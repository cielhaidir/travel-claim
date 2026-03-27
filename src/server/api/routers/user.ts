import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  Role,
  type Prisma,
  type PrismaClient,
} from "../../../../generated/prisma";
import bcrypt from "bcryptjs";

import {
  createTRPCRouter,
  protectedProcedure,
  permissionProcedure,
} from "@/server/api/trpc";
import { userHasPermission } from "@/lib/auth/role-check";

function buildCurrentUserLookup(input: {
  id: string;
  email?: string | null;
}): Prisma.UserWhereInput {
  const orConditions: Prisma.UserWhereInput[] = [{ id: input.id }];

  if (input.email) {
    orConditions.push({ email: input.email });
  }

  return {
    deletedAt: null,
    OR: orConditions,
  };
}

const userMutationInput = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  employeeId: z.string().optional(),
  role: z.nativeEnum(Role).optional(),
  departmentId: z.string().optional().nullable(),
  supervisorId: z.string().optional().nullable(),
  phoneNumber: z.string().optional().nullable(),
});

export const userRouter = createTRPCRouter({
  getMe: permissionProcedure("profile", "read")
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
        where: buildCurrentUserLookup({
          id: ctx.session.user.id,
          email: ctx.session.user.email,
        }),
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
      return ctx.db.user.findMany({
        where: {
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
        },
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
    }),

  getByPhone: permissionProcedure("users", "read")
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
        where: {
          deletedAt: null,
          phoneNumber: { contains: input.search, mode: "insensitive" },
        },
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

  getAll: permissionProcedure("users", "read")
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
        ...(input?.role ? { role: input.role } : {}),
        ...(input?.departmentId ? { departmentId: input.departmentId } : {}),
      };

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
        where,
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

      let nextCursor: string | undefined;
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
        where: { id: input.id },
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

      const isOwn = user.id === ctx.session.user.id;
      const canView = userHasPermission(ctx.session.user, "users", "read");

      if (!isOwn && !canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this user",
        });
      }

      return user;
    }),

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
        where: {
          supervisorId: ctx.session.user.id,
          deletedAt: null,
        },
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

  getHierarchy: permissionProcedure("users", "read")
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
        where: { id: rootUserId },
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

  create: permissionProcedure("users", "create")
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
      userMutationInput.extend({
        password: z.string().min(8),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.user.findUnique({
        where: { email: input.email },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email already exists",
        });
      }

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

      if (input.supervisorId) {
        const isCircular = await checkCircularSupervisor(
          ctx.db,
          "",
          input.supervisorId,
        );
        if (isCircular) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Circular supervisor reference detected",
          });
        }
      }

      const hashedPassword = await bcrypt.hash(input.password, 10);

      return ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: hashedPassword,
          employeeId: input.employeeId,
          role: input.role ?? Role.EMPLOYEE,
          departmentId: input.departmentId ?? null,
          supervisorId: input.supervisorId ?? null,
          phoneNumber: input.phoneNumber ?? null,
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

  update: permissionProcedure("users", "update")
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
      userMutationInput.extend({
        id: z.string(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const user = await ctx.db.user.findUnique({
        where: { id },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

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

      return ctx.db.user.update({
        where: { id },
        data: {
          ...updateData,
          role: updateData.role ?? user.role,
          departmentId: updateData.departmentId ?? null,
          supervisorId: updateData.supervisorId ?? null,
          phoneNumber: updateData.phoneNumber ?? null,
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

  updateMe: permissionProcedure("profile", "update")
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
        name: z.string().trim().min(1).optional(),
        phoneNumber: z.string().trim().optional().nullable(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const nextPhoneNumber =
        input.phoneNumber === undefined
          ? undefined
          : input.phoneNumber === ""
            ? null
            : input.phoneNumber;

      const currentUser = await ctx.db.user.findFirst({
        where: buildCurrentUserLookup({
          id: ctx.session.user.id,
          email: ctx.session.user.email,
        }),
        select: { id: true },
      });

      if (!currentUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return ctx.db.user.update({
        where: { id: currentUser.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(nextPhoneNumber !== undefined
            ? { phoneNumber: nextPhoneNumber }
            : {}),
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

  changePassword: permissionProcedure("profile", "update")
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
      const user = await ctx.db.user.findFirst({
        where: buildCurrentUserLookup({
          id: ctx.session.user.id,
          email: ctx.session.user.email,
        }),
        select: { id: true, password: true },
      });

      if (!user?.password) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User has no password set",
        });
      }

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

      const hashedPassword = await bcrypt.hash(input.newPassword, 10);

      await ctx.db.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      return { success: true };
    }),

  resetPassword: permissionProcedure("users", "update")
    .input(z.object({ id: z.string(), newPassword: z.string().min(8) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.id },
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

  delete: permissionProcedure("users", "delete")
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
      const user = await ctx.db.user.findUnique({
        where: { id: input.id },
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

  restore: permissionProcedure("users", "update")
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.id },
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

  bulkImport: permissionProcedure("users", "import")
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
        const existing = await ctx.db.user.findUnique({
          where: { email },
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
        await ctx.db.user.create({
          data: {
            name: row.displayName.trim(),
            email,
            password: hashedPassword,
            role: Role.EMPLOYEE,
          },
        });

        results.push({ email, status: "created" });
      }

      const created = results.filter((result) => result.status === "created").length;
      const skipped = results.filter((result) => result.status === "skipped").length;

      return { results, created, skipped, total: input.users.length };
    }),
});

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
