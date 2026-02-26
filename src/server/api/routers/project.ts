import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { AuditAction } from "../../../../generated/prisma";
import {
  createTRPCRouter,
  protectedProcedure,
  managerProcedure,
} from "@/server/api/trpc";

export const projectRouter = createTRPCRouter({
  // ─── GET ALL ──────────────────────────────────────────────────────────────
  getAll: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/projects",
        protect: true,
        tags: ["Projects"],
        summary: "Get all projects",
      },
    })
    .input(
      z.object({
        isActive: z.boolean().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      })
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Record<string, unknown> = { deletedAt: null };

      if (input?.isActive !== undefined) {
        where.isActive = input.isActive;
      }

      if (input?.search) {
        where.OR = [
          { name: { contains: input.search, mode: "insensitive" } },
          { code: { contains: input.search, mode: "insensitive" } },
          { clientName: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const limit = input?.limit ?? 50;
      const projects = await ctx.db.project.findMany({
        take: limit + 1,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where,
        orderBy: { createdAt: "desc" },
      });

      let nextCursor: string | undefined = undefined;
      if (projects.length > limit) {
        const nextItem = projects.pop();
        nextCursor = nextItem!.id;
      }

      return { projects, nextCursor };
    }),

  // ─── GET BY ID ────────────────────────────────────────────────────────────
  getById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/projects/{id}",
        protect: true,
        tags: ["Projects"],
        summary: "Get project by ID",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const project = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: {
          _count: { select: { travelRequests: true } },
        },
      });

      if (!project) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project tidak ditemukan",
        });
      }

      return project;
    }),

  // ─── CREATE ───────────────────────────────────────────────────────────────
  create: managerProcedure
    .meta({
      openapi: {
        method: "POST",
        path: "/projects",
        protect: true,
        tags: ["Projects"],
        summary: "Create new project",
      },
    })
    .input(
      z.object({
        code: z.string().min(2).max(30),
        name: z.string().min(3).max(200),
        description: z.string().optional(),
        clientName: z.string().max(200).optional(),
        isActive: z.boolean().optional().default(true),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Check unique code
      const existing = await ctx.db.project.findUnique({
        where: { code: input.code },
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Kode project sudah digunakan",
        });
      }

      const project = await ctx.db.project.create({ data: input });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "Project",
          entityId: project.id,
          changes: { after: project },
        },
      });

      return project;
    }),

  // ─── UPDATE ───────────────────────────────────────────────────────────────
  update: managerProcedure
    .meta({
      openapi: {
        method: "PUT",
        path: "/projects/{id}",
        protect: true,
        tags: ["Projects"],
        summary: "Update project",
      },
    })
    .input(
      z.object({
        id: z.string(),
        code: z.string().min(2).max(30).optional(),
        name: z.string().min(3).max(200).optional(),
        description: z.string().optional(),
        clientName: z.string().max(200).optional(),
        isActive: z.boolean().optional(),
      })
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await ctx.db.project.findUnique({ where: { id } });
      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project tidak ditemukan",
        });
      }

      // Check code uniqueness if changed
      if (data.code && data.code !== existing.code) {
        const codeConflict = await ctx.db.project.findUnique({
          where: { code: data.code },
        });
        if (codeConflict) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Kode project sudah digunakan",
          });
        }
      }

      const updated = await ctx.db.project.update({ where: { id }, data });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "Project",
          entityId: id,
          changes: { before: existing, after: updated },
        },
      });

      return updated;
    }),

  // ─── DELETE (soft) ────────────────────────────────────────────────────────
  delete: managerProcedure
    .meta({
      openapi: {
        method: "DELETE",
        path: "/projects/{id}",
        protect: true,
        tags: ["Projects"],
        summary: "Delete project (soft)",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.project.findUnique({
        where: { id: input.id },
        include: { _count: { select: { travelRequests: true } } },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project tidak ditemukan",
        });
      }

      if (existing._count.travelRequests > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Tidak dapat menghapus project yang sudah digunakan di Travel Request",
        });
      }

      const deleted = await ctx.db.project.update({
        where: { id: input.id },
        data: { deletedAt: new Date(), isActive: false },
      });

      await ctx.db.auditLog.create({
        data: {
          userId: ctx.session.user.id,
          action: AuditAction.DELETE,
          entityType: "Project",
          entityId: input.id,
        },
      });

      return deleted;
    }),
});

