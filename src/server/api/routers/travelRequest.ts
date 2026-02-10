import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  TravelType,
  TravelStatus,
  ApprovalLevel,
  ApprovalStatus,
  AuditAction,
} from "../../../../generated/prisma";

import {
  createTRPCRouter,
  protectedProcedure,
  supervisorProcedure,
  managerProcedure,
} from "@/server/api/trpc";

export const travelRequestRouter = createTRPCRouter({
  // Get all travel requests with filters
  getAll: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/travel-requests',
        protect: true,
        tags: ['Travel Requests'],
        summary: 'Get all travel requests',
      }
    })
    .input(
      z.object({
        status: z.nativeEnum(TravelStatus).optional(),
        travelType: z.nativeEnum(TravelType).optional(),
        requesterId: z.string().optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {
        deletedAt: null,
      };

      // Non-managers can only see their own requests and their team's requests
      if (!["MANAGER", "DIRECTOR", "ADMIN", "FINANCE"].includes(ctx.session.user.role)) {
        where.OR = [
          { requesterId: ctx.session.user.id },
          { participants: { some: { userId: ctx.session.user.id } } },
        ];
      }

      if (input?.status) {
        where.status = input.status;
      }

      if (input?.travelType) {
        where.travelType = input.travelType;
      }

      if (input?.requesterId) {
        where.requesterId = input.requesterId;
      }

      if (input?.startDate || input?.endDate) {
        where.AND = [];
        if (input.startDate) {
          where.AND.push({ startDate: { gte: input.startDate } });
        }
        if (input.endDate) {
          where.AND.push({ endDate: { lte: input.endDate } });
        }
      }

      const requests = await ctx.db.travelRequest.findMany({
        take: input?.limit ? input.limit + 1 : 51,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where,
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              department: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          approvals: {
            include: {
              approver: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          },
          _count: {
            select: {
              claims: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      let nextCursor: string | undefined = undefined;
      const limit = input?.limit ?? 50;
      if (requests.length > limit) {
        const nextItem = requests.pop();
        nextCursor = nextItem!.id;
      }

      return {
        requests,
        nextCursor,
      };
    }),

  // Get travel request by ID
  getById: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/travel-requests/{id}',
        protect: true,
        tags: ['Travel Requests'],
        summary: 'Get travel request by ID',
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const request = await ctx.db.travelRequest.findUnique({
        where: { id: input.id },
        include: {
          requester: {
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
          },
          participants: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  employeeId: true,
                  department: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },
            },
          },
          approvals: {
            include: {
              approver: {
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
          },
          claims: {
            include: {
              submitter: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
        },
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      // Check access rights
      const isRequester = request.requesterId === ctx.session.user.id;
      const isParticipant = request.participants.some(
        (p) => p.userId === ctx.session.user.id
      );
      const canView = ["MANAGER", "DIRECTOR", "ADMIN", "FINANCE"].includes(
        ctx.session.user.role
      );

      if (!isRequester && !isParticipant && !canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this travel request",
        });
      }

      return request;
    }),

  // Get pending approvals for current user
  getPendingApprovals: supervisorProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/travel-requests/pending-approvals',
        protect: true,
        tags: ['Travel Requests'],
        summary: 'Get pending approvals for current user',
      }
    })
    .input(z.object({}))
    .output(z.any())
    .query(async ({ ctx }) => {
    return ctx.db.travelRequest.findMany({
      where: {
        deletedAt: null,
        approvals: {
          some: {
            approverId: ctx.session.user.id,
            status: ApprovalStatus.PENDING,
          },
        },
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            employeeId: true,
            department: {
              select: {
                name: true,
              },
            },
          },
        },
        participants: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        approvals: {
          where: {
            approverId: ctx.session.user.id,
            status: ApprovalStatus.PENDING,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  }),

  // Create travel request
  create: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/travel-requests',
        protect: true,
        tags: ['Travel Requests'],
        summary: 'Create travel request',
      }
    })
    .input(
      z.object({
        purpose: z.string().min(10),
        destination: z.string().min(1),
        travelType: z.nativeEnum(TravelType),
        startDate: z.date(),
        endDate: z.date(),
        estimatedBudget: z.number().positive().optional(),
        projectName: z.string().optional(),
        customerName: z.string().optional(),
        salesPerson: z.string().optional(),
        participantIds: z.array(z.string()).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { participantIds, ...requestData } = input;

      // Validate dates
      if (input.startDate >= input.endDate) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "End date must be after start date",
        });
      }

      // Generate request number
      const year = new Date().getFullYear();
      const count = await ctx.db.travelRequest.count({
        where: {
          requestNumber: {
            startsWith: `TR-${year}`,
          },
        },
      });
      const requestNumber = `TR-${year}-${String(count + 1).padStart(5, "0")}`;

      // Create request
      const request = await ctx.db.travelRequest.create({
        data: {
          requestNumber,
          requesterId: ctx.session.user.id,
          ...requestData,
          participants: participantIds
            ? {
                create: participantIds.map((userId) => ({
                  userId,
                })),
              }
            : undefined,
        },
        include: {
          requester: true,
          participants: {
            include: {
              user: true,
            },
          },
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "TravelRequest",
          entityId: request.id,
          changes: {
            after: request,
          },
        },
      });

      return request;
    }),

  // Update travel request (only in DRAFT or REVISION status)
  update: protectedProcedure
    .meta({
      openapi: {
        method: 'PUT',
        path: '/travel-requests/{id}',
        protect: true,
        tags: ['Travel Requests'],
        summary: 'Update travel request',
      }
    })
    .input(
      z.object({
        id: z.string(),
        purpose: z.string().min(10).optional(),
        destination: z.string().min(1).optional(),
        travelType: z.nativeEnum(TravelType).optional(),
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        estimatedBudget: z.number().positive().optional(),
        projectName: z.string().optional(),
        customerName: z.string().optional(),
        salesPerson: z.string().optional(),
        participantIds: z.array(z.string()).optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { id, participantIds, ...updateData } = input;

      const existing = await ctx.db.travelRequest.findUnique({
        where: { id },
        include: {
          participants: true,
        },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      // Only requester can update
      if (existing.requesterId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the requester can update this request",
        });
      }

      // Can only update DRAFT or REVISION requests
      if (![TravelStatus.DRAFT, TravelStatus.REVISION].includes(existing.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only update requests in DRAFT or REVISION status",
        });
      }

      // Validate dates if both provided
      if (updateData.startDate && updateData.endDate) {
        if (updateData.startDate >= updateData.endDate) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "End date must be after start date",
          });
        }
      }

      // Update participants if provided
      if (participantIds) {
        await ctx.db.travelParticipant.deleteMany({
          where: { travelRequestId: id },
        });
      }

      const updated = await ctx.db.travelRequest.update({
        where: { id },
        data: {
          ...updateData,
          participants: participantIds
            ? {
                create: participantIds.map((userId) => ({
                  userId,
                })),
              }
            : undefined,
        },
        include: {
          requester: true,
          participants: {
            include: {
              user: true,
            },
          },
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "TravelRequest",
          entityId: id,
          changes: {
            before: existing,
            after: updated,
          },
        },
      });

      return updated;
    }),

  // Submit travel request for approval
  submit: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/travel-requests/{id}/submit',
        protect: true,
        tags: ['Travel Requests'],
        summary: 'Submit travel request for approval',
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.travelRequest.findUnique({
        where: { id: input.id },
        include: {
          requester: {
            include: {
              supervisor: true,
              department: true,
            },
          },
        },
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      if (request.requesterId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the requester can submit this request",
        });
      }

      if (![TravelStatus.DRAFT, TravelStatus.REVISION].includes(request.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only submit requests in DRAFT or REVISION status",
        });
      }

      // Create approval workflow
      const approvals = [];

      // L1: Supervisor
      if (request.requester.supervisorId) {
        approvals.push({
          level: ApprovalLevel.L1_SUPERVISOR,
          approverId: request.requester.supervisorId,
        });
      }

      // L2: Manager (department manager)
      if (request.requester.department?.managerId) {
        approvals.push({
          level: ApprovalLevel.L2_MANAGER,
          approverId: request.requester.department.managerId,
        });
      }

      // L3: Director (department director)
      if (request.requester.department?.directorId) {
        approvals.push({
          level: ApprovalLevel.L3_DIRECTOR,
          approverId: request.requester.department.directorId,
        });
      }

      // Update request and create approvals
      const updated = await ctx.db.travelRequest.update({
        where: { id: input.id },
        data: {
          status: TravelStatus.SUBMITTED,
          submittedAt: new Date(),
          approvals: {
            create: approvals,
          },
        },
        include: {
          approvals: {
            include: {
              approver: true,
            },
          },
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.SUBMIT,
          entityType: "TravelRequest",
          entityId: input.id,
        },
      });

      // TODO: Send notifications to approvers

      return updated;
    }),

  // Lock travel request (Finance)
  lock: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/travel-requests/{id}/lock',
        protect: true,
        tags: ['Travel Requests'],
        summary: 'Lock travel request',
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!["FINANCE", "ADMIN"].includes(ctx.session.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can lock travel requests",
        });
      }

      const request = await ctx.db.travelRequest.findUnique({
        where: { id: input.id },
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      if (request.status !== TravelStatus.APPROVED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only lock approved travel requests",
        });
      }

      const updated = await ctx.db.travelRequest.update({
        where: { id: input.id },
        data: {
          status: TravelStatus.LOCKED,
          lockedAt: new Date(),
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.LOCK,
          entityType: "TravelRequest",
          entityId: input.id,
        },
      });

      return updated;
    }),

  // Close travel request (Finance)
  close: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/travel-requests/{id}/close',
        protect: true,
        tags: ['Travel Requests'],
        summary: 'Close travel request',
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!["FINANCE", "ADMIN"].includes(ctx.session.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can close travel requests",
        });
      }

      const request = await ctx.db.travelRequest.findUnique({
        where: { id: input.id },
        include: {
          claims: {
            where: {
              status: {
                notIn: ["PAID", "REJECTED"],
              },
            },
          },
        },
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      if (request.status !== TravelStatus.LOCKED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only close locked travel requests",
        });
      }

      // Check if all claims are settled
      if (request.claims.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot close request with pending claims",
        });
      }

      const updated = await ctx.db.travelRequest.update({
        where: { id: input.id },
        data: {
          status: TravelStatus.CLOSED,
          closedAt: new Date(),
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CLOSE,
          entityType: "TravelRequest",
          entityId: input.id,
        },
      });

      return updated;
    }),

  // Delete travel request (soft delete)
  delete: protectedProcedure
    .meta({
      openapi: {
        method: 'DELETE',
        path: '/travel-requests/{id}',
        protect: true,
        tags: ['Travel Requests'],
        summary: 'Delete travel request',
      }
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const request = await ctx.db.travelRequest.findUnique({
        where: { id: input.id },
        include: {
          claims: true,
        },
      });

      if (!request) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel request not found",
        });
      }

      // Only requester or admin can delete
      const canDelete =
        request.requesterId === ctx.session.user.id ||
        ctx.session.user.role === "ADMIN";

      if (!canDelete) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to delete this request",
        });
      }

      // Can only delete DRAFT requests
      if (request.status !== TravelStatus.DRAFT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only delete requests in DRAFT status",
        });
      }

      const updated = await ctx.db.travelRequest.update({
        where: { id: input.id },
        data: {
          deletedAt: new Date(),
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.DELETE,
          entityType: "TravelRequest",
          entityId: input.id,
        },
      });

      return updated;
    }),

  // Get statistics
  getStatistics: managerProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/travel-requests/statistics',
        protect: true,
        tags: ['Travel Requests'],
        summary: 'Get travel request statistics',
      }
    })
    .input(
      z.object({
        startDate: z.date().optional(),
        endDate: z.date().optional(),
        departmentId: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {
        deletedAt: null,
      };

      if (input?.departmentId) {
        where.requester = {
          departmentId: input.departmentId,
        };
      }

      if (input?.startDate || input?.endDate) {
        where.AND = [];
        if (input.startDate) {
          where.AND.push({ createdAt: { gte: input.startDate } });
        }
        if (input.endDate) {
          where.AND.push({ createdAt: { lte: input.endDate } });
        }
      }

      const [total, byStatus, byType] = await Promise.all([
        ctx.db.travelRequest.count({ where }),
        ctx.db.travelRequest.groupBy({
          by: ["status"],
          where,
          _count: true,
        }),
        ctx.db.travelRequest.groupBy({
          by: ["travelType"],
          where,
          _count: true,
        }),
      ]);

      return {
        total,
        byStatus: byStatus.map((item) => ({
          status: item.status,
          count: item._count,
        })),
        byType: byType.map((item) => ({
          type: item.travelType,
          count: item._count,
        })),
      };
    }),
});