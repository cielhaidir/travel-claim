import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  BailoutStatus,
  BailoutCategory,
  TransportMode,
  AuditAction,
  Role,
} from "../../../../generated/prisma";
import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";

const SALES_CHIEF_ROLES: string[] = [Role.SALES_CHIEF, Role.MANAGER, Role.DIRECTOR, Role.ADMIN];
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
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { deletedAt: null };

      // Non-privileged users only see their own bailouts
      const privilegedRoles: string[] = [...SALES_CHIEF_ROLES, Role.FINANCE];
      if (!privilegedRoles.includes(ctx.session.user.role)) {
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
          chiefApprover: {
            select: { id: true, name: true, role: true },
          },
          directorApprover: {
            select: { id: true, name: true, role: true },
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
          chiefApprover: {
            select: { id: true, name: true, role: true },
          },
          directorApprover: {
            select: { id: true, name: true, role: true },
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
        SALES_CHIEF_ROLES.includes(ctx.session.user.role as Role) ||
        ctx.session.user.role === Role.FINANCE;

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
      const allowedRoles: Role[] = [Role.SALES_EMPLOYEE, Role.SALES_CHIEF, Role.EMPLOYEE];
      const isRequester = travelRequest.requesterId === ctx.session.user.id;
      if (!isRequester && !allowedRoles.includes(ctx.session.user.role as Role)) {
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

      const { travelRequestId, category, description, amount, transportMode, ...rest } = input;

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
          travelRequest: { select: { id: true, requestNumber: true, destination: true } },
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
        throw new TRPCError({ code: "NOT_FOUND", message: "Bailout tidak ditemukan" });
      }

      if (bailout.requesterId !== ctx.session.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Hanya pembuat yang bisa submit" });
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

      // TODO: Send notification to Sales Chief

      return updated;
    }),

  // ─── APPROVE BY CHIEF ─────────────────────────────────────────────────────
  approveByChief: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        notes: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!SALES_CHIEF_ROLES.includes(ctx.session.user.role as Role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Hanya Sales Chief / Manager yang bisa approve di level ini",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({ where: { id: input.id } });

      if (!bailout) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bailout tidak ditemukan" });
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
          chiefApproverId: ctx.session.user.id,
          chiefApprovedAt: new Date(),
          chiefNotes: input.notes,
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

      // TODO: Send notification to Director

      return updated;
    }),

  // ─── APPROVE BY DIRECTOR ──────────────────────────────────────────────────
  approveByDirector: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        notes: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!DIRECTOR_ROLES.includes(ctx.session.user.role as Role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Hanya Director yang bisa approve di level ini",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({ where: { id: input.id } });

      if (!bailout) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bailout tidak ditemukan" });
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
          directorApproverId: ctx.session.user.id,
          directorApprovedAt: new Date(),
          directorNotes: input.notes,
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

      // TODO: Send notification to requester & finance

      return updated;
    }),

  // ─── REJECT ───────────────────────────────────────────────────────────────
  reject: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        rejectionReason: z.string().min(5),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (!SALES_CHIEF_ROLES.includes(ctx.session.user.role as Role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Hanya Sales Chief / Director yang bisa reject bailout",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({ where: { id: input.id } });

      if (!bailout) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bailout tidak ditemukan" });
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

      // TODO: Send notification to requester

      return updated;
    }),

  // ─── MARK DISBURSED (Finance) ─────────────────────────────────────────────
  disburse: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        disbursementRef: z.string().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      if (
        !([Role.FINANCE, Role.ADMIN] as Role[]).includes(
          ctx.session.user.role as Role
        )
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Hanya Finance yang bisa mencairkan bailout",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({ where: { id: input.id } });

      if (!bailout) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Bailout tidak ditemukan" });
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
      const role = ctx.session.user.role as Role;

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
