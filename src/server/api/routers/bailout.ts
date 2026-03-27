import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  BailoutStatus,
  BailoutCategory,
  TransportMode,
  AuditAction,
  Role,
  type Prisma,
} from "../../../../generated/prisma";
import {
  createTRPCRouter,
  permissionProcedure,
} from "@/server/api/trpc";
import { sendWhatsappPoll, sendWhatsappMessage } from "@/lib/utils/whatsapp";
import { hasPermissionMap } from "@/lib/auth/permissions";
import { generateBailoutNumber } from "@/lib/utils/numberGenerators";

function applyScope<T extends Record<string, unknown>>(
  _ctx: unknown,
  where: T,
): T {
  return where;
}

export const bailoutRouter = createTRPCRouter({
  // ─── GET ALL (by travelRequestId or global) ───────────────────────────────
  getAll: permissionProcedure("bailout", "read")
    .meta({
      openapi: {
        method: "GET",
        path: "/bailouts",
        protect: true,
        tags: ["Bailout"],
        summary: "Get all bailouts",
      },
    })
    .input(
      z.object({
        travelRequestId: z.string().optional(),
        status: z.nativeEnum(BailoutStatus).optional(),
        limit: z.number().min(1).max(500).optional(),
        cursor: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = applyScope(ctx, {
        deletedAt: null,
      });

      if (input?.travelRequestId) {
        where.travelRequestId = input.travelRequestId;
      }
      if (input?.status) {
        where.status = input.status;
      }

      const limit = input?.limit ?? 50;
      const bailouts = await ctx.db.bailout.findMany({
        take: limit + 1,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where,
        include: {
          requester: {
            select: { id: true, name: true, email: true, employeeId: true },
          },
          travelRequest: {
            select: {
              id: true,
              requestNumber: true,
              destination: true,
              status: true,
            },
          },
          finance: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined = undefined;
      if (bailouts.length > limit) {
        const nextItem = bailouts.pop();
        nextCursor = nextItem!.id;
      }

      return { bailouts, nextCursor };
    }),

  repairLegacyTravelStatuses: permissionProcedure("bailout", "disburse")
    .input(z.object({}))
    .output(z.object({ updatedCount: z.number() }))
    .mutation(async ({ ctx }) => {
      const legacyCandidates = await ctx.db.bailout.findMany({
        where: applyScope(
          ctx,
          {
            deletedAt: null,
            status: BailoutStatus.DRAFT,
            submittedAt: null,
            travelRequest: {
              status: {
                in: ["APPROVED", "LOCKED", "CLOSED"],
              },
            },
            approvals: {
              none: {},
            },
          } satisfies Prisma.BailoutWhereInput,
        ),
        select: {
          id: true,
          createdAt: true,
          travelRequest: {
            select: {
              createdAt: true,
              submittedAt: true,
            },
          },
        },
      });

      const repairableIds = legacyCandidates
        .filter((bailout) =>
          bailout.travelRequest.submittedAt
            ? bailout.createdAt <= bailout.travelRequest.submittedAt
            : bailout.createdAt <= bailout.travelRequest.createdAt,
        )
        .map((bailout) => bailout.id);

      if (repairableIds.length === 0) {
        return { updatedCount: 0 };
      }

      await ctx.db.bailout.updateMany({
        where: { id: { in: repairableIds } },
        data: {
          status: BailoutStatus.APPROVED_DIRECTOR,
        },
      });

      return { updatedCount: repairableIds.length };
    }),

  // ─── GET BY ID ────────────────────────────────────────────────────────────
  getById: permissionProcedure("bailout", "read")
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const bailout = await ctx.db.bailout.findFirst({
        where: applyScope(ctx, { id: input.id }),
        include: {
          requester: {
            select: { id: true, name: true, email: true, employeeId: true },
          },
          travelRequest: {
            select: {
              id: true,
              requestNumber: true,
              destination: true,
              status: true,
              startDate: true,
              endDate: true,
            },
          },
        },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      return bailout;
    }),

  // ─── CREATE ───────────────────────────────────────────────────────────────
  create: permissionProcedure("bailout", "create")
    .meta({
      openapi: {
        method: "POST",
        path: "/bailouts",
        protect: true,
        tags: ["Bailout"],
        summary: "Create bailout request",
      },
    })
    .input(
      z.object({
        travelRequestId: z.string(),
        category: z.nativeEnum(BailoutCategory).default(BailoutCategory.OTHER),
        description: z.string().min(10),
        amount: z.number().positive(),
        // Transport
        transportMode: z.nativeEnum(TransportMode).optional(),
        carrier: z.string().optional(),
        departureFrom: z.string().optional(),
        arrivalTo: z.string().optional(),
        departureAt: z.coerce.date().optional(),
        arrivalAt: z.coerce.date().optional(),
        flightNumber: z.string().optional(),
        seatClass: z.string().optional(),
        bookingRef: z.string().optional(),
        // Hotel
        hotelName: z.string().optional(),
        hotelAddress: z.string().optional(),
        checkIn: z.coerce.date().optional(),
        checkOut: z.coerce.date().optional(),
        roomType: z.string().optional(),
        // Meal
        mealDate: z.coerce.date().optional(),
        mealLocation: z.string().optional(),
        // Finance assignment
        financeId: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Check if travel request exists
      const travelRequest = await ctx.db.travelRequest.findFirst({
        where: applyScope(ctx, { id: input.travelRequestId }),
      });

      if (!travelRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel Request tidak ditemukan",
        });
      }

      // Generate bailout number
      const bailoutNumber = await generateBailoutNumber(ctx.db);

      const {
        travelRequestId,
        category,
        description,
        amount,
        transportMode,
        ...rest
      } = input;

      const bailout = await ctx.db.bailout.create({
        data: {
          bailoutNumber,
          travelRequestId,
          requesterId: ctx.session.user.id,
          category,
          description,
          amount,
          transportMode,
          ...rest,
          status: BailoutStatus.DRAFT,
        },
        include: {
          requester: { select: { id: true, name: true, email: true } },
          travelRequest: {
            select: { id: true, requestNumber: true, destination: true },
          },
        },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "Bailout",
          entityId: bailout.id,
          changes: { after: bailout },
        },
      });

      return bailout;
    }),

  // ─── SUBMIT ───────────────────────────────────────────────────────────────
  submit: permissionProcedure("bailout", "submit")
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const bailout = await ctx.db.bailout.findFirst({
        where: applyScope(ctx, { id: input.id }),
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      if (bailout.requesterId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Hanya pembuat yang bisa submit",
        });
      }

      if (bailout.status !== BailoutStatus.DRAFT) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Hanya bailout DRAFT yang bisa di-submit",
        });
      }

      const updated = await ctx.db.bailout.update({
        where: { id: input.id },
        data: {
          status: BailoutStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.SUBMIT,
          entityType: "Bailout",
          entityId: input.id,
        },
      });

      // Send poll notification to Sales Chief / Manager so they can act via WhatsApp
      void (async () => {
        const chiefUsers = await ctx.db.user.findMany({
          where: {
            role: { in: [Role.SALES_CHIEF, Role.MANAGER] },
            deletedAt: null,
            phoneNumber: { not: null },
          },
          select: { phoneNumber: true, name: true },
          take: 5,
        });

        for (const chief of chiefUsers) {
          if (!chief.phoneNumber) continue;
          await sendWhatsappPoll({
            phone: `${chief.phoneNumber.replace(/^\+/, "")}@s.whatsapp.net`,
            question:
              `📋 *Bailout Perlu Approval*\n` +
              `No: ${updated.bailoutNumber}\n` +
              `Kategori: ${updated.category}\n` +
              `Jumlah: Rp ${Number(updated.amount).toLocaleString("id-ID")}\n` +
              `Keterangan: ${updated.description}\n` +
              `Diajukan oleh: ${ctx.session.user.name ?? ctx.session.user.email}`,
            options: [
              `Approve ${updated.bailoutNumber}`,
              `Decline ${updated.bailoutNumber}`,
              `Revision ${updated.bailoutNumber}`,
            ],
            maxAnswer: 1,
          });
        }
      })();

      return updated;
    }),

  // ─── APPROVE BY CHIEF ─────────────────────────────────────────────────────
  approveByChief: permissionProcedure("bailout", "approve")
    .input(
      z.object({
        id: z.string(),
        notes: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const bailout = await ctx.db.bailout.findFirst({
        where: applyScope(ctx, { id: input.id }),
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      if (bailout.status !== BailoutStatus.SUBMITTED) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bailout harus dalam status SUBMITTED untuk bisa di-approve",
        });
      }

      const updated = await ctx.db.bailout.update({
        where: { id: input.id },
        data: {
          status: BailoutStatus.APPROVED_CHIEF,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.APPROVE,
          entityType: "Bailout",
          entityId: input.id,
          metadata: { level: "CHIEF", notes: input.notes },
        },
      });

      // Send poll notification to Director(s) so they can act via WhatsApp
      void (async () => {
        const directors = await ctx.db.user.findMany({
          where: {
            role: Role.DIRECTOR,
            deletedAt: null,
            phoneNumber: { not: null },
          },
          select: { phoneNumber: true, name: true },
          take: 5,
        });

        for (const director of directors) {
          if (!director.phoneNumber) continue;
          await sendWhatsappPoll({
            phone: `${director.phoneNumber.replace(/^\+/, "")}@s.whatsapp.net`,
            question:
              `📋 *Bailout Perlu Approval Direktur*\n` +
              `No: ${updated.bailoutNumber}\n` +
              `Kategori: ${updated.category}\n` +
              `Jumlah: Rp ${Number(updated.amount).toLocaleString("id-ID")}\n` +
              `Keterangan: ${updated.description}\n` +
              `Disetujui Chief: ${ctx.session.user.name ?? ctx.session.user.email}`,
            options: [
              `Approve ${updated.bailoutNumber}`,
              `Decline ${updated.bailoutNumber}`,
              `Revision ${updated.bailoutNumber}`,
            ],
            maxAnswer: 1,
          });
        }
      })();

      return updated;
    }),

  // ─── APPROVE BY DIRECTOR ──────────────────────────────────────────────────
  approveByDirector: permissionProcedure("bailout", "approve")
    .input(
      z.object({
        id: z.string(),
        notes: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const bailout = await ctx.db.bailout.findFirst({
        where: applyScope(ctx, { id: input.id }),
        include: {
          travelRequest: {
            select: {
              status: true,
              createdAt: true,
              submittedAt: true,
            },
          },
          approvals: {
            select: { id: true },
          },
        },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      if (bailout.status !== BailoutStatus.APPROVED_CHIEF) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bailout harus sudah di-approve Chief terlebih dahulu",
        });
      }

      const updated = await ctx.db.bailout.update({
        where: { id: input.id },
        data: {
          status: BailoutStatus.APPROVED_DIRECTOR,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.APPROVE,
          entityType: "Bailout",
          entityId: input.id,
          metadata: { level: "DIRECTOR", notes: input.notes },
        },
      });

      // Send notification to requester & finance that bailout is fully approved
      void (async () => {
        const fullBailout = await ctx.db.bailout.findFirst({
          where: applyScope(ctx, { id: input.id }),
          include: {
            requester: { select: { phoneNumber: true, name: true } },
          },
        });

        // Notify requester
        const requesterPhone = fullBailout?.requester?.phoneNumber;
        if (requesterPhone) {
          await sendWhatsappPoll({
            phone: `${requesterPhone.replace(/^\+/, "")}@s.whatsapp.net`,
            question:
              `✅ *Bailout Disetujui Penuh*\n` +
              `No: ${updated.bailoutNumber}\n` +
              `Jumlah: Rp ${Number(updated.amount).toLocaleString("id-ID")}\n` +
              `Keterangan: ${updated.description}\n` +
              `Disetujui Direktur: ${ctx.session.user.name ?? ctx.session.user.email}`,
            options: [`OK ${updated.bailoutNumber}`],
            maxAnswer: 1,
          });
        }

        // Notify Finance to disburse — with full category-specific detail
        const fmtDate = (d: Date | null | undefined) =>
          d
            ? new Date(d).toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })
            : "-";
        const fmtDateTime = (d: Date | null | undefined) =>
          d
            ? new Date(d).toLocaleString("id-ID", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "-";

        let categoryDetail = "";
        if (updated.category === "TRANSPORT") {
          categoryDetail =
            `Mode          : ${updated.transportMode ?? "-"}\n` +
            (updated.carrier ? `Maskapai      : ${updated.carrier}\n` : "") +
            (updated.flightNumber
              ? `No. Penerbangan: ${updated.flightNumber}\n`
              : "") +
            (updated.seatClass
              ? `Kelas         : ${updated.seatClass}\n`
              : "") +
            (updated.bookingRef
              ? `Booking Ref   : ${updated.bookingRef}\n`
              : "") +
            `Dari          : ${updated.departureFrom ?? "-"} → ${updated.arrivalTo ?? "-"}\n` +
            `Berangkat     : ${fmtDateTime(updated.departureAt)}\n` +
            `Tiba          : ${fmtDateTime(updated.arrivalAt)}\n`;
        } else if (updated.category === "HOTEL") {
          categoryDetail =
            `Hotel         : ${updated.hotelName ?? "-"}\n` +
            (updated.hotelAddress
              ? `Alamat        : ${updated.hotelAddress}\n`
              : "") +
            (updated.roomType ? `Tipe Kamar    : ${updated.roomType}\n` : "") +
            `Check-in      : ${fmtDate(updated.checkIn)}\n` +
            `Check-out     : ${fmtDate(updated.checkOut)}\n`;
        } else if (updated.category === "MEAL") {
          categoryDetail =
            `Tanggal       : ${fmtDate(updated.mealDate)}\n` +
            (updated.mealLocation
              ? `Lokasi        : ${updated.mealLocation}\n`
              : "");
        }

        // Fetch requester name for the message
        const bailoutWithRequester = await ctx.db.bailout.findFirst({
          where: applyScope(ctx, { id: input.id }),
          include: {
            requester: { select: { name: true, email: true } },
            travelRequest: {
              select: { requestNumber: true, destination: true },
            },
          },
        });

        const financeMsg =
          `💰 *Bailout Disetujui — Upload Dokumen & Proses Pencairan*\n` +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Bailout No    : ${updated.bailoutNumber}\n` +
          `Travel Request: ${bailoutWithRequester?.travelRequest?.requestNumber ?? "-"}\n` +
          `Tujuan        : ${bailoutWithRequester?.travelRequest?.destination ?? "-"}\n` +
          `Pemohon       : ${bailoutWithRequester?.requester?.name ?? bailoutWithRequester?.requester?.email ?? "-"}\n` +
          `Kategori      : ${updated.category}\n` +
          `Jumlah        : Rp ${Number(updated.amount).toLocaleString("id-ID")}\n` +
          `Keterangan    : ${updated.description}\n` +
          (categoryDetail ? `━━━━━━━━━━━━━━━━━━━━━━\n${categoryDetail}` : "") +
          `━━━━━━━━━━━━━━━━━━━━━━\n` +
          `Disetujui Direktur: ${ctx.session.user.name ?? ctx.session.user.email}\n` +
          `Silakan upload dokumen/invoice dan proses pencairan.`;

        const financeUsers = await ctx.db.user.findMany({
          where: {
            role: Role.FINANCE,
            deletedAt: null,
            phoneNumber: { not: null },
          },
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
      })();

      return updated;
    }),

  // ─── REJECT ───────────────────────────────────────────────────────────────
  reject: permissionProcedure("bailout", "reject")
    .input(
      z.object({
        id: z.string(),
        rejectionReason: z.string().min(5),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const bailout = await ctx.db.bailout.findFirst({
        where: applyScope(ctx, { id: input.id }),
        include: {
          travelRequest: {
            select: {
              status: true,
              createdAt: true,
              submittedAt: true,
            },
          },
          approvals: {
            select: { id: true },
          },
        },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      const rejectableStatuses: BailoutStatus[] = [
        BailoutStatus.SUBMITTED,
        BailoutStatus.APPROVED_CHIEF,
      ];

      if (!rejectableStatuses.includes(bailout.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bailout tidak bisa di-reject pada status ini",
        });
      }

      const updated = await ctx.db.bailout.update({
        where: { id: input.id },
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
          entityId: input.id,
          metadata: { reason: input.rejectionReason },
        },
      });

      // Send notification to requester that bailout was rejected
      void (async () => {
        const fullBailout = await ctx.db.bailout.findFirst({
          where: applyScope(ctx, { id: input.id }),
          include: {
            requester: { select: { phoneNumber: true, name: true } },
          },
        });
        const phone = fullBailout?.requester?.phoneNumber;
        if (phone) {
          await sendWhatsappPoll({
            phone: `${phone.replace(/^\+/, "")}@s.whatsapp.net`,
            question:
              `❌ *Bailout Ditolak*\n` +
              `No: ${updated.bailoutNumber}\n` +
              `Jumlah: Rp ${Number(updated.amount).toLocaleString("id-ID")}\n` +
              `Alasan: ${input.rejectionReason}\n` +
              `Ditolak oleh: ${ctx.session.user.name ?? ctx.session.user.email}`,
            options: [`OK ${updated.bailoutNumber}`],
            maxAnswer: 1,
          });
        }
      })();

      return updated;
    }),

  // ─── MARK DISBURSED (Finance) ─────────────────────────────────────────────
  disburse: permissionProcedure("bailout", "disburse")
    .input(
      z.object({
        id: z.string(),
        disbursementRef: z.string().optional(),
        storageUrl: z.string().url().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const bailout = await ctx.db.bailout.findFirst({
        where: applyScope(ctx, { id: input.id }),
        include: {
          travelRequest: {
            select: {
              status: true,
              createdAt: true,
              submittedAt: true,
            },
          },
          approvals: {
            select: { id: true },
          },
        },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      const isLegacyTravelReady =
        bailout.status === BailoutStatus.DRAFT &&
        bailout.submittedAt === null &&
        bailout.approvals.length === 0 &&
        ["APPROVED", "LOCKED", "CLOSED"].includes(bailout.travelRequest.status) &&
        (bailout.travelRequest.submittedAt
          ? bailout.createdAt <= bailout.travelRequest.submittedAt
          : bailout.createdAt <= bailout.travelRequest.createdAt);

      if (
        bailout.status !== BailoutStatus.APPROVED_DIRECTOR &&
        !isLegacyTravelReady
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bailout harus sudah di-approve Director sebelum dicairkan",
        });
      }

      const updated = await ctx.db.bailout.update({
        where: { id: input.id },
        data: {
          status: BailoutStatus.DISBURSED,
          disbursedAt: new Date(),
          disbursementRef: input.disbursementRef,
          storageUrl: input.storageUrl,
          financeId: ctx.session.user.id,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CLOSE,
          entityType: "Bailout",
          entityId: input.id,
          metadata: { disbursementRef: input.disbursementRef },
        },
      });

      return updated;
    }),

  // ─── GET PENDING FOR APPROVAL ─────────────────────────────────────────────
  getPendingApprovals: permissionProcedure("bailout", "read")
    .input(z.object({}))
    .output(z.any())
    .query(async ({ ctx }) => {
      const canApprove =
        (ctx.session.user.isRoot ?? false) ||
        hasPermissionMap(ctx.session.user.permissions, "bailout", "approve");
      const canDisburse =
        (ctx.session.user.isRoot ?? false) ||
        hasPermissionMap(ctx.session.user.permissions, "bailout", "disburse");

      const statusFilters: BailoutStatus[] = [
        ...(canApprove
          ? [BailoutStatus.SUBMITTED, BailoutStatus.APPROVED_CHIEF]
          : []),
        ...(canDisburse ? [BailoutStatus.APPROVED_DIRECTOR] : []),
      ];

      if (statusFilters.length === 0) {
        return { bailouts: [] };
      }

      const bailouts = await ctx.db.bailout.findMany({
        where: applyScope(ctx, {
          status: { in: statusFilters },
          deletedAt: null,
        }),
        include: {
          requester: {
            select: { id: true, name: true, email: true, employeeId: true },
          },
          travelRequest: {
            select: {
              id: true,
              requestNumber: true,
              destination: true,
              status: true,
            },
          },
        },
        orderBy: { submittedAt: "asc" },
      });

      return { bailouts };
    }),

  // ─── GET PRESIGNED UPLOAD URL ─────────────────────────────────────────────
  getUploadUrl: permissionProcedure("bailout", "disburse")
    .input(
      z.object({
        bailoutId: z.string().min(1),
        filename: z.string().min(1),
        contentType: z.string().min(1),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const bailout = await ctx.db.bailout.findFirst({
        where: applyScope(ctx, { id: input.bailoutId }),
        select: { requesterId: true },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      const { getPresignedUploadUrl, buildStorageKey, getPublicUrl } =
        await import("@/lib/storage/r2");

      const key = buildStorageKey("bailouts", input.bailoutId, input.filename);
      const uploadUrl = await getPresignedUploadUrl(
        key,
        input.contentType,
        900,
      );

      return { uploadUrl, key, publicUrl: getPublicUrl(key) };
    }),

  // ─── ATTACH FILE (simpan URL setelah upload berhasil) ────────────────────
  attachFile: permissionProcedure("bailout", "disburse")
    .input(
      z.object({
        id: z.string(),
        // Accepts either a storage key (Option B) or full URL (Option A)
        storageUrl: z.string().min(1),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const bailout = await ctx.db.bailout.findFirst({
        where: applyScope(ctx, { id: input.id }),
        select: { requesterId: true },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      return ctx.db.bailout.update({
        where: { id: input.id },
        data: { storageUrl: input.storageUrl },
      });
    }),

  // ─── GET PRESIGNED DOWNLOAD URL ──────────────────────────────────────────
  getFileUrl: permissionProcedure("bailout", "read")
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const bailout = await ctx.db.bailout.findFirst({
        where: applyScope(ctx, { id: input.id }),
        select: { requesterId: true, storageUrl: true },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      if (!bailout.storageUrl) {
        return { url: null };
      }

      const { getPresignedDownloadUrl } = await import("@/lib/storage/r2");
      // 30-minute presigned GET URL
      const url = await getPresignedDownloadUrl(bailout.storageUrl, 1800);
      return { url };
    }),
});

