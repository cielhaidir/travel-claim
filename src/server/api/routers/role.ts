import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { Role } from "../../../../generated/prisma";
import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";
import {
  archiveRoleProfile,
  listRolePermissionProfiles,
  resetRolePermissionProfile,
  restoreRoleProfile,
  updateRoleDisplayName,
  upsertRolePermissionProfile,
} from "@/server/auth/permission-store";
import {
  hasPermissionMap,
  sanitizePermissionMap,
  type PermissionMap,
} from "@/lib/auth/permissions";

function requireRoleAccess(
  ctx: {
    isRoot?: boolean;
    session?: {
      user?: {
        permissions?: PermissionMap;
      };
    } | null;
  },
  action: "read" | "update",
) {
  if (ctx.isRoot) {
    return;
  }

  if (!hasPermissionMap(ctx.session?.user?.permissions, "roles", action)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Insufficient permissions to manage role permissions",
    });
  }
}

async function requireDeletableRole(
  ctx: {
    db: {
      user: {
        count(args: {
          where: { role: Role; deletedAt: null };
        }): Promise<number>;
      };
    };
  },
  role: Role,
) {
  if (role === Role.ROOT) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "ROOT role cannot be archived",
    });
  }

  const userCount = await ctx.db.user.count({
    where: {
      role,
      deletedAt: null,
    },
  });

  if (userCount > 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This role is still assigned to active users.",
    });
  }
}

export const roleRouter = createTRPCRouter({
  getAll: protectedProcedure
    .input(z.void())
    .output(z.any())
    .query(async ({ ctx }) => {
      requireRoleAccess(ctx, "read");
      return listRolePermissionProfiles(ctx.db);
    }),

  updatePermissions: protectedProcedure
    .input(
      z.object({
        role: z.nativeEnum(Role),
        permissions: z.record(z.string(), z.array(z.string())),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRoleAccess(ctx, "update");

      if (input.role === Role.ROOT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ROOT permissions are fixed and cannot be customized",
        });
      }

      await upsertRolePermissionProfile(ctx.db, {
        role: input.role,
        permissions: sanitizePermissionMap(input.permissions as PermissionMap),
      });

      return listRolePermissionProfiles(ctx.db);
    }),

  resetPermissions: protectedProcedure
    .input(
      z.object({
        role: z.nativeEnum(Role),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRoleAccess(ctx, "update");

      if (input.role === Role.ROOT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ROOT permissions are fixed and cannot be reset",
        });
      }

      await resetRolePermissionProfile(ctx.db, {
        role: input.role,
      });

      return listRolePermissionProfiles(ctx.db);
    }),

  rename: protectedProcedure
    .input(
      z.object({
        role: z.nativeEnum(Role),
        displayName: z.string().trim().min(2).max(100),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRoleAccess(ctx, "update");

      if (input.role === Role.ROOT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ROOT role metadata cannot be changed",
        });
      }

      await updateRoleDisplayName(ctx.db, {
        role: input.role,
        displayName: input.displayName,
      });

      return listRolePermissionProfiles(ctx.db);
    }),

  delete: protectedProcedure
    .input(
      z.object({
        role: z.nativeEnum(Role),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRoleAccess(ctx, "update");
      await requireDeletableRole(ctx, input.role);

      await archiveRoleProfile(ctx.db, {
        role: input.role,
      });

      return listRolePermissionProfiles(ctx.db);
    }),

  restore: protectedProcedure
    .input(
      z.object({
        role: z.nativeEnum(Role),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      requireRoleAccess(ctx, "update");

      if (input.role === Role.ROOT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ROOT role cannot be restored from this screen",
        });
      }

      await restoreRoleProfile(ctx.db, {
        role: input.role,
      });

      return listRolePermissionProfiles(ctx.db);
    }),
});
