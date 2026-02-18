import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COAType, AuditAction } from "../../../../generated/prisma";

import {
  createTRPCRouter,
  protectedProcedure,
  adminProcedure,
} from "@/server/api/trpc";

export const chartOfAccountRouter = createTRPCRouter({
  // Get all Chart of Accounts with optional filters
  getAll: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/chart-of-accounts",
        protect: true,
        tags: ["Chart of Accounts"],
        summary: "Get all chart of accounts",
      },
    })
    .input(
      z
        .object({
          accountType: z.nativeEnum(COAType).optional(),
          isActive: z.boolean().optional(),
          parentId: z.string().optional().nullable(),
          category: z.string().optional(),
          limit: z.number().min(1).max(100).optional(),
          cursor: z.string().optional(),
        })
        .optional()
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {};

      if (input?.accountType) {
        where.accountType = input.accountType;
      }

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive;
      }

      if (input?.parentId !== undefined) {
        where.parentId = input.parentId;
      }

      if (input?.category) {
        where.category = input.category;
      }

      const accounts = await ctx.db.chartOfAccount.findMany({
        take: input?.limit ? input.limit + 1 : 51,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where,
        include: {
          parent: {
            select: {
              id: true,
              code: true,
              name: true,
              accountType: true,
            },
          },
          children: {
            select: {
              id: true,
              code: true,
              name: true,
              accountType: true,
              isActive: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          updatedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              claims: true,
              children: true,
            },
          },
        },
        orderBy: [{ accountType: "asc" }, { code: "asc" }],
      });

      let nextCursor: string | undefined = undefined;
      const limit = input?.limit ?? 50;
      if (accounts.length > limit) {
        const nextItem = accounts.pop();
        nextCursor = nextItem!.id;
      }

      return {
        accounts,
        nextCursor,
      };
    }),

  // Get Chart of Account by ID with full details
  getById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/chart-of-accounts/{id}",
        protect: true,
        tags: ["Chart of Accounts"],
        summary: "Get chart of account by ID",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const account = await ctx.db.chartOfAccount.findUnique({
        where: { id: input.id },
        include: {
          parent: {
            select: {
              id: true,
              code: true,
              name: true,
              accountType: true,
              category: true,
            },
          },
          children: {
            select: {
              id: true,
              code: true,
              name: true,
              accountType: true,
              category: true,
              isActive: true,
            },
            orderBy: {
              code: "asc",
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          updatedBy: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          _count: {
            select: {
              claims: true,
              children: true,
              auditLogs: true,
            },
          },
        },
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chart of Account not found",
        });
      }

      return account;
    }),

  // Get COA hierarchy tree structure
  getHierarchy: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/chart-of-accounts/hierarchy",
        protect: true,
        tags: ["Chart of Accounts"],
        summary: "Get chart of accounts hierarchy tree",
      },
    })
    .input(
      z.object({
        accountType: z.nativeEnum(COAType).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {
        parentId: null,
      };

      if (input.accountType) {
        where.accountType = input.accountType;
      }

      if (input.isActive !== undefined) {
        where.isActive = input.isActive;
      }

      // Get root accounts (no parent) with nested children
      const rootAccounts = await ctx.db.chartOfAccount.findMany({
        where,
        include: {
          children: {
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
              _count: {
                select: {
                  claims: true,
                },
              },
            },
            orderBy: {
              code: "asc",
            },
          },
          _count: {
            select: {
              claims: true,
            },
          },
        },
        orderBy: [{ accountType: "asc" }, { code: "asc" }],
      });

      return rootAccounts;
    }),

  // Get only active accounts (for dropdowns)
  getActiveAccounts: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/chart-of-accounts/active",
        protect: true,
        tags: ["Chart of Accounts"],
        summary: "Get active chart of accounts for dropdowns",
      },
    })
    .input(
      z.object({
        accountType: z.nativeEnum(COAType).optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {
        isActive: true,
      };

      if (input.accountType) {
        where.accountType = input.accountType;
      }

      return ctx.db.chartOfAccount.findMany({
        where,
        select: {
          id: true,
          code: true,
          name: true,
          accountType: true,
          category: true,
          subcategory: true,
          parentId: true,
        },
        orderBy: [{ accountType: "asc" }, { code: "asc" }],
      });
    }),

  // Get accounts filtered by account type
  getByType: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/chart-of-accounts/by-type/{accountType}",
        protect: true,
        tags: ["Chart of Accounts"],
        summary: "Get chart of accounts by type",
      },
    })
    .input(
      z.object({
        accountType: z.nativeEnum(COAType),
        isActive: z.boolean().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {
        accountType: input.accountType,
      };

      if (input.isActive !== undefined) {
        where.isActive = input.isActive;
      }

      return ctx.db.chartOfAccount.findMany({
        where,
        include: {
          parent: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          _count: {
            select: {
              claims: true,
              children: true,
            },
          },
        },
        orderBy: {
          code: "asc",
        },
      });
    }),

  // Create new Chart of Account (Admin only)
  create: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/chart-of-accounts",
        protect: true,
        tags: ["Chart of Accounts"],
        summary: "Create chart of account (Admin only)",
      },
    })
    .input(
      z.object({
        code: z
          .string()
          .min(1)
          .max(20)
          .regex(/^[A-Z0-9-]+$/, "Code must contain only uppercase letters, numbers, and hyphens"),
        name: z.string().min(1).max(100),
        accountType: z.nativeEnum(COAType),
        category: z.string().min(1).max(50),
        subcategory: z.string().max(50).optional(),
        parentId: z.string().optional(),
        description: z.string().optional(),
        isActive: z.boolean().optional().default(true),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Check if code already exists
      const existing = await ctx.db.chartOfAccount.findUnique({
        where: { code: input.code },
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Account code '${input.code}' already exists`,
        });
      }

      // Validate parent exists if provided
      if (input.parentId) {
        const parent = await ctx.db.chartOfAccount.findUnique({
          where: { id: input.parentId },
        });

        if (!parent) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Parent account not found",
          });
        }

        // Validate parent has same account type
        if (parent.accountType !== input.accountType) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Parent account must have the same account type",
          });
        }
      }

      // Create the account
      const account = await ctx.db.chartOfAccount.create({
        data: {
          code: input.code,
          name: input.name,
          accountType: input.accountType,
          category: input.category,
          subcategory: input.subcategory,
          parentId: input.parentId,
          description: input.description,
          isActive: input.isActive ?? true,
          createdById: ctx.session.user.id,
          updatedById: ctx.session.user.id,
        },
        include: {
          parent: true,
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          updatedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "ChartOfAccount",
          entityId: account.id,
          chartOfAccountId: account.id,
          changes: {
            after: account,
          },
        },
      });

      return account;
    }),

  // Update existing Chart of Account (Admin only)
  update: adminProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/chart-of-accounts/{id}",
        protect: true,
        tags: ["Chart of Accounts"],
        summary: "Update chart of account (Admin only)",
      },
    })
    .input(
      z.object({
        id: z.string(),
        code: z
          .string()
          .min(1)
          .max(20)
          .regex(/^[A-Z0-9-]+$/, "Code must contain only uppercase letters, numbers, and hyphens")
          .optional(),
        name: z.string().min(1).max(100).optional(),
        accountType: z.nativeEnum(COAType).optional(),
        category: z.string().min(1).max(50).optional(),
        subcategory: z.string().max(50).optional().nullable(),
        parentId: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        isActive: z.boolean().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      // Check if account exists
      const existing = await ctx.db.chartOfAccount.findUnique({
        where: { id },
        include: {
          children: true,
          _count: {
            select: {
              claims: true,
            },
          },
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chart of Account not found",
        });
      }

      // If updating code, check for conflicts
      if (input.code && input.code !== existing.code) {
        const codeExists = await ctx.db.chartOfAccount.findUnique({
          where: { code: input.code },
        });

        if (codeExists) {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Account code '${input.code}' already exists`,
          });
        }
      }

      // Prevent circular references in parent hierarchy
      if (input.parentId !== undefined) {
        if (input.parentId === id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Account cannot be its own parent",
          });
        }

        if (input.parentId) {
          // Check if the new parent exists
          const parent = await ctx.db.chartOfAccount.findUnique({
            where: { id: input.parentId },
          });

          if (!parent) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Parent account not found",
            });
          }

          // Validate parent has same account type
          const newAccountType = input.accountType ?? existing.accountType;
          if (parent.accountType !== newAccountType) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Parent account must have the same account type",
            });
          }

          // Check if the new parent is a descendant (prevent circular reference)
          const isDescendant = await checkIsDescendant(
            ctx.db,
            id,
            input.parentId
          );
          if (isDescendant) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Cannot set a descendant as parent (circular reference)",
            });
          }
        }
      }

      // If changing account type, validate no children exist
      if (input.accountType && input.accountType !== existing.accountType) {
        if (existing.children.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Cannot change account type when child accounts exist",
          });
        }
      }

      // Update the account
      const updated = await ctx.db.chartOfAccount.update({
        where: { id },
        data: {
          ...updateData,
          updatedById: ctx.session.user.id,
        },
        include: {
          parent: true,
          children: {
            select: {
              id: true,
              code: true,
              name: true,
            },
          },
          createdBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          updatedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "ChartOfAccount",
          entityId: id,
          chartOfAccountId: id,
          changes: {
            before: existing,
            after: updated,
          },
        },
      });

      return updated;
    }),

  // Delete Chart of Account (Admin only)
  // Soft delete (isActive=false) or hard delete if no dependencies
  delete: adminProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/chart-of-accounts/{id}",
        protect: true,
        tags: ["Chart of Accounts"],
        summary: "Delete chart of account (Admin only)",
      },
    })
    .input(
      z.object({
        id: z.string(),
        force: z.boolean().optional().default(false),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Check if account exists
      const account = await ctx.db.chartOfAccount.findUnique({
        where: { id: input.id },
        include: {
          children: true,
          _count: {
            select: {
              claims: true,
            },
          },
        },
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chart of Account not found",
        });
      }

      // Check if account has children
      if (account.children.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Cannot delete account with child accounts. Please delete or reassign child accounts first.",
        });
      }

      // Check if account has claims
      if (account._count.claims > 0) {
        if (input.force) {
          // Soft delete: set isActive to false
          const updated = await ctx.db.chartOfAccount.update({
            where: { id: input.id },
            data: {
              isActive: false,
              updatedById: ctx.session.user.id,
            },
          });

          // Create audit log
          await ctx.db.auditLog.create({
            data: {
              userId: ctx.session.user.id,
              action: AuditAction.DELETE,
              entityType: "ChartOfAccount",
              entityId: input.id,
              chartOfAccountId: input.id,
              metadata: {
                deleteType: "soft",
                reason: "Has associated claims",
                claimCount: account._count.claims,
              },
            },
          });

          return {
            success: true,
            deleteType: "soft",
            account: updated,
            message: `Account deactivated. ${account._count.claims} claim(s) are still associated with this account.`,
          };
        } else {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Cannot delete account with ${account._count.claims} associated claim(s). Use force=true to deactivate instead.`,
          });
        }
      }

      // Hard delete: no dependencies
      await ctx.db.chartOfAccount.delete({
        where: { id: input.id },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.DELETE,
          entityType: "ChartOfAccount",
          entityId: input.id,
          metadata: {
            deleteType: "hard",
            deletedAccount: account,
          },
        },
      });

      return {
        success: true,
        deleteType: "hard",
        message: "Account permanently deleted",
      };
    }),

  // Toggle active status (Admin only)
  toggleActive: adminProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/chart-of-accounts/{id}/toggle-active",
        protect: true,
        tags: ["Chart of Accounts"],
        summary: "Toggle chart of account active status (Admin only)",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const account = await ctx.db.chartOfAccount.findUnique({
        where: { id: input.id },
      });

      if (!account) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Chart of Account not found",
        });
      }

      const newActiveStatus = !account.isActive;

      // If activating, check parent is also active
      if (newActiveStatus && account.parentId) {
        const parent = await ctx.db.chartOfAccount.findUnique({
          where: { id: account.parentId },
        });

        if (parent && !parent.isActive) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Cannot activate account when parent account is inactive",
          });
        }
      }

      // If deactivating, deactivate all children too
      if (!newActiveStatus) {
        const childrenCount = await ctx.db.chartOfAccount.count({
          where: { parentId: input.id, isActive: true },
        });

        if (childrenCount > 0) {
          // Deactivate all active children
          await ctx.db.chartOfAccount.updateMany({
            where: { parentId: input.id, isActive: true },
            data: {
              isActive: false,
              updatedById: ctx.session.user.id,
            },
          });
        }
      }

      const updated = await ctx.db.chartOfAccount.update({
        where: { id: input.id },
        data: {
          isActive: newActiveStatus,
          updatedById: ctx.session.user.id,
        },
        include: {
          parent: true,
          children: true,
          updatedBy: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "ChartOfAccount",
          entityId: input.id,
          chartOfAccountId: input.id,
          metadata: {
            action: "toggle_active",
            previousStatus: account.isActive,
            newStatus: newActiveStatus,
          },
        },
      });

      return updated;
    }),
});

// Helper function to check if an account is a descendant of another
async function checkIsDescendant(
  db: any,
  ancestorId: string,
  descendantId: string
): Promise<boolean> {
  const descendant = await db.chartOfAccount.findUnique({
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
