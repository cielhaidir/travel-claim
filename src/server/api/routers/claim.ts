import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  ClaimType,
  ClaimStatus,
  EntertainmentType,
  NonEntertainmentCategory,
  ApprovalLevel,
  TravelStatus,
  AuditAction,
  type Prisma,
} from "../../../../generated/prisma";
import { generateApprovalNumber } from "@/lib/utils/numberGenerators";

import {
  createTRPCRouter,
  protectedProcedure,
  financeProcedure,
} from "@/server/api/trpc";

export const claimRouter = createTRPCRouter({
  // Get all claims with filters
  getAll: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/claims',
        protect: true,
        tags: ['Claims'],
        summary: 'Get all claims',
      }
    })
    .input(
      z.object({
        status: z.nativeEnum(ClaimStatus).optional(),
        claimType: z.nativeEnum(ClaimType).optional(),
        travelRequestId: z.string().optional(),
        submitterId: z.string().optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }).optional()
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.ClaimWhereInput = {
        deletedAt: null,
      };

      // Non-finance users can only see their own claims
      if (!["FINANCE", "ADMIN", "MANAGER", "DIRECTOR"].includes(ctx.session.user.role)) {
        where.submitterId = ctx.session.user.id;
      }

      if (input?.status) {
        where.status = input.status;
      }

      if (input?.claimType) {
        where.claimType = input.claimType;
      }

      if (input?.travelRequestId) {
        where.travelRequestId = input.travelRequestId;
      }

      if (input?.submitterId) {
        where.submitterId = input.submitterId;
      }

      const andFilters: Prisma.ClaimWhereInput[] = [];
      if (input?.startDate) {
        andFilters.push({ createdAt: { gte: input.startDate } });
      }
      if (input?.endDate) {
        andFilters.push({ createdAt: { lte: input.endDate } });
      }
      if (andFilters.length > 0) where.AND = andFilters;

      const claims = await ctx.db.claim.findMany({
        take: input?.limit ? input.limit + 1 : 51,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where,
        include: {
          submitter: {
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
          travelRequest: {
            select: {
              id: true,
              requestNumber: true,
              destination: true,
              travelType: true,
              status: true,
            },
          },
          attachments: {
            select: {
              id: true,
              filename: true,
              mimeType: true,
              fileSize: true,
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
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      let nextCursor: string | undefined = undefined;
      const limit = input?.limit ?? 50;
      if (claims.length > limit) {
        const nextItem = claims.pop();
        nextCursor = nextItem!.id;
      }

      return {
        claims,
        nextCursor,
      };
    }),

  // Get claim by ID
  getById: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/claims/{id}',
        protect: true,
        tags: ['Claims'],
        summary: 'Get claim by ID',
      },
      mcp: {
        enabled: true,
        name: "get_claim",
        description: "Get detailed information about a specific claim for review or resume",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const claim = await ctx.db.claim.findUnique({
        where: { id: input.id },
        include: {
          submitter: {
            include: {
              department: true,
            },
          },
          travelRequest: {
            include: {
              requester: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
          },
          attachments: true,
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
      const canView = ["FINANCE", "ADMIN", "MANAGER", "DIRECTOR"].includes(
        ctx.session.user.role
      );

      if (!isSubmitter && !isRequester && !canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this claim",
        });
      }

      return claim;
    }),

  // Get claims by travel request
  getByTravelRequest: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/claims/by-travel-request/{travelRequestId}',
        protect: true,
        tags: ['Claims'],
        summary: 'Get claims by travel request',
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

      const isRequester = travelRequest.requesterId === ctx.session.user.id;
      const isParticipant = travelRequest.participants.some(
        (p) => p.userId === ctx.session.user.id
      );
      const canView = ["FINANCE", "ADMIN", "MANAGER", "DIRECTOR"].includes(
        ctx.session.user.role
      );

      if (!isRequester && !isParticipant && !canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view claims for this travel request",
        });
      }

      return ctx.db.claim.findMany({
        where: {
          travelRequestId: input.travelRequestId,
          deletedAt: null,
        },
        include: {
          submitter: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          attachments: {
            select: {
              id: true,
              filename: true,
              mimeType: true,
              fileSize: true,
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
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      });
    }),

  // Create entertainment claim
  createEntertainment: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/claims/entertainment',
        protect: true,
        tags: ['Claims'],
        summary: 'Create entertainment claim',
      },
      mcp: {
        enabled: true,
        name: "create_entertainment_claim_draft",
        description: "Create a draft entertainment claim for a travel request",
      },
    })
    .input(
      z.object({
        travelRequestId: z.string(),
        entertainmentType: z.nativeEnum(EntertainmentType),
        entertainmentDate: z.coerce.date(),
        entertainmentLocation: z.string(),
        entertainmentAddress: z.string().optional(),
        guestName: z.string(),
        guestCompany: z.string().optional(),
        guestPosition: z.string().optional(),
        isGovernmentOfficial: z.boolean().optional(),
        amount: z.number().positive(),
        description: z.string().min(10),
        notes: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { travelRequestId, ...claimData } = input;

      // Verify travel request exists and is approved
      const travelRequest = await ctx.db.travelRequest.findUnique({
        where: { id: travelRequestId },
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

      // Check if user is requester or participant
      const isRequester = travelRequest.requesterId === ctx.session.user.id;
      const isParticipant = travelRequest.participants.some(
        (p) => p.userId === ctx.session.user.id
      );

      if (!isRequester && !isParticipant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to create claims for this travel request",
        });
      }

      // Check if travel request is approved or locked
      if (!([ TravelStatus.APPROVED, TravelStatus.LOCKED] as TravelStatus[]).includes(travelRequest.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Claims can only be created for approved travel requests",
        });
      }

      // Generate claim number
      const year = new Date().getFullYear();
      const count = await ctx.db.claim.count({
        where: {
          claimNumber: {
            startsWith: `CLM-${year}`,
          },
        },
      });
      const claimNumber = `CLM-${year}-${String(count + 1).padStart(5, "0")}`;

      // Create claim
      const claim = await ctx.db.claim.create({
        data: {
          claimNumber,
          travelRequestId,
          submitterId: ctx.session.user.id,
          claimType: ClaimType.ENTERTAINMENT,
          ...claimData,
        },
        include: {
          submitter: { select: { id: true, name: true, email: true, employeeId: true, role: true, departmentId: true, phoneNumber: true, image: true } },
          travelRequest: true,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "Claim",
          entityId: claim.id,
          changes: {
            after: claim,
          },
        },
      });

      return claim;
    }),

  // Create non-entertainment claim
  createNonEntertainment: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/claims/non-entertainment',
        protect: true,
        tags: ['Claims'],
        summary: 'Create non-entertainment claim',
      },
      mcp: {
        enabled: true,
        name: "create_nonentertainment_claim_draft",
        description: "Create a draft non-entertainment claim for a travel request",
      },
    })
    .input(
      z.object({
        travelRequestId: z.string(),
        expenseCategory: z.nativeEnum(NonEntertainmentCategory),
        expenseDate: z.coerce.date(),
        expenseDestination: z.string().optional(),
        customerName: z.string().optional(),
        amount: z.number().positive(),
        description: z.string().min(10),
        notes: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { travelRequestId, ...claimData } = input;

      // Verify travel request
      const travelRequest = await ctx.db.travelRequest.findUnique({
        where: { id: travelRequestId },
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

      // Check authorization
      const isRequester = travelRequest.requesterId === ctx.session.user.id;
      const isParticipant = travelRequest.participants.some(
        (p) => p.userId === ctx.session.user.id
      );

      if (!isRequester && !isParticipant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not authorized to create claims for this travel request",
        });
      }

      // Check travel request status
      if (!([TravelStatus.APPROVED, TravelStatus.LOCKED] as TravelStatus[]).includes(travelRequest.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Claims can only be created for approved travel requests",
        });
      }

      // Generate claim number
      const year = new Date().getFullYear();
      const count = await ctx.db.claim.count({
        where: {
          claimNumber: {
            startsWith: `CLM-${year}`,
          },
        },
      });
      const claimNumber = `CLM-${year}-${String(count + 1).padStart(5, "0")}`;

      // Create claim
      const claim = await ctx.db.claim.create({
        data: {
          claimNumber,
          travelRequestId,
          submitterId: ctx.session.user.id,
          claimType: ClaimType.NON_ENTERTAINMENT,
          ...claimData,
        },
        include: {
          submitter: { select: { id: true, name: true, email: true, employeeId: true, role: true, departmentId: true, phoneNumber: true, image: true } },
          travelRequest: true,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "Claim",
          entityId: claim.id,
          changes: {
            after: claim,
          },
        },
      });

      return claim;
    }),

  // Update claim (only in DRAFT or REVISION status)
  update: protectedProcedure
    .meta({
      openapi: {
        method: 'PUT',
        path: '/claims/{id}',
        protect: true,
        tags: ['Claims'],
        summary: 'Update claim',
      },
      mcp: {
        enabled: true,
        name: "update_claim_draft",
        description: "Update a claim draft (only works for DRAFT or REVISION status)",
      },
    })
    .input(
      z.object({
        id: z.string(),
        entertainmentType: z.nativeEnum(EntertainmentType).optional(),
        entertainmentDate: z.coerce.date().optional(),
        entertainmentLocation: z.string().optional(),
        entertainmentAddress: z.string().optional(),
        guestName: z.string().optional(),
        guestCompany: z.string().optional(),
        guestPosition: z.string().optional(),
        isGovernmentOfficial: z.boolean().optional(),
        expenseCategory: z.nativeEnum(NonEntertainmentCategory).optional(),
        expenseDate: z.coerce.date().optional(),
        expenseDestination: z.string().optional(),
        customerName: z.string().optional(),
        amount: z.number().positive().optional(),
        description: z.string().min(10).optional(),
        notes: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.db.claim.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      // Only submitter can update
      if (existing.submitterId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the submitter can update this claim",
        });
      }

      // Can only update DRAFT or REVISION claims
      if (!([ClaimStatus.DRAFT, ClaimStatus.REVISION] as ClaimStatus[]).includes(existing.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only update claims in DRAFT or REVISION status",
        });
      }

      const updated = await ctx.db.claim.update({
        where: { id },
        data: updateData,
        include: {
          submitter: { select: { id: true, name: true, email: true, employeeId: true, role: true, departmentId: true, phoneNumber: true, image: true } },
          travelRequest: true,
          attachments: true,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Claim",
          entityId: id,
          changes: {
            before: existing,
            after: updated,
          },
        },
      });

      return updated;
    }),

  // Submit claim for approval
  submit: protectedProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/claims/{id}/submit',
        protect: true,
        tags: ['Claims'],
        summary: 'Submit claim for approval',
      },
      mcp: {
        enabled: true,
        name: "submit_claim",
        description: "Submit a draft claim for approval",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.claim.findUnique({
        where: { id: input.id },
        include: {
          submitter: {
            include: {
              supervisor: true,
              department: true,
            },
          },
          travelRequest: true,
          attachments: true,
        },
      });

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      if (claim.submitterId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only the submitter can submit this claim",
        });
      }

      if (!([ClaimStatus.DRAFT, ClaimStatus.REVISION] as ClaimStatus[]).includes(claim.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only submit claims in DRAFT or REVISION status",
        });
      }

      // Validate attachments exist
      if (claim.attachments.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "At least one attachment is required to submit a claim",
        });
      }

      // Create approval workflow
      const approvalEntries: { level: ApprovalLevel; approverId: string }[] = [];

      // L1: Supervisor
      if (claim.submitter.supervisorId) {
        approvalEntries.push({
          level: ApprovalLevel.L1_SUPERVISOR,
          approverId: claim.submitter.supervisorId,
        });
      }

      // L2: Finance for high amounts (example: > 5000000)
      if (Number(claim.amount) > 5000000) {
        // Find finance user
        const financeUser = await ctx.db.user.findFirst({
          where: {
            role: "FINANCE",
            deletedAt: null,
          },
        });

        if (financeUser) {
          approvalEntries.push({
            level: ApprovalLevel.L2_MANAGER,
            approverId: financeUser.id,
          });
        }
      }

      // Generate a unique approvalNumber for each approval record
      const approvalsWithNumbers = await Promise.all(
        approvalEntries.map(async (entry) => ({
          ...entry,
          approvalNumber: await generateApprovalNumber(ctx.db),
        }))
      );

      // Update claim and create approvals
      const updated = await ctx.db.claim.update({
        where: { id: input.id },
        data: {
          status: ClaimStatus.SUBMITTED,
          approvals: {
            create: approvalsWithNumbers,
          },
        },
        include: {
          approvals: {
            include: {
              approver: { select: { id: true, name: true, email: true, employeeId: true, role: true, departmentId: true, image: true } },
            },
          },
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.SUBMIT,
          entityType: "Claim",
          entityId: input.id,
        },
      });

      // TODO: Send notifications to approvers

      return updated;
    }),

  // Mark claim as paid (Finance only)
  markAsPaid: financeProcedure
    .input(
      z.object({
        id: z.string(),
        paymentReference: z.string(),
        paidBy: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.claim.findUnique({
        where: { id: input.id },
      });

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      if (claim.status !== ClaimStatus.APPROVED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only mark approved claims as paid",
        });
      }

      const updated = await ctx.db.claim.update({
        where: { id: input.id },
        data: {
          status: ClaimStatus.PAID,
          isPaid: true,
          paidAt: new Date(),
          paidBy: input.paidBy ?? ctx.session.user.name,
          paymentReference: input.paymentReference,
        },
      });

      // Update travel request total reimbursed
      const totalPaid = await ctx.db.claim.aggregate({
        where: {
          travelRequestId: claim.travelRequestId,
          status: ClaimStatus.PAID,
        },
        _sum: {
          amount: true,
        },
      });

      await ctx.db.travelRequest.update({
        where: { id: claim.travelRequestId },
        data: {
          totalReimbursed: totalPaid._sum.amount ?? 0,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Claim",
          entityId: input.id,
          metadata: {
            action: "marked_as_paid",
            paymentReference: input.paymentReference,
          },
        },
      });

      return updated;
    }),

  // Delete claim (soft delete)
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.claim.findUnique({
        where: { id: input.id },
      });

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      // Only submitter or admin can delete
      const canDelete =
        claim.submitterId === ctx.session.user.id ||
        ctx.session.user.role === "ADMIN";

      if (!canDelete) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to delete this claim",
        });
      }

      // Can only delete DRAFT claims
      if (claim.status !== ClaimStatus.DRAFT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only delete claims in DRAFT status",
        });
      }

      const updated = await ctx.db.claim.update({
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
          entityType: "Claim",
          entityId: input.id,
        },
      });

      return updated;
    }),

  // Get claim statistics
  getStatistics: financeProcedure
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        departmentId: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.ClaimWhereInput = {
        deletedAt: null,
      };

      if (input?.departmentId) {
        where.submitter = {
          departmentId: input.departmentId,
        };
      }

      const andFiltersStats: Prisma.ClaimWhereInput[] = [];
      if (input?.startDate) {
        andFiltersStats.push({ createdAt: { gte: input.startDate } });
      }
      if (input?.endDate) {
        andFiltersStats.push({ createdAt: { lte: input.endDate } });
      }
      if (andFiltersStats.length > 0) where.AND = andFiltersStats;

      const [total, byStatus, byType, totalAmount, paidAmount] = await Promise.all([
        ctx.db.claim.count({ where }),
        ctx.db.claim.groupBy({
          by: ["status"],
          where,
          _count: true,
        }),
        ctx.db.claim.groupBy({
          by: ["claimType"],
          where,
          _count: true,
        }),
        ctx.db.claim.aggregate({
          where,
          _sum: {
            amount: true,
          },
        }),
        ctx.db.claim.aggregate({
          where: {
            ...where,
            status: ClaimStatus.PAID,
          },
          _sum: {
            amount: true,
          },
        }),
      ]);

      return {
        total,
        byStatus: byStatus.map((item) => ({
          status: item.status,
          count: item._count,
        })),
        byType: byType.map((item) => ({
          type: item.claimType,
          count: item._count,
        })),
        totalAmount: totalAmount._sum.amount ?? 0,
        paidAmount: paidAmount._sum.amount ?? 0,
      };
    }),
});