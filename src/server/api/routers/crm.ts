import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  AuditAction,
  CrmActivityType,
  CrmCustomerSegment,
  CrmCustomerStatus,
  CrmLeadPriority,
  CrmLeadSource,
  CrmLeadStage,
  CrmProductType,
  JournalStatus,
  type Prisma,
  type Role,
} from "../../../../generated/prisma";
import { CRM_ROLES, normalizeRoles } from "@/lib/constants/roles";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

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

function requireCrmAccess(ctx: {
  session: { user: { role?: string | null; roles?: string[] | null } };
  isRoot?: boolean;
}) {
  if (ctx.isRoot) return;

  const roles = normalizeRoles({
    roles: ctx.session.user.roles,
    role: ctx.session.user.role,
    includeDefault: false,
  }) as Role[];

  if (!CRM_ROLES.some((role) => roles.includes(role))) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Insufficient permissions for CRM",
    });
  }
}

const leadStageSchema = z.nativeEnum(CrmLeadStage);
const leadPrioritySchema = z.nativeEnum(CrmLeadPriority);
const leadSourceSchema = z.nativeEnum(CrmLeadSource);
const customerSegmentSchema = z.nativeEnum(CrmCustomerSegment);
const customerStatusSchema = z.nativeEnum(CrmCustomerStatus);
const activityTypeSchema = z.nativeEnum(CrmActivityType);
const crmProductTypeSchema = z.nativeEnum(CrmProductType);

const customerInputSchema = z.object({
  name: z.string().min(2).max(150),
  company: z.string().min(2).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  segment: customerSegmentSchema,
  city: z.string().max(100).optional(),
  ownerName: z.string().min(2).max(150),
  status: customerStatusSchema.default(CrmCustomerStatus.ACTIVE),
  totalValue: z.number().min(0).default(0),
  notes: z.string().optional(),
});

const leadInputSchema = z.object({
  customerId: z.string().optional(),
  name: z.string().min(2).max(150),
  company: z.string().min(2).max(200),
  email: z.string().email().max(200),
  phone: z.string().max(30).optional(),
  stage: leadStageSchema.default(CrmLeadStage.NEW),
  value: z.number().min(0).default(0),
  probability: z.number().int().min(0).max(100).default(0),
  source: leadSourceSchema.default(CrmLeadSource.REFERRAL),
  priority: leadPrioritySchema.default(CrmLeadPriority.MEDIUM),
  ownerName: z.string().min(2).max(150),
  expectedCloseDate: z.string().optional(),
  notes: z.string().optional(),
});

const activityInputSchema = z.object({
  customerId: z.string().optional(),
  leadId: z.string().optional(),
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  type: activityTypeSchema.default(CrmActivityType.FOLLOW_UP),
  ownerName: z.string().min(2).max(150),
  scheduledAt: z.string(),
});

const crmProductInputSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(2).max(200),
  description: z.string().optional(),
  type: crmProductTypeSchema.default(CrmProductType.PRODUCT),
  inventoryItemId: z.string().optional(),
  isActive: z.boolean().default(true),
});

const leadLineInputSchema = z.object({
  leadId: z.string(),
  crmProductId: z.string().optional(),
  inventoryItemId: z.string().optional(),
  warehousePreferenceId: z.string().optional(),
  description: z.string().optional(),
  qty: z.number().positive(),
  unitPrice: z.number().min(0).default(0),
  totalPrice: z.number().min(0).default(0),
  requiresInventory: z.boolean().default(false),
});

async function getCustomerOrThrow(ctx: Parameters<typeof requireCrmAccess>[0] & { db: Prisma.TransactionClient | Prisma.DefaultPrismaClient }, id: string) {
  const customer = await ctx.db.crmCustomer.findFirst({
    where: withTenantWhere(ctx, {
      id,
      deletedAt: null,
    }),
  });

  if (!customer) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Customer CRM tidak ditemukan" });
  }

  return customer;
}

async function getLeadOrThrow(ctx: Parameters<typeof requireCrmAccess>[0] & { db: Prisma.TransactionClient | Prisma.DefaultPrismaClient }, id: string) {
  const lead = await ctx.db.crmLead.findFirst({
    where: withTenantWhere(ctx, {
      id,
      deletedAt: null,
    }),
    include: {
      customer: { select: { id: true, company: true } },
    },
  });

  if (!lead) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Lead CRM tidak ditemukan" });
  }

  return lead;
}

async function getActivityOrThrow(ctx: Parameters<typeof requireCrmAccess>[0] & { db: Prisma.TransactionClient | Prisma.DefaultPrismaClient }, id: string) {
  const activity = await ctx.db.crmActivity.findFirst({
    where: withTenantWhere(ctx, {
      id,
      deletedAt: null,
    }),
    include: {
      customer: { select: { id: true, company: true } },
      lead: { select: { id: true, company: true } },
    },
  });

  if (!activity) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Aktivitas CRM tidak ditemukan" });
  }

  return activity;
}

async function validateCustomerRelation(
  ctx: Parameters<typeof requireCrmAccess>[0] & { db: Prisma.TransactionClient | Prisma.DefaultPrismaClient },
  customerId?: string,
) {
  if (!customerId) return null;
  return await getCustomerOrThrow(ctx, customerId);
}

async function validateLeadRelation(
  ctx: Parameters<typeof requireCrmAccess>[0] & { db: Prisma.TransactionClient | Prisma.DefaultPrismaClient },
  leadId?: string,
) {
  if (!leadId) return null;
  return await getLeadOrThrow(ctx, leadId);
}

export const crmRouter = createTRPCRouter({
  dashboard: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        stage: leadStageSchema.optional(),
        owner: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx);

      const search = input.search?.trim();
      const owner = input.owner?.trim();

      const customerWhere: Prisma.CrmCustomerWhereInput = withTenantWhere(ctx, {
        deletedAt: null,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { company: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { city: { contains: search, mode: "insensitive" } },
                { ownerName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(owner ? { ownerName: owner } : {}),
      });

      const leadWhere: Prisma.CrmLeadWhereInput = withTenantWhere(ctx, {
        deletedAt: null,
        ...(input.stage ? { stage: input.stage } : {}),
        ...(owner ? { ownerName: owner } : {}),
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: "insensitive" } },
                { company: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { ownerName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      });

      const activityWhere: Prisma.CrmActivityWhereInput = withTenantWhere(ctx, {
        deletedAt: null,
      });

      const [customers, leads, activities] = await Promise.all([
        ctx.db.crmCustomer.findMany({
          where: customerWhere,
          orderBy: [{ status: "asc" }, { company: "asc" }],
        }),
        ctx.db.crmLead.findMany({
          where: leadWhere,
          orderBy: [{ createdAt: "desc" }],
          include: {
            customer: {
              select: {
                id: true,
                company: true,
              },
            },
          },
        }),
        ctx.db.crmActivity.findMany({
          where: activityWhere,
          orderBy: [{ completedAt: "asc" }, { scheduledAt: "asc" }],
          take: 20,
          include: {
            customer: { select: { id: true, company: true } },
            lead: { select: { id: true, company: true } },
          },
        }),
      ]);

      const owners = Array.from(
        new Set([
          ...customers.map((customer) => customer.ownerName),
          ...leads.map((lead) => lead.ownerName),
          ...activities.map((activity) => activity.ownerName),
        ]),
      ).sort();

      return {
        customers,
        leads,
        activities,
        owners,
      };
    }),

  getCustomerById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx);

      const customer = await ctx.db.crmCustomer.findFirst({
        where: withTenantWhere(ctx, {
          id: input.id,
          deletedAt: null,
        }),
        include: {
          leads: {
            where: { deletedAt: null },
            orderBy: [{ createdAt: "desc" }],
            include: {
              customer: { select: { id: true, company: true } },
            },
          },
          activities: {
            where: { deletedAt: null },
            orderBy: [{ completedAt: "asc" }, { scheduledAt: "asc" }],
            include: {
              lead: { select: { id: true, company: true } },
            },
          },
        },
      });

      if (!customer) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Customer CRM tidak ditemukan",
        });
      }

      return customer;
    }),

  getLeadById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx);

      const lead = await ctx.db.crmLead.findFirst({
        where: withTenantWhere(ctx, {
          id: input.id,
          deletedAt: null,
        }),
        include: {
          customer: { select: { id: true, company: true } },
          activities: {
            where: { deletedAt: null },
            orderBy: [{ completedAt: "asc" }, { scheduledAt: "asc" }],
            include: {
              customer: { select: { id: true, company: true } },
            },
          },
          lines: {
            orderBy: [{ createdAt: "asc" }],
            include: {
              crmProduct: {
                select: { id: true, code: true, name: true, type: true },
              },
              inventoryItem: {
                select: {
                  id: true,
                  sku: true,
                  name: true,
                  unitOfMeasure: true,
                  balances: {
                    select: { qtyOnHand: true, qtyReserved: true },
                  },
                },
              },
              warehousePreference: {
                select: { id: true, code: true, name: true },
              },
            },
          },
          fulfillmentRequests: {
            orderBy: [{ createdAt: "desc" }],
            include: {
              lines: {
                include: {
                  inventoryItem: {
                    select: { id: true, sku: true, name: true, unitOfMeasure: true },
                  },
                  warehouse: {
                    select: { id: true, code: true, name: true },
                  },
                },
              },
            },
          },
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Lead CRM tidak ditemukan",
        });
      }

      const requestIds = (lead.fulfillmentRequests ?? []).map((request) => request.id);
      const requestNumbers = (lead.fulfillmentRequests ?? []).map((request) => request.requestNumber);

      const cogsJournals = requestIds.length
        ? await ctx.db.journalEntry.findMany({
            where: withTenantWhere(ctx, {
              sourceId: { in: requestIds },
              referenceNumber: { in: requestNumbers },
              status: JournalStatus.POSTED,
            }),
            select: {
              id: true,
              sourceId: true,
              journalNumber: true,
              transactionDate: true,
              description: true,
              lines: {
                orderBy: { lineNumber: "asc" },
                select: {
                  id: true,
                  description: true,
                  debitAmount: true,
                  creditAmount: true,
                  lineNumber: true,
                  chartOfAccount: {
                    select: { id: true, code: true, name: true },
                  },
                },
              },
            },
            orderBy: [{ createdAt: "desc" }],
          })
        : [];

      const cogsJournalMap = new Map<string, (typeof cogsJournals)[number]>();
      for (const journal of cogsJournals) {
        if (journal.sourceId && !cogsJournalMap.has(journal.sourceId)) {
          cogsJournalMap.set(journal.sourceId, journal);
        }
      }

      return {
        ...lead,
        fulfillmentRequests: (lead.fulfillmentRequests ?? []).map((request) => ({
          ...request,
          cogsJournal: cogsJournalMap.get(request.id) ?? null,
        })),
      };
    }),

  listProducts: protectedProcedure
    .input(
      z.object({
        search: z.string().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx);

      const products = await ctx.db.crmProduct.findMany({
        where: withTenantWhere(ctx, {
          deletedAt: null,
          ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
          ...(input.search
            ? {
                OR: [
                  { code: { contains: input.search, mode: "insensitive" as const } },
                  { name: { contains: input.search, mode: "insensitive" as const } },
                ],
              }
            : {}),
        }),
        include: {
          inventoryItem: {
            select: { id: true, sku: true, name: true, unitOfMeasure: true },
          },
        },
        orderBy: [{ name: "asc" }],
      });

      return { products };
    }),

  createProduct: protectedProcedure
    .input(crmProductInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);

      const existing = await ctx.db.crmProduct.findFirst({
        where: withTenantWhere(ctx, { code: input.code }),
      });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Produk CRM dengan kode \"${input.code}\" sudah ada`,
        });
      }

      const product = await ctx.db.crmProduct.create({
        data: {
          tenantId: getTenantScope(ctx).tenantId,
          code: input.code,
          name: input.name,
          description: input.description ?? null,
          type: input.type,
          inventoryItemId: input.inventoryItemId ?? null,
          isActive: input.isActive,
        },
        include: {
          inventoryItem: {
            select: { id: true, sku: true, name: true, unitOfMeasure: true },
          },
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: product.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "CrmProduct",
          entityId: product.id,
          changes: { after: product },
        },
      });

      return product;
    }),

  createLeadLine: protectedProcedure
    .input(leadLineInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);
      const lead = await getLeadOrThrow(ctx, input.leadId);

      if (input.crmProductId) {
        const product = await ctx.db.crmProduct.findFirst({
          where: withTenantWhere(ctx, { id: input.crmProductId, deletedAt: null }),
        });
        if (!product) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Produk CRM tidak ditemukan" });
        }
      }

      if (input.inventoryItemId) {
        const item = await ctx.db.inventoryItem.findFirst({
          where: withTenantWhere(ctx, { id: input.inventoryItemId, deletedAt: null }),
        });
        if (!item) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Item inventory tidak ditemukan" });
        }
      }

      const line = await ctx.db.crmLeadLine.create({
        data: {
          tenantId: getTenantScope(ctx).tenantId,
          leadId: lead.id,
          crmProductId: input.crmProductId ?? null,
          inventoryItemId: input.inventoryItemId ?? null,
          warehousePreferenceId: input.warehousePreferenceId ?? null,
          description: input.description ?? null,
          qty: input.qty,
          unitPrice: input.unitPrice,
          totalPrice: input.totalPrice || input.qty * input.unitPrice,
          requiresInventory: input.requiresInventory,
        },
        include: {
          crmProduct: {
            select: { id: true, code: true, name: true, type: true },
          },
          inventoryItem: {
            select: {
              id: true,
              sku: true,
              name: true,
              unitOfMeasure: true,
              balances: {
                select: { qtyOnHand: true, qtyReserved: true },
              },
            },
          },
          warehousePreference: {
            select: { id: true, code: true, name: true },
          },
        },
      });

      const leadLines = await ctx.db.crmLeadLine.findMany({
        where: { leadId: lead.id },
        select: { totalPrice: true, requiresInventory: true },
      });

      const nextValue = leadLines.reduce(
        (sum, row) => sum + Number(row.totalPrice ?? 0),
        0,
      );
      const requiresInventory = leadLines.some((row) => row.requiresInventory);

      await ctx.db.crmLead.update({
        where: { id: lead.id },
        data: {
          value: nextValue,
          requiresInventory,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: line.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "CrmLeadLine",
          entityId: line.id,
          changes: { after: line },
        },
      });

      return line;
    }),

  getDealById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx);

      const lead = await ctx.db.crmLead.findFirst({
        where: withTenantWhere(ctx, {
          id: input.id,
          deletedAt: null,
        }),
        include: {
          customer: { select: { id: true, company: true } },
          activities: {
            where: { deletedAt: null },
            orderBy: [{ completedAt: "asc" }, { scheduledAt: "asc" }],
            include: {
              customer: { select: { id: true, company: true } },
            },
          },
        },
      });

      if (!lead) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deal CRM tidak ditemukan",
        });
      }

      return {
        ...lead,
        dealTitle: lead.company,
        dealStage: lead.stage,
        dealValue: lead.value,
      };
    }),

  createCustomer: protectedProcedure
    .input(customerInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);

      const customer = await ctx.db.crmCustomer.create({
        data: {
          tenantId: getTenantScope(ctx).tenantId,
          ...input,
          phone: input.phone ?? null,
          city: input.city ?? null,
          notes: input.notes ?? null,
          lastContactAt: new Date(),
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: customer.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "CrmCustomer",
          entityId: customer.id,
          changes: { after: customer },
        },
      });

      return customer;
    }),

  updateCustomer: protectedProcedure
    .input(customerInputSchema.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);

      const existing = await getCustomerOrThrow(ctx, input.id);
      const { id, ...data } = input;

      const updated = await ctx.db.crmCustomer.update({
        where: { id },
        data: {
          ...data,
          phone: data.phone ?? null,
          city: data.city ?? null,
          notes: data.notes ?? null,
          totalValue: data.totalValue,
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: updated.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "CrmCustomer",
          entityId: updated.id,
          changes: { before: existing, after: updated },
        },
      });

      return updated;
    }),

  deleteCustomer: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);

      const existing = await getCustomerOrThrow(ctx, input.id);
      const deleted = await ctx.db.crmCustomer.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: deleted.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.DELETE,
          entityType: "CrmCustomer",
          entityId: deleted.id,
          changes: { before: existing, after: deleted },
        },
      });

      return { success: true };
    }),

  createLead: protectedProcedure
    .input(leadInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);
      await validateCustomerRelation(ctx, input.customerId);

      const lead = await ctx.db.crmLead.create({
        data: {
          tenantId: getTenantScope(ctx).tenantId,
          customerId: input.customerId ?? null,
          name: input.name,
          company: input.company,
          email: input.email,
          phone: input.phone ?? null,
          stage: input.stage,
          value: input.value,
          probability: input.probability,
          source: input.source,
          priority: input.priority,
          ownerName: input.ownerName,
          expectedCloseDate: input.expectedCloseDate
            ? new Date(input.expectedCloseDate)
            : null,
          notes: input.notes ?? null,
          lastActivityAt: new Date(),
        },
        include: {
          customer: { select: { id: true, company: true } },
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: lead.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "CrmLead",
          entityId: lead.id,
          changes: { after: lead },
        },
      });

      return lead;
    }),

  updateLead: protectedProcedure
    .input(leadInputSchema.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);
      const existing = await getLeadOrThrow(ctx, input.id);
      await validateCustomerRelation(ctx, input.customerId);
      const { id, ...data } = input;

      const updated = await ctx.db.crmLead.update({
        where: { id },
        data: {
          customerId: data.customerId ?? null,
          name: data.name,
          company: data.company,
          email: data.email,
          phone: data.phone ?? null,
          stage: data.stage,
          value: data.value,
          probability: data.probability,
          source: data.source,
          priority: data.priority,
          ownerName: data.ownerName,
          expectedCloseDate: data.expectedCloseDate
            ? new Date(data.expectedCloseDate)
            : null,
          notes: data.notes ?? null,
        },
        include: {
          customer: { select: { id: true, company: true } },
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: updated.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "CrmLead",
          entityId: updated.id,
          changes: { before: existing, after: updated },
        },
      });

      return updated;
    }),

  updateLeadStage: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        stage: leadStageSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);
      const existing = await getLeadOrThrow(ctx, input.id);

      const updated = await ctx.db.crmLead.update({
        where: { id: input.id },
        data: {
          stage: input.stage,
          lastActivityAt: new Date(),
        },
        include: {
          customer: { select: { id: true, company: true } },
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: updated.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "CrmLeadStage",
          entityId: updated.id,
          changes: {
            before: { stage: existing.stage },
            after: { stage: updated.stage },
          },
        },
      });

      return updated;
    }),

  deleteLead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);
      const existing = await getLeadOrThrow(ctx, input.id);

      const deleted = await ctx.db.crmLead.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: deleted.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.DELETE,
          entityType: "CrmLead",
          entityId: deleted.id,
          changes: { before: existing, after: deleted },
        },
      });

      return { success: true };
    }),

  convertLeadToCustomer: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);

      return await ctx.db.$transaction(async (tx) => {
        const lead = await tx.crmLead.findFirst({
          where: withTenantWhere(ctx, {
            id: input.id,
            deletedAt: null,
          }),
        });

        if (!lead) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Lead CRM tidak ditemukan" });
        }

        const existingCustomer = lead.customerId
          ? await tx.crmCustomer.findFirst({
              where: withTenantWhere(ctx, {
                id: lead.customerId,
                deletedAt: null,
              }),
            })
          : null;

        const customer =
          existingCustomer ??
          (await tx.crmCustomer.create({
            data: {
              tenantId: lead.tenantId,
              name: lead.name,
              company: lead.company,
              email: lead.email,
              phone: lead.phone,
              segment: CrmCustomerSegment.SMB,
              city: null,
              ownerName: lead.ownerName,
              status: CrmCustomerStatus.ACTIVE,
              totalValue: lead.value,
              notes: lead.notes,
              lastContactAt: new Date(),
            },
          }));

        const updatedLead = await tx.crmLead.update({
          where: { id: lead.id },
          data: {
            customerId: customer.id,
            stage: CrmLeadStage.WON,
            lastActivityAt: new Date(),
          },
          include: {
            customer: { select: { id: true, company: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId: lead.tenantId,
            userId: ctx.session.user.id,
            action: AuditAction.UPDATE,
            entityType: "CrmLeadConversion",
            entityId: lead.id,
            changes: {
              before: { customerId: lead.customerId, stage: lead.stage },
              after: { customerId: customer.id, stage: CrmLeadStage.WON },
            },
          },
        });

        return { customer, lead: updatedLead };
      });
    }),

  createActivity: protectedProcedure
    .input(activityInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);

      if (!input.customerId && !input.leadId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pilih lead atau customer untuk aktivitas CRM",
        });
      }

      await validateCustomerRelation(ctx, input.customerId);
      await validateLeadRelation(ctx, input.leadId);

      const activity = await ctx.db.crmActivity.create({
        data: {
          tenantId: getTenantScope(ctx).tenantId,
          customerId: input.customerId ?? null,
          leadId: input.leadId ?? null,
          title: input.title,
          description: input.description ?? null,
          type: input.type,
          ownerName: input.ownerName,
          scheduledAt: new Date(input.scheduledAt),
        },
        include: {
          customer: { select: { id: true, company: true } },
          lead: { select: { id: true, company: true } },
        },
      });

      if (input.leadId) {
        await ctx.db.crmLead.update({
          where: { id: input.leadId },
          data: { lastActivityAt: new Date() },
        });
      }

      await ctx.db.auditLog.create({
        data: {
          tenantId: activity.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.CREATE,
          entityType: "CrmActivity",
          entityId: activity.id,
          changes: { after: activity },
        },
      });

      return activity;
    }),

  updateActivity: protectedProcedure
    .input(activityInputSchema.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);
      const existing = await getActivityOrThrow(ctx, input.id);

      if (!input.customerId && !input.leadId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pilih lead atau customer untuk aktivitas CRM",
        });
      }

      await validateCustomerRelation(ctx, input.customerId);
      await validateLeadRelation(ctx, input.leadId);

      const updated = await ctx.db.crmActivity.update({
        where: { id: input.id },
        data: {
          customerId: input.customerId ?? null,
          leadId: input.leadId ?? null,
          title: input.title,
          description: input.description ?? null,
          type: input.type,
          ownerName: input.ownerName,
          scheduledAt: new Date(input.scheduledAt),
        },
        include: {
          customer: { select: { id: true, company: true } },
          lead: { select: { id: true, company: true } },
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: updated.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "CrmActivity",
          entityId: updated.id,
          changes: { before: existing, after: updated },
        },
      });

      return updated;
    }),

  completeActivity: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        completed: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);
      const existing = await getActivityOrThrow(ctx, input.id);

      const updated = await ctx.db.crmActivity.update({
        where: { id: input.id },
        data: { completedAt: input.completed ? new Date() : null },
        include: {
          customer: { select: { id: true, company: true } },
          lead: { select: { id: true, company: true } },
        },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: updated.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.UPDATE,
          entityType: "CrmActivityCompletion",
          entityId: updated.id,
          changes: {
            before: { completedAt: existing.completedAt },
            after: { completedAt: updated.completedAt },
          },
        },
      });

      return updated;
    }),

  deleteActivity: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx);
      const existing = await getActivityOrThrow(ctx, input.id);

      const deleted = await ctx.db.crmActivity.update({
        where: { id: input.id },
        data: { deletedAt: new Date() },
      });

      await ctx.db.auditLog.create({
        data: {
          tenantId: deleted.tenantId,
          userId: ctx.session.user.id,
          action: AuditAction.DELETE,
          entityType: "CrmActivity",
          entityId: deleted.id,
          changes: { before: existing, after: deleted },
        },
      });

      return { success: true };
    }),
});
