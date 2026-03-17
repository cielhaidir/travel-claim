/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import { type McpMeta } from "trpc-to-mcp";
import { type Role } from "../../../generated/prisma";

// OpenApiMeta stub — trpc-to-openapi removed (zod v4 incompatible).
// Keeps existing .meta({ openapi: ... }) calls compiling without the package.
interface OpenApiMeta {
  openapi?: {
    method?: string;
    path?: string;
    summary?: string;
    description?: string;
    tags?: string[];
    protect?: boolean;
    [key: string]: unknown;
  };
}

import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { normalizeRoles } from "@/lib/constants/roles";

function hasRootSessionAccess(ctx: {
  session?: {
    user?: {
      role?: string;
      roles?: string[];
      isRoot?: boolean;
      memberships?: Array<{
        status: string;
        isRootTenant: boolean;
      }>;
    };
  } | null;
}): boolean {
  const user = ctx.session?.user;
  if (!user) return false;

  const userRoles = normalizeRoles({
    roles: user.roles,
    role: user.role,
    includeDefault: false,
  });

  return (
    user.isRoot === true ||
    userRoles.includes("ROOT" as Role) ||
    (user.memberships ?? []).some(
      (membership) => membership.status === "ACTIVE" && membership.isRootTenant,
    )
  );
}

function resolveSessionTenantId(ctx: {
  session?: {
    user?: {
      activeTenantId?: string | null;
      memberships?: Array<{
        tenantId: string;
        status: string;
        isDefault?: boolean;
      }>;
    };
  } | null;
}): string | null {
  const user = ctx.session?.user;
  if (!user) return null;

  const activeMemberships = (user.memberships ?? []).filter(
    (membership) => membership.status === "ACTIVE",
  );

  if (
    user.activeTenantId &&
    activeMemberships.some(
      (membership) => membership.tenantId === user.activeTenantId,
    )
  ) {
    return user.activeTenantId;
  }

  const defaultMembership = activeMemberships.find(
    (membership) => membership.isDefault,
  );
  if (defaultMembership) {
    return defaultMembership.tenantId;
  }

  return activeMemberships[0]?.tenantId ?? null;
}

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth();

  return {
    db,
    session,
    ...opts,
  };
};

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC
  .context<typeof createTRPCContext>()
  .meta<McpMeta & OpenApiMeta>()
  .create({
    transformer: superjson,
    errorFormatter({ shape, error }) {
      return {
        ...shape,
        data: {
          ...shape.data,
          zodError:
            error.cause instanceof ZodError ? error.cause.flatten() : null,
        },
      };
    },
  });

/**
 * Create a server-side caller.
 *
 * @see https://trpc.io/docs/server/server-side-calls
 */
export const createCallerFactory = t.createCallerFactory;

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router;

/**
 * Middleware for timing procedure execution and adding an artificial delay in development.
 *
 * You can remove this if you don't like it, but it can help catch unwanted waterfalls by simulating
 * network latency that would occur in production but not in local development.
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();

  if (t._config.isDev) {
    // artificial delay in dev
    const waitMs = Math.floor(Math.random() * 400) + 100;
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  const result = await next();

  const end = Date.now();
  console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

  return result;
});

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Middleware: Enforce user authentication
 *
 * Throws UNAUTHORIZED error if user is not authenticated
 */
const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return next({
    ctx: {
      ...ctx,
      // infers the `session` as non-nullable
      session: { ...ctx.session, user: ctx.session.user },
    },
  });
});

const enforceTenantContext = t.middleware(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }

  const isRoot = hasRootSessionAccess(ctx);
  const tenantId = resolveSessionTenantId(ctx);

  if (!isRoot && !tenantId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Active tenant is required",
    });
  }

  return next({
    ctx: {
      ...ctx,
      session: { ...ctx.session, user: ctx.session.user },
      tenantId: tenantId ?? null,
      isRoot,
    },
  });
});

/**
 * Middleware: Enforce role requirements
 *
 * @param allowedRoles - Array of roles that are allowed to access this procedure
 */
const enforceRole = (allowedRoles: Role[]) => {
  return t.middleware(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }

    const userRoles = normalizeRoles({
      roles: ctx.session.user.roles,
      role: ctx.session.user.role,
      includeDefault: false,
    });
    const isRoot = hasRootSessionAccess(ctx);

    if (isRoot) {
      return next({
        ctx: {
          ...ctx,
          session: { ...ctx.session, user: ctx.session.user },
        },
      });
    }

    if (userRoles.length === 0) {
      throw new TRPCError({
        code: "UNAUTHORIZED",
        message: "Authentication required",
      });
    }
    if (!allowedRoles.some((role) => userRoles.includes(role))) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Insufficient permissions for this operation",
      });
    }
    return next({
      ctx: {
        ...ctx,
        // Preserve the non-nullable session type from protectedProcedure
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });
};

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
// export const protectedProcedure = t.procedure
//   .use(timingMiddleware)
//   .use(enforceUserIsAuthed);

export const protectedProcedure = t.procedure
  .use(timingMiddleware)
  .use(enforceUserIsAuthed)
  .use(enforceTenantContext)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        ...ctx,
        // infers the `session` as non-nullable
        session: { ...ctx.session, user: ctx.session.user },
      },
    });
  });

/**
 * Supervisor procedure - requires SUPERVISOR, SALES_CHIEF, MANAGER, DIRECTOR, or ADMIN role
 */
export const supervisorProcedure = protectedProcedure.use(
  enforceRole(["SUPERVISOR", "SALES_CHIEF", "MANAGER", "DIRECTOR", "ADMIN"]),
);

/**
 * Manager procedure - requires MANAGER, DIRECTOR, or ADMIN role
 */
export const managerProcedure = protectedProcedure.use(
  enforceRole(["MANAGER", "DIRECTOR", "ADMIN"]),
);

/**
 * Director procedure - requires DIRECTOR or ADMIN role
 */
export const directorProcedure = protectedProcedure.use(
  enforceRole(["DIRECTOR", "ADMIN"]),
);

/**
 * Finance procedure - requires FINANCE or ADMIN role
 */
export const financeProcedure = protectedProcedure.use(
  enforceRole(["FINANCE", "ADMIN"]),
);

/**
 * Admin procedure - requires ADMIN role only
 */
export const adminProcedure = protectedProcedure.use(enforceRole(["ADMIN"]));
