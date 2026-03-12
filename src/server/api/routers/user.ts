import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  MembershipStatus,
  Role,
  type PrismaClient,
  type Prisma,
} from "../../../../generated/prisma";
import bcrypt from "bcryptjs";

import {
  createTRPCRouter,
  protectedProcedure,
  adminProcedure,
  managerProcedure,
} from "@/server/api/trpc";
import { userHasAnyRole } from "@/lib/auth/role-check";

// Role precedence for deriving primary role from a set of roles
const ROLE_PRECEDENCE_ORDER = [
  Role.ADMIN,
  Role.FINANCE,
  Role.DIRECTOR,
  Role.MANAGER,
  Role.SALES_CHIEF,
  Role.SUPERVISOR,
  Role.SALES_EMPLOYEE,
  Role.EMPLOYEE,
] as const;

function derivePrimary(roles: Role[]): Role {
  for (const r of ROLE_PRECEDENCE_ORDER) {
    if (roles.includes(r)) return r;
  }
  return Role.EMPLOYEE;
}

function getTenantScope(ctx: unknown): {
  tenantId: string | null;
  isRoot: boolean;
} {
  const typed = ctx as { tenantId?: string | null; isRoot?: boolean };
  return {
    tenantId: typed.tenantId ?? null,
    isRoot: typed.isRoot ?? false,
  };
}

function withTenantMembershipFilter(
  ctx: unknown,
  where: Prisma.UserWhereInput,
): Prisma.UserWhereInput {
  const { tenantId, isRoot } = getTenantScope(ctx);
  if (isRoot || !tenantId) return where;
  return {
    AND: [
      where,
      {
        memberships: {
          some: {
            tenantId,
            status: MembershipStatus.ACTIVE,
          },
        },
      },
    ],
  };
}

export const userRouter = createTRPCRouter({
  // Get current user profile
  getMe: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/me",
        protect: true,
        tags: ["Users"],
        summary: "Get current user profile",
      },
    })
    .input(z.void())
    .output(z.any())
    .query(async ({ ctx }) => {
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id: ctx.session.user.id }),
        include: {
          department: true,
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          directReports: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              employeeId: true,
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return user;
    }),

  // Get active users (lightweight, for participant pickers - accessible to all logged-in users)
  getActiveUsers: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/active",
        protect: true,
        tags: ["Users"],
        summary: "Get list of active users for participant selection",
      },
    })
    .input(
      z.object({
        search: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const users = await ctx.db.user.findMany({
        where: withTenantMembershipFilter(ctx, {
          deletedAt: null,
          ...(input.search
            ? {
                OR: [
                  { name: { contains: input.search, mode: "insensitive" } },
                  { email: { contains: input.search, mode: "insensitive" } },
                  {
                    employeeId: { contains: input.search, mode: "insensitive" },
                  },
                ],
              }
            : {}),
        }),
        select: {
          id: true,
          name: true,
          email: true,
          employeeId: true,
          role: true,
          department: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { name: "asc" },
        take: 100,
      });

      return users;
    }),

  // Get user by phone number (dedicated MCP tool)
  getByPhone: managerProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/by-phone",
        protect: true,
        tags: ["Users"],
        summary: "Get user by phone number",
      },
      mcp: {
        enabled: true,
        name: "get_user_by_phone",
        description: "Get user information by phone number",
      },
    })
    .input(
      z.object({
        search: z.string().min(1),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, {
          deletedAt: null,
          phoneNumber: { contains: input.search, mode: "insensitive" },
        }),
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          employeeId: true,
          role: true,
          departmentId: true,
          supervisorId: true,
          phoneNumber: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              directReports: true,
              travelRequests: true,
              claims: true,
            },
          },
        },
      });

      return { user };
    }),

  // Get all users with filters
  getAll: managerProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users",
        protect: true,
        tags: ["Users"],
        summary: "Get all users",
      },
    })
    .input(
      z.object({
        role: z.nativeEnum(Role).optional(),
        departmentId: z.string().optional(),
        includeDeleted: z.boolean().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.UserWhereInput = {
        deletedAt: input?.includeDeleted ? undefined : null,
      };

      if (input?.role) {
        where.role = input.role;
      }

      if (input?.departmentId) {
        where.departmentId = input.departmentId;
      }

      if (input?.search) {
        where.OR = [
          { name: { contains: input.search, mode: "insensitive" } },
          { email: { contains: input.search, mode: "insensitive" } },
          { employeeId: { contains: input.search, mode: "insensitive" } },
          { phoneNumber: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const users = await ctx.db.user.findMany({
        take: input?.limit ? input.limit + 1 : 51,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where: withTenantMembershipFilter(ctx, where),
        include: {
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          userRoles: {
            select: { role: true },
          },
          _count: {
            select: {
              directReports: true,
              travelRequests: true,
              claims: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      let nextCursor: string | undefined = undefined;
      const limit = input?.limit ?? 50;
      if (users.length > limit) {
        const nextItem = users.pop();
        nextCursor = nextItem!.id;
      }

      return {
        users,
        nextCursor,
      };
    }),

  // Get user by ID
  getById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/{id}",
        protect: true,
        tags: ["Users"],
        summary: "Get user by ID",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id: input.id }),
        include: {
          department: true,
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          directReports: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              employeeId: true,
            },
          },
          _count: {
            select: {
              travelRequests: true,
              claims: true,
              approvals: true,
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Only allow viewing own profile or if user is manager/admin
      const isOwn = user.id === ctx.session.user.id;
      const canView = userHasAnyRole(ctx.session.user, [
        "MANAGER",
        "DIRECTOR",
        "ADMIN",
      ]);

      if (!isOwn && !canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this user",
        });
      }

      return user;
    }),

  // Get direct reports
  getDirectReports: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/direct-reports",
        protect: true,
        tags: ["Users"],
        summary: "Get direct reports",
      },
    })
    .input(z.void())
    .output(z.any())
    .query(async ({ ctx }) => {
      return ctx.db.user.findMany({
        where: withTenantMembershipFilter(ctx, {
          supervisorId: ctx.session.user.id,
          deletedAt: null,
        }),
        include: {
          department: true,
          _count: {
            select: {
              directReports: true,
              travelRequests: true,
              claims: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });
    }),

  // Get organizational hierarchy
  getHierarchy: managerProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/hierarchy",
        protect: true,
        tags: ["Users"],
        summary: "Get organizational hierarchy",
      },
    })
    .input(
      z.object({
        userId: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const rootUserId = input?.userId ?? ctx.session.user.id;

      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id: rootUserId }),
        include: {
          department: true,
          directReports: {
            where: { deletedAt: null },
            include: {
              department: true,
              directReports: {
                where: { deletedAt: null },
                include: {
                  department: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return user;
    }),

  // Create user
  create: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/users",
        protect: true,
        tags: ["Users"],
        summary: "Create user",
      },
    })
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        employeeId: z.string().optional(),
        role: z.nativeEnum(Role).optional(),
        roles: z.array(z.nativeEnum(Role)).min(1).optional(),
        departmentId: z.string().optional(),
        supervisorId: z.string().optional(),
        phoneNumber: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Check if email already exists
      const existing = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { email: input.email }),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email already exists",
        });
      }

      // Check if employeeId already exists
      if (input.employeeId) {
        const existingEmployee = await ctx.db.user.findUnique({
          where: { employeeId: input.employeeId },
        });

        if (existingEmployee) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Employee ID already exists",
          });
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, 10);

      // Resolve roles
      const allRoles =
        input.roles && input.roles.length > 0
          ? input.roles
          : [input.role ?? Role.EMPLOYEE];
      const primaryRole = derivePrimary(allRoles);

      const tenantId = getTenantScope(ctx).tenantId;

      return ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: hashedPassword,
          employeeId: input.employeeId,
          role: primaryRole,
          departmentId: input.departmentId,
          supervisorId: input.supervisorId,
          phoneNumber: input.phoneNumber,
          userRoles: {
            create: allRoles.map((r) => ({ role: r, tenantId })),
          },
          memberships: tenantId
            ? {
                create: [
                  {
                    tenantId,
                    role: primaryRole,
                    status: MembershipStatus.ACTIVE,
                    isDefault: true,
                    activatedAt: new Date(),
                  },
                ],
              }
            : undefined,
        },
        include: {
          department: true,
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    }),

  // Update user
  update: adminProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/users/{id}",
        protect: true,
        tags: ["Users"],
        summary: "Update user",
      },
    })
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        employeeId: z.string().optional(),
        role: z.nativeEnum(Role).optional(),
        roles: z.array(z.nativeEnum(Role)).min(1).optional(),
        departmentId: z.string().optional().nullable(),
        supervisorId: z.string().optional().nullable(),
        phoneNumber: z.string().optional().nullable(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { id, roles: inputRoles, ...updateData } = input;

      // Check if user exists
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id }),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Check email uniqueness
      if (input.email && input.email !== user.email) {
        const existing = await ctx.db.user.findUnique({
          where: { email: input.email },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email already exists",
          });
        }
      }

      // Check employeeId uniqueness
      if (input.employeeId && input.employeeId !== user.employeeId) {
        const existing = await ctx.db.user.findUnique({
          where: { employeeId: input.employeeId },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Employee ID already exists",
          });
        }
      }

      // Prevent circular supervisor references
      if (input.supervisorId) {
        if (input.supervisorId === id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "User cannot be their own supervisor",
          });
        }

        const isCircular = await checkCircularSupervisor(
          ctx.db,
          id,
          input.supervisorId,
        );
        if (isCircular) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Circular supervisor reference detected",
          });
        }
      }

      // Sync multi-role table when roles array is provided
      if (inputRoles && inputRoles.length > 0) {
        updateData.role = derivePrimary(inputRoles);
        await ctx.db.userRole.deleteMany({
          where: {
            userId: id,
            tenantId: getTenantScope(ctx).isRoot
              ? undefined
              : getTenantScope(ctx).tenantId,
          },
        });
        await ctx.db.userRole.createMany({
          data: inputRoles.map((r) => ({
            userId: id,
            role: r,
            tenantId: getTenantScope(ctx).tenantId,
          })),
        });
      }

      return ctx.db.user.update({
        where: { id },
        data: updateData,
        include: {
          department: true,
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    }),

  // Update own profile
  updateMe: protectedProcedure
    .meta({
      openapi: {
        method: "PATCH",
        path: "/users/me",
        protect: true,
        tags: ["Users"],
        summary: "Update own profile",
      },
    })
    .input(
      z.object({
        name: z.string().min(1).optional(),
        phoneNumber: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: input,
        include: {
          department: true,
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    }),

  // Change password
  changePassword: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/users/change-password",
        protect: true,
        tags: ["Users"],
        summary: "Change password",
      },
    })
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { password: true },
      });

      if (!user?.password) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User has no password set",
        });
      }

      // Verify current password
      const isValid = await bcrypt.compare(
        input.currentPassword,
        user.password,
      );
      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect",
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(input.newPassword, 10);

      await ctx.db.user.update({
        where: { id: ctx.session.user.id },
        data: { password: hashedPassword },
      });

      return { success: true };
    }),

  // Admin reset password
  resetPassword: adminProcedure
    .input(z.object({ id: z.string(), newPassword: z.string().min(8) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id: input.id }),
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      const hashedPassword = await bcrypt.hash(input.newPassword, 10);
      await ctx.db.user.update({
        where: { id: input.id },
        data: { password: hashedPassword },
      });
      return { success: true };
    }),

  // Soft delete user
  delete: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/users/{id}",
        protect: true,
        tags: ["Users"],
        summary: "Delete user",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id: input.id }),
        include: {
          directReports: {
            where: { deletedAt: null },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Check if user has active direct reports
      if (user.directReports.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete user with active direct reports",
        });
      }

      return ctx.db.user.update({
        where: { id: input.id },
        data: {
          deletedAt: new Date(),
        },
      });
    }),

  // Restore deleted user
  restore: adminProcedure
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id: input.id }),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (!user.deletedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is not deleted",
        });
      }

      return ctx.db.user.update({
        where: { id: input.id },
        data: {
          deletedAt: null,
        },
      });
    }),

  // Bulk import users from Excel/CSV (only userType = member)
  bulkImport: adminProcedure
    .input(
      z.object({
        users: z.array(
          z.object({
            id: z.string().optional(),
            displayName: z.string().min(1),
            userPrincipalName: z.string().email(),
          }),
        ),
        defaultPassword: z.string().min(8),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const results: {
        email: string;
        status: "created" | "skipped";
        reason?: string;
      }[] = [];

      for (const row of input.users) {
        const email = row.userPrincipalName.toLowerCase().trim();

        // Check if email already exists
        const existing = await ctx.db.user.findFirst({
          where: withTenantMembershipFilter(ctx, { email }),
        });

        if (existing) {
          results.push({
            email,
            status: "skipped",
            reason: "Email already exists",
          });
          continue;
        }

        const hashedPassword = await bcrypt.hash(input.defaultPassword, 10);

        const tenantId = getTenantScope(ctx).tenantId;
        await ctx.db.user.create({
          data: {
            name: row.displayName.trim(),
            email,
            password: hashedPassword,
            role: Role.EMPLOYEE,
            memberships: tenantId
              ? {
                  create: [
                    {
                      tenantId,
                      role: Role.EMPLOYEE,
                      status: MembershipStatus.ACTIVE,
                      isDefault: true,
                      activatedAt: new Date(),
                    },
                  ],
                }
              : undefined,
            userRoles: tenantId
              ? {
                  create: [{ role: Role.EMPLOYEE, tenantId }],
                }
              : undefined,
          },
        });

        results.push({ email, status: "created" });
      }

      const created = results.filter((r) => r.status === "created").length;
      const skipped = results.filter((r) => r.status === "skipped").length;

      return { results, created, skipped, total: input.users.length };
    }),
});

// Helper function to check circular supervisor references
async function checkCircularSupervisor(
  db: PrismaClient,
  userId: string,
  supervisorId: string,
): Promise<boolean> {
  const supervisor = await db.user.findUnique({
    where: { id: supervisorId },
    select: { supervisorId: true },
  });

  if (!supervisor?.supervisorId) {
    return false;
  }

  if (supervisor.supervisorId === userId) {
    return true;
  }

  return checkCircularSupervisor(db, userId, supervisor.supervisorId);
}
