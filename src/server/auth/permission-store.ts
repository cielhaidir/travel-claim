import {
  ROLES,
  ROLE_LABELS as DEFAULT_ROLE_LABELS,
  type Role,
} from "@/lib/constants/roles";
import {
  DEFAULT_ROLE_PERMISSION_PRESETS,
  FULL_ACCESS_PERMISSIONS,
  mergePermissionMaps,
  sanitizePermissionMap,
  type PermissionMap,
} from "@/lib/auth/permissions";

type PermissionDbClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
};

type RolePermissionRow = {
  id: string;
  role: Role;
  displayName: string | null;
  isArchived: boolean;
  permissions: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type RoleMembershipCountRow = {
  role: Role;
  membershipCount: number;
  activeMembershipCount: number;
};

type TenantSummary = {
  id: string;
  name: string;
  slug: string;
  isRoot: boolean;
};

export type RolePermissionProfile = {
  id: string | null;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantIsRoot: boolean;
  role: Role;
  displayName: string;
  defaultDisplayName: string;
  isArchived: boolean;
  membershipCount: number;
  activeMembershipCount: number;
  permissions: PermissionMap;
  defaultPermissions: PermissionMap;
  isCustomized: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const ROLE_VALUES = Object.values(ROLES) as Role[];

function getDefaultPermissions(role: Role): PermissionMap {
  return sanitizePermissionMap(DEFAULT_ROLE_PERMISSION_PRESETS[role] ?? {});
}

function getDefaultRoleDisplayName(role: Role): string {
  return DEFAULT_ROLE_LABELS[role] ?? role;
}

function normalizeRoleDisplayName(role: Role, displayName?: string | null) {
  const normalized = displayName?.trim() ?? "";
  if (!normalized) {
    return null;
  }

  return normalized === getDefaultRoleDisplayName(role) ? null : normalized;
}

export function isRolePermissionTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  return (
    message.includes('relation "RolePermission" does not exist') ||
    message.includes("RolePermission") &&
      (message.includes("does not exist") || message.includes("not found"))
  );
}

async function getTenantSummary(
  db: PermissionDbClient,
  tenantId: string,
): Promise<TenantSummary | null> {
  const rows = await db.$queryRawUnsafe<TenantSummary[]>(
    `
      SELECT
        t."id" as "id",
        t."name" as "name",
        t."slug" as "slug",
        t."isRoot" as "isRoot"
      FROM "Tenant" t
      WHERE t."id" = $1
        AND t."deletedAt" IS NULL
      LIMIT 1
    `,
    tenantId,
  );

  return rows[0] ?? null;
}

export async function listTenantRolePermissionProfiles(
  db: PermissionDbClient,
  tenantId: string,
): Promise<RolePermissionProfile[]> {
  const tenant = await getTenantSummary(db, tenantId);
  if (!tenant) {
    return [];
  }

  try {
    const rows = await db.$queryRawUnsafe<RolePermissionRow[]>(
      `
        SELECT
          rp."id" as "id",
          rp."role"::text as "role",
          rp."displayName" as "displayName",
          rp."isArchived" as "isArchived",
          rp."permissions" as "permissions",
          rp."createdAt" as "createdAt",
          rp."updatedAt" as "updatedAt"
        FROM "RolePermission" rp
        WHERE rp."tenantId" = $1
      `,
      tenantId,
    );

    const membershipCounts = await db.$queryRawUnsafe<RoleMembershipCountRow[]>(
      `
        SELECT
          tm."role"::text as "role",
          COUNT(*)::int as "membershipCount",
          COUNT(*) FILTER (
            WHERE tm."status" = 'ACTIVE'::"MembershipStatus"
          )::int as "activeMembershipCount"
        FROM "TenantMembership" tm
        WHERE tm."tenantId" = $1
        GROUP BY tm."role"
      `,
      tenantId,
    );

    const rowByRole = new Map(rows.map((row) => [row.role, row]));
    const countsByRole = new Map(
      membershipCounts.map((row) => [row.role, row]),
    );

    return ROLE_VALUES.map((role) => {
      const row = rowByRole.get(role);
      const defaultPermissions = getDefaultPermissions(role);
      const storedPermissions = row
        ? sanitizePermissionMap(row.permissions)
        : defaultPermissions;
      const membershipCountsForRole = countsByRole.get(role);
      const displayName = row?.displayName ?? getDefaultRoleDisplayName(role);
      const isCustomized =
        !!row &&
        (JSON.stringify(storedPermissions) !==
          JSON.stringify(defaultPermissions) ||
          displayName !== getDefaultRoleDisplayName(role) ||
          row.isArchived);

      return {
        id: row?.id ?? null,
        tenantId: tenant.id,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        tenantIsRoot: tenant.isRoot,
        role,
        displayName,
        defaultDisplayName: getDefaultRoleDisplayName(role),
        isArchived: row?.isArchived ?? false,
        membershipCount: membershipCountsForRole?.membershipCount ?? 0,
        activeMembershipCount:
          membershipCountsForRole?.activeMembershipCount ?? 0,
        permissions: storedPermissions,
        defaultPermissions,
        isCustomized,
        createdAt: row?.createdAt ?? null,
        updatedAt: row?.updatedAt ?? null,
      };
    });
  } catch (error) {
    if (!isRolePermissionTableMissing(error)) {
      throw error;
    }

    return ROLE_VALUES.map((role) => ({
      id: null,
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      tenantIsRoot: tenant.isRoot,
      role,
      displayName: getDefaultRoleDisplayName(role),
      defaultDisplayName: getDefaultRoleDisplayName(role),
      isArchived: false,
      membershipCount: 0,
      activeMembershipCount: 0,
      permissions: getDefaultPermissions(role),
      defaultPermissions: getDefaultPermissions(role),
      isCustomized: false,
      createdAt: null,
      updatedAt: null,
    }));
  }
}

export async function resolveEffectivePermissions(
  db: PermissionDbClient,
  input: {
    tenantId: string | null;
    roles: Role[];
    isRoot?: boolean;
  },
): Promise<PermissionMap> {
  if (input.isRoot || input.roles.includes(ROLES.ROOT)) {
    return FULL_ACCESS_PERMISSIONS;
  }

  if (!input.tenantId || input.roles.length === 0) {
    return mergePermissionMaps(
      ...input.roles.map((role) => getDefaultPermissions(role)),
    );
  }

  try {
    const rows = await db.$queryRawUnsafe<
      Array<{ role: Role; permissions: unknown }>
    >(
      `
        SELECT
          rp."role"::text as "role",
          rp."permissions" as "permissions"
        FROM "RolePermission" rp
        WHERE rp."tenantId" = $1
          AND rp."role"::text = ANY($2)
          AND COALESCE(rp."isArchived", false) = false
      `,
      input.tenantId,
      input.roles,
    );

    const storedPermissions = new Map<Role, PermissionMap>(
      rows.map((row) => [row.role, sanitizePermissionMap(row.permissions)]),
    );

    return mergePermissionMaps(
      ...input.roles.map(
        (role) => storedPermissions.get(role) ?? getDefaultPermissions(role),
      ),
    );
  } catch (error) {
    if (!isRolePermissionTableMissing(error)) {
      throw error;
    }

    return mergePermissionMaps(
      ...input.roles.map((role) => getDefaultPermissions(role)),
    );
  }
}

export async function upsertTenantRolePermissionProfile(
  db: PermissionDbClient,
  input: {
    tenantId: string;
    role: Role;
    permissions: PermissionMap;
  },
): Promise<void> {
  const permissions = sanitizePermissionMap(input.permissions);

  await db.$executeRawUnsafe(
    `
      INSERT INTO "RolePermission" (
        "id",
        "tenantId",
        "role",
        "permissions",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        md5(random()::text || clock_timestamp()::text),
        $1,
        $2::"Role",
        $3::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT ("tenantId", "role") DO UPDATE
      SET
        "permissions" = EXCLUDED."permissions",
        "updatedAt" = NOW()
    `,
    input.tenantId,
    input.role,
    JSON.stringify(permissions),
  );
}

export async function resetTenantRolePermissionProfile(
  db: PermissionDbClient,
  input: {
    tenantId: string;
    role: Role;
  },
): Promise<void> {
  const rows = await db.$queryRawUnsafe<
    Array<{ id: string; displayName: string | null; isArchived: boolean }>
  >(
    `
      SELECT
        rp."id" as "id",
        rp."displayName" as "displayName",
        rp."isArchived" as "isArchived"
      FROM "RolePermission" rp
      WHERE rp."tenantId" = $1
        AND rp."role" = $2::"Role"
      LIMIT 1
    `,
    input.tenantId,
    input.role,
  );

  const existing = rows[0];
  if (!existing) {
    return;
  }

  if (!existing.displayName && !existing.isArchived) {
    await db.$executeRawUnsafe(
      `
        DELETE FROM "RolePermission"
        WHERE "tenantId" = $1
          AND "role" = $2::"Role"
      `,
      input.tenantId,
      input.role,
    );
    return;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "RolePermission"
      SET
        "permissions" = $3::jsonb,
        "updatedAt" = NOW()
      WHERE "tenantId" = $1
        AND "role" = $2::"Role"
    `,
    input.tenantId,
    input.role,
    JSON.stringify(getDefaultPermissions(input.role)),
  );
}

export async function updateTenantRoleDisplayName(
  db: PermissionDbClient,
  input: {
    tenantId: string;
    role: Role;
    displayName: string | null;
  },
): Promise<void> {
  const defaultPermissions = getDefaultPermissions(input.role);
  const normalizedDisplayName = normalizeRoleDisplayName(
    input.role,
    input.displayName,
  );

  await db.$executeRawUnsafe(
    `
      INSERT INTO "RolePermission" (
        "id",
        "tenantId",
        "role",
        "displayName",
        "permissions",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        md5(random()::text || clock_timestamp()::text),
        $1,
        $2::"Role",
        $3,
        $4::jsonb,
        NOW(),
        NOW()
      )
      ON CONFLICT ("tenantId", "role") DO UPDATE
      SET
        "displayName" = EXCLUDED."displayName",
        "updatedAt" = NOW()
    `,
    input.tenantId,
    input.role,
    normalizedDisplayName,
    JSON.stringify(defaultPermissions),
  );
}

export async function archiveTenantRoleProfile(
  db: PermissionDbClient,
  input: {
    tenantId: string;
    role: Role;
  },
): Promise<void> {
  const defaultPermissions = getDefaultPermissions(input.role);

  await db.$executeRawUnsafe(
    `
      INSERT INTO "RolePermission" (
        "id",
        "tenantId",
        "role",
        "permissions",
        "isArchived",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        md5(random()::text || clock_timestamp()::text),
        $1,
        $2::"Role",
        $3::jsonb,
        true,
        NOW(),
        NOW()
      )
      ON CONFLICT ("tenantId", "role") DO UPDATE
      SET
        "isArchived" = true,
        "updatedAt" = NOW()
    `,
    input.tenantId,
    input.role,
    JSON.stringify(defaultPermissions),
  );
}
