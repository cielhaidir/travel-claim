import { trpcToMcpHandler } from "trpc-to-mcp/adapters/vercel-mcp-adapter";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { env } from "@/env";
import { normalizeRoles, type Role } from "@/lib/constants/roles";
import { resolveEffectivePermissions } from "@/server/auth/permission-store";

/**
 * MCP Server Endpoint
 *
 * This endpoint exposes tRPC procedures as MCP tools using the Vercel MCP adapter.
 * It provides authentication support through NextAuth and follows the Next.js App Router conventions.
 *
 * The endpoint is accessible at: /api/mcp/*
 *
 * Transport options:
 *  - Streamable HTTP (recommended, no Redis required): /api/mcp/mcp
 *  - SSE (legacy, requires REDIS_URL):                /api/mcp/sse  &  /api/mcp/message
 *
 * Authentication options:
 *  - NextAuth session cookie (browser-based)
 *  - Bearer token via Authorization header (for MCP clients like Roo/Claude Desktop)
 *    Set MCP_API_TOKEN and MCP_API_TOKEN_USER_EMAIL in your .env to enable this.
 *
 * @see https://github.com/iboughtbed/trpc-to-mcp for documentation
 */
async function handleMcpRequest(request: Request) {
  let session = await auth();

  // If no session from cookie, try Bearer token from Authorization header
  if (!session?.user) {
    const authHeader = request.headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (
      bearerToken &&
      env.MCP_API_TOKEN &&
      bearerToken === env.MCP_API_TOKEN &&
      env.MCP_API_TOKEN_USER_EMAIL
    ) {
      // Look up the user associated with this token
      const tokenUser = await db.user.findUnique({
        where: { email: env.MCP_API_TOKEN_USER_EMAIL },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          employeeId: true,
          departmentId: true,
          image: true,
        },
      });

      if (tokenUser) {
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
          WHERE tm."userId" = ${tokenUser.id}
          ORDER BY tm."isDefault" DESC, tm."createdAt" ASC
        `;
        const activeMemberships = memberships.filter(
          (membership) => membership.status === "ACTIVE",
        );
        const activeTenantId =
          activeMemberships.find((membership) => membership.isDefault)
            ?.tenantId ??
          activeMemberships[0]?.tenantId ??
          memberships.find((membership) => membership.isRootTenant)?.tenantId ??
          null;

        const roles = normalizeRoles({ roles: [], role: tokenUser.role });
        const isRoot = roles.includes("ROOT");
        const permissions = await resolveEffectivePermissions(db, {
          tenantId: activeTenantId,
          roles,
          isRoot,
        });

        // Build a synthetic session object matching the NextAuth session shape
        session = {
          user: {
            id: tokenUser.id,
            name: tokenUser.name ?? "",
            email: tokenUser.email ?? "",
            role: tokenUser.role,
            roles,
            permissions,
            employeeId: tokenUser.employeeId,
            departmentId: tokenUser.departmentId,
            activeTenantId,
            isRoot,
            memberships: memberships.map((membership) => ({
              tenantId: membership.tenantId,
              tenantName: membership.tenantName,
              tenantSlug: membership.tenantSlug,
              role: membership.role as Role,
              status: membership.status as "ACTIVE" | "INVITED" | "SUSPENDED",
              isDefault: membership.isDefault,
              isRootTenant: membership.isRootTenant,
            })),
            image: tokenUser.image ?? null,
          },
          expires: new Date(Date.now() + 1000 * 60 * 60).toISOString(), // 1h
        };
      }
    }
  }

  // Create tRPC context with session, db, and request headers
  const ctx = await createTRPCContext({
    headers: request.headers,
  });

  // Create the MCP handler with the app router and context.
  // redisUrl is only required for the legacy SSE transport; the modern
  // Streamable HTTP transport (/api/mcp/mcp) works without Redis.
  const handler = trpcToMcpHandler(
    appRouter,
    () => ({
      ...ctx,
      session,
    }),
    {
      config: {
        basePath: "/api/mcp",
        verboseLogs: process.env.NODE_ENV === "development",
        maxDuration: 60,
        // When REDIS_URL is set, enable SSE transport and pass the URL.
        // When REDIS_URL is not set, disable SSE so the handler never calls
        // initializeRedis() (which throws "redisUrl is required"). Use the
        // Streamable HTTP transport at /api/mcp/mcp instead.
        ...(process.env.REDIS_URL
          ? { redisUrl: process.env.REDIS_URL }
          : { disableSse: true }),
      },
    },
  );

  return await handler(request);
}

// Export the handler for DELETE, GET, and POST methods as required by Next.js App Router
export {
  handleMcpRequest as DELETE,
  handleMcpRequest as GET,
  handleMcpRequest as POST,
};
