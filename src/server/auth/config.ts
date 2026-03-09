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

type AuthToken = {
  id?: string;
  role?: Role;
  roles?: Role[];
  employeeId?: string | null;
  departmentId?: string | null;
  email?: string;
  name?: string | null;
  picture?: string | null;
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
      email: string;
      employeeId: string | null;
      departmentId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    roles: Role[];
    employeeId: string | null;
    departmentId: string | null;
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
            console.log(
              `[auth] authorize: bypass key accepted for ${user.email}.`,
            );
            return {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              roles: normalizeRoles({ roles: [], role: user.role }),
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

          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            roles: normalizeRoles({ roles: [], role: user.role }),
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
        }

        return true;
      } catch (error) {
        console.error("Error in signIn callback:", error);
        return false;
      }
    },

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    async jwt({ token, user, account, profile, trigger }) {
      const authToken = token as AuthToken;

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
          authToken.employeeId = user.employeeId;
          authToken.departmentId = user.departmentId;
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
            authToken.id = dbUser.id;
            authToken.roles = await getUserRoles(
              dbUser.id,
              dbUser.role as Role,
            );
            authToken.role = derivePrimaryRole(authToken.roles);
            authToken.employeeId = dbUser.employeeId;
            authToken.departmentId = dbUser.departmentId;
            authToken.email = dbUser.email ?? undefined;
            authToken.name = dbUser.name;
            authToken.picture = dbUser.image;
          }
        }
      }

      // Refresh user data on update trigger
      if (trigger === "update" && authToken.id) {
        const dbUser = await db.user.findUnique({
          where: { id: authToken.id },
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
          authToken.roles = await getUserRoles(dbUser.id, dbUser.role as Role);
          authToken.role = derivePrimaryRole(authToken.roles);
          authToken.employeeId = dbUser.employeeId;
          authToken.departmentId = dbUser.departmentId;
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
        session.user.employeeId = authToken.employeeId as string | null;
        session.user.departmentId = authToken.departmentId as string | null;
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
