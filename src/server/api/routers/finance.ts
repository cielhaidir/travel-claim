import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { AuditAction, BailoutStatus, Role, type Prisma } from "../../../../generated/prisma";
import {
  createTRPCRouter,
  protectedProcedure,
} from "@/server/api/trpc";

const FINANCE_ROLES: Role[] = [Role.FINANCE, Role.ADMIN];

export const financeRouter = createTRPCRouter({
  // ─── LIST BAILOUTS (by current user) ─────────────────────────────────────
  listBailout: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/finance/bailouts",
        protect: true,
        tags: ["Finance"],
        summary: "List all bailouts belonging to the current user",
      },
      mcp: {
        enabled: true,
        name: "finance_list_bailout",
        description:
          "Get all bailout records created by the currently authenticated user, ordered by most recent first. Finance and Admin roles can see all bailouts.",
      },
    })
    .input(
      z.object({
        status: z.nativeEnum(BailoutStatus).optional(),
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const isFinance = FINANCE_ROLES.includes(ctx.session.user.role as Role);

      const where: Record<string, unknown> = { deletedAt: null };

      // Non-finance users only see their own bailouts
      if (!isFinance) {
        where.requesterId = ctx.session.user.id;
      }

      if (input.status) {
        where.status = input.status;
      }

      const bailouts = await ctx.db.bailout.findMany({
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
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
        },
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined = undefined;
      if (bailouts.length > input.limit) {
        const nextItem = bailouts.pop();
        nextCursor = nextItem!.id;
      }

      return { bailouts, nextCursor };
    }),

  // ─── GET BAILOUT (Finance view) ───────────────────────────────────────────
  getBailout: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/finance/bailouts/{id}",
        protect: true,
        tags: ["Finance"],
        summary: "Get bailout detail for finance processing",
      },
      mcp: {
        enabled: true,
        name: "finance_get_bailout",
        description:
          "Retrieve full bailout detail including requester, travel request, approvals, and attached files. Intended for Finance role to review before disbursement.",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      if (!FINANCE_ROLES.includes(ctx.session.user.role as Role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can access this endpoint",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({
        where: { id: input.id, deletedAt: null },
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true,
              employeeId: true,
              phoneNumber: true,
              role: true,
              department: { select: { id: true, name: true, code: true } },
            },
          },
          travelRequest: {
            select: {
              id: true,
              requestNumber: true,
              destination: true,
              purpose: true,
              travelType: true,
              status: true,
              startDate: true,
              endDate: true,
            },
          },
          approvals: {
            orderBy: { sequence: "asc" },
            include: {
              approver: {
                select: { id: true, name: true, email: true, role: true },
              },
            },
          },
          finance: {
            select: { id: true, name: true, email: true },
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

  // ─── ATTACH FILE TO BAILOUT ───────────────────────────────────────────────
  attachFileToBailout: protectedProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/finance/bailouts/{bailoutId}/attachments",
        protect: true,
        tags: ["Finance"],
        summary: "Attach a supporting file to a bailout",
      },
      mcp: {
        enabled: true,
        name: "finance_attach_file_to_bailout",
        description:
          "Attach a receipt, transfer proof, or supporting document to a bailout record. Finance staff upload disbursement evidence here. Stores metadata; actual file binary is handled by the storage layer separately.",
      },
    })
    .input(
      z.object({
        bailoutNumber: z.string().min(1),
        storageUrl: z.string().url(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Only Finance / Admin can attach files to bailouts
      if (!FINANCE_ROLES.includes(ctx.session.user.role as Role)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Only Finance or Admin can attach files to a bailout",
        });
      }

      const bailout = await ctx.db.bailout.findUnique({
        where: { bailoutNumber: input.bailoutNumber, deletedAt: null },
      });

      if (!bailout) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Bailout tidak ditemukan",
        });
      }

      // File may be attached at any point from APPROVED_L2 onward (ready for disbursement)
      const attachableStatuses: BailoutStatus[] = [
        BailoutStatus.APPROVED_L2,
        BailoutStatus.DISBURSED,
      ];

      if (!attachableStatuses.includes(bailout.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Files can only be attached to bailouts that are fully approved (APPROVED_L2) or already disbursed (DISBURSED)",
        });
      }

      const updatedBailout = await ctx.db.bailout.update({
        where: { bailoutNumber: input.bailoutNumber },
        data: {
          storageUrl: input.storageUrl,
          financeId: ctx.session.user.id,
          updatedAt: new Date(),
        },
      });

      const attachmentMeta: Prisma.InputJsonValue = {
        storageUrl: input.storageUrl,
        attachedAt: new Date().toISOString(),
        attachedBy: ctx.session.user.id,
      };

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Bailout",
          entityId: bailout.id,
          metadata: {
            action: "attach_file",
            attachment: attachmentMeta,
          },
        },
      });

      return {
        bailout: updatedBailout,
        attachment: attachmentMeta,
      };
    }),
});
