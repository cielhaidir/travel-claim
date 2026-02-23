import { PrismaAdapter } from "@auth/prisma-adapter";
import { type DefaultSession, type NextAuthConfig } from "next-auth";
import AzureADProvider from "next-auth/providers/azure-ad";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/server/db";
import { env } from "@/env";

// Import Role type
type Role = "EMPLOYEE" | "SUPERVISOR" | "MANAGER" | "DIRECTOR" | "FINANCE" | "ADMIN";

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
      email: string;
      employeeId: string | null;
      departmentId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    employeeId: string | null;
    departmentId: string | null;
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
        if (!credentials?.email) {
          throw new Error("Invalid credentials: email not provided.");
        }

        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
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
          throw new Error("No user found with the given email.");
        }

        // In non-production environments, allow passwordless login with a specific bypass key.
        if (
          process.env.NODE_ENV !== "production" &&
          credentials.password === process.env.NEXT_PUBLIC_BYPASS_SECRET
        ) {
          console.log(`Bypassing password validation for ${user.email}.`);
          return {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            employeeId: user.employeeId,
            departmentId: user.departmentId,
          };
        }

        if (!credentials.password) {
          throw new Error("Invalid credentials: password not provided.");
        }

        if (!user.password) {
          throw new Error("The user does not have a password set up.");
        }

        // Validate password
        const isPasswordValid = await bcrypt.compare(
          String(credentials.password),
          String(user.password),
        );

        if (!isPasswordValid) {
          throw new Error("Invalid password.");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          employeeId: user.employeeId,
          departmentId: user.departmentId,
        };
      },
    }),
    // Azure AD provider (conditional)
    ...(env.AZURE_AD_CLIENT_ID && env.AZURE_AD_CLIENT_SECRET && env.AZURE_AD_TENANT_ID ? [
      AzureADProvider({
        clientId: env.AZURE_AD_CLIENT_ID,
        clientSecret: env.AZURE_AD_CLIENT_SECRET,
        issuer: `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID}/v2.0`,
        authorization: {
          params: {
            scope: "openid profile email offline_access User.Read",
          },
        },
      }),
    ] : []),
    // Google provider (conditional)
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    ] : []),
  ],
  adapter: PrismaAdapter(db) as any,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    error: "/auth/error",
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
          const newUser = await db.user.create({
            data: {
              email: user.email,
              name: user.name,
              image: user.image,
              emailVerified: new Date(),
              role: "EMPLOYEE",
              employeeId: (profile as any)?.extension_employeeId ?? (profile as any)?.employeeId ?? null,
            },
          });

          console.log(`Created new user: ${newUser.email} with role EMPLOYEE`);
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

    async jwt({ token, user, account, profile, trigger }) {
      // Initial sign in
      if (user) {
        // For credentials provider, user object already has all needed data
        if (account?.provider === "credentials") {
          token.id = user.id;
          token.role = user.role;
          token.employeeId = user.employeeId;
          token.departmentId = user.departmentId;
          token.email = user.email;
          token.name = user.name;
          token.picture = user.image;
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
            token.id = dbUser.id;
            token.role = dbUser.role;
            token.employeeId = dbUser.employeeId;
            token.departmentId = dbUser.departmentId;
            token.email = dbUser.email;
            token.name = dbUser.name;
            token.picture = dbUser.image;
          }
        }
      }

      // Refresh user data on update trigger
      if (trigger === "update" && token.id) {
        const dbUser = await db.user.findUnique({
          where: { id: token.id as string },
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
          token.role = dbUser.role;
          token.employeeId = dbUser.employeeId;
          token.departmentId = dbUser.departmentId;
          token.email = dbUser.email;
          token.name = dbUser.name;
          token.picture = dbUser.image;
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.employeeId = token.employeeId as string | null;
        session.user.departmentId = token.departmentId as string | null;
        session.user.email = token.email as string;
        session.user.name = token.name as string;
        session.user.image = token.picture as string;
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