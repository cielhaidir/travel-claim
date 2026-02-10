import { z } from "zod";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
  adminProcedure,
} from "@/server/api/trpc";

export const departmentRouter = createTRPCRouter({
  // Get all departments with optional filters
  getAll: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/departments',
        protect: true,
        tags: ['Departments'],
        summary: 'Get all departments',
      }
    })
    .input(
      z.object({
        includeDeleted: z.boolean().optional(),
        parentId: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      return ctx.db.department.findMany({
        where: {
          deletedAt: input.includeDeleted ? undefined : null,
          parentId: input.parentId,
        },
        include: {
          parent: true,
          children: true,
          users: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });
    }),

  // Get department by ID
  getById: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/departments/{id}',
        protect: true,
        tags: ['Departments'],
        summary: 'Get department by ID',
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const department = await ctx.db.department.findUnique({
        where: { id: input.id },
        include: {
          parent: true,
          children: true,
          users: {
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

      if (!department) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Department not found",
        });
      }

      return department;
    }),

  // Get department by code
  getByCode: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/departments/by-code/{code}',
        protect: true,
        tags: ['Departments'],
        summary: 'Get department by code',
      }
    })
    .input(z.object({ code: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const department = await ctx.db.department.findUnique({
        where: { code: input.code },
        include: {
          parent: true,
          children: true,
          users: true,
        },
      });

      if (!department) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Department not found",
        });
      }

      return department;
    }),

  // Get department hierarchy tree
  getHierarchy: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/departments/hierarchy',
        protect: true,
        tags: ['Departments'],
        summary: 'Get department hierarchy tree',
      }
    })
    .input(z.object({}))
    .output(z.any())
    .query(async ({ ctx }) => {
    // Get all root departments (no parent)
    const rootDepartments = await ctx.db.department.findMany({
      where: {
        parentId: null,
        deletedAt: null,
      },
      include: {
        children: {
          include: {
            children: {
              include: {
                children: true,
              },
            },
          },
        },
        users: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    return rootDepartments;
  }),

  // Create department
  create: adminProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/departments',
        protect: true,
        tags: ['Departments'],
        summary: 'Create department',
      }
    })
    .input(
      z.object({
        name: z.string().min(1).max(100),
        code: z.string().min(1).max(20),
        description: z.string().optional(),
        parentId: z.string().optional(),
        managerId: z.string().optional(),
        directorId: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Check if code already exists
      const existing = await ctx.db.department.findUnique({
        where: { code: input.code },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Department code already exists",
        });
      }

      // Validate parent exists if provided
      if (input.parentId) {
        const parent = await ctx.db.department.findUnique({
          where: { id: input.parentId },
        });
        if (!parent) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Parent department not found",
          });
        }
      }

      return ctx.db.department.create({
        data: {
          name: input.name,
          code: input.code,
          description: input.description,
          parentId: input.parentId,
          managerId: input.managerId,
          directorId: input.directorId,
        },
        include: {
          parent: true,
          users: true,
        },
      });
    }),

  // Update department
  update: adminProcedure
    .meta({
      openapi: {
        method: 'PUT',
        path: '/departments/{id}',
        protect: true,
        tags: ['Departments'],
        summary: 'Update department',
      }
    })
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        code: z.string().min(1).max(20).optional(),
        description: z.string().optional(),
        parentId: z.string().optional().nullable(),
        managerId: z.string().optional().nullable(),
        directorId: z.string().optional().nullable(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Check if department exists
      const department = await ctx.db.department.findUnique({
        where: { id },
      });

      if (!department) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Department not found",
        });
      }

      // If updating code, check for conflicts
      if (input.code && input.code !== department.code) {
        const existing = await ctx.db.department.findUnique({
          where: { code: input.code },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Department code already exists",
          });
        }
      }

      // Prevent circular references in parent hierarchy
      if (input.parentId) {
        if (input.parentId === id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Department cannot be its own parent",
          });
        }

        // Check if the new parent is a descendant
        const isDescendant = await checkIsDescendant(
          ctx.db,
          id,
          input.parentId
        );
        if (isDescendant) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot set a descendant as parent",
          });
        }
      }

      return ctx.db.department.update({
        where: { id },
        data: updateData,
        include: {
          parent: true,
          children: true,
          users: true,
        },
      });
    }),

  // Soft delete department
  delete: adminProcedure
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/departments/{id}',
        protect: true,
        tags: ['Departments'],
        summary: 'Delete department',
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Check if department exists
      const department = await ctx.db.department.findUnique({
        where: { id: input.id },
        include: {
          children: true,
          users: true,
        },
      });

      if (!department) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Department not found",
        });
      }

      // Check if department has active children
      const activeChildren = department.children.filter(
        (child) => !child.deletedAt
      );
      if (activeChildren.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete department with active child departments",
        });
      }

      // Check if department has active users
      const activeUsers = department.users.filter((user) => !user.deletedAt);
      if (activeUsers.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete department with active users",
        });
      }

      return ctx.db.department.update({
        where: { id: input.id },
        data: {
          deletedAt: new Date(),
        },
      });
    }),

  // Restore deleted department
  restore: adminProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/departments/{id}/restore',
        protect: true,
        tags: ['Departments'],
        summary: 'Restore deleted department',
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const department = await ctx.db.department.findUnique({
        where: { id: input.id },
      });

      if (!department) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Department not found",
        });
      }

      if (!department.deletedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Department is not deleted",
        });
      }

      return ctx.db.department.update({
        where: { id: input.id },
        data: {
          deletedAt: null,
        },
      });
    }),
});

// Helper function to check if a department is a descendant of another
async function checkIsDescendant(
  db: any,
  ancestorId: string,
  descendantId: string
): Promise<boolean> {
  const descendant = await db.department.findUnique({
    where: { id: descendantId },
    select: { parentId: true },
  });

  if (!descendant || !descendant.parentId) {
    return false;
  }

  if (descendant.parentId === ancestorId) {
    return true;
  }

  return checkIsDescendant(db, ancestorId, descendant.parentId);
}