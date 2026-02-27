import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  ApprovalStatus,
  TravelStatus,
  ClaimStatus,
  AuditAction,
  ApprovalLevel,
  type Prisma,
  PrismaClient,
} from "../../../../generated/prisma";

import {
  createTRPCRouter,
  protectedProcedure,
  supervisorProcedure,
} from "@/server/api/trpc";

// ─────────────────────────────────────────────────────────────────────────────
// Shared input shapes
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Backward-compatible approval identifier.
 * Callers must supply at least one of `approvalId` (internal CUID) or
 * `approvalNumber` (business key, e.g. "APR-2026-00001").
 *
 * For incoming approval flows (e.g. WhatsApp agent) the preferred identifier
 * is `approvalNumber` + `callerPhone`.
 */
const approvalIdentifierSchema = z
  .object({
    approvalId: z.string().optional(),
    approvalNumber: z.string().optional(),
    /**
     * When supplied, the value must exactly match the `approver.phoneNumber`
     * stored on the target approval.  Used by incoming (non-session) flows
     * such as WhatsApp commands to prove the caller owns the approval.
     * Leave undefined for normal web-session calls.
     */
    callerPhone: z.string().optional(),
  })
  .refine((d) => d.approvalId !== undefined || d.approvalNumber !== undefined, {
    message: "Either approvalId or approvalNumber must be provided",
  });

// ─────────────────────────────────────────────────────────────────────────────
// Helper: resolve an Approval row (+ minimal approver select) from identifier
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves an Approval by `approvalId` OR `approvalNumber` and includes the
 * `approver` with their `phoneNumber` so that callerPhone verification can be
 * performed by the calling procedure.
 *
 * Throws `NOT_FOUND` when no matching record exists.
 */
async function resolveApprovalBase<TInclude extends Prisma.ApprovalInclude>(
  db: PrismaClient,
  identifier: { approvalId?: string; approvalNumber?: string },
  include: TInclude,
) {
  const where: Prisma.ApprovalWhereUniqueInput = identifier.approvalId
    ? { id: identifier.approvalId }
    : { approvalNumber: identifier.approvalNumber! };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const approval = await (db as any).approval.findUnique({ where, include });

  if (!approval) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: identifier.approvalId
        ? `Approval with id "${identifier.approvalId}" not found`
        : `Approval with approvalNumber "${identifier.approvalNumber}" not found`,
    });
  }

  return approval as NonNullable<typeof approval>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: enforce phone ownership for incoming approval flows
// ─────────────────────────────────────────────────────────────────────────────

/**
 * When the caller supplies `callerPhone` (incoming flow), verify it matches
 * the `phoneNumber` stored on the approval's approver user record.
 *
 * Throws `FORBIDDEN` on mismatch; is a no-op when `callerPhone` is undefined.
 */
function verifyCallerPhone(
  callerPhone: string | undefined,
  approverPhoneNumber: string | null | undefined,
) {
  if (callerPhone === undefined) return; // web-session call – skip

  if (!approverPhoneNumber) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Phone ownership verification failed: the approver has no phone number on record",
    });
  }

  // Normalise by stripping leading + and whitespace for loose comparison
  const normalise = (p: string) => p.replace(/\s+/g, "").replace(/^\+/, "");

  if (normalise(callerPhone) !== normalise(approverPhoneNumber)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message:
        "Phone ownership verification failed: the supplied phone number does not match the approver on record",
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

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
      const where: Prisma.ApprovalWhereInput = {
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

  // Get approval by approval number
  getByApprovalNumber: protectedProcedure
    .meta({
      openapi: {
        method: 'GET',
        path: '/approvals/by-number/{approvalNumber}',
        protect: true,
        tags: ['Approvals'],
        summary: 'Get approval by approval number',
      },
      mcp: {
        enabled: true,
        name: "get_approval_by_approval_number",
        description: "Fetch detailed information about a specific approval using its human-readable business key (e.g. APR-2026-00001). Returns the same full detail as get_approval_by_id including linked travel request or claim, approver, and approval chain.",
      },
    })
    .input(
      z.object({
        approvalNumber: z.string(),
        // Phone is used to verify the caller is the approver — no session identity assumed
        phone: z.string(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const approval = await ctx.db.approval.findUnique({
        where: { approvalNumber: input.approvalNumber },
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
              // include phone so we can validate identity without relying on session
              phoneNumber: true,
            },
          },
        },
      });

      if (!approval) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Approval with approvalNumber "${input.approvalNumber}" not found`,
        });
      }

      // Phone-based identity check: the caller must supply the approver's registered phone.
      // We do NOT fall back to session identity here because this endpoint is designed
      // for incoming agent/WhatsApp flows where the caller is identified purely by phone.
      const normalize = (p: string) => p.replace(/^\+/, "").replace(/\s+/g, "");
      const approverPhone = approval.approver?.phoneNumber ?? "";

      if (!approverPhone) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "The approver for this approval has no phone number registered",
        });
      }

      if (normalize(input.phone) !== normalize(approverPhone)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "The supplied phone number does not match the approver on record",
        });
      }

      return approval;
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // Approve travel request
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Approve a travel-request approval.
   *
   * Input (all mutations below share the same identifier shape):
   *   - `approvalId`     – internal CUID (original field, still accepted)
   *   - `approvalNumber` – business key, e.g. "APR-2026-00001" (new)
   *   - `callerPhone`    – optional; when present MUST match approver.phoneNumber
   *   - `comments`       – optional free-text comment
   *
   * At least one of `approvalId` / `approvalNumber` is required.
   */
  approveTravelRequest: supervisorProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/approvals/approve-travel-request',
        protect: true,
        tags: ['Approvals'],
        summary: 'Approve travel request',
      },
      mcp: {
        enabled: true,
        name: "approve_travel_request",
        description: "Approve a travel request approval at the current supervisor/manager level. Accepts approvalId or approvalNumber. Optionally verify caller phone for incoming WhatsApp flows.",
      },
    })
    .input(
      approvalIdentifierSchema.extend({
        comments: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // ── 1. Resolve approval record ──────────────────────────────────────────
      const approval = await resolveApprovalBase(
        ctx.db,
        { approvalId: input.approvalId, approvalNumber: input.approvalNumber },
        {
          approver: {
            select: { id: true, phoneNumber: true },
          },
          travelRequest: {
            include: {
              approvals: {
                orderBy: { level: "asc" },
              },
            },
          },
        },
      );

      if (!approval.travelRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found or is not linked to a travel request",
        });
      }

      // ── 2. Phone ownership verification (incoming flow) ─────────────────────
      verifyCallerPhone(input.callerPhone, approval.approver.phoneNumber);

      // ── 3. Session-based authorisation (existing check – unchanged) ─────────
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

      // ── 4. Perform update ───────────────────────────────────────────────────
      const resolvedId = approval.id as string;

      const updatedApproval = await ctx.db.approval.update({
        where: { id: resolvedId },
        data: {
          status: ApprovalStatus.APPROVED,
          comments: input.comments,
          approvedAt: new Date(),
        },
      });

      // Check if all previous level approvals are complete
      const currentLevelIndex = Object.values(ApprovalLevel).indexOf(approval.level as ApprovalLevel);
      const allPreviousApproved = (approval.travelRequest.approvals as Array<{ level: ApprovalLevel; status: ApprovalStatus; id: string }>)
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
      const pendingApprovals = (approval.travelRequest.approvals as Array<{ status: ApprovalStatus; id: string }>).filter(
        (a) => a.status === ApprovalStatus.PENDING
      );

      // Determine new status
      let newStatus: TravelStatus;
      if (pendingApprovals.length === 1 && pendingApprovals[0]!.id === resolvedId) {
        newStatus = TravelStatus.APPROVED;
      } else {
        const statusMap: Record<ApprovalLevel, TravelStatus> = {
          [ApprovalLevel.L1_SUPERVISOR]: TravelStatus.APPROVED_L1,
          [ApprovalLevel.L2_MANAGER]: TravelStatus.APPROVED_L2,
          [ApprovalLevel.L3_DIRECTOR]: TravelStatus.APPROVED_L3,
          [ApprovalLevel.L4_SENIOR_DIRECTOR]: TravelStatus.APPROVED_L4,
          [ApprovalLevel.L5_EXECUTIVE]: TravelStatus.APPROVED_L5,
        };
        newStatus = statusMap[approval.level as ApprovalLevel] ?? TravelStatus.SUBMITTED;
      }

      await ctx.db.travelRequest.update({
        where: { id: approval.travelRequestId as string },
        data: { status: newStatus },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.APPROVE,
          entityType: "TravelRequest",
          entityId: approval.travelRequestId as string,
          metadata: {
            approvalId: resolvedId,
            approvalNumber: approval.approvalNumber,
            level: approval.level,
            comments: input.comments,
          },
        },
      });

      // TODO: Send notification to requester

      return updatedApproval;
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // Reject travel request
  // ───────────────────────────────────────────────────────────────────────────

  rejectTravelRequest: supervisorProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/approvals/reject-travel-request',
        protect: true,
        tags: ['Approvals'],
        summary: 'Reject travel request',
      },
      mcp: {
        enabled: true,
        name: "reject_travel_request",
        description: "Reject a travel request with a mandatory rejection reason. Accepts approvalId or approvalNumber. Optionally verify caller phone for incoming WhatsApp flows.",
      },
    })
    .input(
      approvalIdentifierSchema.extend({
        rejectionReason: z.string().min(10),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // ── 1. Resolve approval record ──────────────────────────────────────────
      const approval = await resolveApprovalBase(
        ctx.db,
        { approvalId: input.approvalId, approvalNumber: input.approvalNumber },
        {
          approver: {
            select: { id: true, phoneNumber: true },
          },
          travelRequest: true,
        },
      );

      if (!approval.travelRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found or is not linked to a travel request",
        });
      }

      // ── 2. Phone ownership verification ────────────────────────────────────
      verifyCallerPhone(input.callerPhone, approval.approver.phoneNumber);

      // ── 3. Session-based authorisation ─────────────────────────────────────
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

      // ── 4. Perform update ───────────────────────────────────────────────────
      const resolvedId = approval.id as string;

      const updatedApproval = await ctx.db.approval.update({
        where: { id: resolvedId },
        data: {
          status: ApprovalStatus.REJECTED,
          rejectionReason: input.rejectionReason,
          rejectedAt: new Date(),
        },
      });

      await ctx.db.travelRequest.update({
        where: { id: approval.travelRequestId as string },
        data: { status: TravelStatus.REJECTED },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.REJECT,
          entityType: "TravelRequest",
          entityId: approval.travelRequestId as string,
          metadata: {
            approvalId: resolvedId,
            approvalNumber: approval.approvalNumber,
            level: approval.level,
            rejectionReason: input.rejectionReason,
          },
        },
      });

      // TODO: Send notification to requester

      return updatedApproval;
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // Request revision for travel request
  // ───────────────────────────────────────────────────────────────────────────

  requestRevision: supervisorProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/approvals/request-revision',
        protect: true,
        tags: ['Approvals'],
        summary: 'Request revision for travel request',
      },
      mcp: {
        enabled: true,
        name: "request_travel_request_revision",
        description: "Request a revision for a travel request, resetting all approvals back to pending. Accepts approvalId or approvalNumber. Optionally verify caller phone for incoming WhatsApp flows.",
      },
    })
    .input(
      approvalIdentifierSchema.extend({
        comments: z.string().min(10),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // ── 1. Resolve approval record ──────────────────────────────────────────
      const approval = await resolveApprovalBase(
        ctx.db,
        { approvalId: input.approvalId, approvalNumber: input.approvalNumber },
        {
          approver: {
            select: { id: true, phoneNumber: true },
          },
          travelRequest: true,
        },
      );

      if (!approval.travelRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found or is not linked to a travel request",
        });
      }

      // ── 2. Phone ownership verification ────────────────────────────────────
      verifyCallerPhone(input.callerPhone, approval.approver.phoneNumber);

      // ── 3. Session-based authorisation ─────────────────────────────────────
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

      // ── 4. Perform update ───────────────────────────────────────────────────
      const resolvedId = approval.id as string;

      const updatedApproval = await ctx.db.approval.update({
        where: { id: resolvedId },
        data: {
          status: ApprovalStatus.REVISION_REQUESTED,
          comments: input.comments,
        },
      });

      // Reset all approvals to pending
      await ctx.db.approval.updateMany({
        where: { travelRequestId: approval.travelRequestId as string },
        data: {
          status: ApprovalStatus.PENDING,
          approvedAt: null,
          rejectedAt: null,
        },
      });

      await ctx.db.travelRequest.update({
        where: { id: approval.travelRequestId as string },
        data: { status: TravelStatus.REVISION },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "TravelRequest",
          entityId: approval.travelRequestId as string,
          metadata: {
            action: "revision_requested",
            approvalId: resolvedId,
            approvalNumber: approval.approvalNumber,
            level: approval.level,
            comments: input.comments,
          },
        },
      });

      // TODO: Send notification to requester

      return updatedApproval;
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // Approve claim
  // ───────────────────────────────────────────────────────────────────────────

  approveClaim: supervisorProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/approvals/approve-claim',
        protect: true,
        tags: ['Approvals'],
        summary: 'Approve claim',
      },
      mcp: {
        enabled: true,
        name: "approve_claim",
        description: "Approve a claim at the current supervisor/manager level. Accepts approvalId or approvalNumber. Optionally verify caller phone for incoming WhatsApp flows.",
      },
    })
    .input(
      approvalIdentifierSchema.extend({
        comments: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // ── 1. Resolve approval record ──────────────────────────────────────────
      const approval = await resolveApprovalBase(
        ctx.db,
        { approvalId: input.approvalId, approvalNumber: input.approvalNumber },
        {
          approver: {
            select: { id: true, phoneNumber: true },
          },
          claim: {
            include: {
              approvals: {
                orderBy: { level: "asc" },
              },
            },
          },
        },
      );

      if (!approval.claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found or is not linked to a claim",
        });
      }

      // ── 2. Phone ownership verification ────────────────────────────────────
      verifyCallerPhone(input.callerPhone, approval.approver.phoneNumber);

      // ── 3. Session-based authorisation ─────────────────────────────────────
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

      // ── 4. Perform update ───────────────────────────────────────────────────
      const resolvedId = approval.id as string;

      const updatedApproval = await ctx.db.approval.update({
        where: { id: resolvedId },
        data: {
          status: ApprovalStatus.APPROVED,
          comments: input.comments,
          approvedAt: new Date(),
        },
      });

      const pendingApprovals = (approval.claim.approvals as Array<{ status: ApprovalStatus; id: string }>).filter(
        (a) => a.status === ApprovalStatus.PENDING && a.id !== resolvedId
      );

      const newStatus =
        pendingApprovals.length === 0 ? ClaimStatus.APPROVED : (approval.claim.status as ClaimStatus);

      await ctx.db.claim.update({
        where: { id: approval.claimId as string },
        data: { status: newStatus },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.APPROVE,
          entityType: "Claim",
          entityId: approval.claimId as string,
          metadata: {
            approvalId: resolvedId,
            approvalNumber: approval.approvalNumber,
            level: approval.level,
            comments: input.comments,
          },
        },
      });

      // TODO: Send notification to submitter

      return updatedApproval;
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // Reject claim
  // ───────────────────────────────────────────────────────────────────────────

  rejectClaim: supervisorProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/approvals/reject-claim',
        protect: true,
        tags: ['Approvals'],
        summary: 'Reject claim',
      },
      mcp: {
        enabled: true,
        name: "reject_claim",
        description: "Reject a claim with a mandatory rejection reason. Accepts approvalId or approvalNumber. Optionally verify caller phone for incoming WhatsApp flows.",
      },
    })
    .input(
      approvalIdentifierSchema.extend({
        rejectionReason: z.string().min(10),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // ── 1. Resolve approval record ──────────────────────────────────────────
      const approval = await resolveApprovalBase(
        ctx.db,
        { approvalId: input.approvalId, approvalNumber: input.approvalNumber },
        {
          approver: {
            select: { id: true, phoneNumber: true },
          },
          claim: true,
        },
      );

      if (!approval.claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found or is not linked to a claim",
        });
      }

      // ── 2. Phone ownership verification ────────────────────────────────────
      verifyCallerPhone(input.callerPhone, approval.approver.phoneNumber);

      // ── 3. Session-based authorisation ─────────────────────────────────────
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

      // ── 4. Perform update ───────────────────────────────────────────────────
      const resolvedId = approval.id as string;

      const updatedApproval = await ctx.db.approval.update({
        where: { id: resolvedId },
        data: {
          status: ApprovalStatus.REJECTED,
          rejectionReason: input.rejectionReason,
          rejectedAt: new Date(),
        },
      });

      await ctx.db.claim.update({
        where: { id: approval.claimId as string },
        data: { status: ClaimStatus.REJECTED },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.REJECT,
          entityType: "Claim",
          entityId: approval.claimId as string,
          metadata: {
            approvalId: resolvedId,
            approvalNumber: approval.approvalNumber,
            level: approval.level,
            rejectionReason: input.rejectionReason,
          },
        },
      });

      // TODO: Send notification to submitter

      return updatedApproval;
    }),

  // ───────────────────────────────────────────────────────────────────────────
  // Request revision for claim
  // ───────────────────────────────────────────────────────────────────────────

  requestClaimRevision: supervisorProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/approvals/request-claim-revision',
        protect: true,
        tags: ['Approvals'],
        summary: 'Request revision for claim',
      },
      mcp: {
        enabled: true,
        name: "request_claim_revision",
        description: "Request a revision for a claim, resetting all approvals back to pending. Accepts approvalId or approvalNumber. Optionally verify caller phone for incoming WhatsApp flows.",
      },
    })
    .input(
      approvalIdentifierSchema.extend({
        comments: z.string().min(10),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // ── 1. Resolve approval record ──────────────────────────────────────────
      const approval = await resolveApprovalBase(
        ctx.db,
        { approvalId: input.approvalId, approvalNumber: input.approvalNumber },
        {
          approver: {
            select: { id: true, phoneNumber: true },
          },
          claim: true,
        },
      );

      if (!approval.claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Approval not found or is not linked to a claim",
        });
      }

      // ── 2. Phone ownership verification ────────────────────────────────────
      verifyCallerPhone(input.callerPhone, approval.approver.phoneNumber);

      // ── 3. Session-based authorisation ─────────────────────────────────────
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

      // ── 4. Perform update ───────────────────────────────────────────────────
      const resolvedId = approval.id as string;

      const updatedApproval = await ctx.db.approval.update({
        where: { id: resolvedId },
        data: {
          status: ApprovalStatus.REVISION_REQUESTED,
          comments: input.comments,
        },
      });

      await ctx.db.approval.updateMany({
        where: { claimId: approval.claimId as string },
        data: {
          status: ApprovalStatus.PENDING,
          approvedAt: null,
          rejectedAt: null,
        },
      });

      await ctx.db.claim.update({
        where: { id: approval.claimId as string },
        data: { status: ClaimStatus.REVISION },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Claim",
          entityId: approval.claimId as string,
          metadata: {
            action: "revision_requested",
            approvalId: resolvedId,
            approvalNumber: approval.approvalNumber,
            level: approval.level,
            comments: input.comments,
          },
        },
      });

      // TODO: Send notification to submitter

      return updatedApproval;
    }),
});
