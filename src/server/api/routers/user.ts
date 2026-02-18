import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Role } from "../../../../generated/prisma";
import bcrypt from "bcryptjs";

import {
  createTRPCRouter,
  protectedProcedure,
  adminProcedure,
  managerProcedure,
} from "@/server/api/trpc";

export const userRouter = createTRPCRouter({
  // Get current user profile
  getMe: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/users/me',
        protect: true,
        tags: ['Users'],
        summary: 'Get current user profile',
      }
    })
    .input(z.void())
    .output(z.any())
    .query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
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

  // Get user by phone number (dedicated MCP tool)
  getByPhone: managerProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/users/by-phone',
        protect: true,
        tags: ['Users'],
        summary: 'Get user by phone number',
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
      })
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

  // Get all users with filters
  getAll: managerProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/users',
        protect: true,
        tags: ['Users'],
        summary: 'Get all users',
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
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {
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
        method: 'GET',
        path: '/users/{id}',
        protect: true,
        tags: ['Users'],
        summary: 'Get user by ID',
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
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

      // Only allow viewing own profile or if user is manager/admin
      const isOwn = user.id === ctx.session.user.id;
      const canView = ["MANAGER", "DIRECTOR", "ADMIN"].includes(
        ctx.session.user.role
      );

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
        method: 'GET',
        path: '/users/direct-reports',
        protect: true,
        tags: ['Users'],
        summary: 'Get direct reports',
      }
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

  // Get organizational hierarchy
  getHierarchy: managerProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/users/hierarchy',
        protect: true,
        tags: ['Users'],
        summary: 'Get organizational hierarchy',
      },
    })
    .input(
      z.object({
        userId: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const rootUserId = input?.userId ?? ctx.session.user.id;

      const user = await ctx.db.user.findUnique({
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

  // Create user
  create: adminProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/users',
        protect: true,
        tags: ['Users'],
        summary: 'Create user',
      }
    })
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        employeeId: z.string().optional(),
        role: z.nativeEnum(Role).optional(),
        departmentId: z.string().optional(),
        supervisorId: z.string().optional(),
        phoneNumber: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Check if email already exists
      const existing = await ctx.db.user.findUnique({
        where: { email: input.email },
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

      return ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: hashedPassword,
          employeeId: input.employeeId,
          role: input.role ?? Role.EMPLOYEE,
          departmentId: input.departmentId,
          supervisorId: input.supervisorId,
          phoneNumber: input.phoneNumber,
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
        method: 'PUT',
        path: '/users/{id}',
        protect: true,
        tags: ['Users'],
        summary: 'Update user',
      }
    })
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        employeeId: z.string().optional(),
        role: z.nativeEnum(Role).optional(),
        departmentId: z.string().optional().nullable(),
        supervisorId: z.string().optional().nullable(),
        phoneNumber: z.string().optional().nullable(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Check if user exists
      const user = await ctx.db.user.findUnique({
        where: { id },
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
          input.supervisorId
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
        method: 'PATCH',
        path: '/users/me',
        protect: true,
        tags: ['Users'],
        summary: 'Update own profile',
      }
    })
    .input(
      z.object({
        name: z.string().min(1).optional(),
        phoneNumber: z.string().optional(),
      })
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
        method: 'POST',
        path: '/users/change-password',
        protect: true,
        tags: ['Users'],
        summary: 'Change password',
      }
    })
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8),
      })
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
      const isValid = await bcrypt.compare(input.currentPassword, user.password);
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

  // Soft delete user
  delete: adminProcedure
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/users/{id}',
        protect: true,
        tags: ['Users'],
        summary: 'Delete user',
      }
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
});

// Helper function to check circular supervisor references
async function checkCircularSupervisor(
  db: any,
  userId: string,
  supervisorId: string
): Promise<boolean> {
  const supervisor = await db.user.findUnique({
    where: { id: supervisorId },
    select: { supervisorId: true },
  });

  if (!supervisor || !supervisor.supervisorId) {
    return false;
  }

  if (supervisor.supervisorId === userId) {
    return true;
  }

  return checkCircularSupervisor(db, userId, supervisor.supervisorId);
}