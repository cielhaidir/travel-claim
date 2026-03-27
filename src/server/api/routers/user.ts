import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  MembershipStatus,
  Role,
  type PrismaClient,
  type Prisma,
} from "../../../../generated/prisma";
import bcrypt from "bcryptjs";

import {
  createTRPCRouter,
  protectedProcedure,
  permissionProcedure,
} from "@/server/api/trpc";
import {
  ensureTenantRoleCatalog,
  getTenantSystemRoleId,
} from "@/server/auth/permission-store";
import { userHasPermission } from "@/lib/auth/role-check";

// Role precedence for deriving primary role from a set of roles
const ROLE_PRECEDENCE_ORDER = [
  Role.ROOT,
  Role.ADMIN,
  Role.FINANCE,
  Role.DIRECTOR,
  Role.MANAGER,
  Role.SALES_CHIEF,
  Role.SUPERVISOR,
  Role.SALES_EMPLOYEE,
  Role.EMPLOYEE,
] as const;

function derivePrimary(roles: Role[]): Role {
  for (const r of ROLE_PRECEDENCE_ORDER) {
    if (roles.includes(r)) return r;
  }
  return Role.EMPLOYEE;
}

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

function withTenantMembershipFilter(
  ctx: unknown,
  where: Prisma.UserWhereInput,
): Prisma.UserWhereInput {
  const { tenantId, isRoot } = getTenantScope(ctx);
  if (isRoot || !tenantId) return where;
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

function buildCurrentUserLookup(input: {
  id: string;
  email?: string | null;
}): Prisma.UserWhereInput {
  const orConditions: Prisma.UserWhereInput[] = [{ id: input.id }];

  if (input.email) {
    orConditions.push({ email: input.email });
  }

  return {
    deletedAt: null,
    OR: orConditions,
  };
}

const tenantMembershipInput = z.object({
  tenantId: z.string(),
  role: z.nativeEnum(Role),
  customRoleId: z.string().optional().nullable(),
  status: z.nativeEnum(MembershipStatus).default(MembershipStatus.ACTIVE),
  isDefault: z.boolean().default(false),
});

type TenantMembershipInput = z.infer<typeof tenantMembershipInput>;

function normalizeTenantMemberships(input: {
  requested?: TenantMembershipInput[];
  currentTenantId: string | null;
  isRoot: boolean;
  fallbackRole: Role;
}): TenantMembershipInput[] {
  const baseMemberships =
    input.requested && input.requested.length > 0
      ? input.requested.map((membership) => ({ ...membership }))
      : input.currentTenantId
        ? [
            {
              tenantId: input.currentTenantId,
              role: input.fallbackRole,
              status: MembershipStatus.ACTIVE,
              isDefault: true,
            },
          ]
        : [];

  if (baseMemberships.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "At least one tenant access entry is required",
    });
  }

  const seenTenantIds = new Set<string>();
  const normalized = baseMemberships.map((membership, index) => {
    if (!input.isRoot && membership.tenantId !== input.currentTenantId) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "You can only manage access for the active tenant",
      });
    }

    if (seenTenantIds.has(membership.tenantId)) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Duplicate tenant access entries are not allowed",
      });
    }
    seenTenantIds.add(membership.tenantId);

    return {
      ...membership,
      customRoleId: membership.customRoleId ?? null,
      isDefault: membership.isDefault,
      status: membership.status ?? MembershipStatus.ACTIVE,
      role: membership.role,
      tenantId: membership.tenantId,
      _index: index,
    };
  });

  const hasDefault = normalized.some((membership) => membership.isDefault);
  const withDefault = normalized.map((membership, index) => ({
    tenantId: membership.tenantId,
    role: membership.role,
    customRoleId: membership.customRoleId,
    status: membership.status,
    isDefault: hasDefault ? membership.isDefault : index === 0,
  }));

  const defaultCount = withDefault.filter(
    (membership) => membership.isDefault,
  ).length;
  if (defaultCount > 1) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Only one tenant can be marked as default",
    });
  }

  return withDefault;
}

async function resolveCustomRolesForMemberships(
  db: PrismaClient,
  memberships: TenantMembershipInput[],
): Promise<TenantMembershipInput[]> {
  const tenantIds = [...new Set(memberships.map((membership) => membership.tenantId))];
  for (const tenantId of tenantIds) {
    await ensureTenantRoleCatalog(db, tenantId);
  }

  const customRoleIds = [
    ...new Set(
      memberships
        .map((membership) => membership.customRoleId)
        .filter((value): value is string => !!value),
    ),
  ];

  if (customRoleIds.length === 0) {
    const resolvedMemberships: TenantMembershipInput[] = [];

    for (const membership of memberships) {
      const systemRoleId = await getTenantSystemRoleId(
        db,
        membership.tenantId,
        membership.role,
      );

      resolvedMemberships.push({
        ...membership,
        customRoleId: systemRoleId ?? null,
      });
    }

    return resolvedMemberships;
  }

  const customRoles = await db.tenantCustomRole.findMany({
    where: {
      id: { in: customRoleIds },
    },
    select: {
      id: true,
      tenantId: true,
      baseRole: true,
      isArchived: true,
    },
  });

  const customRoleById = new Map(customRoles.map((role) => [role.id, role]));

  const resolvedMemberships: TenantMembershipInput[] = [];

  for (const membership of memberships) {
    if (!membership.customRoleId) {
      const systemRoleId = await getTenantSystemRoleId(
        db,
        membership.tenantId,
        membership.role,
      );

      resolvedMemberships.push({
        ...membership,
        customRoleId: systemRoleId ?? null,
      });
      continue;
    }

    const customRole = customRoleById.get(membership.customRoleId);
    if (customRole?.tenantId !== membership.tenantId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Invalid custom role selection",
      });
    }

    if (customRole.isArchived) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Archived custom roles cannot be assigned",
      });
    }

    resolvedMemberships.push({
      ...membership,
      role: customRole.baseRole ?? membership.role,
      customRoleId: customRole.id,
    });
  }

  return resolvedMemberships;
}

function resolvePrimaryMembership(memberships: TenantMembershipInput[]) {
  return (
    memberships.find(
      (membership) =>
        membership.status === MembershipStatus.ACTIVE && membership.isDefault,
    ) ??
    memberships.find(
      (membership) => membership.status === MembershipStatus.ACTIVE,
    ) ??
    memberships[0] ??
    null
  );
}

function buildUserRoleRows(memberships: TenantMembershipInput[]) {
  const primaryMembership = resolvePrimaryMembership(memberships);
  if (!primaryMembership) {
    return [];
  }

  return [
    {
      role: primaryMembership.role,
      tenantId: primaryMembership.tenantId,
    },
  ];
}

function derivePrimaryFromMemberships(
  memberships: TenantMembershipInput[],
): Role {
  return resolvePrimaryMembership(memberships)?.role ?? Role.EMPLOYEE;
}

async function assertTenantRecordsExist(
  db: PrismaClient,
  tenantIds: string[],
): Promise<void> {
  const existing = await db.tenant.count({
    where: {
      id: { in: tenantIds },
      deletedAt: null,
    },
  });

  if (existing !== tenantIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more tenant access entries are invalid",
    });
  }
}

function membershipTimestamps(status: MembershipStatus) {
  return {
    invitedAt: status === MembershipStatus.INVITED ? new Date() : null,
    activatedAt: status === MembershipStatus.ACTIVE ? new Date() : null,
    suspendedAt: status === MembershipStatus.SUSPENDED ? new Date() : null,
  };
}

export const userRouter = createTRPCRouter({
  // Get current user profile
  getMe: permissionProcedure("profile", "read")
    .meta({
      openapi: {
        method: "GET",
        path: "/users/me",
        protect: true,
        tags: ["Users"],
        summary: "Get current user profile",
      },
    })
    .input(z.void())
    .output(z.any())
    .query(async ({ ctx }) => {
      const user = await ctx.db.user.findFirst({
        where: buildCurrentUserLookup({
          id: ctx.session.user.id,
          email: ctx.session.user.email,
        }),
        include: {
          department: true,
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          directReports: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              employeeId: true,
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return user;
    }),

  // Get active users (lightweight, for participant pickers - accessible to all logged-in users)
  getActiveUsers: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/active",
        protect: true,
        tags: ["Users"],
        summary: "Get list of active users for participant selection",
      },
    })
    .input(
      z.object({
        search: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const users = await ctx.db.user.findMany({
        where: withTenantMembershipFilter(ctx, {
          deletedAt: null,
          ...(input.search
            ? {
                OR: [
                  { name: { contains: input.search, mode: "insensitive" } },
                  { email: { contains: input.search, mode: "insensitive" } },
                  {
                    employeeId: { contains: input.search, mode: "insensitive" },
                  },
                ],
              }
            : {}),
        }),
        select: {
          id: true,
          name: true,
          email: true,
          employeeId: true,
          role: true,
          department: {
            select: {
              id: true,
              name: true,
            },
          },
        },
        orderBy: { name: "asc" },
        take: 100,
      });

      return users;
    }),

  // Get user by phone number (dedicated MCP tool)
  getByPhone: permissionProcedure("users", "read")
    .meta({
      openapi: {
        method: "GET",
        path: "/users/by-phone",
        protect: true,
        tags: ["Users"],
        summary: "Get user by phone number",
      },
      mcp: {
        enabled: true,
        name: "get_user_by_phone",
        description: "Get user information by phone number",
      },
    })
    .input(
      z.object({
        search: z.string().min(1),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, {
          deletedAt: null,
          phoneNumber: { contains: input.search, mode: "insensitive" },
        }),
        select: {
          id: true,
          name: true,
          email: true,
          emailVerified: true,
          image: true,
          employeeId: true,
          role: true,
          departmentId: true,
          supervisorId: true,
          phoneNumber: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          _count: {
            select: {
              directReports: true,
              travelRequests: true,
              claims: true,
            },
          },
        },
      });

      return { user };
    }),

  // Get all users with filters
  getAll: permissionProcedure("users", "read")
    .meta({
      openapi: {
        method: "GET",
        path: "/users",
        protect: true,
        tags: ["Users"],
        summary: "Get all users",
      },
    })
    .input(
      z.object({
        role: z.nativeEnum(Role).optional(),
        departmentId: z.string().optional(),
        includeDeleted: z.boolean().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(100).optional(),
        cursor: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const where: Prisma.UserWhereInput = {
        deletedAt: input?.includeDeleted ? undefined : null,
      };

      if (input?.role) {
        const tenantScope = getTenantScope(ctx);
        where.memberships = {
          some: {
            role: input.role,
            status: MembershipStatus.ACTIVE,
            ...(!tenantScope.isRoot && tenantScope.tenantId
              ? { tenantId: tenantScope.tenantId }
              : {}),
          },
        };
      }

      if (input?.departmentId) {
        where.departmentId = input.departmentId;
      }

      if (input?.search) {
        where.OR = [
          { name: { contains: input.search, mode: "insensitive" } },
          { email: { contains: input.search, mode: "insensitive" } },
          { employeeId: { contains: input.search, mode: "insensitive" } },
          { phoneNumber: { contains: input.search, mode: "insensitive" } },
        ];
      }

      const users = await ctx.db.user.findMany({
        take: input?.limit ? input.limit + 1 : 51,
        cursor: input?.cursor ? { id: input.cursor } : undefined,
        where: withTenantMembershipFilter(ctx, where),
        include: {
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          userRoles: {
            select: { role: true },
          },
          memberships: {
            include: {
              customRole: {
                select: {
                  id: true,
                  displayName: true,
                  baseRole: true,
                },
              },
              tenant: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  isRoot: true,
                },
              },
            },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
          },
          _count: {
            select: {
              directReports: true,
              travelRequests: true,
              claims: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });

      let nextCursor: string | undefined = undefined;
      const limit = input?.limit ?? 50;
      if (users.length > limit) {
        const nextItem = users.pop();
        nextCursor = nextItem!.id;
      }

      return {
        users,
        nextCursor,
      };
    }),

  // Get user by ID
  getById: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/{id}",
        protect: true,
        tags: ["Users"],
        summary: "Get user by ID",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id: input.id }),
        include: {
          department: true,
          supervisor: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
            },
          },
          directReports: {
            where: { deletedAt: null },
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              employeeId: true,
            },
          },
          _count: {
            select: {
              travelRequests: true,
              claims: true,
              approvals: true,
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Only allow viewing own profile or if user is manager/admin
      const isOwn = user.id === ctx.session.user.id;
      const canView = userHasPermission(ctx.session.user, "users", "read");

      if (!isOwn && !canView) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized to view this user",
        });
      }

      return user;
    }),

  // Get direct reports
  getDirectReports: protectedProcedure
    .meta({
      openapi: {
        method: "GET",
        path: "/users/direct-reports",
        protect: true,
        tags: ["Users"],
        summary: "Get direct reports",
      },
    })
    .input(z.void())
    .output(z.any())
    .query(async ({ ctx }) => {
      return ctx.db.user.findMany({
        where: withTenantMembershipFilter(ctx, {
          supervisorId: ctx.session.user.id,
          deletedAt: null,
        }),
        include: {
          department: true,
          _count: {
            select: {
              directReports: true,
              travelRequests: true,
              claims: true,
            },
          },
        },
        orderBy: {
          name: "asc",
        },
      });
    }),

  // Get organizational hierarchy
  getHierarchy: permissionProcedure("users", "read")
    .meta({
      openapi: {
        method: "GET",
        path: "/users/hierarchy",
        protect: true,
        tags: ["Users"],
        summary: "Get organizational hierarchy",
      },
    })
    .input(
      z.object({
        userId: z.string().optional(),
      }),
    )
    .output(z.any())
    .query(async ({ ctx, input }) => {
      const rootUserId = input?.userId ?? ctx.session.user.id;

      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id: rootUserId }),
        include: {
          department: true,
          directReports: {
            where: { deletedAt: null },
            include: {
              department: true,
              directReports: {
                where: { deletedAt: null },
                include: {
                  department: true,
                },
              },
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return user;
    }),

  // Create user
  create: permissionProcedure("users", "create")
    .meta({
      openapi: {
        method: "POST",
        path: "/users",
        protect: true,
        tags: ["Users"],
        summary: "Create user",
      },
    })
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(8),
        employeeId: z.string().optional(),
        role: z.nativeEnum(Role).optional(),
        roles: z.array(z.nativeEnum(Role)).min(1).optional(),
        tenantMemberships: z.array(tenantMembershipInput).min(1).optional(),
        departmentId: z.string().optional(),
        supervisorId: z.string().optional(),
        phoneNumber: z.string().optional(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      // Check if email already exists
      const existing = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { email: input.email }),
      });

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Email already exists",
        });
      }

      // Check if employeeId already exists
      if (input.employeeId) {
        const existingEmployee = await ctx.db.user.findUnique({
          where: { employeeId: input.employeeId },
        });

        if (existingEmployee) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Employee ID already exists",
          });
        }
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(input.password, 10);

      // Resolve roles
      const allRoles =
        input.roles && input.roles.length > 0
          ? input.roles
          : [input.role ?? Role.EMPLOYEE];
      const tenantScope = getTenantScope(ctx);
      const tenantMemberships = normalizeTenantMemberships({
        requested: input.tenantMemberships,
        currentTenantId: tenantScope.tenantId,
        isRoot: tenantScope.isRoot,
        fallbackRole: derivePrimary(allRoles),
      });
      await assertTenantRecordsExist(
        ctx.db,
        tenantMemberships.map((membership) => membership.tenantId),
      );
      const resolvedMemberships = await resolveCustomRolesForMemberships(
        ctx.db,
        tenantMemberships,
      );
      const primaryRole = derivePrimaryFromMemberships(resolvedMemberships);
      const userRoleRows = buildUserRoleRows(resolvedMemberships);

      return ctx.db.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: hashedPassword,
          employeeId: input.employeeId,
          role: primaryRole,
          departmentId: input.departmentId,
          supervisorId: input.supervisorId,
          phoneNumber: input.phoneNumber,
          userRoles: {
            create: userRoleRows,
          },
          memberships: {
            create: resolvedMemberships.map((membership) => ({
              tenantId: membership.tenantId,
              role: membership.role,
              customRoleId: membership.customRoleId,
              status: membership.status,
              isDefault: membership.isDefault,
              ...membershipTimestamps(membership.status),
            })),
          },
        },
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
      });
    }),

  // Update user
  update: permissionProcedure("users", "update")
    .meta({
      openapi: {
        method: "PUT",
        path: "/users/{id}",
        protect: true,
        tags: ["Users"],
        summary: "Update user",
      },
    })
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        email: z.string().email().optional(),
        employeeId: z.string().optional(),
        role: z.nativeEnum(Role).optional(),
        roles: z.array(z.nativeEnum(Role)).min(1).optional(),
        tenantMemberships: z.array(tenantMembershipInput).min(1).optional(),
        departmentId: z.string().optional().nullable(),
        supervisorId: z.string().optional().nullable(),
        phoneNumber: z.string().optional().nullable(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const {
        id,
        roles: inputRoles,
        tenantMemberships: inputTenantMemberships,
        ...updateData
      } = input;

      // Check if user exists
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id }),
        include: {
          memberships: {
            select: {
              tenantId: true,
              role: true,
              customRoleId: true,
              status: true,
              isDefault: true,
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Check email uniqueness
      if (input.email && input.email !== user.email) {
        const existing = await ctx.db.user.findUnique({
          where: { email: input.email },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Email already exists",
          });
        }
      }

      // Check employeeId uniqueness
      if (input.employeeId && input.employeeId !== user.employeeId) {
        const existing = await ctx.db.user.findUnique({
          where: { employeeId: input.employeeId },
        });
        if (existing) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Employee ID already exists",
          });
        }
      }

      // Prevent circular supervisor references
      if (input.supervisorId) {
        if (input.supervisorId === id) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "User cannot be their own supervisor",
          });
        }

        const isCircular = await checkCircularSupervisor(
          ctx.db,
          id,
          input.supervisorId,
        );
        if (isCircular) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Circular supervisor reference detected",
          });
        }
      }

      const tenantScope = getTenantScope(ctx);
      const fallbackRole =
        inputRoles && inputRoles.length > 0
          ? derivePrimary(inputRoles)
          : user.role;

      const nextMemberships = normalizeTenantMemberships({
        requested: inputTenantMemberships,
        currentTenantId: tenantScope.tenantId,
        isRoot: tenantScope.isRoot,
        fallbackRole,
      });
      await assertTenantRecordsExist(
        ctx.db,
        nextMemberships.map((membership) => membership.tenantId),
      );
      const resolvedMemberships = await resolveCustomRolesForMemberships(
        ctx.db,
        nextMemberships,
      );
      updateData.role = derivePrimaryFromMemberships(resolvedMemberships);

      return ctx.db.$transaction(async (tx) => {
        await tx.tenantMembership.deleteMany({
          where: { userId: id },
        });

        await tx.tenantMembership.createMany({
          data: resolvedMemberships.map((membership) => ({
            userId: id,
            tenantId: membership.tenantId,
            role: membership.role,
            customRoleId: membership.customRoleId,
            status: membership.status,
            isDefault: membership.isDefault,
            ...membershipTimestamps(membership.status),
          })),
        });

        await tx.userRole.deleteMany({
          where: { userId: id },
        });

        const userRoleRows = buildUserRoleRows(resolvedMemberships);
        if (userRoleRows.length > 0) {
          await tx.userRole.createMany({
            data: userRoleRows.map((row) => ({
              userId: id,
              role: row.role,
              tenantId: row.tenantId,
            })),
          });
        }

        return tx.user.update({
          where: { id },
          data: updateData,
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
        });
      });
    }),

  // Update own profile
  updateMe: permissionProcedure("profile", "update")
    .meta({
      openapi: {
        method: "PATCH",
        path: "/users/me",
        protect: true,
        tags: ["Users"],
        summary: "Update own profile",
      },
    })
    .input(
      z.object({
        name: z.string().trim().min(1).optional(),
        phoneNumber: z.string().trim().optional().nullable(),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const nextPhoneNumber =
        input.phoneNumber === undefined
          ? undefined
          : input.phoneNumber === ""
            ? null
            : input.phoneNumber;

      const currentUser = await ctx.db.user.findFirst({
        where: buildCurrentUserLookup({
          id: ctx.session.user.id,
          email: ctx.session.user.email,
        }),
        select: { id: true },
      });

      if (!currentUser) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return ctx.db.user.update({
        where: { id: currentUser.id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(nextPhoneNumber !== undefined
            ? { phoneNumber: nextPhoneNumber }
            : {}),
        },
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
      });
    }),

  // Change password
  changePassword: permissionProcedure("profile", "update")
    .meta({
      openapi: {
        method: "POST",
        path: "/users/change-password",
        protect: true,
        tags: ["Users"],
        summary: "Change password",
      },
    })
    .input(
      z.object({
        currentPassword: z.string(),
        newPassword: z.string().min(8),
      }),
    )
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: buildCurrentUserLookup({
          id: ctx.session.user.id,
          email: ctx.session.user.email,
        }),
        select: { id: true, password: true },
      });

      if (!user?.password) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User has no password set",
        });
      }

      // Verify current password
      const isValid = await bcrypt.compare(
        input.currentPassword,
        user.password,
      );
      if (!isValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Current password is incorrect",
        });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(input.newPassword, 10);

      await ctx.db.user.update({
        where: { id: user.id },
        data: { password: hashedPassword },
      });

      return { success: true };
    }),

  // Admin reset password
  resetPassword: permissionProcedure("users", "update")
    .input(z.object({ id: z.string(), newPassword: z.string().min(8) }))
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id: input.id }),
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      const hashedPassword = await bcrypt.hash(input.newPassword, 10);
      await ctx.db.user.update({
        where: { id: input.id },
        data: { password: hashedPassword },
      });
      return { success: true };
    }),

  // Soft delete user
  delete: permissionProcedure("users", "delete")
    .meta({
      openapi: {
        method: "DELETE",
        path: "/users/{id}",
        protect: true,
        tags: ["Users"],
        summary: "Delete user",
      },
    })
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id: input.id }),
        include: {
          directReports: {
            where: { deletedAt: null },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Check if user has active direct reports
      if (user.directReports.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete user with active direct reports",
        });
      }

      return ctx.db.user.update({
        where: { id: input.id },
        data: {
          deletedAt: new Date(),
        },
      });
    }),

  // Restore deleted user
  restore: permissionProcedure("users", "update")
    .input(z.object({ id: z.string() }))
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findFirst({
        where: withTenantMembershipFilter(ctx, { id: input.id }),
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      if (!user.deletedAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "User is not deleted",
        });
      }

      return ctx.db.user.update({
        where: { id: input.id },
        data: {
          deletedAt: null,
        },
      });
    }),

  // Bulk import users from Excel/CSV (only userType = member)
  bulkImport: permissionProcedure("users", "import")
    .input(
      z.object({
        users: z.array(
          z.object({
            id: z.string().optional(),
            displayName: z.string().min(1),
            userPrincipalName: z.string().email(),
          }),
        ),
        defaultPassword: z.string().min(8),
      }),
    )
    .output(z.any())
    .mutation(async ({ ctx, input }) => {
      const results: {
        email: string;
        status: "created" | "skipped";
        reason?: string;
      }[] = [];

      for (const row of input.users) {
        const email = row.userPrincipalName.toLowerCase().trim();

        // Check if email already exists
        const existing = await ctx.db.user.findFirst({
          where: withTenantMembershipFilter(ctx, { email }),
        });

        if (existing) {
          results.push({
            email,
            status: "skipped",
            reason: "Email already exists",
          });
          continue;
        }

        const hashedPassword = await bcrypt.hash(input.defaultPassword, 10);

        const tenantId = getTenantScope(ctx).tenantId;
        if (tenantId) {
          await ensureTenantRoleCatalog(ctx.db, tenantId);
        }
        const employeeRoleId = tenantId
          ? await getTenantSystemRoleId(ctx.db, tenantId, Role.EMPLOYEE)
          : null;
        await ctx.db.user.create({
          data: {
            name: row.displayName.trim(),
            email,
            password: hashedPassword,
            role: Role.EMPLOYEE,
            memberships: tenantId
              ? {
                  create: [
                    {
                      tenantId,
                      role: Role.EMPLOYEE,
                      customRoleId: employeeRoleId,
                      status: MembershipStatus.ACTIVE,
                      isDefault: true,
                      activatedAt: new Date(),
                    },
                  ],
                }
              : undefined,
            userRoles: tenantId
              ? {
                  create: [{ role: Role.EMPLOYEE, tenantId }],
                }
              : undefined,
          },
        });

        results.push({ email, status: "created" });
      }

      const created = results.filter((r) => r.status === "created").length;
      const skipped = results.filter((r) => r.status === "skipped").length;

      return { results, created, skipped, total: input.users.length };
    }),
});

// Helper function to check circular supervisor references
async function checkCircularSupervisor(
  db: PrismaClient,
  userId: string,
  supervisorId: string,
): Promise<boolean> {
  const supervisor = await db.user.findUnique({
    where: { id: supervisorId },
    select: { supervisorId: true },
  });

  if (!supervisor?.supervisorId) {
    return false;
  }

  if (supervisor.supervisorId === userId) {
    return true;
  }

  return checkCircularSupervisor(db, userId, supervisor.supervisorId);
}
