# MCP Server Setup Guide

## Overview

Your Travel Claim System is now configured as an **MCP (Model Context Protocol) Server**! This allows AI assistants like Claude to interact with your tRPC procedures as tools.

## What's Already Configured

### 1. Dependencies Installed ✅
- `trpc-to-mcp`: ^1.3.2
- `mcp-handler`: ^1.0.7

### 2. tRPC Configuration ✅
The tRPC instance in [`src/server/api/trpc.ts`](src/server/api/trpc.ts:14) includes `McpMeta` type:

```typescript
import { type McpMeta } from "trpc-to-mcp";

const t = initTRPC
  .context<typeof createTRPCContext>()
  .meta<OpenApiMeta & McpMeta>()
  .create({...});
```

### 3. MCP Endpoint Configured ✅
The MCP server is exposed at [`/api/mcp/[transport]`](src/app/api/mcp/[transport]/route.ts):

```typescript
import { trpcToMcpHandler } from "trpc-to-mcp/adapters/vercel-mcp-adapter";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { auth } from "@/server/auth";

async function handleMcpRequest(request: Request) {
  const session = await auth();
  
  const ctx = await createTRPCContext({
    headers: request.headers,
  });

  const handler = trpcToMcpHandler(appRouter, () => ({
    ...ctx,
    session,
  }), {
    config: {
      basePath: "/api/mcp",
      verboseLogs: process.env.NODE_ENV === "development",
      maxDuration: 60,
    },
  });

  return await handler(request);
}

export { handleMcpRequest as DELETE, handleMcpRequest as GET, handleMcpRequest as POST };
```

## How to Enable MCP on tRPC Procedures

### Basic Example

To expose a tRPC procedure as an MCP tool, add the `mcp` metadata:

```typescript
export const myRouter = createTRPCRouter({
  getProcedure: protectedProcedure
    .meta({
      mcp: {
        enabled: true,
        name: "get_something",  // Optional: defaults to procedureName
        description: "Clear description of what this tool does",
      },
    })
    .input(z.object({
      id: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      // Your logic here
    }),
});
```

### Current MCP-Enabled Procedures

#### User Router
1. **`user.getAll`** → `get_user_by_phone`
   - Description: Get user information by phone number (searches across all fields including phone)
   - Example in [`src/server/api/routers/user.ts:73-78`](src/server/api/routers/user.ts:73-78)

## Adding More MCP Tools

Here are recommended procedures to enable as MCP tools:

### High Priority

1. **Travel Request Management**
   ```typescript
   // In travelRequest router
   .meta({
     mcp: {
       enabled: true,
       name: "create_travel_request",
       description: "Create a new travel request for an employee with destination, dates, and purpose",
     },
   })
   ```

2. **Claim Management**
   ```typescript
   // In claim router
   .meta({
     mcp: {
       enabled: true,
       name: "submit_travel_claim",
       description: "Submit a travel expense claim with amount, category, and receipts",
     },
   })
   ```

3. **Approval Workflow**
   ```typescript
   // In approval router
   .meta({
     mcp: {
       enabled: true,
       name: "approve_request",
       description: "Approve or reject a travel request or claim with optional comments",
     },
   })
   ```

4. **Dashboard Stats**
   ```typescript
   // In dashboard router
   .meta({
     mcp: {
       enabled: true,
       name: "get_user_dashboard",
       description: "Get user's travel and claim statistics, pending approvals, and recent activity",
     },
   })
   ```

## Testing Your MCP Server

### 1. Start the Development Server

```bash
cd travel-claim
npm run dev
```

### 2. Test MCP Endpoint

Your MCP server will be available at:
- Local: `http://localhost:3000/api/mcp/sse` (SSE transport)
- Local: `http://localhost:3000/api/mcp/http` (HTTP transport)

### 3. Verify Tools Are Exposed

You can test by making a request to list available tools:

```bash
curl -X POST http://localhost:3000/api/mcp/http \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

### 4. Connect from Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "travel-claim-system": {
      "url": "http://localhost:3000/api/mcp/sse",
      "transport": "sse"
    }
  }
}
```

## Advanced: Transform Outputs for Better AI Context

If you want to provide human-readable context instead of raw JSON, use `transformMcpProcedure`:

```typescript
import { transformMcpProcedure } from "trpc-to-mcp";

export const router = createTRPCRouter({
  getTravelRequest: transformMcpProcedure(
    protectedProcedure
      .meta({
        mcp: {
          enabled: true,
          name: "get_travel_details",
          description: "Get detailed travel request information",
        },
      })
      .input(z.object({ id: z.string() }))
      .query(async ({ ctx, input }) => {
        const travel = await ctx.db.travelRequest.findUnique({
          where: { id: input.id },
          include: { user: true, department: true },
        });
        return travel;
      }),
    // Transform function to convert output to ContentBlock[]
    (travel) => {
      if (!travel) {
        return [{
          type: "text" as const,
          text: "Travel request not found",
        }];
      }
      
      return [{
        type: "text" as const,
        text: `Travel Request: ${travel.user.name} to ${travel.destination}
Date: ${travel.startDate.toLocaleDateString()} - ${travel.endDate.toLocaleDateString()}
Purpose: ${travel.purpose}
Status: ${travel.status}
Department: ${travel.department.name}`,
      }];
    }
  ),
});
```

## Security Considerations

### Authentication
The MCP endpoint uses NextAuth for authentication. The session is passed to the tRPC context, so all your existing auth middleware works:

- `protectedProcedure`: Requires authentication
- `adminProcedure`: Requires ADMIN role
- `managerProcedure`: Requires MANAGER, DIRECTOR, or ADMIN role
- etc.

### Authorization
Each tool inherits the authorization rules from its tRPC procedure. An AI assistant can only perform actions that the authenticated user is allowed to perform.

### Best Practices
1. **Only expose read-only or safe operations initially**
2. **Use clear, descriptive tool names and descriptions**
3. **Include proper input validation with Zod schemas**
4. **Test tools thoroughly before production use**
5. **Monitor usage through audit logs**

## Deployment

### Environment Variables
Make sure to set in production:

```env
NODE_ENV=production  # This will disable verbose MCP logs
```

### Vercel Deployment
The MCP endpoint works seamlessly with Vercel deployment. Just deploy as normal:

```bash
npm run build
vercel deploy --prod
```

Your MCP server will be available at:
`https://your-domain.vercel.app/api/mcp/sse`

## Example Use Cases

### With Claude Desktop

Once connected, you can ask Claude:

- "Show me all pending travel requests"
- "Create a travel request to Jakarta from March 15-20 for client meeting"
- "What's my current travel claim balance?"
- "Approve travel request TR-2024-001"
- "Search for user by phone number +628123456789"

Claude will automatically use the appropriate MCP tools to fulfill these requests.

## Troubleshooting

### Tools Not Showing Up
1. Verify `mcp.enabled: true` in procedure metadata
2. Check that the procedure has proper input/output schemas
3. Restart the development server
4. Check console for errors

### Authentication Issues
1. Ensure you're logged in to the application
2. Check that session cookies are being sent
3. Verify NEXTAUTH_SECRET is set correctly

### Type Errors
1. Make sure `McpMeta` is included in your tRPC meta type
2. Run `npm run typecheck` to catch TypeScript issues

## Resources

- [trpc-to-mcp Documentation](https://github.com/iboughtbed/trpc-to-mcp)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Claude Desktop MCP Guide](https://docs.anthropic.com/claude/docs/model-context-protocol)

## Next Steps

1. ✅ Review this guide
2. ⬜ Enable MCP on key procedures (see recommendations above)
3. ⬜ Test tools locally
4. ⬜ Connect Claude Desktop to your MCP server
5. ⬜ Deploy to production
6. ⬜ Monitor usage and iterate

---

**Your Travel Claim System is now ready to be used as an MCP server!** 🎉
