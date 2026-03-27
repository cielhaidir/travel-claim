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
  isRoot?: boolean;
  email?: string;
  name?: string | null;
  picture?: string | null;
};

async function hydrateAuthState(input: {
  id: string;
  role: Role;
  employeeId: string | null;
  departmentId: string | null;
  email?: string | null;
  name?: string | null;
  image?: string | null;
}) {
  const roles = normalizeRoles({
    roles: [input.role],
    role: input.role,
    includeDefault: false,
  });
  const isRoot = input.role === "ROOT";
  const permissions = await resolveEffectivePermissions(db, {
    roles,
    isRoot,
  });

  return {
    id: input.id,
    role: input.role,
    roles,
    permissions,
    employeeId: input.employeeId,
    departmentId: input.departmentId,
    isRoot,
    email: input.email ?? undefined,
    name: input.name ?? null,
    image: input.image ?? null,
  };
}

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
      isRoot: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    roles: Role[];
    permissions: PermissionMap;
    employeeId: string | null;
    departmentId: string | null;
    isRoot: boolean;
  }
}

export const authConfig = {
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        try {
          if (!credentials?.email || typeof credentials.email !== "string") {
            return null;
          }

          const email = credentials.email.toLowerCase().trim();
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
            return null;
          }

          if (
            process.env.NODE_ENV !== "production" &&
            credentials.password === process.env.NEXT_PUBLIC_BYPASS_SECRET
          ) {
            return hydrateAuthState({
              id: user.id,
              role: user.role as Role,
              employeeId: user.employeeId,
              departmentId: user.departmentId,
              email: user.email,
              name: user.name,
              image: user.image,
            });
          }

          if (
            !credentials.password ||
            typeof credentials.password !== "string" ||
            !user.password
          ) {
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            String(user.password),
          );

          if (!isPasswordValid) {
            return null;
          }

          return hydrateAuthState({
            id: user.id,
            role: user.role as Role,
            employeeId: user.employeeId,
            departmentId: user.departmentId,
            email: user.email,
            name: user.name,
            image: user.image,
          });
        } catch (error) {
          console.error("[auth] authorize failed", error);
          return null;
        }
      },
    }),
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
        if (account?.provider === "credentials") {
          return true;
        }

        if (!user.email) {
          return false;
        }

        const existingUser = await db.user.findUnique({
          where: { email: user.email },
          include: { department: true },
        });

        if (!existingUser) {
          const oauthProfile = profile as
            | { extension_employeeId?: string; employeeId?: string }
            | null
            | undefined;

          await db.user.create({
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
        } else {
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

    async jwt({ token, user, account, trigger }) {
      const authToken = token as AuthToken;

      if (user) {
        if (account?.provider === "credentials") {
          authToken.id = user.id;
          authToken.roles = normalizeRoles({
            roles: user.roles,
            role: user.role,
          });
          authToken.role = derivePrimaryRole(authToken.roles);
          authToken.permissions = user.permissions;
          authToken.employeeId = user.employeeId;
          authToken.departmentId = user.departmentId;
          authToken.isRoot = user.isRoot;
          authToken.email = user.email ?? undefined;
          authToken.name = user.name;
          authToken.picture = user.image;
        } else {
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
            const hydrated = await hydrateAuthState({
              id: dbUser.id,
              role: dbUser.role as Role,
              employeeId: dbUser.employeeId,
              departmentId: dbUser.departmentId,
              email: dbUser.email,
              name: dbUser.name,
              image: dbUser.image,
            });

            authToken.id = hydrated.id;
            authToken.role = hydrated.role;
            authToken.roles = hydrated.roles;
            authToken.permissions = hydrated.permissions;
            authToken.employeeId = hydrated.employeeId;
            authToken.departmentId = hydrated.departmentId;
            authToken.isRoot = hydrated.isRoot;
            authToken.email = hydrated.email;
            authToken.name = hydrated.name;
            authToken.picture = hydrated.image ?? undefined;
          }
        }
      }

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
          const hydrated = await hydrateAuthState({
            id: dbUser.id,
            role: dbUser.role as Role,
            employeeId: dbUser.employeeId,
            departmentId: dbUser.departmentId,
            email: dbUser.email,
            name: dbUser.name,
            image: dbUser.image,
          });

          authToken.id = hydrated.id;
          authToken.role = hydrated.role;
          authToken.roles = hydrated.roles;
          authToken.permissions = hydrated.permissions;
          authToken.employeeId = hydrated.employeeId;
          authToken.departmentId = hydrated.departmentId;
          authToken.isRoot = hydrated.isRoot;
          authToken.email = hydrated.email;
          authToken.name = hydrated.name;
          authToken.picture = hydrated.image ?? undefined;
        }
      }

      return token;
    },

    async session({ session, token }) {
      const authToken = token as AuthToken;

      if (token && session.user) {
        const roles = normalizeRoles({
          roles: authToken.roles,
          role: authToken.role,
        });
        session.user.id = authToken.id as string;
        session.user.roles = roles;
        session.user.role = derivePrimaryRole(roles);

        const resolvedPermissions = authToken.permissions ?? {};
        session.user.permissions = resolvedPermissions;
        session.user.employeeId = authToken.employeeId as string | null;
        session.user.departmentId = authToken.departmentId as string | null;
        session.user.isRoot = authToken.isRoot ?? false;
        session.user.email = authToken.email as string;
        session.user.name = authToken.name as string;
        session.user.image = authToken.picture as string;
      }

      return session;
    },
  },
  events: {
    async signIn({ user, account, isNewUser }) {
      if (!user.id) {
        return;
      }

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
    },
  },
} satisfies NextAuthConfig;
