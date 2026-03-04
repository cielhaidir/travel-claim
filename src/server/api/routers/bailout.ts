import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  BailoutStatus,
  BailoutCategory,
  TransportMode,
  AuditAction,
  Role,
  ApprovalStatus,
} from "../../../../generated/prisma";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { sendWhatsappPoll, sendWhatsappMessage } from "@/lib/utils/whatsapp";
import { userHasAnyRole, userHasRole } from "@/lib/auth/role-check";

const SALES_CHIEF_ROLES: string[] = [
  Role.SALES_CHIEF,
  Role.MANAGER,
  Role.DIRECTOR,
  Role.ADMIN,
];
const DIRECTOR_ROLES: string[] = [Role.DIRECTOR, Role.ADMIN];

export const bailoutRouter = createTRPCRouter({
  // ─── GET ALL (by travelRequestId or global) ───────────────────────────────
  getAll: protectedProcedure
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
      const where: Record<string, unknown> = { deletedAt: null };

      // Non-privileged users only see their own bailouts
      const privilegedRoles: string[] = [...SALES_CHIEF_ROLES, Role.FINANCE];
      if (!userHasAnyRole(ctx.session.user, privilegedRoles)) {
        where.requesterId = ctx.session.user.id;
      }

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

  // ─── GET BY ID ────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const bailout = await ctx.db.bailout.findUnique({
        where: { id: input.id },
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

      const canView =
        bailout.requesterId === ctx.session.user.id ||
        userHasAnyRole(ctx.session.user, SALES_CHIEF_ROLES) ||
        userHasRole(ctx.session.user, Role.FINANCE);

      if (!canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Anda tidak berhak melihat bailout ini",
        });
      }

      return bailout;
    }),

  // ─── CREATE ───────────────────────────────────────────────────────────────
  create: protectedProcedure
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
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Check if travel request exists
      const travelRequest = await ctx.db.travelRequest.findUnique({
        where: { id: input.travelRequestId },
      });

      if (!travelRequest) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Travel Request tidak ditemukan",
        });
      }

      // Only requester or privileged roles can create bailout
      const allowedRoles: Role[] = [
        Role.SALES_EMPLOYEE,
        Role.SALES_CHIEF,
        Role.EMPLOYEE,
      ];
      const isRequester = travelRequest.requesterId === ctx.session.user.id;
      if (!isRequester && !userHasAnyRole(ctx.session.user, allowedRoles)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Hanya pembuat trip yang bisa mengajukan bailout",
        });
      }

      // Generate bailout number
      const year = new Date().getFullYear();
      const count = await ctx.db.bailout.count({
        where: { bailoutNumber: { startsWith: `BLT-${year}` } },
      });
      const bailoutNumber = `BLT-${year}-${String(count + 1).padStart(5, "0")}`;

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
  submit: protectedProcedure
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const bailout = await ctx.db.bailout.findUnique({
        where: { id: input.id },
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
  approveByChief: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        notes: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, SALES_CHIEF_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Hanya Sales Chief / Manager yang bisa approve di level ini",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({
        where: { id: input.id },
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
  approveByDirector: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        notes: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, DIRECTOR_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Hanya Director yang bisa approve di level ini",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({
        where: { id: input.id },
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
        const fullBailout = await ctx.db.bailout.findUnique({
          where: { id: input.id },
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
        const bailoutWithRequester = await ctx.db.bailout.findUnique({
          where: { id: input.id },
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
  reject: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        rejectionReason: z.string().min(5),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, SALES_CHIEF_ROLES)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Hanya Sales Chief / Director yang bisa reject bailout",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({
        where: { id: input.id },
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
        const fullBailout = await ctx.db.bailout.findUnique({
          where: { id: input.id },
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
  disburse: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        disbursementRef: z.string().optional(),
        storageUrl: z.string().url().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!userHasAnyRole(ctx.session.user, [Role.FINANCE, Role.ADMIN])) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Hanya Finance yang bisa mencairkan bailout",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({
        where: { id: input.id },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      if (bailout.status !== BailoutStatus.APPROVED_DIRECTOR) {
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
  getPendingApprovals: protectedProcedure
    .input(z.object({}))
    .output(z.any())
    .query(async ({ ctx }) => {
      const role = ctx.session.user.role;
      let statusFilter: BailoutStatus;
      if (DIRECTOR_ROLES.includes(role)) {
        statusFilter = BailoutStatus.APPROVED_CHIEF;
      } else if (SALES_CHIEF_ROLES.includes(role)) {
        statusFilter = BailoutStatus.SUBMITTED;
      } else {
        return { bailouts: [] };
      }

      const bailouts = await ctx.db.bailout.findMany({
        where: { status: statusFilter, deletedAt: null },
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
});
