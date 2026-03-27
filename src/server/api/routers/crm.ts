import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  AuditAction,
  CrmActivityType,
  CrmCustomerSegment,
  CrmCustomerStatus,
  CrmDealStage,
  CrmDealStatus,
  CrmEmployeeRange,
  CrmGender,
  CrmIndustry,
  CrmLeadPriority,
  CrmLeadSource,
  CrmLeadStage,
  CrmLeadStatus,
  CrmProductType,
  CrmTaskPriority,
  CrmTaskStatus,
  JournalStatus,
  MembershipStatus,
  type Prisma,
  type PrismaClient,
} from "../../../../generated/prisma";
import {
  type PermissionAction,
  type PermissionMap,
} from "@/lib/auth/permissions";
import { userHasPermission } from "@/lib/auth/role-check";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

type CrmDbClient = Prisma.TransactionClient | PrismaClient;

type CrmContext = {
  session: {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      role?: string | null;
      roles?: string[] | null;
      isRoot?: boolean | null;
      permissions?: PermissionMap | null;
      memberships?: Array<{
        role?: string | null;
        status?: string | null;
        isRootTenant?: boolean | null;
      }> | null;
    };
  };
  isRoot?: boolean;
  tenantId?: string | null;
};

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

function withTenantMembershipFilter(
  ctx: unknown,
  where: Prisma.UserWhereInput,
): Prisma.UserWhereInput {
  const { tenantId, isRoot } = getTenantScope(ctx);

  if (isRoot || !tenantId) {
    return where;
  }

  return {
    AND: [
      where,
      {
        memberships: {
          some: {
            tenantId,
            status: MembershipStatus.ACTIVE,
          },
        },
      },
    ],
  };
}

function requireCrmAccess(
  ctx: CrmContext,
  action: PermissionAction = "read",
) {
  if (ctx.isRoot || userHasPermission(ctx.session.user, "crm", action)) {
    return;
  }

  throw new TRPCError({
    code: "FORBIDDEN",
    message: "Insufficient permissions for CRM",
  });
}

function trimToNull(value?: string | null) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseOptionalDate(value?: string | null) {
  const trimmed = trimToNull(value);
  return trimmed ? new Date(trimmed) : null;
}

function buildFullName(
  firstName?: string | null,
  lastName?: string | null,
  fallback = "Unknown",
) {
  const parts = [trimToNull(firstName), trimToNull(lastName)].filter(
    (part): part is string => !!part,
  );

  return parts.length > 0 ? parts.join(" ") : fallback;
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function mapLeadStatusToLegacyStage(status: CrmLeadStatus): CrmLeadStage {
  if (status === CrmLeadStatus.QUALIFIED || status === CrmLeadStatus.CONVERTED) {
    return CrmLeadStage.QUALIFIED;
  }

  return CrmLeadStage.NEW;
}

function mapDealStatusToLegacyStage(status: CrmDealStatus): CrmDealStage {
  switch (status) {
    case CrmDealStatus.PROPOSAL_QUOTATION:
      return CrmDealStage.PROPOSAL;
    case CrmDealStatus.NEGOTIATION:
      return CrmDealStage.NEGOTIATION;
    case CrmDealStatus.READY_TO_CLOSE:
      return CrmDealStage.VERBAL_WON;
    case CrmDealStatus.WON:
      return CrmDealStage.WON;
    case CrmDealStatus.LOST:
      return CrmDealStage.LOST;
    case CrmDealStatus.QUALIFICATION:
    case CrmDealStatus.DEMO_MAKING:
    default:
      return CrmDealStage.DISCOVERY;
  }
}

function ensureSingleSubject(input: { leadId?: string | null; dealId?: string | null }) {
  const hasLead = !!trimToNull(input.leadId);
  const hasDeal = !!trimToNull(input.dealId);

  if (!hasLead && !hasDeal) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A lead or deal reference is required",
    });
  }

  if (hasLead && hasDeal) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only one CRM reference can be used at a time",
    });
  }
}

async function resolveUserDisplayName(
  db: CrmDbClient,
  ctx: CrmContext,
  userId?: string | null,
  fallback?: string | null,
) {
  const trimmedUserId = trimToNull(userId);
  if (!trimmedUserId) {
    return trimToNull(fallback) ?? ctx.session.user.name ?? ctx.session.user.email ?? "Unknown";
  }

  const user = await db.user.findFirst({
    where: withTenantMembershipFilter(ctx, {
      id: trimmedUserId,
      deletedAt: null,
    }),
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (!user) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Selected user is not available in the active tenant",
    });
  }

  return user.name ?? user.email ?? trimmedUserId;
}

async function getOrganizationOrThrow(
  db: CrmDbClient,
  ctx: CrmContext,
  id: string,
) {
  const organization = await db.crmCustomer.findFirst({
    where: withTenantWhere(ctx, {
      id,
      deletedAt: null,
    }),
  });

  if (!organization) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Organization not found",
    });
  }

  return organization;
}

async function getContactOrThrow(
  db: CrmDbClient,
  ctx: CrmContext,
  id: string,
) {
  const contact = await db.crmContact.findFirst({
    where: withTenantWhere(ctx, {
      id,
      deletedAt: null,
    }),
    include: {
      customer: true,
    },
  });

  if (!contact) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Contact not found",
    });
  }

  return contact;
}

async function getLeadOrThrow(
  db: CrmDbClient,
  ctx: CrmContext,
  id: string,
) {
  const lead = await db.crmLead.findFirst({
    where: withTenantWhere(ctx, {
      id,
      deletedAt: null,
    }),
  });

  if (!lead) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Lead not found",
    });
  }

  return lead;
}

async function getDealOrThrow(
  db: CrmDbClient,
  ctx: CrmContext,
  id: string,
) {
  const deal = await db.crmDeal.findFirst({
    where: withTenantWhere(ctx, {
      id,
      deletedAt: null,
    }),
  });

  if (!deal) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Deal not found",
    });
  }

  return deal;
}

async function getTaskOrThrow(
  db: CrmDbClient,
  ctx: CrmContext,
  id: string,
) {
  const task = await db.crmTask.findFirst({
    where: withTenantWhere(ctx, {
      id,
      deletedAt: null,
    }),
  });

  if (!task) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Task not found",
    });
  }

  return task;
}

async function getNoteOrThrow(
  db: CrmDbClient,
  ctx: CrmContext,
  id: string,
) {
  const note = await db.crmNote.findFirst({
    where: withTenantWhere(ctx, {
      id,
      deletedAt: null,
    }),
  });

  if (!note) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Note not found",
    });
  }

  return note;
}

async function getAttachmentOrThrow(
  db: CrmDbClient,
  ctx: CrmContext,
  id: string,
) {
  const attachment = await db.crmRecordAttachment.findFirst({
    where: withTenantWhere(ctx, {
      id,
      deletedAt: null,
    }),
  });

  if (!attachment) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Attachment not found",
    });
  }

  return attachment;
}

async function touchLinkedRecords(
  db: CrmDbClient,
  ids: {
    customerId?: string | null;
    leadId?: string | null;
    dealId?: string | null;
  },
  touchedAt: Date,
) {
  if (ids.customerId) {
    await db.crmCustomer.update({
      where: { id: ids.customerId },
      data: {
        lastContactAt: touchedAt,
      },
    });
  }

  if (ids.leadId) {
    await db.crmLead.update({
      where: { id: ids.leadId },
      data: {
        lastActivityAt: touchedAt,
      },
    });
  }

  if (ids.dealId) {
    await db.crmDeal.update({
      where: { id: ids.dealId },
      data: {
        lastActivityAt: touchedAt,
      },
    });
  }
}

async function createActivity(
  db: CrmDbClient,
  input: {
    tenantId: string | null;
    customerId?: string | null;
    leadId?: string | null;
    dealId?: string | null;
    ownerName: string;
    title: string;
    description?: string | null;
    type: CrmActivityType;
    happenedAt?: Date;
  },
) {
  await db.crmActivity.create({
    data: {
      tenantId: input.tenantId,
      customerId: input.customerId ?? null,
      leadId: input.leadId ?? null,
      dealId: input.dealId ?? null,
      title: input.title,
      description: trimToNull(input.description),
      type: input.type,
      ownerName: input.ownerName,
      scheduledAt: input.happenedAt ?? new Date(),
      completedAt: input.happenedAt ?? new Date(),
    },
  });
}

function buildOrganizationWhere(
  ctx: CrmContext,
  search?: string,
): Prisma.CrmCustomerWhereInput {
  const trimmed = trimToNull(search);

  return withTenantWhere(ctx, {
    deletedAt: null,
    ...(trimmed
      ? {
          OR: [
            { company: { contains: trimmed, mode: "insensitive" } },
            { website: { contains: trimmed, mode: "insensitive" } },
            { notes: { contains: trimmed, mode: "insensitive" } },
          ],
        }
      : {}),
  });
}

function buildContactWhere(
  ctx: CrmContext,
  search?: string,
): Prisma.CrmContactWhereInput {
  const trimmed = trimToNull(search);

  return withTenantWhere(ctx, {
    deletedAt: null,
    ...(trimmed
      ? {
          OR: [
            { name: { contains: trimmed, mode: "insensitive" } },
            { firstName: { contains: trimmed, mode: "insensitive" } },
            { lastName: { contains: trimmed, mode: "insensitive" } },
            { email: { contains: trimmed, mode: "insensitive" } },
            { phone: { contains: trimmed, mode: "insensitive" } },
            { designation: { contains: trimmed, mode: "insensitive" } },
            {
              customer: {
                company: { contains: trimmed, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  });
}

function buildLeadWhere(
  ctx: CrmContext,
  search?: string,
  status?: CrmLeadStatus | null,
): Prisma.CrmLeadWhereInput {
  const trimmed = trimToNull(search);

  return withTenantWhere(ctx, {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(trimmed
      ? {
          OR: [
            { name: { contains: trimmed, mode: "insensitive" } },
            { firstName: { contains: trimmed, mode: "insensitive" } },
            { lastName: { contains: trimmed, mode: "insensitive" } },
            { company: { contains: trimmed, mode: "insensitive" } },
            { email: { contains: trimmed, mode: "insensitive" } },
            { mobileNo: { contains: trimmed, mode: "insensitive" } },
            { ownerName: { contains: trimmed, mode: "insensitive" } },
          ],
        }
      : {}),
  });
}

function buildDealWhere(
  ctx: CrmContext,
  search?: string,
  status?: CrmDealStatus | null,
): Prisma.CrmDealWhereInput {
  const trimmed = trimToNull(search);

  return withTenantWhere(ctx, {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(trimmed
      ? {
          OR: [
            { title: { contains: trimmed, mode: "insensitive" } },
            { company: { contains: trimmed, mode: "insensitive" } },
            { firstName: { contains: trimmed, mode: "insensitive" } },
            { lastName: { contains: trimmed, mode: "insensitive" } },
            { primaryEmail: { contains: trimmed, mode: "insensitive" } },
            { ownerName: { contains: trimmed, mode: "insensitive" } },
            {
              customer: {
                company: { contains: trimmed, mode: "insensitive" },
              },
            },
            {
              contact: {
                name: { contains: trimmed, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  });
}

function buildTaskWhere(
  ctx: CrmContext,
  search?: string,
  status?: CrmTaskStatus | null,
): Prisma.CrmTaskWhereInput {
  const trimmed = trimToNull(search);

  return withTenantWhere(ctx, {
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(trimmed
      ? {
          OR: [
            { title: { contains: trimmed, mode: "insensitive" } },
            { description: { contains: trimmed, mode: "insensitive" } },
            { assigneeName: { contains: trimmed, mode: "insensitive" } },
            {
              lead: {
                company: { contains: trimmed, mode: "insensitive" },
              },
            },
            {
              deal: {
                title: { contains: trimmed, mode: "insensitive" },
              },
            },
            {
              deal: {
                company: { contains: trimmed, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  });
}

function buildNoteWhere(
  ctx: CrmContext,
  search?: string,
): Prisma.CrmNoteWhereInput {
  const trimmed = trimToNull(search);

  return withTenantWhere(ctx, {
    deletedAt: null,
    ...(trimmed
      ? {
          OR: [
            { title: { contains: trimmed, mode: "insensitive" } },
            { content: { contains: trimmed, mode: "insensitive" } },
            { writerName: { contains: trimmed, mode: "insensitive" } },
            {
              lead: {
                company: { contains: trimmed, mode: "insensitive" },
              },
            },
            {
              deal: {
                title: { contains: trimmed, mode: "insensitive" },
              },
            },
            {
              deal: {
                company: { contains: trimmed, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  });
}

function buildActivityWhere(
  ctx: CrmContext,
  search?: string,
): Prisma.CrmActivityWhereInput {
  const trimmed = trimToNull(search);

  return withTenantWhere(ctx, {
    deletedAt: null,
    ...(trimmed
      ? {
          OR: [
            { title: { contains: trimmed, mode: "insensitive" } },
            { description: { contains: trimmed, mode: "insensitive" } },
            { ownerName: { contains: trimmed, mode: "insensitive" } },
            {
              lead: {
                company: { contains: trimmed, mode: "insensitive" },
              },
            },
            {
              customer: {
                company: { contains: trimmed, mode: "insensitive" },
              },
            },
            {
              deal: {
                title: { contains: trimmed, mode: "insensitive" },
              },
            },
            {
              deal: {
                company: { contains: trimmed, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  });
}

const baseListInput = z.object({
  search: z.string().optional(),
});

const dashboardInputSchema = baseListInput;

const organizationInputSchema = z.object({
  company: z.string().trim().min(1).max(200),
  website: z.string().trim().optional().nullable(),
  annualRevenue: z.number().nonnegative().optional().nullable(),
  employeeCount: z.nativeEnum(CrmEmployeeRange).optional().nullable(),
  industry: z.nativeEnum(CrmIndustry).optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const contactInputSchema = z.object({
  customerId: z.string().min(1),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().optional().nullable(),
  mobilePhone: z.string().trim().optional().nullable(),
  gender: z.nativeEnum(CrmGender).optional().nullable(),
  designation: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  isPrimary: z.boolean().default(false),
  notes: z.string().trim().optional().nullable(),
});

const leadInputSchema = z.object({
  customerId: z.string().optional().nullable(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().min(1).max(200),
  mobileNo: z.string().trim().optional().nullable(),
  gender: z.nativeEnum(CrmGender).optional().nullable(),
  organizationName: z.string().trim().min(1).max(200),
  website: z.string().trim().optional().nullable(),
  employeeCount: z.nativeEnum(CrmEmployeeRange).optional().nullable(),
  annualRevenue: z.number().nonnegative().optional().nullable(),
  industry: z.nativeEnum(CrmIndustry).optional().nullable(),
  status: z.nativeEnum(CrmLeadStatus),
  ownerId: z.string().optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const dealInputSchema = z.object({
  leadId: z.string().optional().nullable(),
  existingOrganization: z.boolean().default(false),
  customerId: z.string().optional().nullable(),
  organizationName: z.string().trim().optional().nullable(),
  website: z.string().trim().optional().nullable(),
  employeeCount: z.nativeEnum(CrmEmployeeRange).optional().nullable(),
  annualRevenue: z.number().nonnegative().optional().nullable(),
  industry: z.nativeEnum(CrmIndustry).optional().nullable(),
  existingContact: z.boolean().default(false),
  contactId: z.string().optional().nullable(),
  firstName: z.string().trim().optional().nullable(),
  lastName: z.string().trim().optional().nullable(),
  primaryEmail: z.string().trim().optional().nullable(),
  primaryMobileNo: z.string().trim().optional().nullable(),
  gender: z.nativeEnum(CrmGender).optional().nullable(),
  title: z.string().trim().optional().nullable(),
  status: z.nativeEnum(CrmDealStatus),
  ownerId: z.string().optional().nullable(),
  expectedCloseDate: z.string().optional().nullable(),
  lostReason: z.string().trim().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
});

const taskInputSchema = z.object({
  leadId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().optional().nullable(),
  status: z.nativeEnum(CrmTaskStatus),
  assigneeId: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  priority: z.nativeEnum(CrmTaskPriority),
});

const noteInputSchema = z.object({
  leadId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1),
  writerId: z.string().optional().nullable(),
});

const attachmentInputSchema = z.object({
  leadId: z.string().optional().nullable(),
  dealId: z.string().optional().nullable(),
  originalName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  fileSize: z.number().int().positive().max(5 * 1024 * 1024),
  storageUrl: z.string().min(1),
});

const crmProductInputSchema = z.object({
  code: z.string().trim().min(1).max(50),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().optional().nullable(),
  type: z.nativeEnum(CrmProductType).default(CrmProductType.PRODUCT),
  inventoryItemId: z.string().optional().nullable(),
  isActive: z.boolean().default(true),
});

const leadLineInputSchema = z.object({
  leadId: z.string().min(1),
  crmProductId: z.string().optional().nullable(),
  inventoryItemId: z.string().optional().nullable(),
  warehousePreferenceId: z.string().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  qty: z.number().nonnegative(),
  unitPrice: z.number().nonnegative(),
  totalPrice: z.number().nonnegative().optional().nullable(),
  requiresInventory: z.boolean().default(false),
});

const leadListInputSchema = baseListInput.extend({
  status: z.nativeEnum(CrmLeadStatus).optional(),
});

const dealListInputSchema = baseListInput.extend({
  status: z.nativeEnum(CrmDealStatus).optional(),
});

const taskListInputSchema = baseListInput.extend({
  status: z.nativeEnum(CrmTaskStatus).optional(),
});

async function resolveLeadOrganizationData(
  db: CrmDbClient,
  ctx: CrmContext,
  input: z.infer<typeof leadInputSchema>,
) {
  const organizationId = trimToNull(input.customerId);
  const organizationName = trimToNull(input.organizationName);

  if (organizationId) {
    const organization = await getOrganizationOrThrow(db, ctx, organizationId);

    return {
      customerId: organization.id,
      organizationName: organizationName ?? organization.company,
      website: trimToNull(input.website) ?? organization.website,
      employeeCount: input.employeeCount ?? organization.employeeCount,
      annualRevenue:
        input.annualRevenue ??
        (organization.annualRevenue ? Number(organization.annualRevenue) : null),
      industry: input.industry ?? organization.industry,
      customerRecord: organization,
    };
  }

  return {
    customerId: null,
    organizationName,
    website: trimToNull(input.website),
    employeeCount: input.employeeCount ?? null,
    annualRevenue: input.annualRevenue ?? null,
    industry: input.industry ?? null,
    customerRecord: null,
  };
}

async function resolveDealPartyData(
  db: CrmDbClient,
  ctx: CrmContext,
  input: z.infer<typeof dealInputSchema>,
) {
  let customerId = trimToNull(input.customerId);
  let organizationName = trimToNull(input.organizationName);
  let website = trimToNull(input.website);
  let employeeCount = input.employeeCount ?? null;
  let annualRevenue = input.annualRevenue ?? null;
  let industry = input.industry ?? null;

  let contactId = trimToNull(input.contactId);
  let firstName = trimToNull(input.firstName);
  let lastName = trimToNull(input.lastName);
  let primaryEmail = trimToNull(input.primaryEmail);
  let primaryMobileNo = trimToNull(input.primaryMobileNo);
  let gender = input.gender ?? null;

  if (input.existingOrganization) {
    if (!customerId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "An organization must be selected",
      });
    }

    const organization = await getOrganizationOrThrow(db, ctx, customerId);
    organizationName = organization.company;
    website = website ?? organization.website;
    employeeCount = employeeCount ?? organization.employeeCount ?? null;
    annualRevenue =
      annualRevenue ?? (organization.annualRevenue ? Number(organization.annualRevenue) : null);
    industry = industry ?? organization.industry ?? null;
  } else if (!organizationName) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Organization details are required",
    });
  }

  if (input.existingContact) {
    if (!contactId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "A contact must be selected",
      });
    }

    const contact = await getContactOrThrow(db, ctx, contactId);
    firstName = trimToNull(contact.firstName) ?? firstName;
    lastName = trimToNull(contact.lastName) ?? lastName;
    primaryEmail = trimToNull(contact.email) ?? primaryEmail;
    primaryMobileNo = trimToNull(contact.phone) ?? primaryMobileNo;
    gender = contact.gender ?? gender;

    if (!customerId) {
      customerId = contact.customerId;
      const organization = await getOrganizationOrThrow(db, ctx, contact.customerId);
      organizationName = organizationName ?? organization.company;
      website = website ?? organization.website;
      employeeCount = employeeCount ?? organization.employeeCount ?? null;
      annualRevenue =
        annualRevenue ?? (organization.annualRevenue ? Number(organization.annualRevenue) : null);
      industry = industry ?? organization.industry ?? null;
    }

    if (customerId && contact.customerId !== customerId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Selected contact does not belong to the selected organization",
      });
    }
  } else if (!firstName || !lastName) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Contact details are required",
    });
  }

  return {
    customerId,
    organizationName,
    website,
    employeeCount,
    annualRevenue,
    industry,
    contactId,
    firstName,
    lastName,
    primaryEmail,
    primaryMobileNo,
    gender,
  };
}

export const crmRouter = createTRPCRouter({
  dashboard: protectedProcedure
    .input(dashboardInputSchema)
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "read");

      const search = trimToNull(input.search);
      const [organizations, contacts, leads, deals, openTasks, notes, recentTasks, recentNotes, activities, customers, leadRows] =
        await Promise.all([
          ctx.db.crmCustomer.count({
            where: buildOrganizationWhere(ctx, search ?? undefined),
          }),
          ctx.db.crmContact.count({
            where: buildContactWhere(ctx, search ?? undefined),
          }),
          ctx.db.crmLead.count({
            where: buildLeadWhere(ctx, search ?? undefined, null),
          }),
          ctx.db.crmDeal.count({
            where: buildDealWhere(ctx, search ?? undefined, null),
          }),
          ctx.db.crmTask.count({
            where: buildTaskWhere(ctx, search ?? undefined, CrmTaskStatus.OPEN),
          }),
          ctx.db.crmNote.count({
            where: buildNoteWhere(ctx, search ?? undefined),
          }),
          ctx.db.crmTask.findMany({
            where: buildTaskWhere(ctx, undefined, null),
            include: {
              lead: { select: { id: true, company: true } },
              deal: { select: { id: true, title: true, company: true } },
            },
            orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
            take: 5,
          }),
          ctx.db.crmNote.findMany({
            where: buildNoteWhere(ctx, undefined),
            include: {
              lead: { select: { id: true, company: true } },
              deal: { select: { id: true, title: true, company: true } },
            },
            orderBy: [{ updatedAt: "desc" }],
            take: 5,
          }),
          ctx.db.crmActivity.findMany({
            where: buildActivityWhere(ctx, search ?? undefined),
            include: {
              lead: { select: { id: true, company: true } },
              customer: { select: { id: true, company: true } },
              deal: { select: { id: true, title: true, company: true } },
            },
            orderBy: [{ scheduledAt: "asc" }, { updatedAt: "desc" }],
            take: 100,
          }),
          ctx.db.crmCustomer.findMany({
            where: buildOrganizationWhere(ctx, search ?? undefined),
            select: { id: true, company: true, status: true },
            orderBy: [{ updatedAt: "desc" }],
            take: 200,
          }),
          ctx.db.crmLead.findMany({
            where: buildLeadWhere(ctx, search ?? undefined, null),
            select: {
              id: true,
              company: true,
              stage: true,
              value: true,
              probability: true,
              ownerName: true,
              source: true,
            },
            orderBy: [{ updatedAt: "desc" }],
            take: 200,
          }),
        ]);

      return {
        counts: {
          organizations,
          contacts,
          leads,
          deals,
          openTasks,
          notes,
        },
        recentTasks,
        recentNotes,
        activities,
        customers,
        leads: leadRows,
      };
    }),

  formOptions: protectedProcedure.query(async ({ ctx }) => {
    requireCrmAccess(ctx, "read");

    const [users, organizations, contacts, leads, deals] = await Promise.all([
      ctx.db.user.findMany({
        where: withTenantMembershipFilter(ctx, {
          deletedAt: null,
        }),
        select: {
          id: true,
          name: true,
          email: true,
        },
        orderBy: { name: "asc" },
        take: 200,
      }),
      ctx.db.crmCustomer.findMany({
        where: withTenantWhere(ctx, {
          deletedAt: null,
        }),
        select: {
          id: true,
          company: true,
        },
        orderBy: { company: "asc" },
        take: 200,
      }),
      ctx.db.crmContact.findMany({
        where: withTenantWhere(ctx, {
          deletedAt: null,
        }),
        select: {
          id: true,
          name: true,
          customerId: true,
          customer: {
            select: {
              company: true,
            },
          },
        },
        orderBy: { name: "asc" },
        take: 200,
      }),
      ctx.db.crmLead.findMany({
        where: withTenantWhere(ctx, {
          deletedAt: null,
        }),
        select: {
          id: true,
          company: true,
          name: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
      ctx.db.crmDeal.findMany({
        where: withTenantWhere(ctx, {
          deletedAt: null,
        }),
        select: {
          id: true,
          title: true,
          company: true,
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
      }),
    ]);

    return {
      users,
      organizations,
      contacts,
      leads,
      deals,
    };
  }),

  listOrganizations: protectedProcedure
    .input(baseListInput)
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "read");

      return ctx.db.crmCustomer.findMany({
        where: buildOrganizationWhere(ctx, input.search),
        include: {
          contacts: {
            where: { deletedAt: null },
            select: { id: true },
          },
          deals: {
            where: { deletedAt: null },
            select: { id: true },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
      });
    }),

  getOrganizationById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "read");

      const organization = await ctx.db.crmCustomer.findFirst({
        where: withTenantWhere(ctx, {
          id: input.id,
          deletedAt: null,
        }),
        include: {
          contacts: {
            where: { deletedAt: null },
            orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
          },
          deals: {
            where: { deletedAt: null },
            orderBy: [{ updatedAt: "desc" }],
            include: {
              contact: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          leads: {
            where: { deletedAt: null },
            orderBy: [{ updatedAt: "desc" }],
          },
        },
      });

      if (!organization) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Organization not found",
        });
      }

      return organization;
    }),

  createOrganization: protectedProcedure
    .input(organizationInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "create");

      return ctx.db.crmCustomer.create({
        data: {
          tenantId: getTenantScope(ctx).tenantId,
          name: input.company,
          company: input.company,
          email: null,
          phone: null,
          segment: CrmCustomerSegment.SMB,
          city: null,
          ownerName: null,
          status: CrmCustomerStatus.ACTIVE,
          totalValue: 0,
          website: trimToNull(input.website),
          annualRevenue: input.annualRevenue ?? null,
          employeeCount: input.employeeCount ?? null,
          industry: input.industry ?? null,
          notes: trimToNull(input.notes),
          lastContactAt: new Date(),
        },
      });
    }),

  updateOrganization: protectedProcedure
    .input(organizationInputSchema.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "update");

      await getOrganizationOrThrow(ctx.db, ctx, input.id);

      return ctx.db.crmCustomer.update({
        where: { id: input.id },
        data: {
          name: input.company,
          company: input.company,
          website: trimToNull(input.website),
          annualRevenue: input.annualRevenue ?? null,
          employeeCount: input.employeeCount ?? null,
          industry: input.industry ?? null,
          notes: trimToNull(input.notes),
        },
      });
    }),

  deleteOrganization: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "delete");

      await getOrganizationOrThrow(ctx.db, ctx, input.id);

      return ctx.db.crmCustomer.update({
        where: { id: input.id },
        data: {
          deletedAt: new Date(),
        },
      });
    }),

  listContacts: protectedProcedure
    .input(baseListInput)
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "read");

      return ctx.db.crmContact.findMany({
        where: buildContactWhere(ctx, input.search),
        include: {
          customer: {
            select: {
              id: true,
              company: true,
            },
          },
          deals: {
            where: { deletedAt: null },
            select: { id: true },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
      });
    }),

  getContactById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "read");

      const contact = await ctx.db.crmContact.findFirst({
        where: withTenantWhere(ctx, {
          id: input.id,
          deletedAt: null,
        }),
        include: {
          customer: true,
          deals: {
            where: { deletedAt: null },
            orderBy: [{ updatedAt: "desc" }],
          },
        },
      });

      if (!contact) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Contact not found",
        });
      }

      return contact;
    }),

  createContact: protectedProcedure
    .input(contactInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "create");

      await getOrganizationOrThrow(ctx.db, ctx, input.customerId);

      const name = buildFullName(input.firstName, input.lastName, input.firstName);

      return ctx.db.$transaction(async (tx) => {
        if (input.isPrimary) {
          await tx.crmContact.updateMany({
            where: withTenantWhere(ctx, {
              customerId: input.customerId,
              deletedAt: null,
            }),
            data: {
              isPrimary: false,
            },
          });
        }

        return tx.crmContact.create({
          data: {
            tenantId: getTenantScope(ctx).tenantId,
            customerId: input.customerId,
            name,
            title: trimToNull(input.designation),
            email: trimToNull(input.email),
            phone: trimToNull(input.mobilePhone),
            department: null,
            firstName: trimToNull(input.firstName),
            lastName: trimToNull(input.lastName),
            gender: input.gender ?? null,
            designation: trimToNull(input.designation),
            address: trimToNull(input.address),
            isPrimary: input.isPrimary,
            isActive: true,
            notes: trimToNull(input.notes),
          },
        });
      });
    }),

  updateContact: protectedProcedure
    .input(contactInputSchema.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "update");

      await getContactOrThrow(ctx.db, ctx, input.id);
      await getOrganizationOrThrow(ctx.db, ctx, input.customerId);

      const name = buildFullName(input.firstName, input.lastName, input.firstName);

      return ctx.db.$transaction(async (tx) => {
        if (input.isPrimary) {
          await tx.crmContact.updateMany({
            where: withTenantWhere(ctx, {
              customerId: input.customerId,
              deletedAt: null,
              NOT: { id: input.id },
            }),
            data: {
              isPrimary: false,
            },
          });
        }

        return tx.crmContact.update({
          where: { id: input.id },
          data: {
            customerId: input.customerId,
            name,
            title: trimToNull(input.designation),
            email: trimToNull(input.email),
            phone: trimToNull(input.mobilePhone),
            firstName: trimToNull(input.firstName),
            lastName: trimToNull(input.lastName),
            gender: input.gender ?? null,
            designation: trimToNull(input.designation),
            address: trimToNull(input.address),
            isPrimary: input.isPrimary,
            notes: trimToNull(input.notes),
          },
        });
      });
    }),

  deleteContact: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "delete");

      await getContactOrThrow(ctx.db, ctx, input.id);

      return ctx.db.$transaction(async (tx) => {
        await tx.crmDeal.updateMany({
          where: withTenantWhere(ctx, {
            contactId: input.id,
            deletedAt: null,
          }),
          data: {
            contactId: null,
          },
        });

        return tx.crmContact.update({
          where: { id: input.id },
          data: {
            deletedAt: new Date(),
          },
        });
      });
    }),

  listLeads: protectedProcedure
    .input(leadListInputSchema)
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "read");

      return ctx.db.crmLead.findMany({
        where: buildLeadWhere(ctx, input.search, input.status ?? null),
        include: {
          customer: {
            select: {
              id: true,
              company: true,
            },
          },
          deals: {
            where: { deletedAt: null },
            select: { id: true },
          },
          tasks: {
            where: { deletedAt: null },
            select: { id: true },
          },
          notesList: {
            where: { deletedAt: null },
            select: { id: true },
          },
          attachments: {
            where: { deletedAt: null },
            select: { id: true },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
      });
    }),

  getLeadById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "read");

      const lead = await ctx.db.crmLead.findFirst({
        where: withTenantWhere(ctx, {
          id: input.id,
          deletedAt: null,
        }),
        include: {
          customer: true,
          deals: {
            where: { deletedAt: null },
            orderBy: [{ updatedAt: "desc" }],
            include: {
              contact: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
          tasks: {
            where: { deletedAt: null },
            orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
          },
          notesList: {
            where: { deletedAt: null },
            orderBy: [{ updatedAt: "desc" }],
          },
          attachments: {
            where: { deletedAt: null },
            orderBy: [{ createdAt: "desc" }],
          },
          activities: {
            where: { deletedAt: null },
            orderBy: [{ scheduledAt: "desc" }],
          },
          leadLines: {
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
          message: "Lead not found",
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
      const lead = await getLeadOrThrow(ctx.db, ctx, input.leadId);

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
      await ctx.db.crmLead.update({
        where: { id: lead.id },
        data: {
          value: nextValue,
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

  createLead: protectedProcedure
    .input(leadInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "create");

      const ownerName = await resolveUserDisplayName(ctx.db, ctx, input.ownerId);
      const organizationData = await resolveLeadOrganizationData(ctx.db, ctx, input);
      if (!organizationData.organizationName) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Organization name is required",
        });
      }

      const organizationName = organizationData.organizationName;
      const fullName = buildFullName(input.firstName, input.lastName, input.email);
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        const lead = await tx.crmLead.create({
          data: {
            tenantId: getTenantScope(ctx).tenantId,
            customerId: organizationData.customerId,
            name: fullName,
            company: organizationName,
            email: input.email.trim(),
            phone: trimToNull(input.mobileNo),
            firstName: trimToNull(input.firstName),
            lastName: trimToNull(input.lastName),
            mobileNo: trimToNull(input.mobileNo),
            gender: input.gender ?? null,
            status: input.status,
            website: organizationData.website,
            employeeCount: organizationData.employeeCount,
            annualRevenue: organizationData.annualRevenue,
            industry: organizationData.industry,
            ownerId: trimToNull(input.ownerId),
            stage: mapLeadStatusToLegacyStage(input.status),
            value: 0,
            probability: input.status === CrmLeadStatus.QUALIFIED ? 75 : 25,
            source: CrmLeadSource.WEBSITE,
            priority: CrmLeadPriority.MEDIUM,
            ownerName,
            expectedCloseDate: parseOptionalDate(input.expectedCloseDate),
            lastActivityAt: touchedAt,
            convertedToDealAt:
              input.status === CrmLeadStatus.CONVERTED ? touchedAt : null,
            notes: trimToNull(input.notes),
          },
        });

        await touchLinkedRecords(
          tx,
          {
            customerId: lead.customerId,
            leadId: lead.id,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: lead.tenantId,
          customerId: lead.customerId,
          leadId: lead.id,
          ownerName,
          title: "Lead created",
          description: `${lead.company} has been added to CRM.`,
          type: CrmActivityType.SYSTEM,
          happenedAt: touchedAt,
        });

        return lead;
      });
    }),

  updateLead: protectedProcedure
    .input(leadInputSchema.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "update");

      const existing = await getLeadOrThrow(ctx.db, ctx, input.id);
      const ownerName = await resolveUserDisplayName(
        ctx.db,
        ctx,
        input.ownerId,
        existing.ownerName,
      );
      const organizationData = await resolveLeadOrganizationData(ctx.db, ctx, input);
      if (!organizationData.organizationName) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Organization name is required",
        });
      }

      const organizationName = organizationData.organizationName;
      const fullName = buildFullName(input.firstName, input.lastName, input.email);
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        const lead = await tx.crmLead.update({
          where: { id: input.id },
          data: {
            customerId: organizationData.customerId,
            name: fullName,
            company: organizationName,
            email: input.email.trim(),
            phone: trimToNull(input.mobileNo),
            firstName: trimToNull(input.firstName),
            lastName: trimToNull(input.lastName),
            mobileNo: trimToNull(input.mobileNo),
            gender: input.gender ?? null,
            status: input.status,
            website: organizationData.website,
            employeeCount: organizationData.employeeCount,
            annualRevenue: organizationData.annualRevenue,
            industry: organizationData.industry,
            ownerId: trimToNull(input.ownerId),
            ownerName,
            stage: mapLeadStatusToLegacyStage(input.status),
            probability: input.status === CrmLeadStatus.QUALIFIED ? 75 : 25,
            expectedCloseDate: parseOptionalDate(input.expectedCloseDate),
            lastActivityAt: touchedAt,
            convertedToDealAt:
              input.status === CrmLeadStatus.CONVERTED
                ? existing.convertedToDealAt ?? touchedAt
                : null,
            notes: trimToNull(input.notes),
          },
        });

        await touchLinkedRecords(
          tx,
          {
            customerId: lead.customerId,
            leadId: lead.id,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: lead.tenantId,
          customerId: lead.customerId,
          leadId: lead.id,
          ownerName,
          title: "Lead updated",
          description: `${lead.company} lead data has been updated.`,
          type:
            existing.status !== lead.status
              ? CrmActivityType.STAGE_CHANGE
              : CrmActivityType.SYSTEM,
          happenedAt: touchedAt,
        });

        return lead;
      });
    }),

  deleteLead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "delete");

      await getLeadOrThrow(ctx.db, ctx, input.id);

      return ctx.db.$transaction(async (tx) => {
        const deletedAt = new Date();

        await tx.crmTask.updateMany({
          where: withTenantWhere(ctx, {
            leadId: input.id,
            deletedAt: null,
          }),
          data: {
            deletedAt,
          },
        });

        await tx.crmNote.updateMany({
          where: withTenantWhere(ctx, {
            leadId: input.id,
            deletedAt: null,
          }),
          data: {
            deletedAt,
          },
        });

        await tx.crmRecordAttachment.updateMany({
          where: withTenantWhere(ctx, {
            leadId: input.id,
            deletedAt: null,
          }),
          data: {
            deletedAt,
          },
        });

        return tx.crmLead.update({
          where: { id: input.id },
          data: {
            deletedAt,
          },
        });
      });
    }),

  createDealFromLead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "update");

      const lead = await getLeadOrThrow(ctx.db, ctx, input.id);
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        const existingDeal = await tx.crmDeal.findFirst({
          where: withTenantWhere(ctx, {
            leadId: lead.id,
            deletedAt: null,
          }),
        });

        if (existingDeal) {
          return existingDeal;
        }

        const deal = await tx.crmDeal.create({
          data: {
            tenantId: lead.tenantId,
            customerId: lead.customerId,
            leadId: lead.id,
            title: `${lead.company} - ${lead.name}`,
            company: lead.company,
            ownerName: lead.ownerName,
            ownerId: lead.ownerId,
            status: CrmDealStatus.QUALIFICATION,
            website: lead.website,
            employeeCount: lead.employeeCount,
            annualRevenue: lead.annualRevenue,
            industry: lead.industry,
            firstName: lead.firstName,
            lastName: lead.lastName,
            primaryEmail: lead.email,
            primaryMobileNo: lead.mobileNo,
            gender: lead.gender,
            stage: mapDealStatusToLegacyStage(CrmDealStatus.QUALIFICATION),
            value: 0,
            probability: 35,
            source: lead.source,
            expectedCloseDate: lead.expectedCloseDate,
            notes: lead.notes,
            lastActivityAt: touchedAt,
          },
        });

        await tx.crmLead.update({
          where: { id: lead.id },
          data: {
            status: CrmLeadStatus.CONVERTED,
            stage: CrmLeadStage.QUALIFIED,
            convertedToDealAt: touchedAt,
            lastActivityAt: touchedAt,
          },
        });

        await touchLinkedRecords(
          tx,
          {
            customerId: lead.customerId,
            leadId: lead.id,
            dealId: deal.id,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: lead.tenantId,
          customerId: lead.customerId,
          leadId: lead.id,
          ownerName: lead.ownerName,
          title: "Lead converted",
          description: `${lead.company} was converted into a deal.`,
          type: CrmActivityType.STAGE_CHANGE,
          happenedAt: touchedAt,
        });
        await createActivity(tx, {
          tenantId: deal.tenantId,
          customerId: deal.customerId,
          dealId: deal.id,
          ownerName: deal.ownerName,
          title: "Deal created from lead",
          description: `${deal.company} deal has been created from a lead.`,
          type: CrmActivityType.SYSTEM,
          happenedAt: touchedAt,
        });

        return deal;
      });
    }),

  listDeals: protectedProcedure
    .input(dealListInputSchema)
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "read");

      return ctx.db.crmDeal.findMany({
        where: buildDealWhere(ctx, input.search, input.status ?? null),
        include: {
          customer: {
            select: {
              id: true,
              company: true,
            },
          },
          contact: {
            select: {
              id: true,
              name: true,
            },
          },
          lead: {
            select: {
              id: true,
              company: true,
            },
          },
          tasks: {
            where: { deletedAt: null },
            select: { id: true },
          },
          notesList: {
            where: { deletedAt: null },
            select: { id: true },
          },
          attachments: {
            where: { deletedAt: null },
            select: { id: true },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
      });
    }),

  getDealById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "read");

      const deal = await ctx.db.crmDeal.findFirst({
        where: withTenantWhere(ctx, {
          id: input.id,
          deletedAt: null,
        }),
        include: {
          customer: true,
          contact: true,
          lead: true,
          tasks: {
            where: { deletedAt: null },
            orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
          },
          notesList: {
            where: { deletedAt: null },
            orderBy: [{ updatedAt: "desc" }],
          },
          attachments: {
            where: { deletedAt: null },
            orderBy: [{ createdAt: "desc" }],
          },
          activities: {
            where: { deletedAt: null },
            orderBy: [{ scheduledAt: "desc" }],
          },
        },
      });

      if (!deal) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Deal not found",
        });
      }

      return deal;
    }),

  createDeal: protectedProcedure
    .input(dealInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "create");

      const ownerName = await resolveUserDisplayName(ctx.db, ctx, input.ownerId);
      const leadId = trimToNull(input.leadId);
      const party = await resolveDealPartyData(ctx.db, ctx, input);
      if (!party.organizationName) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Organization details are required",
        });
      }

      const title =
        trimToNull(input.title) ??
        `${party.organizationName} - ${buildFullName(party.firstName, party.lastName, "Deal")}`;
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        if (leadId) {
          await getLeadOrThrow(tx, ctx, leadId);
        }

        const deal = await tx.crmDeal.create({
          data: {
            tenantId: getTenantScope(ctx).tenantId,
            customerId: party.customerId,
            contactId: party.contactId,
            leadId,
            title,
            company: party.organizationName,
            ownerName,
            ownerId: trimToNull(input.ownerId),
            status: input.status,
            website: party.website,
            employeeCount: party.employeeCount,
            annualRevenue: party.annualRevenue,
            industry: party.industry,
            firstName: party.firstName,
            lastName: party.lastName,
            primaryEmail: party.primaryEmail,
            primaryMobileNo: party.primaryMobileNo,
            gender: party.gender,
            stage: mapDealStatusToLegacyStage(input.status),
            value: 0,
            probability:
              input.status === CrmDealStatus.READY_TO_CLOSE
                ? 90
                : input.status === CrmDealStatus.NEGOTIATION
                  ? 65
                  : 35,
            source: leadId ? CrmLeadSource.REFERRAL : CrmLeadSource.WEBSITE,
            expectedCloseDate: parseOptionalDate(input.expectedCloseDate),
            closedAt:
              input.status === CrmDealStatus.WON ||
              input.status === CrmDealStatus.LOST
                ? touchedAt
                : null,
            lostReason:
              input.status === CrmDealStatus.LOST
                ? trimToNull(input.lostReason)
                : null,
            notes: trimToNull(input.notes),
            lastActivityAt: touchedAt,
          },
        });

        if (leadId) {
          await tx.crmLead.update({
            where: { id: leadId },
            data: {
              status: CrmLeadStatus.CONVERTED,
              stage: CrmLeadStage.QUALIFIED,
              convertedToDealAt: touchedAt,
              lastActivityAt: touchedAt,
            },
          });

          await createActivity(tx, {
            tenantId: deal.tenantId,
            customerId: deal.customerId,
            leadId,
            ownerName,
            title: "Lead converted",
            description: `${deal.company} was converted into a deal.`,
            type: CrmActivityType.STAGE_CHANGE,
            happenedAt: touchedAt,
          });
        }

        await touchLinkedRecords(
          tx,
          {
            customerId: deal.customerId,
            dealId: deal.id,
            leadId,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: deal.tenantId,
          customerId: deal.customerId,
          dealId: deal.id,
          ownerName,
          title: "Deal created",
          description: `${deal.company} deal has been added to CRM.`,
          type: CrmActivityType.SYSTEM,
          happenedAt: touchedAt,
        });

        return deal;
      });
    }),

  updateDeal: protectedProcedure
    .input(dealInputSchema.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "update");

      const existing = await getDealOrThrow(ctx.db, ctx, input.id);
      const ownerName = await resolveUserDisplayName(
        ctx.db,
        ctx,
        input.ownerId,
        existing.ownerName,
      );
      const party = await resolveDealPartyData(ctx.db, ctx, input);
      if (!party.organizationName) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Organization details are required",
        });
      }

      const leadId = trimToNull(input.leadId);
      const title =
        trimToNull(input.title) ??
        `${party.organizationName} - ${buildFullName(party.firstName, party.lastName, "Deal")}`;
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        if (leadId) {
          await getLeadOrThrow(tx, ctx, leadId);
        }

        const deal = await tx.crmDeal.update({
          where: { id: input.id },
          data: {
            customerId: party.customerId,
            contactId: party.contactId,
            leadId,
            title,
            company: party.organizationName,
            ownerName,
            ownerId: trimToNull(input.ownerId),
            status: input.status,
            website: party.website,
            employeeCount: party.employeeCount,
            annualRevenue: party.annualRevenue,
            industry: party.industry,
            firstName: party.firstName,
            lastName: party.lastName,
            primaryEmail: party.primaryEmail,
            primaryMobileNo: party.primaryMobileNo,
            gender: party.gender,
            stage: mapDealStatusToLegacyStage(input.status),
            probability:
              input.status === CrmDealStatus.READY_TO_CLOSE
                ? 90
                : input.status === CrmDealStatus.NEGOTIATION
                  ? 65
                  : 35,
            expectedCloseDate: parseOptionalDate(input.expectedCloseDate),
            closedAt:
              input.status === CrmDealStatus.WON ||
              input.status === CrmDealStatus.LOST
                ? existing.closedAt ?? touchedAt
                : null,
            lostReason:
              input.status === CrmDealStatus.LOST
                ? trimToNull(input.lostReason)
                : null,
            notes: trimToNull(input.notes),
            lastActivityAt: touchedAt,
          },
        });

        if (leadId) {
          await tx.crmLead.update({
            where: { id: leadId },
            data: {
              status: CrmLeadStatus.CONVERTED,
              stage: CrmLeadStage.QUALIFIED,
              convertedToDealAt: touchedAt,
              lastActivityAt: touchedAt,
            },
          });
        }

        await touchLinkedRecords(
          tx,
          {
            customerId: deal.customerId,
            dealId: deal.id,
            leadId,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: deal.tenantId,
          customerId: deal.customerId,
          dealId: deal.id,
          ownerName,
          title: "Deal updated",
          description: `${deal.company} deal data has been updated.`,
          type:
            existing.status !== deal.status
              ? CrmActivityType.STAGE_CHANGE
              : CrmActivityType.SYSTEM,
          happenedAt: touchedAt,
        });

        return deal;
      });
    }),

  deleteDeal: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "delete");

      await getDealOrThrow(ctx.db, ctx, input.id);

      return ctx.db.$transaction(async (tx) => {
        const deletedAt = new Date();

        await tx.crmTask.updateMany({
          where: withTenantWhere(ctx, {
            dealId: input.id,
            deletedAt: null,
          }),
          data: {
            deletedAt,
          },
        });

        await tx.crmNote.updateMany({
          where: withTenantWhere(ctx, {
            dealId: input.id,
            deletedAt: null,
          }),
          data: {
            deletedAt,
          },
        });

        await tx.crmRecordAttachment.updateMany({
          where: withTenantWhere(ctx, {
            dealId: input.id,
            deletedAt: null,
          }),
          data: {
            deletedAt,
          },
        });

        return tx.crmDeal.update({
          where: { id: input.id },
          data: {
            deletedAt,
          },
        });
      });
    }),
 
  listTasks: protectedProcedure
    .input(taskListInputSchema)
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "read");

      return ctx.db.crmTask.findMany({
        where: buildTaskWhere(ctx, input.search, input.status ?? null),
        include: {
          lead: {
            select: {
              id: true,
              company: true,
              name: true,
            },
          },
          deal: {
            select: {
              id: true,
              title: true,
              company: true,
            },
          },
        },
        orderBy: [{ dueDate: "asc" }, { updatedAt: "desc" }],
      });
    }),

  createTask: protectedProcedure
    .input(taskInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "create");
      ensureSingleSubject(input);

      const leadId = trimToNull(input.leadId);
      const dealId = trimToNull(input.dealId);
      const assigneeName = await resolveUserDisplayName(ctx.db, ctx, input.assigneeId);
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        const lead = leadId ? await getLeadOrThrow(tx, ctx, leadId) : null;
        const deal = dealId ? await getDealOrThrow(tx, ctx, dealId) : null;

        const task = await tx.crmTask.create({
          data: {
            tenantId: getTenantScope(ctx).tenantId,
            leadId,
            dealId,
            title: input.title.trim(),
            description: trimToNull(input.description),
            status: input.status,
            assigneeId: trimToNull(input.assigneeId),
            assigneeName,
            dueDate: parseOptionalDate(input.dueDate),
            priority: input.priority,
          },
        });

        await touchLinkedRecords(
          tx,
          {
            customerId: lead?.customerId ?? deal?.customerId ?? null,
            leadId,
            dealId,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: task.tenantId,
          customerId: lead?.customerId ?? deal?.customerId ?? null,
          leadId,
          dealId,
          ownerName: assigneeName,
          title: "Task created",
          description: task.title,
          type: CrmActivityType.TASK,
          happenedAt: touchedAt,
        });

        return task;
      });
    }),

  updateTask: protectedProcedure
    .input(taskInputSchema.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "update");
      ensureSingleSubject(input);

      const existing = await getTaskOrThrow(ctx.db, ctx, input.id);
      const leadId = trimToNull(input.leadId);
      const dealId = trimToNull(input.dealId);
      const assigneeName = await resolveUserDisplayName(
        ctx.db,
        ctx,
        input.assigneeId,
        existing.assigneeName,
      );
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        const lead = leadId ? await getLeadOrThrow(tx, ctx, leadId) : null;
        const deal = dealId ? await getDealOrThrow(tx, ctx, dealId) : null;

        const task = await tx.crmTask.update({
          where: { id: input.id },
          data: {
            leadId,
            dealId,
            title: input.title.trim(),
            description: trimToNull(input.description),
            status: input.status,
            assigneeId: trimToNull(input.assigneeId),
            assigneeName,
            dueDate: parseOptionalDate(input.dueDate),
            priority: input.priority,
          },
        });

        await touchLinkedRecords(
          tx,
          {
            customerId: lead?.customerId ?? deal?.customerId ?? null,
            leadId,
            dealId,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: task.tenantId,
          customerId: lead?.customerId ?? deal?.customerId ?? null,
          leadId,
          dealId,
          ownerName: assigneeName,
          title: "Task updated",
          description: task.title,
          type: CrmActivityType.TASK,
          happenedAt: touchedAt,
        });

        return task;
      });
    }),

  deleteTask: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "delete");

      const task = await getTaskOrThrow(ctx.db, ctx, input.id);
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        const updated = await tx.crmTask.update({
          where: { id: input.id },
          data: {
            deletedAt: touchedAt,
          },
        });

        let customerId: string | null = null;
        if (task.leadId) {
          const lead = await getLeadOrThrow(tx, ctx, task.leadId);
          customerId = lead.customerId;
        }
        if (task.dealId) {
          const deal = await getDealOrThrow(tx, ctx, task.dealId);
          customerId = deal.customerId;
        }

        await touchLinkedRecords(
          tx,
          {
            customerId,
            leadId: task.leadId,
            dealId: task.dealId,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: task.tenantId,
          customerId,
          leadId: task.leadId,
          dealId: task.dealId,
          ownerName: task.assigneeName ?? ctx.session.user.name ?? "Unknown",
          title: "Task removed",
          description: task.title,
          type: CrmActivityType.TASK,
          happenedAt: touchedAt,
        });

        return updated;
      });
    }),

  listNotes: protectedProcedure
    .input(baseListInput)
    .query(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "read");

      return ctx.db.crmNote.findMany({
        where: buildNoteWhere(ctx, input.search),
        include: {
          lead: {
            select: {
              id: true,
              company: true,
              name: true,
            },
          },
          deal: {
            select: {
              id: true,
              title: true,
              company: true,
            },
          },
        },
        orderBy: [{ updatedAt: "desc" }],
      });
    }),

  createNote: protectedProcedure
    .input(noteInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "create");
      ensureSingleSubject(input);

      const leadId = trimToNull(input.leadId);
      const dealId = trimToNull(input.dealId);
      const writerName = await resolveUserDisplayName(
        ctx.db,
        ctx,
        input.writerId,
        ctx.session.user.name,
      );
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        const lead = leadId ? await getLeadOrThrow(tx, ctx, leadId) : null;
        const deal = dealId ? await getDealOrThrow(tx, ctx, dealId) : null;

        const note = await tx.crmNote.create({
          data: {
            tenantId: getTenantScope(ctx).tenantId,
            leadId,
            dealId,
            title: input.title.trim(),
            content: input.content.trim(),
            writerId: trimToNull(input.writerId) ?? ctx.session.user.id,
            writerName,
          },
        });

        await touchLinkedRecords(
          tx,
          {
            customerId: lead?.customerId ?? deal?.customerId ?? null,
            leadId,
            dealId,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: note.tenantId,
          customerId: lead?.customerId ?? deal?.customerId ?? null,
          leadId,
          dealId,
          ownerName: writerName,
          title: "Note added",
          description: note.title,
          type: CrmActivityType.NOTE,
          happenedAt: touchedAt,
        });

        return note;
      });
    }),

  updateNote: protectedProcedure
    .input(noteInputSchema.extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "update");
      ensureSingleSubject(input);

      const existing = await getNoteOrThrow(ctx.db, ctx, input.id);
      const leadId = trimToNull(input.leadId);
      const dealId = trimToNull(input.dealId);
      const writerName = await resolveUserDisplayName(
        ctx.db,
        ctx,
        input.writerId,
        existing.writerName,
      );
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        const lead = leadId ? await getLeadOrThrow(tx, ctx, leadId) : null;
        const deal = dealId ? await getDealOrThrow(tx, ctx, dealId) : null;

        const note = await tx.crmNote.update({
          where: { id: input.id },
          data: {
            leadId,
            dealId,
            title: input.title.trim(),
            content: input.content.trim(),
            writerId: trimToNull(input.writerId) ?? existing.writerId ?? undefined,
            writerName,
          },
        });

        await touchLinkedRecords(
          tx,
          {
            customerId: lead?.customerId ?? deal?.customerId ?? null,
            leadId,
            dealId,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: note.tenantId,
          customerId: lead?.customerId ?? deal?.customerId ?? null,
          leadId,
          dealId,
          ownerName: writerName,
          title: "Note updated",
          description: note.title,
          type: CrmActivityType.NOTE,
          happenedAt: touchedAt,
        });

        return note;
      });
    }),

  deleteNote: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "delete");

      const note = await getNoteOrThrow(ctx.db, ctx, input.id);
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        const updated = await tx.crmNote.update({
          where: { id: input.id },
          data: {
            deletedAt: touchedAt,
          },
        });

        let customerId: string | null = null;
        if (note.leadId) {
          const lead = await getLeadOrThrow(tx, ctx, note.leadId);
          customerId = lead.customerId;
        }
        if (note.dealId) {
          const deal = await getDealOrThrow(tx, ctx, note.dealId);
          customerId = deal.customerId;
        }

        await touchLinkedRecords(
          tx,
          {
            customerId,
            leadId: note.leadId,
            dealId: note.dealId,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: note.tenantId,
          customerId,
          leadId: note.leadId,
          dealId: note.dealId,
          ownerName: note.writerName ?? ctx.session.user.name ?? "Unknown",
          title: "Note removed",
          description: note.title,
          type: CrmActivityType.NOTE,
          happenedAt: touchedAt,
        });

        return updated;
      });
    }),

  createAttachment: protectedProcedure
    .input(attachmentInputSchema)
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "create");
      ensureSingleSubject(input);

      const leadId = trimToNull(input.leadId);
      const dealId = trimToNull(input.dealId);
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        const lead = leadId ? await getLeadOrThrow(tx, ctx, leadId) : null;
        const deal = dealId ? await getDealOrThrow(tx, ctx, dealId) : null;

        const attachment = await tx.crmRecordAttachment.create({
          data: {
            tenantId: getTenantScope(ctx).tenantId,
            leadId,
            dealId,
            filename: sanitizeFilename(input.originalName),
            originalName: input.originalName.trim(),
            mimeType: input.mimeType.trim(),
            fileSize: input.fileSize,
            storageUrl: input.storageUrl,
            storageProvider: "inline",
          },
        });

        await touchLinkedRecords(
          tx,
          {
            customerId: lead?.customerId ?? deal?.customerId ?? null,
            leadId,
            dealId,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: attachment.tenantId,
          customerId: lead?.customerId ?? deal?.customerId ?? null,
          leadId,
          dealId,
          ownerName: ctx.session.user.name ?? ctx.session.user.email ?? "Unknown",
          title: "Attachment added",
          description: attachment.originalName,
          type: CrmActivityType.ATTACHMENT,
          happenedAt: touchedAt,
        });

        return attachment;
      });
    }),

  deleteAttachment: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      requireCrmAccess(ctx, "delete");

      const attachment = await getAttachmentOrThrow(ctx.db, ctx, input.id);
      const touchedAt = new Date();

      return ctx.db.$transaction(async (tx) => {
        const updated = await tx.crmRecordAttachment.update({
          where: { id: input.id },
          data: {
            deletedAt: touchedAt,
          },
        });

        let customerId: string | null = null;
        if (attachment.leadId) {
          const lead = await getLeadOrThrow(tx, ctx, attachment.leadId);
          customerId = lead.customerId;
        }
        if (attachment.dealId) {
          const deal = await getDealOrThrow(tx, ctx, attachment.dealId);
          customerId = deal.customerId;
        }

        await touchLinkedRecords(
          tx,
          {
            customerId,
            leadId: attachment.leadId,
            dealId: attachment.dealId,
          },
          touchedAt,
        );
        await createActivity(tx, {
          tenantId: attachment.tenantId,
          customerId,
          leadId: attachment.leadId,
          dealId: attachment.dealId,
          ownerName: ctx.session.user.name ?? ctx.session.user.email ?? "Unknown",
          title: "Attachment removed",
          description: attachment.originalName,
          type: CrmActivityType.ATTACHMENT,
          happenedAt: touchedAt,
        });

        return updated;
      });
    }),
});
