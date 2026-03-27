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
import {
  generateApprovalNumber,
  generateClaimNumber,
} from "@/lib/utils/numberGenerators";

import {
  createTRPCRouter,
  permissionProcedure,
} from "@/server/api/trpc";
import { sendWhatsappPoll, buildClaimApprovalPoll } from "@/lib/utils/whatsapp";

function getTenantScope(ctx: unknown): {
  tenantId: string | null;
  isRoot: boolean;
} {
  const typed = ctx as { tenantId?: string | null; isRoot?: boolean };
  return {
    tenantId: typed.tenantId ?? null,
    isRoot: typed.isRoot ?? false,
  };
}

function withTenantWhere<T extends Record<string, unknown>>(
  ctx: unknown,
  where: T,
): T {
  const { tenantId, isRoot } = getTenantScope(ctx);
  if (!isRoot) {
    (where as Record<string, unknown>).tenantId = tenantId;
  }
  return where;
}

export const claimRouter = createTRPCRouter({
  // Get all claims with filters
  getAll: permissionProcedure("claims", "read")
    .meta({
      openapi: {
        method: "GET",
        path: "/claims",
        protect: true,
        tags: ["Claims"],
        summary: "Get all claims",
      },
    })
    .input(
      z
        .object({
          status: z.nativeEnum(ClaimStatus).optional(),
          claimType: z.nativeEnum(ClaimType).optional(),
          travelRequestId: z.string().optional(),
          submitterId: z.string().optional(),
          startDate: z.coerce.date().optional(),
          endDate: z.coerce.date().optional(),
          limit: z.number().min(1).max(100).optional(),
          cursor: z.string().optional(),
        })
        .optional(),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.ClaimWhereInput = withTenantWhere(ctx, {
        deletedAt: null,
      });

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
            where: {
              deletedAt: null,
            },
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
  getById: permissionProcedure("claims", "read")
    .meta({
      openapi: {
        method: "GET",
        path: "/claims/{id}",
        protect: true,
        tags: ["Claims"],
        summary: "Get claim by ID",
      },
      mcp: {
        enabled: true,
        name: "get_claim",
        description:
          "Get detailed information about a specific claim for review or resume",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const claim = await ctx.db.claim.findFirst({
        where: withTenantWhere(ctx, { id: input.id }),
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
          attachments: {
            where: {
              deletedAt: null,
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
        },
      });

      if (!claim) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Claim not found",
        });
      }

      return claim;
    }),

  // Get claims by travel request
  getByTravelRequest: permissionProcedure("claims", "read")
    .meta({
      openapi: {
        method: "GET",
        path: "/claims/by-travel-request/{travelRequestId}",
        protect: true,
        tags: ["Claims"],
        summary: "Get claims by travel request",
      },
    })
    .input(z.object({ travelRequestId: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const travelRequest = await ctx.db.travelRequest.findFirst({
        where: withTenantWhere(ctx, { id: input.travelRequestId }),
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

      return ctx.db.claim.findMany({
        where: withTenantWhere(ctx, {
          travelRequestId: input.travelRequestId,
          deletedAt: null,
        }),
        include: {
          submitter: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          attachments: {
            where: {
              deletedAt: null,
            },
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
  createEntertainment: permissionProcedure("claims", "create")
    .meta({
      openapi: {
        method: "POST",
        path: "/claims/entertainment",
        protect: true,
        tags: ["Claims"],
        summary: "Create entertainment claim",
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
        coaId: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { travelRequestId, ...claimData } = input;

      // Verify travel request exists and is approved
      const travelRequest = await ctx.db.travelRequest.findFirst({
        where: withTenantWhere(ctx, { id: travelRequestId }),
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
        (p) => p.userId === ctx.session.user.id,
      );

      if (!isRequester && !isParticipant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You are not authorized to create claims for this travel request",
        });
      }

      // Check if travel request is approved or locked
      if (
        !(
          [TravelStatus.APPROVED, TravelStatus.LOCKED] as TravelStatus[]
        ).includes(travelRequest.status)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Claims can only be created for approved travel requests",
        });
      }

      // Generate claim number
      const claimNumber = await generateClaimNumber(
        ctx.db,
        getTenantScope(ctx).tenantId,
      );

      // Create claim
      const claim = await ctx.db.claim.create({
        data: {
          tenantId: travelRequest.tenantId,
          claimNumber,
          travelRequestId,
          submitterId: ctx.session.user.id,
          claimType: ClaimType.ENTERTAINMENT,
          ...claimData,
        },
        include: {
          submitter: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              role: true,
              departmentId: true,
              phoneNumber: true,
              image: true,
            },
          },
          travelRequest: true,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          tenantId: claim.tenantId,
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
  createNonEntertainment: permissionProcedure("claims", "create")
    .meta({
      openapi: {
        method: "POST",
        path: "/claims/non-entertainment",
        protect: true,
        tags: ["Claims"],
        summary: "Create non-entertainment claim",
      },
      mcp: {
        enabled: true,
        name: "create_nonentertainment_claim_draft",
        description:
          "Create a draft non-entertainment claim for a travel request",
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
        coaId: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { travelRequestId, ...claimData } = input;

      // Verify travel request
      const travelRequest = await ctx.db.travelRequest.findFirst({
        where: withTenantWhere(ctx, { id: travelRequestId }),
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
        (p) => p.userId === ctx.session.user.id,
      );

      if (!isRequester && !isParticipant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "You are not authorized to create claims for this travel request",
        });
      }

      // Check travel request status
      if (
        !(
          [TravelStatus.APPROVED, TravelStatus.LOCKED] as TravelStatus[]
        ).includes(travelRequest.status)
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Claims can only be created for approved travel requests",
        });
      }

      // Generate claim number
      const claimNumber = await generateClaimNumber(
        ctx.db,
        getTenantScope(ctx).tenantId,
      );

      // Create claim
      const claim = await ctx.db.claim.create({
        data: {
          tenantId: travelRequest.tenantId,
          claimNumber,
          travelRequestId,
          submitterId: ctx.session.user.id,
          claimType: ClaimType.NON_ENTERTAINMENT,
          ...claimData,
        },
        include: {
          submitter: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              role: true,
              departmentId: true,
              phoneNumber: true,
              image: true,
            },
          },
          travelRequest: true,
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          tenantId: claim.tenantId,
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
  update: permissionProcedure("claims", "update")
    .meta({
      openapi: {
        method: "PUT",
        path: "/claims/{id}",
        protect: true,
        tags: ["Claims"],
        summary: "Update claim",
      },
      mcp: {
        enabled: true,
        name: "update_claim_draft",
        description:
          "Update a claim draft (only works for DRAFT or REVISION status)",
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
        coaId: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input;

      const existing = await ctx.db.claim.findFirst({
        where: withTenantWhere(ctx, { id }),
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
      if (
        !([ClaimStatus.DRAFT, ClaimStatus.REVISION] as ClaimStatus[]).includes(
          existing.status,
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Can only update claims in DRAFT or REVISION status",
        });
      }

      const updated = await ctx.db.claim.update({
        where: { id },
        data: updateData,
        include: {
          submitter: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              role: true,
              departmentId: true,
              phoneNumber: true,
              image: true,
            },
          },
          travelRequest: true,
          attachments: {
            where: {
              deletedAt: null,
            },
          },
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          tenantId: existing.tenantId,
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
  submit: permissionProcedure("claims", "submit")
    .meta({
      openapi: {
        method: "POST",
        path: "/claims/{id}/submit",
        protect: true,
        tags: ["Claims"],
        summary: "Submit claim for approval",
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
      const claim = await ctx.db.claim.findFirst({
        where: withTenantWhere(ctx, { id: input.id }),
        include: {
          submitter: {
            include: {
              supervisor: true,
              department: {
                include: {
                  chief: {
                    include: {
                      supervisor: {
                        include: {
                          supervisor: { include: { supervisor: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          travelRequest: {
            include: {
              project: {
                include: {
                  salesLead: {
                    include: {
                      supervisor: {
                        include: {
                          supervisor: { include: { supervisor: true } },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
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

      if (
        !([ClaimStatus.DRAFT, ClaimStatus.REVISION] as ClaimStatus[]).includes(
          claim.status,
        )
      ) {
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

      // ── Build dynamic approval chain per DYNAMIC_APPROVAL_HIERARCHY.md ──────
      // Entry type includes sequence for chain ordering
      const approvalEntries: {
        sequence: number;
        level: ApprovalLevel;
        approverId: string;
      }[] = [];
      let seq = 1;

      const submitterRole = claim.submitter.role;
      const isSalesRole =
        submitterRole === "SALES_EMPLOYEE" || submitterRole === "SALES_CHIEF";
      const isSalesTravel =
        claim.travelRequest?.travelType === "SALES" &&
        !!claim.travelRequest?.projectId;

      if (
        !isSalesRole &&
        isSalesTravel &&
        claim.travelRequest?.project?.salesLead
      ) {
        // Rule B: Regular employee on a sales trip → start with SALES_LEAD (unless submitter IS the sales lead)
        const salesLead = claim.travelRequest.project.salesLead;
        if (salesLead.id !== claim.submitterId) {
          approvalEntries.push({
            sequence: seq++,
            level: ApprovalLevel.SALES_LEAD,
            approverId: salesLead.id,
          });

          // Walk the sales lead's supervisor chain: DEPT_CHIEF → DIRECTOR → SENIOR_DIRECTOR → EXECUTIVE
          let current: {
            id: string;
            supervisorId: string | null;
            supervisor?: typeof salesLead | null;
          } | null = salesLead;
          const levels: ApprovalLevel[] = [
            ApprovalLevel.DEPT_CHIEF,
            ApprovalLevel.DIRECTOR,
            ApprovalLevel.SENIOR_DIRECTOR,
            ApprovalLevel.EXECUTIVE,
          ];
          for (const level of levels) {
            if (!current?.supervisorId) break;
            current = current.supervisor ?? null;
            if (!current) break;
            approvalEntries.push({
              sequence: seq++,
              level,
              approverId: current.id,
            });
          }
        } else {
          // Submitter IS the sales lead — start at DEPT_CHIEF via submitter's department chief
          const chief = claim.submitter.department?.chief;
          if (chief) {
            approvalEntries.push({
              sequence: seq++,
              level: ApprovalLevel.DEPT_CHIEF,
              approverId: chief.id,
            });
            let current: {
              id: string;
              supervisorId: string | null;
              supervisor?: typeof chief | null;
            } | null = chief;
            const levels: ApprovalLevel[] = [
              ApprovalLevel.DIRECTOR,
              ApprovalLevel.SENIOR_DIRECTOR,
              ApprovalLevel.EXECUTIVE,
            ];
            for (const level of levels) {
              if (!current?.supervisorId) break;
              current = current.supervisor ?? null;
              if (!current) break;
              approvalEntries.push({
                sequence: seq++,
                level,
                approverId: current.id,
              });
            }
          }
        }
      } else {
        // Rule A (SALES_EMPLOYEE / SALES_CHIEF) or Rule C (non-sales employee, non-sales travel):
        // Chain starts at DEPT_CHIEF then walks supervisor chain upward
        const chief = claim.submitter.department?.chief;
        if (chief) {
          approvalEntries.push({
            sequence: seq++,
            level: ApprovalLevel.DEPT_CHIEF,
            approverId: chief.id,
          });
          let current: {
            id: string;
            supervisorId: string | null;
            supervisor?: typeof chief | null;
          } | null = chief;
          const levels: ApprovalLevel[] = [
            ApprovalLevel.DIRECTOR,
            ApprovalLevel.SENIOR_DIRECTOR,
            ApprovalLevel.EXECUTIVE,
          ];
          for (const level of levels) {
            if (!current?.supervisorId) break;
            current = current.supervisor ?? null;
            if (!current) break;
            approvalEntries.push({
              sequence: seq++,
              level,
              approverId: current.id,
            });
          }
        }
      }

      // Deduplicate by approverId (same person can't appear twice in the chain)
      const seen = new Set<string>();
      const deduped = approvalEntries
        .filter((e) => {
          if (e.approverId === claim.submitterId) return false;
          if (seen.has(e.approverId)) return false;
          seen.add(e.approverId);
          return true;
        })
        .map((e, idx) => ({ ...e, sequence: idx + 1 })); // resequence after dedup

      if (deduped.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "No approvers are configured for this claim. Please contact an administrator.",
        });
      }

      // Generate a unique approvalNumber for each approval record
      const approvalsWithNumbers = await Promise.all(
        deduped.map(async (entry) => ({
          ...entry,
          tenantId: claim.tenantId,
          approvalNumber: await generateApprovalNumber(
            ctx.db,
            claim.tenantId,
          ),
        })),
      );

      if (claim.status === ClaimStatus.REVISION) {
        await ctx.db.approval.deleteMany({
          where: {
            claimId: input.id,
          },
        });
      }

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
              approver: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                  employeeId: true,
                  role: true,
                  departmentId: true,
                  image: true,
                },
              },
            },
          },
        },
      });

      // Create audit log
      await ctx.db.auditLog.create({
        data: {
          tenantId: claim.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.SUBMIT,
          entityType: "Claim",
          entityId: input.id,
        },
      });

      // Send poll notification only to the FIRST approver (sequence = 1).
      // Subsequent approvers are notified sequentially as each level approves
      // (handled in approval.approveClaim).
      void (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const first = (
          updated.approvals as unknown as Array<{
            approvalNumber: string;
            sequence: number;
            approver: { id: string; name: string | null; email: string | null };
          }>
        ).find((a) => a.sequence === 1);

        if (!first) return;

        const approverWithPhone = await ctx.db.user.findUnique({
          where: { id: first.approver.id },
          select: { phoneNumber: true },
        });
        const phone = approverWithPhone?.phoneNumber;
        if (!phone) return;

        await sendWhatsappPoll(
          buildClaimApprovalPoll(
            first.approvalNumber,
            phone.replace(/^\+/, ""),
            {
              claimNumber: claim.claimNumber,
              submitterName:
                claim.submitter.name ?? claim.submitter.email ?? "Unknown",
              claimType: claim.claimType,
              amount: claim.amount,
              description: claim.description,
              travelRequestNumber: claim.travelRequest?.requestNumber,
            },
          ),
        );
      })();

      return updated;
    }),

  // Mark claim as paid (Finance only)
  markAsPaid: permissionProcedure("claims", "pay")
    .input(
      z.object({
        id: z.string(),
        paymentReference: z.string(),
        paidBy: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.claim.findFirst({
        where: withTenantWhere(ctx, { id: input.id }),
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
          financeId: ctx.session.user.id,
        },
      });

      // Update travel request total reimbursed
      const totalPaid = await ctx.db.claim.aggregate({
        where: withTenantWhere(ctx, {
          travelRequestId: claim.travelRequestId,
          status: ClaimStatus.PAID,
        }),
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
          tenantId: claim.tenantId,
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
  delete: permissionProcedure("claims", "delete")
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const claim = await ctx.db.claim.findFirst({
        where: withTenantWhere(ctx, { id: input.id }),
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
          tenantId: claim.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.DELETE,
          entityType: "Claim",
          entityId: input.id,
        },
      });

      return updated;
    }),

  // Get claim statistics
  getStatistics: permissionProcedure("claims", "pay")
    .input(
      z.object({
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        departmentId: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.ClaimWhereInput = withTenantWhere(ctx, {
        deletedAt: null,
      });

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

      const [total, byStatus, byType, totalAmount, paidAmount] =
        await Promise.all([
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
