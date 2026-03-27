import {
  ROLES,
  ROLE_LABELS as DEFAULT_ROLE_LABELS,
  type Role,
} from "@/lib/constants/roles";
import {
  DEFAULT_ROLE_PERMISSION_PRESETS,
  FULL_ACCESS_PERMISSIONS,
  mergeMissingPermissionModules,
  mergePermissionMaps,
  sanitizePermissionMap,
  type PermissionMap,
} from "@/lib/auth/permissions";

type PermissionDbClient = {
  $queryRawUnsafe<T = unknown>(query: string, ...values: unknown[]): Promise<T>;
  $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
};

type LegacyRolePermissionRow = {
  role: Role;
  displayName: string | null;
  isArchived: boolean;
  permissions: unknown;
};

type TenantRoleRow = {
  id: string;
  baseRole: Role | null;
  isSystem: boolean;
  slug: string;
  displayName: string;
  isArchived: boolean;
  permissions: unknown;
  defaultPermissions: unknown;
  createdAt: Date;
  updatedAt: Date;
};

type TenantRoleMembershipCountRow = {
  customRoleId: string;
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
  roleKey: string;
  roleKind: "SYSTEM" | "CUSTOM";
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  tenantIsRoot: boolean;
  role: Role | null;
  systemRole: Role | null;
  customRoleId: string | null;
  slug: string | null;
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
const NON_ROOT_SEEDED_ROLES: Role[] = [
  ROLES.ADMIN,
  ROLES.FINANCE,
  ROLES.DIRECTOR,
  ROLES.MANAGER,
  ROLES.SALES_CHIEF,
  ROLES.SUPERVISOR,
  ROLES.SALES_EMPLOYEE,
  ROLES.EMPLOYEE,
];
const ROOT_TENANT_SEEDED_ROLES: Role[] = [ROLES.ROOT];
const MINIMAL_CUSTOM_ROLE_DEFAULTS = sanitizePermissionMap({
  dashboard: ["read"],
  profile: ["read", "update"],
});

function buildSystemRoleKey(role: Role): string {
  return `system:${role}`;
}

function buildCustomRoleKey(customRoleId: string): string {
  return `custom:${customRoleId}`;
}

function buildSystemRoleSlug(role: Role): string {
  return `system-${role.toLowerCase().replace(/_/g, "-")}`;
}

function getSeededRolesForTenant(isRootTenant: boolean): Role[] {
  return isRootTenant ? ROOT_TENANT_SEEDED_ROLES : NON_ROOT_SEEDED_ROLES;
}

function normalizePermissionMap(
  value: unknown,
  fallback: PermissionMap,
): PermissionMap {
  return mergeMissingPermissionModules(value, fallback);
}

function jsonEquals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeRoleDisplayName(role: Role, displayName?: string | null) {
  const normalized = displayName?.trim() ?? "";
  return normalized || getDefaultRoleDisplayName(role);
}

export function getDefaultRolePermissions(role: Role): PermissionMap {
  return sanitizePermissionMap(DEFAULT_ROLE_PERMISSION_PRESETS[role] ?? {});
}

export function getDefaultRoleDisplayName(role: Role): string {
  return DEFAULT_ROLE_LABELS[role] ?? role;
}

export function getDefaultCustomRolePermissions(): PermissionMap {
  return MINIMAL_CUSTOM_ROLE_DEFAULTS;
}

export function normalizeCustomRoleSlug(displayName: string): string {
  return displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
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
    (message.includes("RolePermission") &&
      (message.includes("does not exist") || message.includes("not found")))
  );
}

export function isTenantCustomRoleTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";

  return (
    message.includes('relation "TenantCustomRole" does not exist') ||
    (message.includes("TenantCustomRole") &&
      (message.includes("does not exist") || message.includes("not found")))
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

async function getLegacySystemRoleRows(
  db: PermissionDbClient,
  tenantId: string,
): Promise<Map<Role, LegacyRolePermissionRow>> {
  try {
    const rows = await db.$queryRawUnsafe<LegacyRolePermissionRow[]>(
      `
        SELECT
          rp."role"::text as "role",
          rp."displayName" as "displayName",
          rp."isArchived" as "isArchived",
          rp."permissions" as "permissions"
        FROM "RolePermission" rp
        WHERE rp."tenantId" = $1
      `,
      tenantId,
    );

    return new Map(rows.map((row) => [row.role, row]));
  } catch (error) {
    if (!isRolePermissionTableMissing(error)) {
      throw error;
    }

    return new Map();
  }
}

async function getTenantRoleRows(
  db: PermissionDbClient,
  tenantId: string,
): Promise<TenantRoleRow[]> {
  return db.$queryRawUnsafe<TenantRoleRow[]>(
    `
      SELECT
        cr."id" as "id",
        cr."baseRole"::text as "baseRole",
        cr."isSystem" as "isSystem",
        cr."slug" as "slug",
        cr."displayName" as "displayName",
        cr."isArchived" as "isArchived",
        cr."permissions" as "permissions",
        cr."defaultPermissions" as "defaultPermissions",
        cr."createdAt" as "createdAt",
        cr."updatedAt" as "updatedAt"
      FROM "TenantCustomRole" cr
      WHERE cr."tenantId" = $1
    `,
    tenantId,
  );
}

async function ensureTenantRoleDefaults(
  db: PermissionDbClient,
  tenantId: string,
): Promise<void> {
  await db.$executeRawUnsafe(
    `
      UPDATE "TenantCustomRole"
      SET "defaultPermissions" = "permissions"
      WHERE "tenantId" = $1
        AND "defaultPermissions" IS NULL
    `,
    tenantId,
  );
}

async function backfillMembershipRoleBindings(
  db: PermissionDbClient,
  tenantId: string,
): Promise<void> {
  await db.$executeRawUnsafe(
    `
      UPDATE "TenantMembership" tm
      SET "customRoleId" = tr."id"
      FROM "TenantCustomRole" tr
      WHERE tm."tenantId" = $1
        AND tm."tenantId" = tr."tenantId"
        AND tm."customRoleId" IS NULL
        AND tr."isSystem" = true
        AND tr."baseRole" = tm."role"
    `,
    tenantId,
  );
}

export async function ensureTenantRoleCatalog(
  db: PermissionDbClient,
  tenantId: string,
): Promise<void> {
  const tenant = await getTenantSummary(db, tenantId);
  if (!tenant) {
    return;
  }

  await ensureTenantRoleDefaults(db, tenantId);

  const seededRoles = getSeededRolesForTenant(tenant.isRoot);
  const legacyRowsByRole = await getLegacySystemRoleRows(db, tenantId);
  const existingRows = await getTenantRoleRows(db, tenantId);
  const existingSystemRows = new Map<Role, TenantRoleRow>();

  for (const row of existingRows) {
    if (row.isSystem && row.baseRole) {
      existingSystemRows.set(row.baseRole, row);
    }
  }

  for (const role of seededRoles) {
    const defaultPermissions = getDefaultRolePermissions(role);
    const legacyRow = legacyRowsByRole.get(role);
    const existingRow = existingSystemRows.get(role);

    if (!existingRow) {
      const permissions = legacyRow
        ? normalizePermissionMap(legacyRow.permissions, defaultPermissions)
        : defaultPermissions;

      await db.$executeRawUnsafe(
        `
          INSERT INTO "TenantCustomRole" (
            "id",
            "tenantId",
            "baseRole",
            "isSystem",
            "slug",
            "displayName",
            "isArchived",
            "permissions",
            "defaultPermissions",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            md5(random()::text || clock_timestamp()::text),
            $1,
            $2::"Role",
            true,
            $3,
            $4,
            $5,
            $6::jsonb,
            $7::jsonb,
            NOW(),
            NOW()
          )
        `,
        tenantId,
        role,
        buildSystemRoleSlug(role),
        normalizeRoleDisplayName(role, legacyRow?.displayName),
        legacyRow?.isArchived ?? false,
        JSON.stringify(permissions),
        JSON.stringify(defaultPermissions),
      );
      continue;
    }

    const nextDefaultPermissions = normalizePermissionMap(
      existingRow.defaultPermissions,
      defaultPermissions,
    );
    const nextPermissions = normalizePermissionMap(
      existingRow.permissions,
      nextDefaultPermissions,
    );
    const nextDisplayName =
      existingRow.displayName?.trim() ??
      legacyRow?.displayName?.trim() ??
      getDefaultRoleDisplayName(role);
    const nextIsArchived = existingRow.isArchived ?? legacyRow?.isArchived ?? false;

    if (
      !existingRow.isSystem ||
      existingRow.baseRole !== role ||
      !jsonEquals(existingRow.defaultPermissions, nextDefaultPermissions) ||
      !jsonEquals(existingRow.permissions, nextPermissions) ||
      existingRow.displayName !== nextDisplayName ||
      existingRow.isArchived !== nextIsArchived
    ) {
      await db.$executeRawUnsafe(
        `
          UPDATE "TenantCustomRole"
          SET
            "baseRole" = $2::"Role",
            "isSystem" = true,
            "slug" = $3,
            "displayName" = $4,
            "isArchived" = $5,
            "permissions" = $6::jsonb,
            "defaultPermissions" = $7::jsonb,
            "updatedAt" = NOW()
          WHERE "id" = $1
        `,
        existingRow.id,
        role,
        buildSystemRoleSlug(role),
        nextDisplayName,
        nextIsArchived,
        JSON.stringify(nextPermissions),
        JSON.stringify(nextDefaultPermissions),
      );
    }
  }

  await backfillMembershipRoleBindings(db, tenantId);
}

async function getSystemTenantRoleRow(
  db: PermissionDbClient,
  tenantId: string,
  role: Role,
): Promise<TenantRoleRow | null> {
  await ensureTenantRoleCatalog(db, tenantId);

  const rows = await db.$queryRawUnsafe<TenantRoleRow[]>(
    `
      SELECT
        cr."id" as "id",
        cr."baseRole"::text as "baseRole",
        cr."isSystem" as "isSystem",
        cr."slug" as "slug",
        cr."displayName" as "displayName",
        cr."isArchived" as "isArchived",
        cr."permissions" as "permissions",
        cr."defaultPermissions" as "defaultPermissions",
        cr."createdAt" as "createdAt",
        cr."updatedAt" as "updatedAt"
      FROM "TenantCustomRole" cr
      WHERE cr."tenantId" = $1
        AND cr."isSystem" = true
        AND cr."baseRole" = $2::"Role"
      LIMIT 1
    `,
    tenantId,
    role,
  );

  return rows[0] ?? null;
}

export async function getTenantSystemRoleId(
  db: PermissionDbClient,
  tenantId: string,
  role: Role,
): Promise<string | null> {
  const row = await getSystemTenantRoleRow(db, tenantId, role);
  return row?.id ?? null;
}

export async function listTenantRolePermissionProfiles(
  db: PermissionDbClient,
  tenantId: string,
): Promise<RolePermissionProfile[]> {
  const tenant = await getTenantSummary(db, tenantId);
  if (!tenant) {
    return [];
  }

  await ensureTenantRoleCatalog(db, tenantId);

  const rows = await getTenantRoleRows(db, tenantId);
  const membershipCounts = await db.$queryRawUnsafe<TenantRoleMembershipCountRow[]>(
    `
      SELECT
        tm."customRoleId" as "customRoleId",
        COUNT(*)::int as "membershipCount",
        COUNT(*) FILTER (
          WHERE tm."status" = 'ACTIVE'::"MembershipStatus"
        )::int as "activeMembershipCount"
      FROM "TenantMembership" tm
      WHERE tm."tenantId" = $1
        AND tm."customRoleId" IS NOT NULL
      GROUP BY tm."customRoleId"
    `,
    tenantId,
  );
  const membershipCountsByRoleId = new Map(
    membershipCounts.map((row) => [row.customRoleId, row]),
  );

  const systemProfiles: RolePermissionProfile[] = [];
  const customProfiles: RolePermissionProfile[] = [];

  for (const row of rows) {
    const systemRole = row.isSystem ? row.baseRole : null;
    const defaultPermissions = normalizePermissionMap(
      row.defaultPermissions,
      row.baseRole
        ? getDefaultRolePermissions(row.baseRole)
        : getDefaultCustomRolePermissions(),
    );
    const permissions = normalizePermissionMap(row.permissions, defaultPermissions);
    const membershipCount = membershipCountsByRoleId.get(row.id);
    const defaultDisplayName =
      systemRole ? getDefaultRoleDisplayName(systemRole) : row.displayName;

    const profile: RolePermissionProfile = {
      id: row.id,
      roleKey: row.isSystem
        ? buildSystemRoleKey(systemRole ?? ROLES.EMPLOYEE)
        : buildCustomRoleKey(row.id),
      roleKind: row.isSystem ? "SYSTEM" : "CUSTOM",
      tenantId: tenant.id,
      tenantName: tenant.name,
      tenantSlug: tenant.slug,
      tenantIsRoot: tenant.isRoot,
      role: row.baseRole,
      systemRole,
      customRoleId: row.id,
      slug: row.slug,
      displayName: row.displayName,
      defaultDisplayName,
      isArchived: row.isArchived,
      membershipCount: membershipCount?.membershipCount ?? 0,
      activeMembershipCount: membershipCount?.activeMembershipCount ?? 0,
      permissions,
      defaultPermissions,
      isCustomized:
        !jsonEquals(permissions, defaultPermissions) ||
        row.displayName !== defaultDisplayName ||
        row.isArchived,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    if (row.isSystem) {
      systemProfiles.push(profile);
    } else {
      customProfiles.push(profile);
    }
  }

  systemProfiles.sort((left, right) => {
    const leftIndex = ROLE_VALUES.indexOf(left.systemRole ?? ROLES.EMPLOYEE);
    const rightIndex = ROLE_VALUES.indexOf(right.systemRole ?? ROLES.EMPLOYEE);
    return leftIndex - rightIndex;
  });
  customProfiles.sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );

  return [...systemProfiles, ...customProfiles];
}

export async function resolveEffectivePermissions(
  db: PermissionDbClient,
  input: {
    tenantId: string | null;
    roles: Role[];
    isRoot?: boolean;
    customRoleId?: string | null;
  },
): Promise<PermissionMap> {
  if (input.isRoot || input.roles.includes(ROLES.ROOT)) {
    return FULL_ACCESS_PERMISSIONS;
  }

  if (input.tenantId && input.customRoleId) {
    try {
      const rows = await db.$queryRawUnsafe<
        Array<{ permissions: unknown; defaultPermissions: unknown }>
      >(
        `
          SELECT
            cr."permissions" as "permissions",
            cr."defaultPermissions" as "defaultPermissions"
          FROM "TenantCustomRole" cr
          WHERE cr."tenantId" = $1
            AND cr."id" = $2
            AND COALESCE(cr."isArchived", false) = false
          LIMIT 1
        `,
        input.tenantId,
        input.customRoleId,
      );

      const activeRole = rows[0];
      if (activeRole) {
        return normalizePermissionMap(
          activeRole.permissions,
          normalizePermissionMap(
            activeRole.defaultPermissions,
            getDefaultCustomRolePermissions(),
          ),
        );
      }
    } catch (error) {
      if (!isTenantCustomRoleTableMissing(error)) {
        throw error;
      }
    }
  }

  if (!input.tenantId || input.roles.length === 0) {
    return mergePermissionMaps(
      ...input.roles.map((role) => getDefaultRolePermissions(role)),
    );
  }

  await ensureTenantRoleCatalog(db, input.tenantId);

  try {
    const rows = await db.$queryRawUnsafe<
      Array<{
        baseRole: Role;
        permissions: unknown;
        defaultPermissions: unknown;
      }>
    >(
      `
        SELECT
          cr."baseRole"::text as "baseRole",
          cr."permissions" as "permissions",
          cr."defaultPermissions" as "defaultPermissions"
        FROM "TenantCustomRole" cr
        WHERE cr."tenantId" = $1
          AND cr."isSystem" = true
          AND cr."baseRole"::text = ANY($2)
          AND COALESCE(cr."isArchived", false) = false
      `,
      input.tenantId,
      input.roles,
    );

    const permissionsByRole = new Map<Role, PermissionMap>(
      rows.map((row) => [
        row.baseRole,
        normalizePermissionMap(
          row.permissions,
          normalizePermissionMap(
            row.defaultPermissions,
            getDefaultRolePermissions(row.baseRole),
          ),
        ),
      ]),
    );

    return mergePermissionMaps(
      ...input.roles.map(
        (role) => permissionsByRole.get(role) ?? getDefaultRolePermissions(role),
      ),
    );
  } catch (error) {
    if (!isTenantCustomRoleTableMissing(error)) {
      throw error;
    }

    return mergePermissionMaps(
      ...input.roles.map((role) => getDefaultRolePermissions(role)),
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
  const systemRole = await getSystemTenantRoleRow(db, input.tenantId, input.role);
  if (!systemRole) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "TenantCustomRole"
      SET
        "permissions" = $2::jsonb,
        "updatedAt" = NOW()
      WHERE "id" = $1
    `,
    systemRole.id,
    JSON.stringify(sanitizePermissionMap(input.permissions)),
  );
}

export async function resetTenantRolePermissionProfile(
  db: PermissionDbClient,
  input: {
    tenantId: string;
    role: Role;
  },
): Promise<void> {
  const systemRole = await getSystemTenantRoleRow(db, input.tenantId, input.role);
  if (!systemRole) {
    return;
  }

  const defaultPermissions = normalizePermissionMap(
    systemRole.defaultPermissions,
    getDefaultRolePermissions(input.role),
  );

  await db.$executeRawUnsafe(
    `
      UPDATE "TenantCustomRole"
      SET
        "permissions" = $2::jsonb,
        "updatedAt" = NOW()
      WHERE "id" = $1
    `,
    systemRole.id,
    JSON.stringify(defaultPermissions),
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
  const systemRole = await getSystemTenantRoleRow(db, input.tenantId, input.role);
  if (!systemRole) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "TenantCustomRole"
      SET
        "displayName" = $2,
        "updatedAt" = NOW()
      WHERE "id" = $1
    `,
    systemRole.id,
    normalizeRoleDisplayName(input.role, input.displayName),
  );
}

export async function archiveTenantRoleProfile(
  db: PermissionDbClient,
  input: {
    tenantId: string;
    role: Role;
  },
): Promise<void> {
  const systemRole = await getSystemTenantRoleRow(db, input.tenantId, input.role);
  if (!systemRole) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "TenantCustomRole"
      SET
        "isArchived" = true,
        "updatedAt" = NOW()
      WHERE "id" = $1
    `,
    systemRole.id,
  );
}

export async function restoreTenantRoleProfile(
  db: PermissionDbClient,
  input: {
    tenantId: string;
    role: Role;
  },
): Promise<void> {
  const systemRole = await getSystemTenantRoleRow(db, input.tenantId, input.role);
  if (!systemRole) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "TenantCustomRole"
      SET
        "isArchived" = false,
        "updatedAt" = NOW()
      WHERE "id" = $1
    `,
    systemRole.id,
  );
}
