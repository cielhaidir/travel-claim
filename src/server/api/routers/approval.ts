import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  ApprovalStatus,
  TravelStatus,
  ClaimStatus,
  BailoutStatus,
  AuditAction,
  ApprovalLevel,
  type Prisma,
  type PrismaClient,
  Role,
} from "../../../../generated/prisma";

import {
  createTRPCRouter,
  protectedProcedure,
  supervisorProcedure,
} from "@/server/api/trpc";
import { generateApprovalNumber } from "@/lib/utils/numberGenerators";
import { sendWhatsappPoll, sendWhatsappMessage } from "@/lib/utils/whatsapp";

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

  const approval = await db.approval.findUnique({ where, include });

  if (!approval) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: identifier.approvalId
        ? `Approval with id "${identifier.approvalId}" not found`
        : `Approval with approvalNumber "${identifier.approvalNumber}" not found`,
    });
  }

  return approval;
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
// Shared Prisma include for full approval detail (used by get actions)
// ─────────────────────────────────────────────────────────────────────────────

const fullApprovalInclude = {
  travelRequest: {
    include: {
      requester: {
        include: {
          department: true,
          supervisor: {
            select: { id: true, name: true, email: true },
          },
        },
      },
      participants: {
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      },
      approvals: {
        include: {
          approver: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "asc" as const },
      },
    },
  },
  claim: {
    include: {
      submitter: { include: { department: true } },
      travelRequest: {
        include: {
          requester: { select: { id: true, name: true, email: true } },
        },
      },
      attachments: true,
      approvals: {
        include: {
          approver: { select: { id: true, name: true, role: true } },
        },
        orderBy: { createdAt: "asc" as const },
      },
    },
  },
  approver: {
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      phoneNumber: true,
    },
  },
} satisfies Prisma.ApprovalInclude;

// ─────────────────────────────────────────────────────────────────────────────
// Router
// ─────────────────────────────────────────────────────────────────────────────

export const approvalRouter = createTRPCRouter({
  // ───────────────────────────────────────────────────────────────────────────
  // UNIFIED MCP TOOL
  // Single entry-point for all approval actions consumed by the MCP / WhatsApp
  // agent. The `action` field is the discriminator.
  //
  //   action: "list"          → list my approvals (paginated)
  //   action: "pending_count" → count my pending approvals
  //   action: "get"           → fetch one approval by id or approvalNumber
  //   action: "approve"       → approve (TravelRequest, Claim, or Bailout)
  //   action: "reject"        → reject  (TravelRequest, Claim, or Bailout)
  //   action: "revision"      → request revision (TravelRequest, Claim, or Bailout)
  //
  // Entity type is auto-detected from the linked record; the caller does NOT
  // need to declare it separately.
  // ───────────────────────────────────────────────────────────────────────────
  actOnApproval: supervisorProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/approvals/act",
        protect: true,
        tags: ["Approvals"],
        summary: "Unified approval action tool",
      },
      mcp: {
        enabled: true,
        name: "act_on_approval",
        description: [
          "Unified approval action tool. Use the `action` field to choose what to do:",
          "",
          "• **list**          — List all pending and historical approvals assigned to you.",
          "  Optional filters: `status`, `entityType` ('TravelRequest' | 'Claim'), `limit`, `cursor`.",
          "",
          "• **pending_count** — Get the number of approvals waiting for your action.",
          "",
          "• **get**           — Fetch full detail for one approval.",
          "  Provide `approvalId` (CUID) OR `approvalNumber` (e.g. 'APR-2026-00001').",
          "  For incoming WhatsApp flows also supply `phone` to verify caller identity.",
          "",
          "• **approve**       — Approve the approval step (TravelRequest, Claim, or Bailout — auto-detected).",
          "  Provide `approvalId` or `approvalNumber`. Optional: `comments`, `callerPhone`.",
          "",
          "• **reject**        — Reject the approval step.",
          "  Provide `approvalId` or `approvalNumber` + `rejectionReason` (min 10 chars). Optional: `callerPhone`.",
          "",
          "• **revision**      — Request a revision, resetting all approval steps to PENDING.",
          "  Provide `approvalId` or `approvalNumber` + `comments` (min 10 chars). Optional: `callerPhone`.",
        ].join("\n"),
      },
    })
    .input(
      z.object({
        // ── Discriminator ──────────────────────────────────────────────────
        action: z.enum(["list", "pending_count", "get", "approve", "reject", "revision"]),

        // ── Identifier (required for get / approve / reject / revision) ───
        approvalId: z.string().optional(),
        approvalNumber: z.string().optional(),

        // ── get: phone-based identity check for WhatsApp flows ────────────
        phone: z.string().optional(),

        // ── approve / revision: optional free-text comment ────────────────
        comments: z.string().optional(),

        // ── reject / revision (when used as rejection): mandatory reason ──
        rejectionReason: z.string().optional(),

        // ── WhatsApp caller identity for approve / reject / revision ──────
        callerPhone: z.string().optional(),

        // ── list: optional filters ────────────────────────────────────────
        status: z.nativeEnum(ApprovalStatus).optional(),
        entityType: z.enum(["TravelRequest", "Claim"]).optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // ══════════════════════════════════════════════════════════════════════
      // ACTION: list
      // ══════════════════════════════════════════════════════════════════════
      if (input.action === "list") {
        const where: Prisma.ApprovalWhereInput = {
          approverId: ctx.session.user.id,
        };

        if (input.status) where.status = input.status;
        if (input.entityType === "TravelRequest") {
          where.travelRequestId = { not: null };
        } else if (input.entityType === "Claim") {
          where.claimId = { not: null };
        }

        const approvals = await ctx.db.approval.findMany({
          take: input.limit ? input.limit + 1 : 51,
          cursor: input.cursor ? { id: input.cursor } : undefined,
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
                    department: { select: { name: true } },
                  },
                },
              },
            },
            claim: {
              include: {
                submitter: {
                  select: { id: true, name: true, email: true, employeeId: true },
                },
                travelRequest: {
                  select: { requestNumber: true, destination: true },
                },
              },
            },
            approver: {
              select: { id: true, name: true, role: true },
            },
          },
          orderBy: { createdAt: "desc" },
        });

        let nextCursor: string | undefined = undefined;
        const limit = input.limit ?? 50;
        if (approvals.length > limit) {
          const nextItem = approvals.pop();
          nextCursor = nextItem!.id;
        }

        return { approvals, nextCursor };
      }

      // ══════════════════════════════════════════════════════════════════════
      // ACTION: pending_count
      // ══════════════════════════════════════════════════════════════════════
      if (input.action === "pending_count") {
        return ctx.db.approval.count({
          where: {
            approverId: ctx.session.user.id,
            status: ApprovalStatus.PENDING,
          },
        });
      }

      // ══════════════════════════════════════════════════════════════════════
      // ACTION: get
      // ══════════════════════════════════════════════════════════════════════
      if (input.action === "get") {
        if (input.approvalNumber && !input.approvalId) {
          // Lookup by approvalNumber with optional phone verification (WhatsApp flow)
          const found = await ctx.db.approval.findUnique({
            where: { approvalNumber: input.approvalNumber },
            include: fullApprovalInclude,
          });

          if (!found) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Approval with approvalNumber "${input.approvalNumber}" not found`,
            });
          }

          // Phone-based identity check when phone is supplied
          if (input.phone) {
            const approverPhone = (found.approver as { phoneNumber?: string | null } | null)?.phoneNumber ?? "";
            if (!approverPhone) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "The approver for this approval has no phone number registered",
              });
            }
            const normalize = (p: string) => p.replace(/^\+/, "").replace(/\s+/g, "");
            if (normalize(input.phone) !== normalize(approverPhone)) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "The supplied phone number does not match the approver on record",
              });
            }
          }

          return found;
        } else {
          // Lookup by id (or approvalNumber fallback) — session-based access check
          const id = input.approvalId;
          if (!id && !input.approvalNumber) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Provide approvalId or approvalNumber for action=get",
            });
          }

          const where: Prisma.ApprovalWhereUniqueInput = id
            ? { id }
            : { approvalNumber: input.approvalNumber! };

          const found = await ctx.db.approval.findUnique({
            where,
            include: fullApprovalInclude,
          });

          if (!found) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Approval not found" });
          }

          // Session-based access check
          const isApprover = found.approverId === ctx.session.user.id;
          const isRequester =
            (found.travelRequest as { requesterId?: string } | null)?.requesterId === ctx.session.user.id ||
            (found.claim as { submitterId?: string } | null)?.submitterId === ctx.session.user.id;
          const canView = ["MANAGER", "DIRECTOR", "ADMIN", "FINANCE"].includes(
            ctx.session.user.role,
          );

          if (!isApprover && !isRequester && !canView) {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Not authorized to view this approval",
            });
          }

          return found;
        }
      }

      // ══════════════════════════════════════════════════════════════════════
      // ACTIONS: approve / reject / revision
      // All three share identifier resolution + phone check + auth guard.
      // ══════════════════════════════════════════════════════════════════════

      if (!input.approvalId && !input.approvalNumber) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Either approvalId or approvalNumber must be provided",
        });
      }

      // ── Resolve base record with all linked entities ───────────────────────
      const approval = await resolveApprovalBase(
        ctx.db,
        { approvalId: input.approvalId, approvalNumber: input.approvalNumber },
        {
          approver: { select: { id: true, phoneNumber: true } },
          travelRequest: {
            include: {
              approvals: { orderBy: { level: "asc" } },
            },
          },
          claim: {
            include: {
              approvals: { orderBy: { level: "asc" } },
            },
          },
          bailout: {
            include: {
              approvals: { orderBy: { sequence: "asc" } },
              finance: { select: { id: true, phoneNumber: true, name: true } },
            },
          },
        },
      );

      // ── Detect entity type ─────────────────────────────────────────────────
      const entityType: "TravelRequest" | "Claim" | "Bailout" =
        approval.travelRequest
          ? "TravelRequest"
          : approval.claim
          ? "Claim"
          : approval.bailout
          ? "Bailout"
          : (() => {
              throw new TRPCError({
                code: "NOT_FOUND",
                message: "Approval is not linked to any known entity",
              });
            })();

      // ── Phone ownership verification (WhatsApp flow) ───────────────────────
      verifyCallerPhone(
        input.callerPhone,
        (approval.approver as { phoneNumber?: string | null }).phoneNumber,
      );

      // ── Session-based authorisation ────────────────────────────────────────
      if (approval.approverId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to act on this approval",
        });
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This approval has already been processed",
        });
      }

      const resolvedId = approval.id;

      // ══════════════════════════════════════════════════════════════════════
      // ACTION: approve
      // ══════════════════════════════════════════════════════════════════════
      if (input.action === "approve") {
        const updatedApproval = await ctx.db.approval.update({
          where: { id: resolvedId },
          data: {
            status: ApprovalStatus.APPROVED,
            comments: input.comments,
            approvedAt: new Date(),
          },
        });

        // ── TravelRequest approval chain ─────────────────────────────────────
        if (entityType === "TravelRequest") {
          const tr = approval.travelRequest!;
          const allApprovals = tr.approvals as Array<{ level: ApprovalLevel; status: ApprovalStatus; id: string; sequence?: number }>;

          const currentLevelIndex = Object.values(ApprovalLevel).indexOf(approval.level);
          const allPreviousApproved = allApprovals
            .filter((a) => Object.values(ApprovalLevel).indexOf(a.level) < currentLevelIndex)
            .every((a) => a.status === ApprovalStatus.APPROVED);

          if (!allPreviousApproved) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Previous level approvals must be completed first",
            });
          }

          const pendingApprovals = allApprovals.filter(
            (a) => a.status === ApprovalStatus.PENDING && a.id !== resolvedId,
          );

          let newStatus: TravelStatus;
          if (pendingApprovals.length === 0) {
            newStatus = TravelStatus.APPROVED;
          } else {
            const currentSequence = (approval as unknown as { sequence: number }).sequence ?? 1;
            const seqStatusMap: Record<number, TravelStatus> = {
              1: TravelStatus.APPROVED_L1,
              2: TravelStatus.APPROVED_L2,
              3: TravelStatus.APPROVED_L3,
              4: TravelStatus.APPROVED_L4,
              5: TravelStatus.APPROVED_L5,
            };
            newStatus = seqStatusMap[currentSequence] ?? TravelStatus.SUBMITTED;
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

          // Notifications
          void (async () => {
            if (newStatus === TravelStatus.APPROVED) {
              const fullTr = await ctx.db.travelRequest.findUnique({
                where: { id: approval.travelRequestId as string },
                include: {
                  requester: { select: { phoneNumber: true, name: true } },
                  bailouts: {
                    where: { deletedAt: null },
                    include: {
                      requester: { select: { name: true, email: true } },
                      finance: { select: { phoneNumber: true, name: true } },
                    },
                  },
                },
              });
              const phone = fullTr?.requester?.phoneNumber;
              if (phone) {
                await sendWhatsappPoll({
                  phone: `${phone.replace(/^\+/, "")}@s.whatsapp.net`,
                  question:
                    `✅ *Travel Request Disetujui Penuh*\n` +
                    `Travel: ${fullTr!.requestNumber}\n` +
                    `Semua level approval telah selesai.\n` +
                    `Disetujui oleh: ${ctx.session.user.name ?? ctx.session.user.email}`,
                  options: [`OK`],
                  maxAnswer: 1,
                });
              }

              if (fullTr?.bailouts && fullTr.bailouts.length > 0) {
                const fmtDate = (d: Date | null | undefined) =>
                  d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-";
                const fmtDateTime = (d: Date | null | undefined) =>
                  d ? new Date(d).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

                for (const bailout of fullTr.bailouts) {
                  const financePhone = bailout.finance?.phoneNumber;
                  if (!financePhone) continue;

                  let detail = "";
                  if (bailout.category === "TRANSPORT") {
                    detail =
                      `Mode: ${bailout.transportMode ?? "-"}\n` +
                      (bailout.carrier ? `Maskapai/Operator: ${bailout.carrier}\n` : "") +
                      (bailout.flightNumber ? `No. Penerbangan: ${bailout.flightNumber}\n` : "") +
                      (bailout.seatClass ? `Kelas: ${bailout.seatClass}\n` : "") +
                      (bailout.bookingRef ? `Booking Ref: ${bailout.bookingRef}\n` : "") +
                      `Dari: ${bailout.departureFrom ?? "-"} → ${bailout.arrivalTo ?? "-"}\n` +
                      `Berangkat: ${fmtDateTime(bailout.departureAt)}\n` +
                      `Tiba: ${fmtDateTime(bailout.arrivalAt)}\n`;
                  } else if (bailout.category === "HOTEL") {
                    detail =
                      `Hotel: ${bailout.hotelName ?? "-"}\n` +
                      (bailout.hotelAddress ? `Alamat: ${bailout.hotelAddress}\n` : "") +
                      (bailout.roomType ? `Tipe Kamar: ${bailout.roomType}\n` : "") +
                      `Check-in: ${fmtDate(bailout.checkIn)} — Check-out: ${fmtDate(bailout.checkOut)}\n`;
                  } else if (bailout.category === "MEAL") {
                    detail =
                      `Tanggal: ${fmtDate(bailout.mealDate)}\n` +
                      (bailout.mealLocation ? `Lokasi: ${bailout.mealLocation}\n` : "");
                  }

                  await sendWhatsappMessage({
                    phone: `${financePhone.replace(/^\+/, "")}@s.whatsapp.net`,
                    message:
                      `📎 *Travel Request Disetujui — Perlu Upload Dokumen Bailout*\n` +
                      `━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `Travel Request : ${fullTr.requestNumber}\n` +
                      `Bailout No     : ${bailout.bailoutNumber}\n` +
                      `Pemohon        : ${bailout.requester.name ?? bailout.requester.email ?? "-"}\n` +
                      `Kategori       : ${bailout.category}\n` +
                      `Jumlah         : Rp ${Number(bailout.amount).toLocaleString("id-ID")}\n` +
                      `Keterangan     : ${bailout.description}\n` +
                      (detail ? `━━━━━━━━━━━━━━━━━━━━━━\n${detail}` : "") +
                      `━━━━━━━━━━━━━━━━━━━━━━\n` +
                      `Silakan upload dokumen/invoice terkait bailout ini dan proses pencairan.`,
                  });
                }
              }
            } else {
              const currentSequence = (approval as unknown as { sequence: number }).sequence ?? 1;
              const nextApprovalRow = (
                tr.approvals as Array<{ id: string; sequence: number; status: string; approverId: string; approvalNumber: string }>
              ).find((a) => a.sequence === currentSequence + 1 && a.status === "PENDING");

              if (!nextApprovalRow) return;

              const nextApprover = await ctx.db.user.findUnique({
                where: { id: nextApprovalRow.approverId },
                select: { phoneNumber: true },
              });
              const phone = nextApprover?.phoneNumber;
              if (!phone) return;

              const fullTr = await ctx.db.travelRequest.findUnique({
                where: { id: approval.travelRequestId as string },
                include: { requester: { select: { name: true, email: true } } },
              });
              if (!fullTr) return;

              const { buildTravelRequestApprovalPoll } = await import("@/lib/utils/whatsapp");
              await sendWhatsappPoll(
                buildTravelRequestApprovalPoll(
                  nextApprovalRow.approvalNumber,
                  phone.replace(/^\+/, ""),
                  {
                    requestNumber: fullTr.requestNumber,
                    requesterName: fullTr.requester.name ?? fullTr.requester.email ?? "Unknown",
                    destination: fullTr.destination,
                    purpose: fullTr.purpose,
                    startDate: fullTr.startDate,
                    endDate: fullTr.endDate,
                  },
                ),
              );
            }
          })();
        }

        // ── Claim approval chain ─────────────────────────────────────────────
        else if (entityType === "Claim") {
          const cl = approval.claim!;
          const pendingApprovals = (cl.approvals as Array<{ status: ApprovalStatus; id: string; sequence: number }>).filter(
            (a) => a.status === ApprovalStatus.PENDING && a.id !== resolvedId,
          );

          const newStatus =
            pendingApprovals.length === 0 ? ClaimStatus.APPROVED : cl.status;

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

          void (async () => {
            if (newStatus === ClaimStatus.APPROVED) {
              const fullCl = await ctx.db.claim.findUnique({
                where: { id: approval.claimId as string },
                include: { submitter: { select: { phoneNumber: true, name: true } } },
              });
              const phone = fullCl?.submitter?.phoneNumber;
              if (phone) {
                await sendWhatsappPoll({
                  phone: `${phone.replace(/^\+/, "")}@s.whatsapp.net`,
                  question:
                    `✅ *Claim Disetujui Penuh*\n` +
                    `Claim: ${fullCl!.claimNumber}\n` +
                    `Semua level approval telah selesai.\n` +
                    `Disetujui oleh: ${ctx.session.user.name ?? ctx.session.user.email}`,
                  options: [`OK`],
                  maxAnswer: 1,
                });
              }
            } else {
              const currentSequence = (approval as unknown as { sequence: number }).sequence ?? 1;
              const nextApprovalRow = (
                cl.approvals as Array<{ id: string; sequence: number; status: string; approverId: string; approvalNumber: string }>
              ).find((a) => a.sequence === currentSequence + 1 && a.status === "PENDING");

              if (!nextApprovalRow) return;

              const nextApprover = await ctx.db.user.findUnique({
                where: { id: nextApprovalRow.approverId },
                select: { phoneNumber: true },
              });
              const phone = nextApprover?.phoneNumber;
              if (!phone) return;

              const fullCl = await ctx.db.claim.findUnique({
                where: { id: approval.claimId as string },
                include: {
                  submitter: { select: { name: true, email: true } },
                  travelRequest: { select: { requestNumber: true } },
                },
              });
              if (!fullCl) return;

              const { buildClaimApprovalPoll } = await import("@/lib/utils/whatsapp");
              await sendWhatsappPoll(
                buildClaimApprovalPoll(
                  nextApprovalRow.approvalNumber,
                  phone.replace(/^\+/, ""),
                  {
                    claimNumber: fullCl.claimNumber,
                    submitterName: fullCl.submitter.name ?? fullCl.submitter.email ?? "Unknown",
                    claimType: fullCl.claimType as string,
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
                    amount: fullCl.amount as any,
                    description: fullCl.description,
                    travelRequestNumber: fullCl.travelRequest?.requestNumber,
                  },
                ),
              );
            }
          })();
        }

        // ── Bailout approval chain ───────────────────────────────────────────
        else {
          const bailout = approval.bailout!;
          const pendingApprovals = (
            bailout.approvals as Array<{ status: ApprovalStatus; id: string; sequence: number }>
          ).filter((a) => a.status === ApprovalStatus.PENDING && a.id !== approval.id);

          const isFullyApproved = pendingApprovals.length === 0;

          let newBailoutStatus: BailoutStatus;
          if (isFullyApproved) {
            newBailoutStatus = BailoutStatus.APPROVED;
          } else {
            const currentSeq = (approval as unknown as { sequence: number }).sequence ?? 1;
            const seqStatusMap: Record<number, BailoutStatus> = {
              1: BailoutStatus.APPROVED_L1,
              2: BailoutStatus.APPROVED_L2,
              3: BailoutStatus.APPROVED_L3,
              4: BailoutStatus.APPROVED_L4,
              5: BailoutStatus.APPROVED_L5,
            };
            newBailoutStatus = seqStatusMap[currentSeq] ?? BailoutStatus.SUBMITTED;
          }

          await ctx.db.bailout.update({
            where: { id: approval.bailoutId as string },
            data: { status: newBailoutStatus },
          });

          await ctx.db.auditLog.create({
            data: {
              userId: ctx.session.user.id,
              action: AuditAction.APPROVE,
              entityType: "Bailout",
              entityId: approval.bailoutId as string,
              metadata: {
                approvalId: resolvedId,
                approvalNumber: approval.approvalNumber,
                level: approval.level,
                comments: input.comments,
              },
            },
          });

          void (async () => {
            if (isFullyApproved) {
              const fullBailout = await ctx.db.bailout.findUnique({
                where: { id: approval.bailoutId as string },
                include: {
                  requester: { select: { phoneNumber: true, name: true, email: true } },
                  finance: { select: { phoneNumber: true, name: true } },
                  travelRequest: { select: { requestNumber: true, destination: true } },
                },
              });

              const requesterPhone = fullBailout?.requester?.phoneNumber;
              if (requesterPhone) {
                await sendWhatsappPoll({
                  phone: `${requesterPhone.replace(/^\+/, "")}@s.whatsapp.net`,
                  question:
                    `✅ *Bailout Disetujui Penuh*\n` +
                    `No: ${fullBailout!.bailoutNumber}\n` +
                    `Jumlah: Rp ${Number(fullBailout!.amount).toLocaleString("id-ID")}\n` +
                    `Semua level approval telah selesai.\n` +
                    `Disetujui oleh: ${ctx.session.user.name ?? ctx.session.user.email}`,
                  options: [`OK`],
                  maxAnswer: 1,
                });
              }

              const fmtDate = (d: Date | null | undefined) =>
                d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-";
              const fmtDateTime = (d: Date | null | undefined) =>
                d ? new Date(d).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

              let categoryDetail = "";
              if (fullBailout) {
                if (fullBailout.category === "TRANSPORT") {
                  categoryDetail =
                    `Mode          : ${fullBailout.transportMode ?? "-"}\n` +
                    (fullBailout.carrier ? `Maskapai      : ${fullBailout.carrier}\n` : "") +
                    (fullBailout.flightNumber ? `No. Penerbangan: ${fullBailout.flightNumber}\n` : "") +
                    (fullBailout.seatClass ? `Kelas         : ${fullBailout.seatClass}\n` : "") +
                    (fullBailout.bookingRef ? `Booking Ref   : ${fullBailout.bookingRef}\n` : "") +
                    `Dari          : ${fullBailout.departureFrom ?? "-"} → ${fullBailout.arrivalTo ?? "-"}\n` +
                    `Berangkat     : ${fmtDateTime(fullBailout.departureAt)}\n` +
                    `Tiba          : ${fmtDateTime(fullBailout.arrivalAt)}\n`;
                } else if (fullBailout.category === "HOTEL") {
                  categoryDetail =
                    `Hotel         : ${fullBailout.hotelName ?? "-"}\n` +
                    (fullBailout.hotelAddress ? `Alamat        : ${fullBailout.hotelAddress}\n` : "") +
                    (fullBailout.roomType ? `Tipe Kamar    : ${fullBailout.roomType}\n` : "") +
                    `Check-in      : ${fmtDate(fullBailout.checkIn)}\n` +
                    `Check-out     : ${fmtDate(fullBailout.checkOut)}\n`;
                } else if (fullBailout.category === "MEAL") {
                  categoryDetail =
                    `Tanggal       : ${fmtDate(fullBailout.mealDate)}\n` +
                    (fullBailout.mealLocation ? `Lokasi        : ${fullBailout.mealLocation}\n` : "");
                }
              }

              const financeMsg = fullBailout
                ? `💰 *Bailout Disetujui — Upload Dokumen & Proses Pencairan*\n` +
                  `━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `Bailout No    : ${fullBailout.bailoutNumber}\n` +
                  `Travel Request: ${fullBailout.travelRequest?.requestNumber ?? "-"}\n` +
                  `Tujuan        : ${fullBailout.travelRequest?.destination ?? "-"}\n` +
                  `Pemohon       : ${fullBailout.requester.name ?? fullBailout.requester.email ?? "-"}\n` +
                  `Kategori      : ${fullBailout.category}\n` +
                  `Jumlah        : Rp ${Number(fullBailout.amount).toLocaleString("id-ID")}\n` +
                  `Keterangan    : ${fullBailout.description}\n` +
                  (categoryDetail ? `━━━━━━━━━━━━━━━━━━━━━━\n${categoryDetail}` : "") +
                  `━━━━━━━━━━━━━━━━━━━━━━\n` +
                  `Disetujui oleh: ${ctx.session.user.name ?? ctx.session.user.email}\n` +
                  `Silakan upload dokumen/invoice dan proses pencairan.`
                : "";

              const financePhone = fullBailout?.finance?.phoneNumber ?? bailout.finance?.phoneNumber;
              if (financePhone && financeMsg) {
                await sendWhatsappMessage({
                  phone: `${financePhone.replace(/^\+/, "")}@s.whatsapp.net`,
                  message: financeMsg,
                });
              } else if (financeMsg) {
                const financeUsers = await ctx.db.user.findMany({
                  where: { role: Role.FINANCE, deletedAt: null, phoneNumber: { not: null } },
                  select: { phoneNumber: true },
                  take: 5,
                });
                for (const fin of financeUsers) {
                  if (!fin.phoneNumber) continue;
                  await sendWhatsappMessage({
                    phone: `${fin.phoneNumber.replace(/^\+/, "")}@s.whatsapp.net`,
                    message: financeMsg,
                  });
                }
              }
            } else {
              const currentSeq = (approval as unknown as { sequence: number }).sequence ?? 1;
              const nextApprovalRow = (
                bailout.approvals as Array<{ id: string; sequence: number; status: string; approverId: string; approvalNumber: string }>
              ).find((a) => a.sequence === currentSeq + 1 && a.status === "PENDING");

              if (!nextApprovalRow) return;

              const nextApprover = await ctx.db.user.findUnique({
                where: { id: nextApprovalRow.approverId },
                select: { phoneNumber: true },
              });
              const phone = nextApprover?.phoneNumber;
              if (!phone) return;

              const fullBailout = await ctx.db.bailout.findUnique({
                where: { id: approval.bailoutId as string },
                include: { requester: { select: { name: true, email: true } } },
              });
              if (!fullBailout) return;

              await sendWhatsappPoll({
                phone: `${phone.replace(/^\+/, "")}@s.whatsapp.net`,
                question:
                  `📋 *Bailout Perlu Approval Anda*\n` +
                  `No: ${nextApprovalRow.approvalNumber}\n` +
                  `Bailout: ${fullBailout.bailoutNumber}\n` +
                  `Kategori: ${fullBailout.category}\n` +
                  `Jumlah: Rp ${Number(fullBailout.amount).toLocaleString("id-ID")}\n` +
                  `Keterangan: ${fullBailout.description}\n` +
                  `Diajukan oleh: ${fullBailout.requester.name ?? fullBailout.requester.email ?? "Unknown"}`,
                options: [
                  `Approve ${nextApprovalRow.approvalNumber}`,
                  `Decline ${nextApprovalRow.approvalNumber}`,
                  `Revision ${nextApprovalRow.approvalNumber}`,
                ],
                maxAnswer: 1,
              });
            }
          })();
        }

        return updatedApproval;
      }

      // ══════════════════════════════════════════════════════════════════════
      // ACTION: reject
      // ══════════════════════════════════════════════════════════════════════
      if (input.action === "reject") {
        if (!input.rejectionReason || input.rejectionReason.length < 10) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "rejectionReason is required and must be at least 10 characters",
          });
        }

        const updatedApproval = await ctx.db.approval.update({
          where: { id: resolvedId },
          data: {
            status: ApprovalStatus.REJECTED,
            rejectionReason: input.rejectionReason,
            rejectedAt: new Date(),
          },
        });

        if (entityType === "TravelRequest") {
          await ctx.db.travelRequest.update({
            where: { id: approval.travelRequestId as string },
            data: { status: TravelStatus.REJECTED },
          });

          await ctx.db.bailout.updateMany({
            where: { travelRequestId: approval.travelRequestId as string, deletedAt: null },
            data: { status: BailoutStatus.REJECTED, rejectedAt: new Date() },
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

          void (async () => {
            const tr = await ctx.db.travelRequest.findUnique({
              where: { id: approval.travelRequestId as string },
              include: { requester: { select: { phoneNumber: true, name: true } } },
            });
            const phone = tr?.requester?.phoneNumber;
            if (phone) {
              await sendWhatsappPoll({
                phone: `${phone.replace(/^\+/, "")}@s.whatsapp.net`,
                question:
                  `❌ *Travel Request Ditolak*\n` +
                  `Approval: ${approval.approvalNumber as string}\n` +
                  `Alasan: ${input.rejectionReason}\n` +
                  `Ditolak oleh: ${ctx.session.user.name ?? ctx.session.user.email}`,
                options: [`OK ${approval.approvalNumber as string}`],
                maxAnswer: 1,
              });
            }
          })();
        } else if (entityType === "Claim") {
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

          void (async () => {
            const cl = await ctx.db.claim.findUnique({
              where: { id: approval.claimId as string },
              include: { submitter: { select: { phoneNumber: true, name: true } } },
            });
            const phone = cl?.submitter?.phoneNumber;
            if (phone) {
              await sendWhatsappPoll({
                phone: `${phone.replace(/^\+/, "")}@s.whatsapp.net`,
                question:
                  `❌ *Claim Ditolak*\n` +
                  `Approval: ${approval.approvalNumber as string}\n` +
                  `Claim: ${cl.claimNumber}\n` +
                  `Alasan: ${input.rejectionReason}\n` +
                  `Ditolak oleh: ${ctx.session.user.name ?? ctx.session.user.email}`,
                options: [`OK ${approval.approvalNumber as string}`],
                maxAnswer: 1,
              });
            }
          })();
        } else {
          // Bailout
          await ctx.db.bailout.update({
            where: { id: approval.bailoutId as string },
            data: {
              status: BailoutStatus.REJECTED,
              rejectedAt: new Date(),
              rejectionReason: input.rejectionReason,
            },
          });

          await ctx.db.auditLog.create({
            data: {
              userId: ctx.session.user.id,
              action: AuditAction.REJECT,
              entityType: "Bailout",
              entityId: approval.bailoutId as string,
              metadata: {
                approvalId: resolvedId,
                approvalNumber: approval.approvalNumber,
                level: approval.level,
                rejectionReason: input.rejectionReason,
              },
            },
          });

          void (async () => {
            const bailout = approval.bailout!;
            const phone = (bailout.approvals as unknown as { requester?: { phoneNumber?: string | null } }[]) &&
              (await ctx.db.bailout.findUnique({
                where: { id: approval.bailoutId as string },
                include: { requester: { select: { phoneNumber: true, name: true } } },
              }));
            const requesterPhone = (phone as { requester?: { phoneNumber?: string | null } } | null)
              ?.requester?.phoneNumber;
            if (requesterPhone) {
              await sendWhatsappPoll({
                phone: `${requesterPhone.replace(/^\+/, "")}@s.whatsapp.net`,
                question:
                  `❌ *Bailout Ditolak*\n` +
                  `No: ${(bailout as unknown as { bailoutNumber: string }).bailoutNumber}\n` +
                  `Jumlah: Rp ${Number((bailout as unknown as { amount: number }).amount).toLocaleString("id-ID")}\n` +
                  `Alasan: ${input.rejectionReason}\n` +
                  `Ditolak oleh: ${ctx.session.user.name ?? ctx.session.user.email}`,
                options: [`OK ${(bailout as unknown as { bailoutNumber: string }).bailoutNumber}`],
                maxAnswer: 1,
              });
            }
          })();
        }

        return updatedApproval;
      }

      // ══════════════════════════════════════════════════════════════════════
      // ACTION: revision
      // ══════════════════════════════════════════════════════════════════════
      if (input.action === "revision") {
        if (!input.comments || input.comments.length < 10) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "comments is required and must be at least 10 characters for revision",
          });
        }

        const updatedApproval = await ctx.db.approval.update({
          where: { id: resolvedId },
          data: {
            status: ApprovalStatus.REVISION_REQUESTED,
            comments: input.comments,
          },
        });

        if (entityType === "TravelRequest") {
          await ctx.db.approval.updateMany({
            where: { travelRequestId: approval.travelRequestId as string },
            data: { status: ApprovalStatus.PENDING, approvedAt: null, rejectedAt: null },
          });

          await ctx.db.travelRequest.update({
            where: { id: approval.travelRequestId as string },
            data: { status: TravelStatus.REVISION },
          });

          await ctx.db.bailout.updateMany({
            where: { travelRequestId: approval.travelRequestId as string, deletedAt: null },
            data: { status: BailoutStatus.REVISION },
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

          void (async () => {
            const tr = await ctx.db.travelRequest.findUnique({
              where: { id: approval.travelRequestId as string },
              include: { requester: { select: { phoneNumber: true, name: true } } },
            });
            const phone = tr?.requester?.phoneNumber;
            if (phone) {
              await sendWhatsappPoll({
                phone: `${phone.replace(/^\+/, "")}@s.whatsapp.net`,
                question:
                  `🔄 *Revisi Travel Request Diminta*\n` +
                  `Approval: ${approval.approvalNumber as string}\n` +
                  `Catatan: ${input.comments}\n` +
                  `Dari: ${ctx.session.user.name ?? ctx.session.user.email}`,
                options: [`OK ${approval.approvalNumber as string}`],
                maxAnswer: 1,
              });
            }
          })();
        } else if (entityType === "Claim") {
          await ctx.db.approval.updateMany({
            where: { claimId: approval.claimId as string },
            data: { status: ApprovalStatus.PENDING, approvedAt: null, rejectedAt: null },
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

          void (async () => {
            const cl = await ctx.db.claim.findUnique({
              where: { id: approval.claimId as string },
              include: { submitter: { select: { phoneNumber: true, name: true } } },
            });
            const phone = cl?.submitter?.phoneNumber;
            if (phone) {
              await sendWhatsappPoll({
                phone: `${phone.replace(/^\+/, "")}@s.whatsapp.net`,
                question:
                  `🔄 *Revisi Claim Diminta*\n` +
                  `Approval: ${approval.approvalNumber as string}\n` +
                  `Claim: ${cl.claimNumber}\n` +
                  `Catatan: ${input.comments}\n` +
                  `Dari: ${ctx.session.user.name ?? ctx.session.user.email}`,
                options: [`OK ${approval.approvalNumber as string}`],
                maxAnswer: 1,
              });
            }
          })();
        } else {
          // Bailout
          await ctx.db.approval.updateMany({
            where: { bailoutId: approval.bailoutId as string },
            data: { status: ApprovalStatus.PENDING, approvedAt: null, rejectedAt: null },
          });

          await ctx.db.bailout.update({
            where: { id: approval.bailoutId as string },
            data: { status: BailoutStatus.REVISION },
          });

          await ctx.db.auditLog.create({
            data: {
              userId: ctx.session.user.id,
              action: AuditAction.UPDATE,
              entityType: "Bailout",
              entityId: approval.bailoutId as string,
              metadata: {
                action: "revision_requested",
                approvalId: resolvedId,
                approvalNumber: approval.approvalNumber,
                level: approval.level,
                comments: input.comments,
              },
            },
          });

          void (async () => {
            const fullBailout = await ctx.db.bailout.findUnique({
              where: { id: approval.bailoutId as string },
              include: { requester: { select: { phoneNumber: true, name: true } } },
            });
            const phone = fullBailout?.requester?.phoneNumber;
            if (phone) {
              await sendWhatsappPoll({
                phone: `${phone.replace(/^\+/, "")}@s.whatsapp.net`,
                question:
                  `🔄 *Revisi Bailout Diminta*\n` +
                  `No: ${fullBailout!.bailoutNumber}\n` +
                  `Jumlah: Rp ${Number(fullBailout!.amount).toLocaleString("id-ID")}\n` +
                  `Catatan: ${input.comments}\n` +
                  `Dari: ${ctx.session.user.name ?? ctx.session.user.email}`,
                options: [`OK ${fullBailout!.bailoutNumber}`],
                maxAnswer: 1,
              });
            }
          })();
        }

        return updatedApproval;
      }

      // Should never reach here given the discriminated enum
      throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown action" });
    }),

  // ─── UI QUERY PROCEDURES (non-MCP, used by the web frontend) ─────────────

  // List approvals assigned to the current user (used by approvals page)
  getMyApprovals: supervisorProcedure
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

      if (input?.status) where.status = input.status;
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
                  department: { select: { name: true } },
                },
              },
            },
          },
          claim: {
            include: {
              submitter: {
                select: { id: true, name: true, email: true, employeeId: true },
              },
              travelRequest: {
                select: { requestNumber: true, destination: true },
              },
            },
          },
          approver: {
            select: { id: true, name: true, role: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined = undefined;
      const limit = input?.limit ?? 50;
      if (approvals.length > limit) {
        const nextItem = approvals.pop();
        nextCursor = nextItem!.id;
      }

      return { approvals, nextCursor };
    }),

  // Count pending approvals for the current user (used by badge / header)
  getPendingCount: supervisorProcedure
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

  // ─── ADMIN / TESTING PROCEDURES ───────────────────────────────────────────

  // Get all travel approvals at a given level (admin view for testing)
  getAllApprovalsAdmin: protectedProcedure
    .input(
      z.object({
        level: z.nativeEnum(ApprovalLevel).optional(),
        status: z.nativeEnum(ApprovalStatus).optional(),
        limit: z.number().min(1).max(100).optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      if (!["ADMIN", "DIRECTOR", "MANAGER"].includes(ctx.session.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins and managers can view all approvals",
        });
      }

      const where: Prisma.ApprovalWhereInput = {
        travelRequestId: { not: null },
      };

      if (input?.level) {
        where.level = input.level as ApprovalLevel;
      }
      if (input?.status) {
        where.status = input.status;
      }

      const approvals = await ctx.db.approval.findMany({
        take: input?.limit ? input.limit + 1 : 51,
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
                    select: { name: true },
                  },
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
        orderBy: { createdAt: "desc" },
      });

      const limit = input?.limit ?? 50;
      let nextCursor: string | undefined = undefined;
      if (approvals.length > limit) {
        const nextItem = approvals.pop();
        nextCursor = nextItem!.id;
      }

      return { approvals, nextCursor };
    }),

  // Admin action on any approval (approve / reject / revision) — bypasses approverId check
  adminActOnApproval: protectedProcedure
    .input(
      z.object({
        approvalId: z.string(),
        action: z.enum(["approve", "reject", "revision"]),
        comments: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!["ADMIN", "DIRECTOR", "MANAGER"].includes(ctx.session.user.role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only admins and managers can act on any approval",
        });
      }

      const approval = await ctx.db.approval.findUnique({
        where: { id: input.approvalId },
        include: {
          travelRequest: {
            include: {
              approvals: { orderBy: { level: "asc" } },
            },
          },
        },
      });

      if (!approval || !approval.travelRequest) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Approval not found" });
      }

      if (approval.status !== ApprovalStatus.PENDING) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This approval has already been processed" });
      }

      if (input.action === "approve") {
        const requiresComment = false;
        void requiresComment;

        await ctx.db.approval.update({
          where: { id: input.approvalId },
          data: {
            status: ApprovalStatus.APPROVED,
            comments: input.comments,
            approvedAt: new Date(),
          },
        });

        // Determine new travel request status
        const pendingApprovals = approval.travelRequest.approvals.filter(
          (a) => a.status === ApprovalStatus.PENDING
        );
        let newStatus: TravelStatus;
        const isLastPending = pendingApprovals.length === 1 && pendingApprovals[0]!.id === input.approvalId;
        if (isLastPending) {
          newStatus = TravelStatus.APPROVED;
        } else {
          const approvalSeq = (approval as unknown as { sequence: number }).sequence ?? 1;
          const seqStatusMap: Record<number, TravelStatus> = {
            1: TravelStatus.APPROVED_L1,
            2: TravelStatus.APPROVED_L2,
            3: TravelStatus.APPROVED_L3,
            4: TravelStatus.APPROVED_L4,
            5: TravelStatus.APPROVED_L5,
          };
          newStatus = seqStatusMap[approvalSeq] ?? TravelStatus.SUBMITTED;
        }

        await ctx.db.travelRequest.update({
          where: { id: approval.travelRequestId! },
          data: { status: newStatus },
        });

        await ctx.db.auditLog.create({
          data: {
            userId: ctx.session.user.id,
            action: AuditAction.APPROVE,
            entityType: "TravelRequest",
            entityId: approval.travelRequestId!,
            metadata: { approvalId: input.approvalId, level: approval.level, adminOverride: true },
          },
        });
      } else if (input.action === "reject") {
        if (!input.comments || input.comments.length < 10) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Rejection reason required (min 10 chars)" });
        }

        await ctx.db.approval.update({
          where: { id: input.approvalId },
          data: {
            status: ApprovalStatus.REJECTED,
            rejectionReason: input.comments,
            rejectedAt: new Date(),
          },
        });

        await ctx.db.travelRequest.update({
          where: { id: approval.travelRequestId! },
          data: { status: TravelStatus.REJECTED },
        });

        await ctx.db.auditLog.create({
          data: {
            userId: ctx.session.user.id,
            action: AuditAction.REJECT,
            entityType: "TravelRequest",
            entityId: approval.travelRequestId!,
            metadata: { approvalId: input.approvalId, level: approval.level, adminOverride: true },
          },
        });
      } else {
        // revision
        if (!input.comments || input.comments.length < 10) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Revision reason required (min 10 chars)" });
        }

        await ctx.db.approval.update({
          where: { id: input.approvalId },
          data: { status: ApprovalStatus.REVISION_REQUESTED, comments: input.comments },
        });

        // Reset all approvals to pending
        await ctx.db.approval.updateMany({
          where: { travelRequestId: approval.travelRequestId },
          data: { status: ApprovalStatus.PENDING, approvedAt: null, rejectedAt: null },
        });

        await ctx.db.travelRequest.update({
          where: { id: approval.travelRequestId! },
          data: { status: TravelStatus.REVISION },
        });

        await ctx.db.auditLog.create({
          data: {
            userId: ctx.session.user.id,
            action: AuditAction.UPDATE,
            entityType: "TravelRequest",
            entityId: approval.travelRequestId!,
            metadata: { action: "revision_requested", approvalId: input.approvalId, level: approval.level, adminOverride: true },
          },
        });
      }

      return { success: true };
    }),

  // Get travel requests that need director review (status = SUBMITTED, APPROVED_L1, APPROVED_L2)
  // This is more reliable than filtering approvals, because L3 might not exist yet
  getTravelRequestsForDirectorReview: protectedProcedure
    .input(
      z.object({
        statusFilter: z.enum(["PENDING", "ALL"]).optional(),
        limit: z.number().min(1).max(100).optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      if (!["ADMIN", "DIRECTOR", "MANAGER"].includes(ctx.session.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
      }

      // "PENDING" means: find requests where L3 approval is PENDING or doesn't exist yet
      // "ALL" means: find all requests that have ever had an L3 approval
      const pendingOnly = !input?.statusFilter || input.statusFilter === "PENDING";

      if (pendingOnly) {
        // Find requests that have a DIRECTOR-level approval pending, or are at APPROVED_L1/L2/L3 waiting for the next step
        const travelRequests = await ctx.db.travelRequest.findMany({
          where: {
            deletedAt: null,
            status: { in: [TravelStatus.SUBMITTED, TravelStatus.APPROVED_L1, TravelStatus.APPROVED_L2, TravelStatus.APPROVED_L3] },
            approvals: {
              some: {
                level: ApprovalLevel.DIRECTOR,
                status: ApprovalStatus.PENDING,
              },
            },
          },
          include: {
            requester: {
              select: {
                id: true, name: true, employeeId: true,
                department: { select: { name: true } },
              },
            },
            approvals: {
              where: { level: ApprovalLevel.DIRECTOR },
              include: { approver: { select: { id: true, name: true, role: true } } },
            },
          },
          take: input?.limit ?? 50,
          orderBy: { updatedAt: "desc" },
        });

        return { travelRequests };
      } else {
        // ALL: return any travel request that has a DIRECTOR-level approval
        const travelRequests = await ctx.db.travelRequest.findMany({
          where: {
            deletedAt: null,
            approvals: { some: { level: ApprovalLevel.DIRECTOR } },
          },
          include: {
            requester: {
              select: {
                id: true, name: true, employeeId: true,
                department: { select: { name: true } },
              },
            },
            approvals: {
              where: { level: ApprovalLevel.DIRECTOR },
              include: { approver: { select: { id: true, name: true, role: true } } },
            },
          },
          take: input?.limit ?? 50,
          orderBy: { updatedAt: "desc" },
        });

        return { travelRequests };
      }
    }),

  // Direct action on a travel request by creating an L3 approval on the fly (for requests with no L3 approval yet)
  adminActOnTravelRequestDirect: protectedProcedure
    .input(
      z.object({
        travelRequestId: z.string(),
        action: z.enum(["approve", "reject", "revision"]),
        comments: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!["ADMIN", "DIRECTOR", "MANAGER"].includes(ctx.session.user.role)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient permissions" });
      }

      const requiresComment = input.action === "reject" || input.action === "revision";
      if (requiresComment && (!input.comments || input.comments.length < 10)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Reason required (min 10 chars)" });
      }

      const travelRequest = await ctx.db.travelRequest.findUnique({
        where: { id: input.travelRequestId },
      });

      if (!travelRequest) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Travel request not found" });
      }

      const approvalStatus =
        input.action === "approve" ? ApprovalStatus.APPROVED
        : input.action === "reject" ? ApprovalStatus.REJECTED
        : ApprovalStatus.REVISION_REQUESTED;

      // Create a DIRECTOR-level approval record with a resolved status (create + approve in one shot)
      const approvalNumber = await generateApprovalNumber(ctx.db);
      await ctx.db.approval.create({
        data: {
          approvalNumber,
          travelRequestId: input.travelRequestId,
          approverId: ctx.session.user.id,
          level: ApprovalLevel.DIRECTOR,
          status: approvalStatus,
          comments: input.comments,
          rejectionReason: input.action === "reject" ? input.comments : undefined,
          approvedAt: input.action === "approve" ? new Date() : undefined,
          rejectedAt: input.action === "reject" ? new Date() : undefined,
        },
      });

      // Update travel request status
      let newTravelStatus: TravelStatus;
      if (input.action === "approve") {
        newTravelStatus = TravelStatus.APPROVED;
      } else if (input.action === "reject") {
        newTravelStatus = TravelStatus.REJECTED;
      } else {
        newTravelStatus = TravelStatus.REVISION;
        // Reset all approvals to PENDING for revision
        await ctx.db.approval.updateMany({
          where: { travelRequestId: input.travelRequestId, level: { not: ApprovalLevel.DIRECTOR } },
          data: { status: ApprovalStatus.PENDING, approvedAt: null, rejectedAt: null },
        });
      }

      await ctx.db.travelRequest.update({
        where: { id: input.travelRequestId },
        data: { status: newTravelStatus },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: input.action === "approve" ? AuditAction.APPROVE : AuditAction.REJECT,
          entityType: "TravelRequest",
          entityId: input.travelRequestId,
          metadata: { action: input.action, level: "DIRECTOR", adminDirectAct: true },
        },
      });

      return { success: true };
    }),
});
