import { trpcToMcpHandler } from "trpc-to-mcp/adapters/vercel-mcp-adapter";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { env } from "@/env";

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
        // Build a synthetic session object matching the NextAuth session shape
        session = {
          user: {
            id: tokenUser.id,
            name: tokenUser.name ?? "",
            email: tokenUser.email ?? "",
            role: tokenUser.role,
            employeeId: tokenUser.employeeId,
            departmentId: tokenUser.departmentId,
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
        // Pass redisUrl only when the env var is present (required for SSE transport).
        // If REDIS_URL is not set, SSE endpoints will be unavailable; use /api/mcp/mcp instead.
        ...(process.env.REDIS_URL ? { redisUrl: process.env.REDIS_URL } : {}),
      },
    },
  );

  return await handler(request);
}

// Export the handler for DELETE, GET, and POST methods as required by Next.js App Router
export { handleMcpRequest as DELETE, handleMcpRequest as GET, handleMcpRequest as POST };
