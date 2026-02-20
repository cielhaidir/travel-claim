import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  ApprovalStatus,
  TravelStatus,
  ClaimStatus,
  AuditAction,
  ApprovalLevel,
} from "../../../../generated/prisma";

import {
  createTRPCRouter,
  protectedProcedure,
  supervisorProcedure,
} from "@/server/api/trpc";

export const approvalRouter = createTRPCRouter({
  // Get all approvals for current user
  getMyApprovals: supervisorProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/approvals/my',
        protect: true,
        tags: ['Approvals'],
        summary: 'Get my approvals',
      },
      mcp: {
        enabled: true,
        name: "list_my_approvals",
        description: "List all pending and historical approvals assigned to the current supervisor/manager",
      },
    })
    .input(
      z.object({
        status: z.nativeEnum(ApprovalStatus).optional(),
        entityType: z.enum(["TravelRequest", "Claim"]).optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: any = {
        approverId: ctx.session.user.id,
      };

      if (input?.status) {
        where.status = input.status;
      }

      if (input?.entityType === "TravelRequest") {
        where.travelRequestId = { not: null };
      } else if (input?.entityType === "Claim") {
        where.claimId = { not: null };
      }

      const approvals = await ctx.db.approval.findMany({
        take: input?.limit ? input.limit + 1 : 51,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where,
        include: {
          travelRequest: {
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
            },
          },
          claim: {
            include: {
              submitter: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  employeeId: true,
                },
              },
              travelRequest: {
                select: {
                  requestNumber: true,
                  destination: true,
                },
              },
            },
          },
          approver: {
            select: {
              id: true,
              name: true,
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
      if (approvals.length > limit) {
        const nextItem = approvals.pop();
        nextCursor = nextItem!.id;
      }

      return {
        approvals,
        nextCursor,
      };
    }),

  // Get pending approvals count
  getPendingCount: supervisorProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/approvals/pending-count',
        protect: true,
        tags: ['Approvals'],
        summary: 'Get pending approvals count',
      },
      mcp: {
        enabled: true,
        name: "get_pending_approvals_count",
        description: "Get the number of pending approvals waiting for the current user's action",
      },
    })
    .input(z.object({}))
    .output(z.number())
    .query(async ({ ctx }) => {
    return ctx.db.approval.count({
      where: {
        approverId: ctx.session.user.id,
        status: ApprovalStatus.PENDING,
      },
    });
  }),

  // Get approval by ID
  getById: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/approvals/{id}',
        protect: true,
        tags: ['Approvals'],
        summary: 'Get approval by ID',
      },
      mcp: {
        enabled: true,
        name: "get_approval_by_id",
        description: "Get detailed information about a specific approval by its ID",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const approval = await ctx.db.approval.findUnique({
        where: { id: input.id },
        include: {
          travelRequest: {
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
            },
          },
          claim: {
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
                      role: true,
                    },
                  },
                },
                orderBy: {
                  createdAt: "asc",
                },
              },
            },
          },
          approver: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
        },
      });

      if (!approval) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found",
        });
      }

      // Check access rights
      const isApprover = approval.approverId === ctx.session.user.id;
      const isRequester =
        approval.travelRequest?.requesterId === ctx.session.user.id ||
        approval.claim?.submitterId === ctx.session.user.id;
      const canView = ["MANAGER", "DIRECTOR", "ADMIN", "FINANCE"].includes(
        ctx.session.user.role
      );

      if (!isApprover && !isRequester && !canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this approval",
        });
      }

      return approval;
    }),

  // Approve travel request
  approveTravelRequest: supervisorProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/approvals/{approvalId}/approve-travel-request',
        protect: true,
        tags: ['Approvals'],
        summary: 'Approve travel request',
      },
      mcp: {
        enabled: true,
        name: "approve_travel_request",
        description: "Approve a travel request approval at the current supervisor/manager level",
      },
    })
    .input(
      z.object({
        approvalId: z.string(),
        comments: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const approval = await ctx.db.approval.findUnique({
        where: { id: input.approvalId },
        include: {
          travelRequest: {
            include: {
              approvals: {
                orderBy: {
                  level: "asc",
                },
              },
            },
          },
        },
      });

      if (!approval || !approval.travelRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found",
        });
      }

      if (approval.approverId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to approve this request",
        });
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This approval has already been processed",
        });
      }

      // Update approval
      const updatedApproval = await ctx.db.approval.update({
        where: { id: input.approvalId },
        data: {
          status: ApprovalStatus.APPROVED,
          comments: input.comments,
          approvedAt: new Date(),
        },
      });

      // Check if all previous level approvals are complete
      const currentLevelIndex = Object.values(ApprovalLevel).indexOf(approval.level);
      const allPreviousApproved = approval.travelRequest.approvals
        .filter((a) => {
          const levelIndex = Object.values(ApprovalLevel).indexOf(a.level);
          return levelIndex < currentLevelIndex;
        })
        .every((a) => a.status === ApprovalStatus.APPROVED);

      if (!allPreviousApproved) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Previous level approvals must be completed first",
        });
      }

      // Check if there are more approvals pending
      const pendingApprovals = approval.travelRequest.approvals.filter(
        (a) => a.status === ApprovalStatus.PENDING
      );

      // Determine new status
      let newStatus: TravelStatus;
      if (pendingApprovals.length === 1 && pendingApprovals[0]!.id === input.approvalId) {
        // This is the last approval
        newStatus = TravelStatus.APPROVED;
      } else {
        // Map approval level to travel status
        const statusMap: Record<ApprovalLevel, TravelStatus> = {
          [ApprovalLevel.L1_SUPERVISOR]: TravelStatus.APPROVED_L1,
          [ApprovalLevel.L2_MANAGER]: TravelStatus.APPROVED_L2,
          [ApprovalLevel.L3_DIRECTOR]: TravelStatus.APPROVED_L3,
          [ApprovalLevel.L4_SENIOR_DIRECTOR]: TravelStatus.APPROVED_L4,
          [ApprovalLevel.L5_EXECUTIVE]: TravelStatus.APPROVED_L5,
        };
        newStatus = statusMap[approval.level] || TravelStatus.SUBMITTED;
      }

      // Update travel request status
      await ctx.db.travelRequest.update({
        where: { id: approval.travelRequestId! },
        data: {
          status: newStatus,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.APPROVE,
          entityType: "TravelRequest",
          entityId: approval.travelRequestId!,
          metadata: {
            approvalId: input.approvalId,
            level: approval.level,
            comments: input.comments,
          },
        },
      });

      // TODO: Send notification to requester

      return updatedApproval;
    }),

  // Reject travel request
  rejectTravelRequest: supervisorProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/approvals/{approvalId}/reject-travel-request',
        protect: true,
        tags: ['Approvals'],
        summary: 'Reject travel request',
      },
      mcp: {
        enabled: true,
        name: "reject_travel_request",
        description: "Reject a travel request with a mandatory rejection reason",
      },
    })
    .input(
      z.object({
        approvalId: z.string(),
        rejectionReason: z.string().min(10),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const approval = await ctx.db.approval.findUnique({
        where: { id: input.approvalId },
        include: {
          travelRequest: true,
        },
      });

      if (!approval || !approval.travelRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found",
        });
      }

      if (approval.approverId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to reject this request",
        });
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This approval has already been processed",
        });
      }

      // Update approval
      const updatedApproval = await ctx.db.approval.update({
        where: { id: input.approvalId },
        data: {
          status: ApprovalStatus.REJECTED,
          rejectionReason: input.rejectionReason,
          rejectedAt: new Date(),
        },
      });

      // Update travel request status
      await ctx.db.travelRequest.update({
        where: { id: approval.travelRequestId! },
        data: {
          status: TravelStatus.REJECTED,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.REJECT,
          entityType: "TravelRequest",
          entityId: approval.travelRequestId!,
          metadata: {
            approvalId: input.approvalId,
            level: approval.level,
            rejectionReason: input.rejectionReason,
          },
        },
      });

      // TODO: Send notification to requester

      return updatedApproval;
    }),

  // Request revision for travel request
  requestRevision: supervisorProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/approvals/{approvalId}/request-revision',
        protect: true,
        tags: ['Approvals'],
        summary: 'Request revision for travel request',
      },
      mcp: {
        enabled: true,
        name: "request_travel_request_revision",
        description: "Request a revision for a travel request, resetting all approvals back to pending",
      },
    })
    .input(
      z.object({
        approvalId: z.string(),
        comments: z.string().min(10),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const approval = await ctx.db.approval.findUnique({
        where: { id: input.approvalId },
        include: {
          travelRequest: true,
        },
      });

      if (!approval || !approval.travelRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found",
        });
      }

      if (approval.approverId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to request revision for this request",
        });
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This approval has already been processed",
        });
      }

      // Update approval
      const updatedApproval = await ctx.db.approval.update({
        where: { id: input.approvalId },
        data: {
          status: ApprovalStatus.REVISION_REQUESTED,
          comments: input.comments,
        },
      });

      // Reset all approvals to pending
      await ctx.db.approval.updateMany({
        where: {
          travelRequestId: approval.travelRequestId,
        },
        data: {
          status: ApprovalStatus.PENDING,
          approvedAt: null,
          rejectedAt: null,
        },
      });

      // Update travel request status
      await ctx.db.travelRequest.update({
        where: { id: approval.travelRequestId! },
        data: {
          status: TravelStatus.REVISION,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "TravelRequest",
          entityId: approval.travelRequestId!,
          metadata: {
            action: "revision_requested",
            approvalId: input.approvalId,
            level: approval.level,
            comments: input.comments,
          },
        },
      });

      // TODO: Send notification to requester

      return updatedApproval;
    }),

  // Approve claim
  approveClaim: supervisorProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/approvals/{approvalId}/approve-claim',
        protect: true,
        tags: ['Approvals'],
        summary: 'Approve claim',
      },
      mcp: {
        enabled: true,
        name: "approve_claim",
        description: "Approve a claim at the current supervisor/manager level",
      },
    })
    .input(
      z.object({
        approvalId: z.string(),
        comments: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const approval = await ctx.db.approval.findUnique({
        where: { id: input.approvalId },
        include: {
          claim: {
            include: {
              approvals: {
                orderBy: {
                  level: "asc",
                },
              },
            },
          },
        },
      });

      if (!approval || !approval.claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found",
        });
      }

      if (approval.approverId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to approve this claim",
        });
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This approval has already been processed",
        });
      }

      // Update approval
      const updatedApproval = await ctx.db.approval.update({
        where: { id: input.approvalId },
        data: {
          status: ApprovalStatus.APPROVED,
          comments: input.comments,
          approvedAt: new Date(),
        },
      });

      // Check if there are more approvals pending
      const pendingApprovals = approval.claim.approvals.filter(
        (a) => a.status === ApprovalStatus.PENDING && a.id !== input.approvalId
      );

      // Update claim status
      const newStatus =
        pendingApprovals.length === 0 ? ClaimStatus.APPROVED : approval.claim.status;

      await ctx.db.claim.update({
        where: { id: approval.claimId! },
        data: {
          status: newStatus,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.APPROVE,
          entityType: "Claim",
          entityId: approval.claimId!,
          metadata: {
            approvalId: input.approvalId,
            level: approval.level,
            comments: input.comments,
          },
        },
      });

      // TODO: Send notification to submitter

      return updatedApproval;
    }),

  // Reject claim
  rejectClaim: supervisorProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/approvals/{approvalId}/reject-claim',
        protect: true,
        tags: ['Approvals'],
        summary: 'Reject claim',
      },
      mcp: {
        enabled: true,
        name: "reject_claim",
        description: "Reject a claim with a mandatory rejection reason",
      },
    })
    .input(
      z.object({
        approvalId: z.string(),
        rejectionReason: z.string().min(10),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const approval = await ctx.db.approval.findUnique({
        where: { id: input.approvalId },
        include: {
          claim: true,
        },
      });

      if (!approval || !approval.claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found",
        });
      }

      if (approval.approverId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to reject this claim",
        });
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This approval has already been processed",
        });
      }

      // Update approval
      const updatedApproval = await ctx.db.approval.update({
        where: { id: input.approvalId },
        data: {
          status: ApprovalStatus.REJECTED,
          rejectionReason: input.rejectionReason,
          rejectedAt: new Date(),
        },
      });

      // Update claim status
      await ctx.db.claim.update({
        where: { id: approval.claimId! },
        data: {
          status: ClaimStatus.REJECTED,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.REJECT,
          entityType: "Claim",
          entityId: approval.claimId!,
          metadata: {
            approvalId: input.approvalId,
            level: approval.level,
            rejectionReason: input.rejectionReason,
          },
        },
      });

      // TODO: Send notification to submitter

      return updatedApproval;
    }),

  // Request revision for claim
  requestClaimRevision: supervisorProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/approvals/{approvalId}/request-claim-revision',
        protect: true,
        tags: ['Approvals'],
        summary: 'Request revision for claim',
      },
      mcp: {
        enabled: true,
        name: "request_claim_revision",
        description: "Request a revision for a claim, resetting all approvals back to pending",
      },
    })
    .input(
      z.object({
        approvalId: z.string(),
        comments: z.string().min(10),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const approval = await ctx.db.approval.findUnique({
        where: { id: input.approvalId },
        include: {
          claim: true,
        },
      });

      if (!approval || !approval.claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found",
        });
      }

      if (approval.approverId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to request revision for this claim",
        });
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This approval has already been processed",
        });
      }

      // Update approval
      const updatedApproval = await ctx.db.approval.update({
        where: { id: input.approvalId },
        data: {
          status: ApprovalStatus.REVISION_REQUESTED,
          comments: input.comments,
        },
      });

      // Reset all approvals to pending
      await ctx.db.approval.updateMany({
        where: {
          claimId: approval.claimId,
        },
        data: {
          status: ApprovalStatus.PENDING,
          approvedAt: null,
          rejectedAt: null,
        },
      });

      // Update claim status
      await ctx.db.claim.update({
        where: { id: approval.claimId! },
        data: {
          status: ClaimStatus.REVISION,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Claim",
          entityId: approval.claimId!,
          metadata: {
            action: "revision_requested",
            approvalId: input.approvalId,
            level: approval.level,
            comments: input.comments,
          },
        },
      });

      // TODO: Send notification to submitter

      return updatedApproval;
    }),
});