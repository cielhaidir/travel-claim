import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  MembershipStatus,
  Role,
  type Prisma,
  type PrismaClient,
} from "../../../../generated/prisma";
import { bootstrapTenantAccounting } from "@/lib/accounting/bootstrap";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  archiveTenantRoleProfile,
  ensureTenantRoleCatalog,
  getDefaultCustomRolePermissions,
  getTenantSystemRoleId,
  isTenantCustomRoleTableMissing,
  listTenantRolePermissionProfiles,
  normalizeCustomRoleSlug,
  resetTenantRolePermissionProfile,
  restoreTenantRoleProfile,
  updateTenantRoleDisplayName,
  upsertTenantRolePermissionProfile,
} from "@/server/auth/permission-store";
import {
  hasPermissionMap,
  sanitizePermissionMap,
  type PermissionMap,
} from "@/lib/auth/permissions";

const roleProfileTargetSchema = z
  .object({
    tenantId: z.string(),
    role: z.nativeEnum(Role).optional(),
    customRoleId: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    const targetCount =
      Number(Boolean(value.role)) + Number(Boolean(value.customRoleId));

    if (targetCount !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one role target.",
        path: ["role"],
      });
    }
  });

function isCustomRoleSlugConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  return message.includes("TenantCustomRole_tenantId_slug_key");
}

async function requireTenantExists(
  db: PrismaClient,
  tenantId: string,
) {
  const tenant = await db.tenant.findFirst({
    where: {
      id: tenantId,
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

  return tenant;
}

async function requireCustomRole(
  db: PrismaClient,
  input: {
    tenantId: string;
    customRoleId: string;
  },
) {
  const customRole = await db.tenantCustomRole.findFirst({
    where: {
      id: input.customRoleId,
      tenantId: input.tenantId,
    },
    select: {
      id: true,
      tenantId: true,
      baseRole: true,
      isSystem: true,
      displayName: true,
      slug: true,
      isArchived: true,
      permissions: true,
      defaultPermissions: true,
    },
  });

  if (!customRole) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Custom role not found",
    });
  }

  return customRole;
}

function requireSystemRole(input: {
  role?: Role;
  customRoleId?: string;
}): Role {
  if (input.role) {
    return input.role;
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "System role target is required",
  });
}

function requireRoot(ctx: unknown) {
  const typed = ctx as { isRoot?: boolean };
  if (!typed.isRoot) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only root users can manage tenants",
    });
  }
}

function requireRolePermissionAccess(
  ctx: unknown,
  tenantId: string,
  action: "read" | "update",
) {
  const typed = ctx as {
    isRoot?: boolean;
    tenantId?: string | null;
    session?: {
      user?: {
        permissions?: PermissionMap;
      };
    } | null;
  };

  if (typed.isRoot) {
    return;
  }

  if (typed.tenantId !== tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "You can only manage role permissions for the currently active tenant",
    });
  }

  if (!hasPermissionMap(typed.session?.user?.permissions, "roles", action)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Insufficient permissions to manage role permissions",
    });
  }
}

function requireTenantMembershipAccess(
  ctx: unknown,
  tenantId: string,
  action: "read" | "update",
) {
  const typed = ctx as {
    isRoot?: boolean;
    tenantId?: string | null;
    session?: {
      user?: {
        permissions?: PermissionMap;
      };
    } | null;
  };

  if (typed.isRoot) {
    return;
  }

  if (typed.tenantId !== tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "You can only manage memberships for the currently active tenant",
    });
  }

  if (!hasPermissionMap(typed.session?.user?.permissions, "tenants", action)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Insufficient permissions to manage tenant memberships",
    });
  }
}

function requireRoleCatalogAccess(ctx: unknown, tenantId: string) {
  const typed = ctx as {
    isRoot?: boolean;
    tenantId?: string | null;
    session?: {
      user?: {
        permissions?: PermissionMap;
      };
    } | null;
  };

  if (typed.isRoot) {
    return;
  }

  if (typed.tenantId !== tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "You can only load assignable roles for the currently active tenant",
    });
  }

  const permissions = typed.session?.user?.permissions;
  if (
    hasPermissionMap(permissions, "users", "read") ||
    hasPermissionMap(permissions, "users", "update") ||
    hasPermissionMap(permissions, "tenants", "read") ||
    hasPermissionMap(permissions, "tenants", "update") ||
    hasPermissionMap(permissions, "roles", "read") ||
    hasPermissionMap(permissions, "roles", "update")
  ) {
    return;
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Insufficient permissions to view assignable roles",
  });
}

function slugifyTenantName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
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
      isDefault: true,
      createdAt: true,
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  const primaryMembership = activeMemberships[0];
  const primaryRole = primaryMembership?.role ?? Role.EMPLOYEE;

  await tx.userRole.deleteMany({
    where: { userId },
  });

  if (primaryMembership) {
    await tx.userRole.create({
      data: {
        userId,
        role: primaryRole,
        tenantId: primaryMembership.tenantId,
      },
    });
  }

  await tx.user.update({
    where: { id: userId },
    data: {
      role: primaryRole,
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
      requireTenantMembershipAccess(ctx, input.tenantId, "read");
      await ensureTenantRoleCatalog(ctx.db, input.tenantId);

      const tenant = await ctx.db.tenant.findFirst({
        where: {
          id: input.tenantId,
          deletedAt: null,
        },
        include: {
          memberships: {
            include: {
              customRole: {
                select: {
                  id: true,
                  displayName: true,
                  baseRole: true,
                  isSystem: true,
                },
              },
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

  getRolePermissions: protectedProcedure
    .input(
      z.object({
        tenantId: z.string(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      requireRolePermissionAccess(ctx, input.tenantId, "read");

      const tenant = await ctx.db.tenant.findFirst({
        where: {
          id: input.tenantId,
          deletedAt: null,
        },
        select: {
          id: true,
        },
      });

      if (!tenant) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Tenant not found",
        });
      }

      return listTenantRolePermissionProfiles(ctx.db, input.tenantId);
    }),

  getAssignableRoles: protectedProcedure
    .input(
      z.object({
        tenantId: z.string(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      requireRoleCatalogAccess(ctx, input.tenantId);

      const tenant = await requireTenantExists(ctx.db, input.tenantId);
      const profiles = await listTenantRolePermissionProfiles(ctx.db, input.tenantId);

      return profiles
        .filter((profile) => !profile.isArchived)
        .filter((profile) => !tenant.isRoot || profile.roleKind === "SYSTEM")
        .filter(
          (profile) =>
            tenant.isRoot ? profile.systemRole === Role.ROOT : profile.systemRole !== Role.ROOT,
        )
        .map((profile) => ({
          roleKey: profile.roleKey,
          roleKind: profile.roleKind,
          displayName: profile.displayName,
          baseRole: profile.role ?? profile.systemRole ?? Role.EMPLOYEE,
          systemRole: profile.systemRole,
          customRoleId: profile.customRoleId,
          tenantId: profile.tenantId,
        }));
    }),

  getAssignableRolesCatalog: protectedProcedure
    .input(
      z
        .object({
          tenantIds: z.array(z.string()).optional(),
        })
        .optional(),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const requestedTenantIds = [...new Set(input?.tenantIds ?? [])];
      const tenantIds =
        requestedTenantIds.length > 0
          ? requestedTenantIds
          : ctx.isRoot
            ? (
                await ctx.db.tenant.findMany({
                  where: { deletedAt: null },
                  select: { id: true },
                })
              ).map((tenant) => tenant.id)
            : ctx.tenantId
              ? [ctx.tenantId]
              : [];

      const catalog: Record<string, unknown[]> = {};

      for (const tenantId of tenantIds) {
        requireRoleCatalogAccess(ctx, tenantId);
        const tenant = await requireTenantExists(ctx.db, tenantId);
        const profiles = await listTenantRolePermissionProfiles(ctx.db, tenantId);

        catalog[tenantId] = profiles
          .filter((profile) => !profile.isArchived)
          .filter((profile) => !tenant.isRoot || profile.roleKind === "SYSTEM")
          .filter(
            (profile) =>
              tenant.isRoot
                ? profile.systemRole === Role.ROOT
                : profile.systemRole !== Role.ROOT,
          )
          .map((profile) => ({
            roleKey: profile.roleKey,
            roleKind: profile.roleKind,
            displayName: profile.displayName,
            baseRole: profile.role ?? profile.systemRole ?? Role.EMPLOYEE,
            systemRole: profile.systemRole,
            customRoleId: profile.customRoleId,
            tenantId: profile.tenantId,
          }));
      }

      return catalog;
    }),

  updateRolePermissions: protectedProcedure
    .input(
      roleProfileTargetSchema.extend({
        permissions: z.record(z.string(), z.array(z.string())),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRolePermissionAccess(ctx, input.tenantId, "update");
      const tenant = await requireTenantExists(ctx.db, input.tenantId);
      const permissions = sanitizePermissionMap(input.permissions as PermissionMap);

      if (input.customRoleId) {
        const targetRole = await requireCustomRole(ctx.db, {
          tenantId: input.tenantId,
          customRoleId: input.customRoleId,
        });

        if (tenant.isRoot && !targetRole.isSystem) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Root tenant custom roles cannot be edited",
          });
        }

        if (targetRole.isSystem && targetRole.baseRole === Role.ROOT) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "ROOT permissions are fixed and cannot be customized",
          });
        }

        try {
          await ctx.db.tenantCustomRole.update({
            where: { id: targetRole.id },
            data: { permissions },
          });
        } catch (error) {
          if (isTenantCustomRoleTableMissing(error)) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message:
                "Custom role storage is not migrated yet. Run the latest Prisma migration first.",
            });
          }

          throw error;
        }

        return listTenantRolePermissionProfiles(ctx.db, input.tenantId);
      }

      const systemRole = requireSystemRole(input);

      if (systemRole === Role.ROOT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ROOT permissions are fixed and cannot be customized",
        });
      }

      try {
        await upsertTenantRolePermissionProfile(ctx.db, {
          tenantId: input.tenantId,
          role: systemRole,
          permissions,
        });
      } catch (error) {
        if (isTenantCustomRoleTableMissing(error)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Tenant role storage is not migrated yet. Run the latest Prisma migration first.",
          });
        }

        throw error;
      }

      return listTenantRolePermissionProfiles(ctx.db, input.tenantId);
    }),

  resetRolePermissions: protectedProcedure
    .input(roleProfileTargetSchema)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRolePermissionAccess(ctx, input.tenantId, "update");

      const tenant = await requireTenantExists(ctx.db, input.tenantId);

      if (input.customRoleId) {
        const customRole = await requireCustomRole(ctx.db, {
          tenantId: input.tenantId,
          customRoleId: input.customRoleId,
        });

        if (tenant.isRoot && !customRole.isSystem) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Root tenant custom roles cannot be edited",
          });
        }

        if (customRole.isSystem && customRole.baseRole === Role.ROOT) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "ROOT permissions are fixed and cannot be reset",
          });
        }

        try {
          await ctx.db.tenantCustomRole.update({
            where: { id: customRole.id },
            data: {
              permissions: customRole.defaultPermissions as Prisma.InputJsonValue,
            },
          });
        } catch (error) {
          if (isTenantCustomRoleTableMissing(error)) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message:
                "Custom role storage is not migrated yet. Run the latest Prisma migration first.",
            });
          }

          throw error;
        }

        return listTenantRolePermissionProfiles(ctx.db, input.tenantId);
      }

      const systemRole = requireSystemRole(input);

      if (systemRole === Role.ROOT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ROOT permissions are fixed and cannot be reset",
        });
      }

      try {
        await resetTenantRolePermissionProfile(ctx.db, {
          tenantId: input.tenantId,
          role: systemRole,
        });
      } catch (error) {
        if (isTenantCustomRoleTableMissing(error)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Tenant role storage is not migrated yet. Run the latest Prisma migration first.",
          });
        }

        throw error;
      }

      return listTenantRolePermissionProfiles(ctx.db, input.tenantId);
    }),

  renameRole: protectedProcedure
    .input(
      roleProfileTargetSchema.extend({
        displayName: z.string().trim().min(2).max(100),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRolePermissionAccess(ctx, input.tenantId, "update");

      const tenant = await requireTenantExists(ctx.db, input.tenantId);

      if (input.customRoleId) {
        const customRole = await requireCustomRole(ctx.db, {
          tenantId: input.tenantId,
          customRoleId: input.customRoleId,
        });

        if (tenant.isRoot && !customRole.isSystem) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Root tenant custom roles cannot be edited",
          });
        }

        if (customRole.isSystem && customRole.baseRole === Role.ROOT) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "ROOT role metadata cannot be changed",
          });
        }

        const slug = normalizeCustomRoleSlug(input.displayName);

        if (!slug) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "A valid role name is required",
          });
        }

        try {
          await ctx.db.tenantCustomRole.update({
            where: { id: customRole.id },
            data: customRole.isSystem
              ? {
                  displayName: input.displayName.trim(),
                }
              : {
                  slug,
                  displayName: input.displayName.trim(),
                },
          });
        } catch (error) {
          if (isTenantCustomRoleTableMissing(error)) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message:
                "Custom role storage is not migrated yet. Run the latest Prisma migration first.",
            });
          }

          if (isCustomRoleSlugConflict(error)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "A custom role with this name already exists in the tenant.",
            });
          }

          throw error;
        }

        return listTenantRolePermissionProfiles(ctx.db, input.tenantId);
      }

      const systemRole = requireSystemRole(input);

      if (tenant.isRoot || systemRole === Role.ROOT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ROOT role metadata cannot be changed",
        });
      }

      try {
        await updateTenantRoleDisplayName(ctx.db, {
          tenantId: input.tenantId,
          role: systemRole,
          displayName: input.displayName,
        });
      } catch (error) {
        if (isTenantCustomRoleTableMissing(error)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Tenant role storage is not migrated yet. Run the latest Prisma migration first.",
          });
        }

        throw error;
      }

      return listTenantRolePermissionProfiles(ctx.db, input.tenantId);
    }),

  deleteRole: protectedProcedure
    .input(roleProfileTargetSchema)
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRolePermissionAccess(ctx, input.tenantId, "update");

      const tenant = await requireTenantExists(ctx.db, input.tenantId);

      if (input.customRoleId) {
        const customRole = await requireCustomRole(ctx.db, {
          tenantId: input.tenantId,
          customRoleId: input.customRoleId,
        });

        if (tenant.isRoot && !customRole.isSystem) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Root tenant custom roles cannot be deleted",
          });
        }

        if (customRole.isSystem && customRole.baseRole === Role.ROOT) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "ROOT role cannot be deleted",
          });
        }

        const membershipCount = await ctx.db.tenantMembership.count({
          where: {
            tenantId: input.tenantId,
            customRoleId: customRole.id,
          },
        });

        if (membershipCount > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "This role is still assigned to tenant memberships and cannot be deleted yet.",
          });
        }

        try {
          if (customRole.isSystem) {
            await ctx.db.tenantCustomRole.update({
              where: { id: customRole.id },
              data: { isArchived: true },
            });
          } else {
            await ctx.db.tenantCustomRole.delete({
              where: { id: customRole.id },
            });
          }
        } catch (error) {
          if (isTenantCustomRoleTableMissing(error)) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message:
                "Custom role storage is not migrated yet. Run the latest Prisma migration first.",
            });
          }

          throw error;
        }

        return listTenantRolePermissionProfiles(ctx.db, input.tenantId);
      }

      const systemRole = requireSystemRole(input);

      if (tenant.isRoot || systemRole === Role.ROOT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ROOT role cannot be deleted",
        });
      }

      const membershipCount = await ctx.db.tenantMembership.count({
        where: {
          tenantId: input.tenantId,
          role: systemRole,
          customRoleId: null,
        },
      });

      if (membershipCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This role is still assigned to tenant memberships and cannot be deleted yet.",
        });
      }

      try {
        await archiveTenantRoleProfile(ctx.db, {
          tenantId: input.tenantId,
          role: systemRole,
        });
      } catch (error) {
        if (isTenantCustomRoleTableMissing(error)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Tenant role storage is not migrated yet. Run the latest Prisma migration first.",
          });
        }

        throw error;
      }

      return listTenantRolePermissionProfiles(ctx.db, input.tenantId);
    }),

  createCustomRole: protectedProcedure
    .input(
      z.object({
        tenantId: z.string(),
        displayName: z.string().trim().min(2).max(100),
        sourceRoleId: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRolePermissionAccess(ctx, input.tenantId, "update");

      const tenant = await requireTenantExists(ctx.db, input.tenantId);
      if (tenant.isRoot) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Custom roles cannot be created in the root tenant",
        });
      }

      const slug = normalizeCustomRoleSlug(input.displayName);
      if (!slug) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "A valid role name is required",
        });
      }

      let baseRole: Role = Role.EMPLOYEE;
      let defaultPermissions = getDefaultCustomRolePermissions();
      let initialPermissions = defaultPermissions;

      if (input.sourceRoleId) {
        const sourceRole = await requireCustomRole(ctx.db, {
          tenantId: input.tenantId,
          customRoleId: input.sourceRoleId,
        });

        if (sourceRole.isArchived) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Archived roles cannot be used as a copy source",
          });
        }

        baseRole = sourceRole.baseRole ?? Role.EMPLOYEE;
        defaultPermissions = sanitizePermissionMap(sourceRole.permissions as PermissionMap);
        initialPermissions = defaultPermissions;
      }

      try {
        await ctx.db.tenantCustomRole.create({
          data: {
            tenantId: input.tenantId,
            baseRole,
            isSystem: false,
            slug,
            displayName: input.displayName.trim(),
            permissions: initialPermissions,
            defaultPermissions,
          },
        });
      } catch (error) {
        if (isTenantCustomRoleTableMissing(error)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Custom role storage is not migrated yet. Run the latest Prisma migration first.",
          });
        }

        if (isCustomRoleSlugConflict(error)) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "A custom role with this name already exists in the tenant.",
          });
        }

        throw error;
      }

      return listTenantRolePermissionProfiles(ctx.db, input.tenantId);
    }),

  restoreRole: protectedProcedure
    .input(
      z.object({
        tenantId: z.string(),
        role: z.nativeEnum(Role),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRolePermissionAccess(ctx, input.tenantId, "update");

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

      if (tenant.isRoot || input.role === Role.ROOT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ROOT role cannot be restored from this screen",
        });
      }

      try {
        await restoreTenantRoleProfile(ctx.db, {
          tenantId: input.tenantId,
          role: input.role,
        });
      } catch (error) {
        if (isTenantCustomRoleTableMissing(error)) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Tenant role storage is not migrated yet. Run the latest Prisma migration first.",
          });
        }

        throw error;
      }

      return listTenantRolePermissionProfiles(ctx.db, input.tenantId);
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

      const baseSlug = slugifyTenantName(input.slug ?? input.name);
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

        await ensureTenantRoleCatalog(tx, tenant.id);
        const adminRoleId = await getTenantSystemRoleId(tx, tenant.id, Role.ADMIN);

        await tx.tenantMembership.create({
          data: {
            userId: ctx.session.user.id,
            tenantId: tenant.id,
            role: Role.ADMIN,
            customRoleId: adminRoleId,
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
        customRoleId: z.string().optional(),
        status: z.nativeEnum(MembershipStatus),
        isDefault: z.boolean().default(false),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireTenantMembershipAccess(ctx, input.tenantId, "update");
      await ensureTenantRoleCatalog(ctx.db, input.tenantId);

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

      if (tenant.isRoot && !input.customRoleId && input.role !== Role.ROOT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Root tenant memberships must use the ROOT role",
        });
      }

      let customRoleId: string | null = null;
      let resolvedRole = input.role;

      if (input.customRoleId) {
        const customRole = await requireCustomRole(ctx.db, {
          tenantId: input.tenantId,
          customRoleId: input.customRoleId,
        });

        if (tenant.isRoot && !customRole.isSystem) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Root tenant memberships cannot use custom roles",
          });
        }

        if (customRole.isArchived) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Archived custom roles cannot be assigned",
          });
        }

        customRoleId = customRole.id;
        resolvedRole =
          customRole.baseRole ??
          (tenant.isRoot ? Role.ROOT : input.role);
      } else {
        const fallbackSystemRole = tenant.isRoot ? Role.ROOT : input.role;
        const systemRoleId = await getTenantSystemRoleId(
          ctx.db,
          input.tenantId,
          fallbackSystemRole,
        );

        if (!systemRoleId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to resolve tenant role binding",
          });
        }

        customRoleId = systemRoleId;
        resolvedRole = fallbackSystemRole;
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
            role: resolvedRole,
            customRoleId,
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
            role: resolvedRole,
            customRoleId,
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
