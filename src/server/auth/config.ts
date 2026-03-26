import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { env } from "@/env";
import {
  DEFAULT_USER_ROLES,
  derivePrimaryRole,
  normalizeRoles,
  type Role,
} from "@/lib/constants/roles";
import { type PermissionMap } from "@/lib/auth/permissions";
import { resolveEffectivePermissions } from "@/server/auth/permission-store";

type AuthToken = {
  id?: string;
  role?: Role;
  roles?: Role[];
  permissions?: PermissionMap;
  employeeId?: string | null;
  departmentId?: string | null;
  activeTenantId?: string | null;
  isRoot?: boolean;
  memberships?: AuthTenantMembership[];
  email?: string;
  name?: string | null;
  picture?: string | null;
};

type AuthTenantMembership = {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: Role;
  status: "ACTIVE" | "INVITED" | "SUSPENDED";
  isDefault: boolean;
  isRootTenant: boolean;
};

/**
 * Module augmentation for `next-auth` types. Allows us to add custom properties to the `session`
 * object and keep type safety.
 *
 * @see https://next-auth.js.org/getting-started/typescript#module-augmentation
 */
declare module "next-auth" {
  interface Session extends DefaultSession {
    user: {
      id: string;
      role: Role;
      roles: Role[];
      permissions: PermissionMap;
      email: string;
      employeeId: string | null;
      departmentId: string | null;
      activeTenantId: string | null;
      isRoot: boolean;
      memberships: AuthTenantMembership[];
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    roles: Role[];
    permissions: PermissionMap;
    employeeId: string | null;
    departmentId: string | null;
    activeTenantId: string | null;
    isRoot: boolean;
    memberships: AuthTenantMembership[];
  }
}

async function getUserRoles(
  userId: string,
  fallbackRole: Role,
): Promise<Role[]> {
  const rows = await db.$queryRaw<Array<{ role: Role }>>`
    SELECT "role"
    FROM "UserRole"
    WHERE "userId" = ${userId}
  `;

  return normalizeRoles({
    roles: rows.map((row) => row.role),
    role: fallbackRole,
  });
}

function hasRootMembership(memberships: AuthTenantMembership[]): boolean {
  return memberships.some(
    (membership) => membership.role === "ROOT" || membership.isRootTenant,
  );
}

function resolveScopedRoles(input: {
  memberships: AuthTenantMembership[];
  activeTenantId: string | null;
  fallbackRole: Role;
  isRoot: boolean;
}): Role[] {
  const activeMemberships = input.memberships.filter(
    (membership) => membership.status === "ACTIVE",
  );

  const currentMembership =
    activeMemberships.find(
      (membership) => membership.tenantId === input.activeTenantId,
    ) ??
    activeMemberships.find((membership) => membership.isDefault) ??
    (input.isRoot
      ? activeMemberships.find((membership) => membership.isRootTenant)
      : activeMemberships[0]);

  if (currentMembership) {
    return normalizeRoles({
      roles: [currentMembership.role],
      role: currentMembership.role,
      includeDefault: false,
    });
  }

  return normalizeRoles({
    roles: [],
    role: input.fallbackRole,
  });
}

async function resolveScopedPermissions(input: {
  activeTenantId: string | null;
  roles: Role[];
  isRoot: boolean;
}): Promise<PermissionMap> {
  return resolveEffectivePermissions(db, {
    tenantId: input.activeTenantId,
    roles: input.roles,
    isRoot: input.isRoot,
  });
}

async function getUserMemberships(
  userId: string,
): Promise<AuthTenantMembership[]> {
  try {
    const memberships = await db.$queryRaw<
      Array<{
        tenantId: string;
        tenantName: string;
        tenantSlug: string;
        role: string;
        status: string;
        isDefault: boolean;
        isRootTenant: boolean;
      }>
    >`
      SELECT
        tm."tenantId" as "tenantId",
        t."name" as "tenantName",
        t."slug" as "tenantSlug",
        tm."role"::text as "role",
        tm."status"::text as "status",
        tm."isDefault" as "isDefault",
        t."isRoot" as "isRootTenant"
      FROM "TenantMembership" tm
      INNER JOIN "Tenant" t ON t."id" = tm."tenantId"
      WHERE tm."userId" = ${userId}
      ORDER BY tm."isDefault" DESC, tm."createdAt" ASC
    `;

    return memberships.map((membership) => ({
      tenantId: membership.tenantId,
      tenantName: membership.tenantName,
      tenantSlug: membership.tenantSlug,
      role: membership.role as Role,
      status: membership.status as AuthTenantMembership["status"],
      isDefault: membership.isDefault,
      isRootTenant: membership.isRootTenant,
    }));
  } catch {
    return [];
  }
}

function resolveActiveTenantId(input: {
  memberships: AuthTenantMembership[];
  currentTenantId?: string | null;
  isRoot: boolean;
}): string | null {
  const { memberships, currentTenantId, isRoot } = input;
  const activeMemberships = memberships.filter((m) => m.status === "ACTIVE");

  if (
    currentTenantId &&
    activeMemberships.some(
      (membership) => membership.tenantId === currentTenantId,
    )
  ) {
    return currentTenantId;
  }

  const defaultMembership = activeMemberships.find(
    (membership) => membership.isDefault,
  );
  if (defaultMembership) {
    return defaultMembership.tenantId;
  }

  if (activeMemberships[0]) {
    return activeMemberships[0].tenantId;
  }

  if (isRoot) {
    const rootMembership = memberships.find(
      (membership) => membership.isRootTenant,
    );
    return rootMembership?.tenantId ?? null;
  }

  return null;
}

function hasRootAccess(roles: readonly Role[]): boolean {
  return roles.includes("ROOT" as Role);
}

async function ensureTenantBootstrapRows(): Promise<{
  defaultTenantId: string | null;
  rootTenantId: string | null;
}> {
  try {
    await db.$executeRaw`
      INSERT INTO "Tenant" ("id", "slug", "name", "isRoot", "createdAt", "updatedAt")
      VALUES (md5(random()::text || clock_timestamp()::text), 'root', 'Root Tenant', true, NOW(), NOW())
      ON CONFLICT ("slug") DO UPDATE
      SET "name" = EXCLUDED."name", "isRoot" = true, "updatedAt" = NOW()
    `;

    await db.$executeRaw`
      INSERT INTO "Tenant" ("id", "slug", "name", "isRoot", "createdAt", "updatedAt")
      VALUES (md5(random()::text || clock_timestamp()::text), 'default', 'Default Tenant', false, NOW(), NOW())
      ON CONFLICT ("slug") DO UPDATE
      SET "name" = EXCLUDED."name", "updatedAt" = NOW()
    `;

    const rows = await db.$queryRaw<
      Array<{ slug: string; id: string }>
    >`SELECT "slug", "id" FROM "Tenant" WHERE "slug" IN ('default', 'root')`;

    return {
      defaultTenantId: rows.find((row) => row.slug === "default")?.id ?? null,
      rootTenantId: rows.find((row) => row.slug === "root")?.id ?? null,
    };
  } catch {
    return { defaultTenantId: null, rootTenantId: null };
  }
}

async function ensureMembershipsForUser(input: {
  userId: string;
  role: Role;
}): Promise<void> {
  const { defaultTenantId, rootTenantId } = await ensureTenantBootstrapRows();

  if (!defaultTenantId) {
    return;
  }

  try {
    await db.$executeRaw`
      INSERT INTO "TenantMembership" (
        "id", "userId", "tenantId", "role", "status", "isDefault", "createdAt", "updatedAt", "activatedAt"
      )
      VALUES (
        md5(random()::text || clock_timestamp()::text),
        ${input.userId},
        ${defaultTenantId},
        ${input.role}::"Role",
        'ACTIVE'::"MembershipStatus",
        true,
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT ("userId", "tenantId") DO UPDATE
      SET "status" = 'ACTIVE', "updatedAt" = NOW()
    `;

    if (input.role === "ROOT" && rootTenantId) {
      await db.$executeRaw`
        INSERT INTO "TenantMembership" (
          "id", "userId", "tenantId", "role", "status", "isDefault", "createdAt", "updatedAt", "activatedAt"
        )
        VALUES (
          md5(random()::text || clock_timestamp()::text),
          ${input.userId},
          ${rootTenantId},
          'ROOT'::"Role",
          'ACTIVE'::"MembershipStatus",
          false,
          NOW(),
          NOW(),
          NOW()
        )
        ON CONFLICT ("userId", "tenantId") DO UPDATE
        SET "role" = 'ROOT', "status" = 'ACTIVE', "updatedAt" = NOW()
      `;
    }
  } catch {
    // ignore if migration not applied yet
  }
}

/**
 * Options for NextAuth.js used to configure adapters, providers, callbacks, etc.
 *
 * @see https://next-auth.js.org/configuration/options
 */
export const authConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
    // Credentials provider (always available)
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || typeof credentials.email !== "string") {
            console.error("[auth] authorize: missing or invalid email");
            return null;
          }

          // Normalize email to lowercase and trim whitespace
          const email = credentials.email.toLowerCase().trim();
          console.log("[auth] authorize: looking up user:", email);

          const user = await db.user.findUnique({
            where: { email },
            select: {
              id: true,
              name: true,
              email: true,
              password: true,
              role: true,
              employeeId: true,
              departmentId: true,
              image: true,
            },
          });

          if (!user) {
            console.error("[auth] authorize: no user found for email:", email);
            return null;
          }

          console.log(
            "[auth] authorize: user found, hasPassword:",
            !!user.password,
          );

          // In non-production environments, allow passwordless login with a specific bypass key.
          if (
            process.env.NODE_ENV !== "production" &&
            credentials.password === process.env.NEXT_PUBLIC_BYPASS_SECRET
          ) {
            await ensureMembershipsForUser({
              userId: user.id,
              role: user.role as Role,
            });
            const memberships = await getUserMemberships(user.id);
            const isRoot =
              user.role === "ROOT" || hasRootMembership(memberships);
            const activeTenantId = resolveActiveTenantId({
              memberships,
              isRoot,
            });
            const roles = resolveScopedRoles({
              memberships,
              activeTenantId,
              fallbackRole: user.role as Role,
              isRoot,
            });
            const permissions = await resolveScopedPermissions({
              activeTenantId,
              roles,
              isRoot,
            });
            console.log(
              `[auth] authorize: bypass key accepted for ${user.email}.`,
            );
            return {
              activeTenantId,
              isRoot,
              memberships,
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              roles,
              permissions,
              employeeId: user.employeeId,
              departmentId: user.departmentId,
            };
          }

          if (
            !credentials.password ||
            typeof credentials.password !== "string"
          ) {
            console.error("[auth] authorize: missing or invalid password");
            return null;
          }

          if (!user.password) {
            console.error("[auth] authorize: user has no password set:", email);
            return null;
          }

          // Validate password
          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            String(user.password),
          );

          console.log("[auth] authorize: password valid:", isPasswordValid);

          if (!isPasswordValid) {
            return null;
          }

          await ensureMembershipsForUser({
            userId: user.id,
            role: user.role as Role,
          });

          const memberships = await getUserMemberships(user.id);
          const isRoot = user.role === "ROOT" || hasRootMembership(memberships);
          const activeTenantId = resolveActiveTenantId({ memberships, isRoot });
          const roles = resolveScopedRoles({
            memberships,
            activeTenantId,
            fallbackRole: user.role as Role,
            isRoot,
          });
          const permissions = await resolveScopedPermissions({
            activeTenantId,
            roles,
            isRoot,
          });

          return {
            activeTenantId,
            isRoot,
            memberships,
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            roles,
            permissions,
            employeeId: user.employeeId,
            departmentId: user.departmentId,
          };
        } catch (err) {
          console.error("[auth] authorize: unexpected error:", err);
          return null;
        }
      },
    }),
    // Microsoft Entra ID (formerly Azure AD) provider (conditional)
    ...(env.AZURE_AD_CLIENT_ID &&
    env.AZURE_AD_CLIENT_SECRET &&
    env.AZURE_AD_TENANT_ID
      ? [
          MicrosoftEntraID({
            clientId: env.AZURE_AD_CLIENT_ID,
            clientSecret: env.AZURE_AD_CLIENT_SECRET,
            allowDangerousEmailAccountLinking: true,
            issuer: `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/v2.0`,
            authorization: {
              params: {
                scope: "openid profile email offline_access User.Read",
              },
            },
          }),
        ]
      : []),
    // Google provider (conditional)
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  adapter: PrismaAdapter(db) as unknown as Adapter,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      try {
        // Skip database operations for credentials provider (already handled in authorize)
        if (account?.provider === "credentials") {
          return true;
        }

        if (!user.email) {
          console.error("No email provided from OAuth provider");
          return false;
        }

        // Look up existing user by email (for OAuth providers only)
        const existingUser = await db.user.findUnique({
          where: { email: user.email },
          include: { department: true },
        });

        if (!existingUser) {
          // First-time login: create user with default EMPLOYEE role
          const oauthProfile = profile as
            | { extension_employeeId?: string; employeeId?: string }
            | null
            | undefined;
          const newUser = await db.user.create({
            data: {
              email: user.email,
              name: user.name,
              image: user.image,
              emailVerified: new Date(),
              role: "EMPLOYEE",
              employeeId:
                oauthProfile?.extension_employeeId ??
                oauthProfile?.employeeId ??
                null,
            },
          });

          console.log(`Created new user: ${newUser.email} with role EMPLOYEE`);
          await db.$executeRaw`
            INSERT INTO "UserRole" ("userId", "role", "createdAt")
            VALUES (${newUser.id}, ${DEFAULT_USER_ROLES[0]}::"Role", NOW())
            ON CONFLICT ("userId", "role") DO NOTHING
          `;
          await ensureMembershipsForUser({
            userId: newUser.id,
            role: newUser.role as Role,
          });
        } else {
          // Update existing user profile
          await db.user.update({
            where: { id: existingUser.id },
            data: {
              name: user.name ?? existingUser.name,
              image: user.image ?? existingUser.image,
              emailVerified: existingUser.emailVerified ?? new Date(),
              updatedAt: new Date(),
            },
          });
          await ensureMembershipsForUser({
            userId: existingUser.id,
            role: existingUser.role as Role,
          });
        }

        return true;
      } catch (error) {
        console.error("Error in signIn callback:", error);
        return false;
      }
    },

    async jwt({ token, user, account, profile, trigger, session }) {
      const authToken = token as AuthToken;
      const sessionUpdate = session as
        | {
            activeTenantId?: string | null;
          }
        | undefined;

      // Initial sign in
      if (user) {
        // For credentials provider, user object already has all needed data
        if (account?.provider === "credentials") {
          authToken.id = user.id;
          authToken.role = user.role;
          authToken.roles = normalizeRoles({
            roles: user.roles,
            role: user.role,
          });
          authToken.permissions = user.permissions;
          authToken.employeeId = user.employeeId;
          authToken.departmentId = user.departmentId;
          authToken.memberships = user.memberships;
          authToken.isRoot = user.isRoot;
          authToken.activeTenantId = resolveActiveTenantId({
            memberships: user.memberships,
            currentTenantId: user.activeTenantId,
            isRoot: user.isRoot,
          });
          authToken.email = user.email ?? undefined;
          authToken.name = user.name;
          authToken.picture = user.image;
        } else {
          // For OAuth providers, fetch from database
          const dbUser = await db.user.findUnique({
            where: { id: user.id },
            select: {
              id: true,
              role: true,
              employeeId: true,
              departmentId: true,
              email: true,
              name: true,
              image: true,
            },
          });

          if (dbUser) {
            const memberships = await getUserMemberships(dbUser.id);
            authToken.id = dbUser.id;
            authToken.isRoot =
              dbUser.role === "ROOT" || hasRootMembership(memberships);
            authToken.activeTenantId = resolveActiveTenantId({
              memberships,
              currentTenantId: authToken.activeTenantId,
              isRoot: authToken.isRoot,
            });
            authToken.roles = resolveScopedRoles({
              memberships,
              activeTenantId: authToken.activeTenantId,
              fallbackRole: dbUser.role as Role,
              isRoot: authToken.isRoot,
            });
            authToken.permissions = await resolveScopedPermissions({
              activeTenantId: authToken.activeTenantId,
              roles: authToken.roles,
              isRoot: authToken.isRoot,
            });
            authToken.role = derivePrimaryRole(authToken.roles);
            authToken.employeeId = dbUser.employeeId;
            authToken.departmentId = dbUser.departmentId;
            authToken.memberships = memberships;
            authToken.email = dbUser.email ?? undefined;
            authToken.name = dbUser.name;
            authToken.picture = dbUser.image;
          }
        }
      }

      // Refresh user data on update trigger
      if (trigger === "update" && authToken.id) {
        const userSelect = {
          id: true,
          role: true,
          employeeId: true,
          departmentId: true,
          email: true,
          name: true,
          image: true,
        } as const;

        let dbUser = await db.user.findUnique({
          where: { id: authToken.id },
          select: userSelect,
        });

        if (!dbUser && authToken.email) {
          dbUser = await db.user.findUnique({
            where: { email: authToken.email },
            select: userSelect,
          });
        }

        if (dbUser) {
          const memberships = await getUserMemberships(dbUser.id);
          authToken.id = dbUser.id;
          const requestedTenantId =
            typeof sessionUpdate?.activeTenantId === "string" ||
            sessionUpdate?.activeTenantId === null
              ? sessionUpdate.activeTenantId
              : undefined;

          authToken.isRoot =
            dbUser.role === "ROOT" || hasRootMembership(memberships);
          authToken.employeeId = dbUser.employeeId;
          authToken.departmentId = dbUser.departmentId;
          authToken.memberships = memberships;
          if (
            requestedTenantId !== undefined &&
            memberships.some(
              (membership) =>
                membership.status === "ACTIVE" &&
                membership.tenantId === requestedTenantId,
            )
          ) {
            authToken.activeTenantId = requestedTenantId;
          } else {
            authToken.activeTenantId = resolveActiveTenantId({
              memberships,
              currentTenantId: authToken.activeTenantId,
              isRoot: authToken.isRoot,
            });
          }
          authToken.roles = resolveScopedRoles({
            memberships,
            activeTenantId: authToken.activeTenantId ?? null,
            fallbackRole: dbUser.role as Role,
            isRoot: authToken.isRoot,
          });
          authToken.permissions = await resolveScopedPermissions({
            activeTenantId: authToken.activeTenantId ?? null,
            roles: authToken.roles,
            isRoot: authToken.isRoot,
          });
          authToken.role = derivePrimaryRole(authToken.roles);
          authToken.email = dbUser.email ?? undefined;
          authToken.name = dbUser.name;
          authToken.picture = dbUser.image;
        }
      }

      return token;
    },

    async session({ session, token }) {
      const authToken = token as AuthToken;

      if (token && session.user) {
        session.user.id = authToken.id as string;
        const roles = normalizeRoles({
          roles: authToken.roles,
          role: authToken.role,
        });
        session.user.roles = roles;
        session.user.role = derivePrimaryRole(roles);
        session.user.permissions = authToken.permissions ?? {};
        session.user.employeeId = authToken.employeeId as string | null;
        session.user.departmentId = authToken.departmentId as string | null;
        session.user.activeTenantId = authToken.activeTenantId ?? null;
        session.user.isRoot = authToken.isRoot ?? false;
        session.user.memberships = authToken.memberships ?? [];
        session.user.email = authToken.email as string;
        session.user.name = authToken.name as string;
        session.user.image = authToken.picture as string;
      }

      return session;
    },
  },
  events: {
    async signIn({ user, account, profile: _profile, isNewUser }) {
      // Log authentication event for audit
      if (user.id) {
        try {
          await db.auditLog.create({
            data: {
              userId: user.id,
              action: "CREATE",
              entityType: "Authentication",
              entityId: user.id,
              metadata: {
                provider: account?.provider,
                isNewUser,
                timestamp: new Date().toISOString(),
              },
            },
          });
        } catch (error) {
          console.error("Failed to create audit log:", error);
        }
      }
    },
  },
} satisfies NextAuthConfig;
