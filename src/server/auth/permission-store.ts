import { Prisma } from "@prisma/client";
import {
  ROLES,
  ROLE_LABELS as DEFAULT_ROLE_LABELS,
  type Role,
} from "@/lib/constants/roles";
import {
  DEFAULT_ROLE_PERMISSION_PRESETS,
  FULL_ACCESS_PERMISSIONS,
  mergeMissingPermissionModules,
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

type RoleUsageRow = {
  role: Role;
  userCount: number;
};

export type RolePermissionProfile = {
  id: string | null;
  roleKey: string;
  role: Role;
  displayName: string;
  defaultDisplayName: string;
  isArchived: boolean;
  permissions: PermissionMap;
  defaultPermissions: PermissionMap;
  isCustomized: boolean;
  userCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};

const ROLE_VALUES = Object.values(ROLES) as Role[];

function buildRoleKey(role: Role): string {
  return `system:${role}`;
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

async function listStoredRolePermissions(
  db: PermissionDbClient,
): Promise<RolePermissionRow[]> {
  try {
    return await db.$queryRawUnsafe<RolePermissionRow[]>(
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
      `,
    );
  } catch (error) {
    if (!isRolePermissionTableMissing(error)) {
      throw error;
    }

    return [];
  }
}

export async function ensureRolePermissionCatalog(
  db: PermissionDbClient,
): Promise<void> {
  const storedRows = await listStoredRolePermissions(db);
  const rowsByRole = new Map(storedRows.map((row) => [row.role, row]));

  for (const role of ROLE_VALUES) {
    const defaults = getDefaultRolePermissions(role);
    const existing = rowsByRole.get(role);

    if (!existing) {
      await db.$executeRawUnsafe(
        `
          INSERT INTO "RolePermission" (
            "id",
            "role",
            "displayName",
            "isArchived",
            "permissions",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            md5(random()::text || clock_timestamp()::text),
            $1::"Role",
            $2,
            false,
            $3::jsonb,
            NOW(),
            NOW()
          )
        `,
        role,
        getDefaultRoleDisplayName(role),
        JSON.stringify(defaults),
      );
      continue;
    }

    const nextPermissions = normalizePermissionMap(existing.permissions, defaults);
    const nextDisplayName = normalizeRoleDisplayName(role, existing.displayName);

    if (
      existing.displayName !== nextDisplayName ||
      !jsonEquals(existing.permissions, nextPermissions)
    ) {
      await db.$executeRawUnsafe(
        `
          UPDATE "RolePermission"
          SET
            "displayName" = $2,
            "permissions" = $3::jsonb,
            "updatedAt" = NOW()
          WHERE "id" = $1
        `,
        existing.id,
        nextDisplayName,
        JSON.stringify(nextPermissions),
      );
    }
  }
}

async function getRolePermissionRow(
  db: PermissionDbClient,
  role: Role,
): Promise<RolePermissionRow | null> {
  await ensureRolePermissionCatalog(db);
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
      WHERE rp."role" = $1::"Role"
      LIMIT 1
    `,
    role,
  );

  return rows[0] ?? null;
}

export async function listRolePermissionProfiles(
  db: PermissionDbClient,
): Promise<RolePermissionProfile[]> {
  await ensureRolePermissionCatalog(db);

  const [rows, userCounts] = await Promise.all([
    listStoredRolePermissions(db),
    db.$queryRawUnsafe<RoleUsageRow[]>(
      `
        SELECT
          u."role"::text as "role",
          COUNT(*)::int as "userCount"
        FROM "User" u
        WHERE u."deletedAt" IS NULL
        GROUP BY u."role"
      `,
    ),
  ]);

  const countByRole = new Map(userCounts.map((row) => [row.role, row.userCount]));

  return rows
    .map((row) => {
      const defaultPermissions = getDefaultRolePermissions(row.role);
      const permissions = normalizePermissionMap(row.permissions, defaultPermissions);
      const defaultDisplayName = getDefaultRoleDisplayName(row.role);

      return {
        id: row.id,
        roleKey: buildRoleKey(row.role),
        role: row.role,
        displayName: normalizeRoleDisplayName(row.role, row.displayName),
        defaultDisplayName,
        isArchived: row.isArchived,
        permissions,
        defaultPermissions,
        isCustomized:
          !jsonEquals(permissions, defaultPermissions) ||
          normalizeRoleDisplayName(row.role, row.displayName) !==
            defaultDisplayName ||
          row.isArchived,
        userCount: countByRole.get(row.role) ?? 0,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      } satisfies RolePermissionProfile;
    })
    .sort(
      (left, right) => ROLE_VALUES.indexOf(left.role) - ROLE_VALUES.indexOf(right.role),
    );
}

export async function resolveEffectivePermissions(
  db: PermissionDbClient,
  input: {
    roles: Role[];
    isRoot?: boolean;
  },
): Promise<PermissionMap> {
  if (input.isRoot || input.roles.includes(ROLES.ROOT)) {
    return FULL_ACCESS_PERMISSIONS;
  }

  if (input.roles.length === 0) {
    return {};
  }

  await ensureRolePermissionCatalog(db);

  try {
    const rows = await db.$queryRawUnsafe<
      Array<{
        role: Role;
        permissions: unknown;
        isArchived: boolean;
      }>
    >(
      `
        SELECT
          rp."role"::text as "role",
          rp."permissions" as "permissions",
          rp."isArchived" as "isArchived"
        FROM "RolePermission" rp
        WHERE rp."role"::text = ANY($1)
      `,
      input.roles,
    );

    const permissionsByRole = new Map<Role, PermissionMap>();

    for (const row of rows) {
      if (row.isArchived) {
        continue;
      }

      permissionsByRole.set(
        row.role,
        normalizePermissionMap(row.permissions, getDefaultRolePermissions(row.role)),
      );
    }

    return input.roles.reduce<PermissionMap>((merged, role) => {
      const next = permissionsByRole.get(role) ?? getDefaultRolePermissions(role);
      for (const [moduleKey, actions] of Object.entries(next)) {
        const current = new Set(merged[moduleKey] ?? []);
        for (const action of actions) {
          current.add(action);
        }
        merged[moduleKey] = [...current].sort();
      }
      return merged;
    }, {});
  } catch (error) {
    if (!isRolePermissionTableMissing(error)) {
      throw error;
    }

    return input.roles.reduce<PermissionMap>((merged, role) => {
      const next = getDefaultRolePermissions(role);
      for (const [moduleKey, actions] of Object.entries(next)) {
        const current = new Set(merged[moduleKey] ?? []);
        for (const action of actions) {
          current.add(action);
        }
        merged[moduleKey] = [...current].sort();
      }
      return merged;
    }, {});
  }
}

export async function upsertRolePermissionProfile(
  db: PermissionDbClient,
  input: {
    role: Role;
    permissions: PermissionMap;
  },
): Promise<void> {
  const row = await getRolePermissionRow(db, input.role);
  if (!row) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "RolePermission"
      SET
        "permissions" = $2::jsonb,
        "updatedAt" = NOW()
      WHERE "id" = $1
    `,
    row.id,
    JSON.stringify(sanitizePermissionMap(input.permissions)),
  );
}

export async function resetRolePermissionProfile(
  db: PermissionDbClient,
  input: {
    role: Role;
  },
): Promise<void> {
  const row = await getRolePermissionRow(db, input.role);
  if (!row) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "RolePermission"
      SET
        "permissions" = $2::jsonb,
        "updatedAt" = NOW()
      WHERE "id" = $1
    `,
    row.id,
    JSON.stringify(getDefaultRolePermissions(input.role)),
  );
}

export async function updateRoleDisplayName(
  db: PermissionDbClient,
  input: {
    role: Role;
    displayName: string | null;
  },
): Promise<void> {
  const row = await getRolePermissionRow(db, input.role);
  if (!row) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "RolePermission"
      SET
        "displayName" = $2,
        "updatedAt" = NOW()
      WHERE "id" = $1
    `,
    row.id,
    normalizeRoleDisplayName(input.role, input.displayName),
  );
}

export async function archiveRoleProfile(
  db: PermissionDbClient,
  input: {
    role: Role;
  },
): Promise<void> {
  const row = await getRolePermissionRow(db, input.role);
  if (!row) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "RolePermission"
      SET
        "isArchived" = true,
        "updatedAt" = NOW()
      WHERE "id" = $1
    `,
    row.id,
  );
}

export async function restoreRoleProfile(
  db: PermissionDbClient,
  input: {
    role: Role;
  },
): Promise<void> {
  const row = await getRolePermissionRow(db, input.role);
  if (!row) {
    return;
  }

  await db.$executeRawUnsafe(
    `
      UPDATE "RolePermission"
      SET
        "isArchived" = false,
        "updatedAt" = NOW()
      WHERE "id" = $1
    `,
    row.id,
  );
}
