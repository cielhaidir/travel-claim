import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { AuditAction, type Prisma } from "../../../../generated/prisma";

import {
  createTRPCRouter,
  protectedProcedure,
  managerProcedure,
  adminProcedure,
} from "@/server/api/trpc";

export const auditLogRouter = createTRPCRouter({
  // Get all audit logs (admin/manager only)
  getAll: managerProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/audit-logs',
        protect: true,
        tags: ['Audit Logs'],
        summary: 'Get all audit logs',
      }
    })
    .input(
      z.object({
        userId: z.string().optional(),
        action: z.nativeEnum(AuditAction).optional(),
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.AuditLogWhereInput = {};

      if (input?.userId) {
        where.userId = input.userId;
      }

      if (input?.action) {
        where.action = input.action;
      }

      if (input?.entityType) {
        where.entityType = input.entityType;
      }

      if (input?.entityId) {
        where.entityId = input.entityId;
      }

      const andFiltersMain: Prisma.AuditLogWhereInput[] = [];
      if (input?.startDate) {
        andFiltersMain.push({ createdAt: { gte: input.startDate } });
      }
      if (input?.endDate) {
        andFiltersMain.push({ createdAt: { lte: input.endDate } });
      }
      if (andFiltersMain.length > 0) where.AND = andFiltersMain;

      const logs = await ctx.db.auditLog.findMany({
        take: input?.limit ? input.limit + 1 : 51,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      let nextCursor: string | undefined = undefined;
      const limit = input?.limit ?? 50;
      if (logs.length > limit) {
        const nextItem = logs.pop();
        nextCursor = nextItem!.id;
      }

      return {
        logs,
        nextCursor,
      };
    }),

  // Get audit log by ID
  getById: managerProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/audit-logs/{id}',
        protect: true,
        tags: ['Audit Logs'],
        summary: 'Get audit log by ID',
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const log = await ctx.db.auditLog.findUnique({
        where: { id: input.id },
        include: {
          user: {
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
          },
        },
      });

      if (!log) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Audit log not found",
        });
      }

      return log;
    }),

  // Get audit logs for specific entity
  getByEntity: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/audit-logs/by-entity',
        protect: true,
        tags: ['Audit Logs'],
        summary: 'Get audit logs for specific entity',
      }
    })
    .input(
      z.object({
        entityType: z.string(),
        entityId: z.string(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      // Check if user has access to view this entity's audit logs
      // For now, only managers and above can view entity audit logs
      if (!["MANAGER", "DIRECTOR", "ADMIN", "FINANCE"].includes(ctx.session.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Insufficient permissions to view audit logs",
        });
      }

      return ctx.db.auditLog.findMany({
        where: {
          entityType: input.entityType,
          entityId: input.entityId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }),

  // Get audit logs for current user's actions
  getMyActions: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/audit-logs/my-actions',
        protect: true,
        tags: ['Audit Logs'],
        summary: 'Get my audit logs',
      }
    })
    .input(
      z.object({
        action: z.nativeEnum(AuditAction).optional(),
        entityType: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.AuditLogWhereInput = {
        userId: ctx.session.user.id,
      };

      if (input?.action) {
        where.action = input.action;
      }

      if (input?.entityType) {
        where.entityType = input.entityType;
      }

      const andFiltersMyLogs: Prisma.AuditLogWhereInput[] = [];
      if (input?.startDate) {
        andFiltersMyLogs.push({ createdAt: { gte: input.startDate } });
      }
      if (input?.endDate) {
        andFiltersMyLogs.push({ createdAt: { lte: input.endDate } });
      }
      if (andFiltersMyLogs.length > 0) where.AND = andFiltersMyLogs;

      const logs = await ctx.db.auditLog.findMany({
        take: input?.limit ? input.limit + 1 : 51,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where,
        orderBy: {
          createdAt: "desc",
        },
      });

      let nextCursor: string | undefined = undefined;
      const limit = input?.limit ?? 50;
      if (logs.length > limit) {
        const nextItem = logs.pop();
        nextCursor = nextItem!.id;
      }

      return {
        logs,
        nextCursor,
      };
    }),

  // Get audit trail for a specific travel request
  getTravelRequestTrail: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/audit-logs/travel-request/{travelRequestId}',
        protect: true,
        tags: ['Audit Logs'],
        summary: 'Get audit trail for travel request',
      }
    })
    .input(z.object({ travelRequestId: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      // Verify access to travel request
      const travelRequest = await ctx.db.travelRequest.findUnique({
        where: { id: input.travelRequestId },
        include: {
          participants: true,
        },
      });

      if (!travelRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      // Check access rights
      const isRequester = travelRequest.requesterId === ctx.session.user.id;
      const isParticipant = travelRequest.participants.some(
        (p) => p.userId === ctx.session.user.id
      );
      const canView = ["MANAGER", "DIRECTOR", "ADMIN", "FINANCE"].includes(
        ctx.session.user.role
      );

      if (!isRequester && !isParticipant && !canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view audit trail for this travel request",
        });
      }

      return ctx.db.auditLog.findMany({
        where: {
          entityType: "TravelRequest",
          entityId: input.travelRequestId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    }),

  // Get audit trail for a specific claim
  getClaimTrail: protectedProcedure
    .input(z.object({ claimId: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      // Verify access to claim
      const claim = await ctx.db.claim.findUnique({
        where: { id: input.claimId },
        include: {
          travelRequest: {
            include: {
              participants: true,
            },
          },
        },
      });

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      // Check access rights
      const isSubmitter = claim.submitterId === ctx.session.user.id;
      const isRequester = claim.travelRequest.requesterId === ctx.session.user.id;
      const isParticipant = claim.travelRequest.participants.some(
        (p) => p.userId === ctx.session.user.id
      );
      const canView = ["FINANCE", "ADMIN", "MANAGER", "DIRECTOR"].includes(
        ctx.session.user.role
      );

      if (!isSubmitter && !isRequester && !isParticipant && !canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view audit trail for this claim",
        });
      }

      return ctx.db.auditLog.findMany({
        where: {
          entityType: "Claim",
          entityId: input.claimId,
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      });
    }),

  // Get recent activity (for dashboards)
  getRecentActivity: managerProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).optional(),
        entityTypes: z.array(z.string()).optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.AuditLogWhereInput = {};

      if (input?.entityTypes && input.entityTypes.length > 0) {
        where.entityType = {
          in: input.entityTypes,
        };
      }

      return ctx.db.auditLog.findMany({
        take: input?.limit ?? 20,
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }),

  // Get audit statistics
  getStatistics: adminProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        userId: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.AuditLogWhereInput = {};

      if (input?.userId) {
        where.userId = input.userId;
      }

      const andFiltersStats: Prisma.AuditLogWhereInput[] = [];
      if (input?.startDate) {
        andFiltersStats.push({ createdAt: { gte: input.startDate } });
      }
      if (input?.endDate) {
        andFiltersStats.push({ createdAt: { lte: input.endDate } });
      }
      if (andFiltersStats.length > 0) where.AND = andFiltersStats;

      const [total, byAction, byEntityType, byUser] = await Promise.all([
        ctx.db.auditLog.count({ where }),
        ctx.db.auditLog.groupBy({
          by: ["action"],
          where,
          _count: true,
        }),
        ctx.db.auditLog.groupBy({
          by: ["entityType"],
          where,
          _count: true,
        }),
        ctx.db.auditLog.groupBy({
          by: ["userId"],
          where,
          _count: true,
          orderBy: {
            _count: {
              userId: "desc",
            },
          },
          take: 10,
        }),
      ]);

      // Get user details for top users
      const userIds = byUser.map((item) => item.userId);
      const users = await ctx.db.user.findMany({
        where: {
          id: { in: userIds },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });

      const topUsers = byUser.map((item) => {
        const user = users.find((u) => u.id === item.userId);
        return {
          userId: item.userId,
          userName: user?.name ?? "Unknown",
          userEmail: user?.email ?? "",
          userRole: user?.role ?? "EMPLOYEE",
          count: item._count,
        };
      });

      return {
        total,
        byAction: byAction.map((item) => ({
          action: item.action,
          count: item._count,
        })),
        byEntityType: byEntityType.map((item) => ({
          entityType: item.entityType,
          count: item._count,
        })),
        topUsers,
      };
    }),

  // Search audit logs
  search: managerProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().min(1).max(100).optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      // Search in entity IDs and entity types
      const logs = await ctx.db.auditLog.findMany({
        take: input.limit,
        where: {
          OR: [
            { entityId: { contains: input.query, mode: "insensitive" } },
            { entityType: { contains: input.query, mode: "insensitive" } },
          ],
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      return logs;
    }),

  // Export audit logs (admin only)
  export: adminProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        userId: z.string().optional(),
        entityType: z.string().optional(),
        action: z.nativeEnum(AuditAction).optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.AuditLogWhereInput = {};

      if (input?.userId) {
        where.userId = input.userId;
      }

      if (input?.entityType) {
        where.entityType = input.entityType;
      }

      if (input?.action) {
        where.action = input.action;
      }

      const andFiltersExport: Prisma.AuditLogWhereInput[] = [];
      if (input?.startDate) {
        andFiltersExport.push({ createdAt: { gte: input.startDate } });
      }
      if (input?.endDate) {
        andFiltersExport.push({ createdAt: { lte: input.endDate } });
      }
      if (andFiltersExport.length > 0) where.AND = andFiltersExport;

      const logs = await ctx.db.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              role: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      // Return data for export (would be converted to CSV/Excel on client side)
      return logs.map((log) => ({
        id: log.id,
        timestamp: log.createdAt.toISOString(),
        userId: log.userId,
        userName: log.user.name,
        userEmail: log.user.email,
        userRole: log.user.role,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        changes: log.changes,
        metadata: log.metadata,
      }));
    }),
});