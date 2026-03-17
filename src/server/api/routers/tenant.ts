import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MembershipStatus,
  Role,
  type Prisma,
} from "../../../../generated/prisma";
import { bootstrapTenantAccounting } from "@/lib/accounting/bootstrap";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const ROLE_PRECEDENCE: Role[] = [
  Role.ROOT,
  Role.ADMIN,
  Role.FINANCE,
  Role.DIRECTOR,
  Role.MANAGER,
  Role.SALES_CHIEF,
  Role.SUPERVISOR,
  Role.SALES_EMPLOYEE,
  Role.EMPLOYEE,
];

function requireRoot(ctx: unknown) {
  const typed = ctx as { isRoot?: boolean };
  if (!typed.isRoot) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only root users can manage tenants",
    });
  }
}

function slugifyTenantName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function derivePrimaryRole(roles: Role[]): Role {
  for (const role of ROLE_PRECEDENCE) {
    if (roles.includes(role)) return role;
  }
  return Role.EMPLOYEE;
}

async function syncUserAccess(
  tx: Prisma.TransactionClient,
  userId: string,
): Promise<void> {
  const activeMemberships = await tx.tenantMembership.findMany({
    where: {
      userId,
      status: MembershipStatus.ACTIVE,
    },
    select: {
      role: true,
      tenantId: true,
    },
  });

  const roleToTenant = new Map<Role, string>();
  for (const membership of activeMemberships) {
    if (!roleToTenant.has(membership.role)) {
      roleToTenant.set(membership.role, membership.tenantId);
    }
  }

  const roles = [...roleToTenant.keys()];
  const existingRoles = await tx.userRole.findMany({
    where: { userId },
    select: { role: true },
  });

  const existingRoleSet = new Set(existingRoles.map((row) => row.role));
  const targetRoleSet = new Set(roles);
  const rolesToCreate = roles.filter((role) => !existingRoleSet.has(role));
  const rolesToDelete = existingRoles
    .map((row) => row.role)
    .filter((role) => !targetRoleSet.has(role));

  if (rolesToDelete.length > 0) {
    await tx.userRole.deleteMany({
      where: {
        userId,
        role: { in: rolesToDelete },
      },
    });
  }

  if (rolesToCreate.length > 0) {
    await tx.userRole.createMany({
      data: rolesToCreate.map((role) => ({
        userId,
        role,
        tenantId: roleToTenant.get(role) ?? null,
      })),
      skipDuplicates: true,
    });
  }

  await tx.user.update({
    where: { id: userId },
    data: {
      role: derivePrimaryRole(roles),
    },
  });
}

export const tenantRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(z.void())
    .output(z.any())
    .query(async ({ ctx }) => {
      requireRoot(ctx);

      const tenants = await ctx.db.tenant.findMany({
        where: {
          deletedAt: null,
        },
        include: {
          memberships: {
            select: {
              id: true,
              userId: true,
              role: true,
              status: true,
              isDefault: true,
            },
          },
          _count: {
            select: {
              departments: true,
              projects: true,
              travelRequests: true,
              claims: true,
              bailouts: true,
            },
          },
        },
        orderBy: [{ isRoot: "desc" }, { name: "asc" }],
      });

      return tenants.map((tenant) => {
        const activeMemberships = tenant.memberships.filter(
          (membership) => membership.status === MembershipStatus.ACTIVE,
        );

        return {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          isRoot: tenant.isRoot,
          createdAt: tenant.createdAt,
          updatedAt: tenant.updatedAt,
          membershipCount: tenant.memberships.length,
          activeMembershipCount: activeMemberships.length,
          defaultMembershipCount: tenant.memberships.filter(
            (membership) => membership.isDefault,
          ).length,
          suspendedMembershipCount: tenant.memberships.filter(
            (membership) => membership.status === MembershipStatus.SUSPENDED,
          ).length,
          invitedMembershipCount: tenant.memberships.filter(
            (membership) => membership.status === MembershipStatus.INVITED,
          ).length,
          stats: tenant._count,
        };
      });
    }),

  getMembers: protectedProcedure
    .input(
      z.object({
        tenantId: z.string(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      requireRoot(ctx);

      const tenant = await ctx.db.tenant.findFirst({
        where: {
          id: input.tenantId,
          deletedAt: null,
        },
        include: {
          memberships: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  employeeId: true,
                  image: true,
                  role: true,
                  deletedAt: true,
                },
              },
            },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          },
        },
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        });
      }

      return tenant;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(2).max(200),
        slug: z.string().min(2).max(100).optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRoot(ctx);

      const baseSlug = slugifyTenantName(input.slug || input.name);
      if (!baseSlug) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A valid tenant slug is required",
        });
      }

      const existing = await ctx.db.tenant.findUnique({
        where: { slug: baseSlug },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Tenant slug already exists",
        });
      }

      return ctx.db.$transaction(async (tx) => {
        const tenant = await tx.tenant.create({
          data: {
            name: input.name.trim(),
            slug: baseSlug,
            isRoot: false,
          },
        });

        await tx.tenantMembership.create({
          data: {
            userId: ctx.session.user.id,
            tenantId: tenant.id,
            role: Role.ROOT,
            status: MembershipStatus.ACTIVE,
            isDefault: false,
            activatedAt: new Date(),
          },
        });

        await bootstrapTenantAccounting(tx, {
          tenantId: tenant.id,
          userId: ctx.session.user.id,
        });

        await syncUserAccess(tx, ctx.session.user.id);

        return tenant;
      });
    }),

  upsertMembership: protectedProcedure
    .input(
      z.object({
        tenantId: z.string(),
        userId: z.string(),
        role: z.nativeEnum(Role),
        status: z.nativeEnum(MembershipStatus),
        isDefault: z.boolean().default(false),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRoot(ctx);

      const tenant = await ctx.db.tenant.findFirst({
        where: {
          id: input.tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
          isRoot: true,
        },
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        });
      }

      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (tenant.isRoot && input.role !== Role.ROOT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Root tenant memberships must use the ROOT role",
        });
      }

      return ctx.db.$transaction(async (tx) => {
        if (input.isDefault) {
          await tx.tenantMembership.updateMany({
            where: { userId: input.userId, isDefault: true },
            data: { isDefault: false },
          });
        }

        const membership = await tx.tenantMembership.upsert({
          where: {
            userId_tenantId: {
              userId: input.userId,
              tenantId: input.tenantId,
            },
          },
          update: {
            role: input.role,
            status: input.status,
            isDefault: input.isDefault,
            activatedAt:
              input.status === MembershipStatus.ACTIVE ? new Date() : null,
            suspendedAt:
              input.status === MembershipStatus.SUSPENDED ? new Date() : null,
            invitedAt:
              input.status === MembershipStatus.INVITED ? new Date() : null,
            suspendedReason: null,
          },
          create: {
            userId: input.userId,
            tenantId: input.tenantId,
            role: input.role,
            status: input.status,
            isDefault: input.isDefault,
            activatedAt:
              input.status === MembershipStatus.ACTIVE ? new Date() : null,
            suspendedAt:
              input.status === MembershipStatus.SUSPENDED ? new Date() : null,
            invitedAt:
              input.status === MembershipStatus.INVITED ? new Date() : null,
          },
        });

        await syncUserAccess(tx, input.userId);

        return membership;
      });
    }),
});
