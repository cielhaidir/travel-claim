# Quick MCP Access Guide

## Your MCP Server is Ready! 🎉

Your Travel Claim System already has **2 MCP-enabled procedures** ready to use:

### Available MCP Tools

1. **`get_user_by_phone`** (from [`user.ts:73-78`](src/server/api/routers/user.ts:73-78))
   - **Description**: Get user information by phone number (searches across all fields including phone)
   - **Router**: `user.getAll`
   - **Access Level**: Manager+ (MANAGER, DIRECTOR, ADMIN)

2. **`list_my_travel_requests`** (from [`travelRequest.ts:29-34`](src/server/api/routers/travelRequest.ts:29-34))
   - **Description**: List all travel requests for the current user that are eligible for claims
   - **Router**: `travelRequest.getAll`
   - **Access Level**: Protected (any authenticated user)

## How to Access Now

### Option 1: Claude Desktop (Recommended)

1. **Make sure your dev server is running:**
   ```bash
   cd travel-claim
   npm run dev
   ```

2. **Add to Claude Desktop config** (`~/Library/Application Support/Claude/claude_desktop_config.json`):
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

3. **Restart Claude Desktop**

4. **Test it by asking Claude:**
   - "Search for user by phone number +628123456789"
   - "Show me my travel requests"
   - "List all my pending travel requests"

### Option 2: Direct HTTP Test

Test the MCP endpoint directly:

```bash
# Test list tools
curl -X POST http://localhost:3000/api/mcp/http \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
  }'
```

### Option 3: Use with Claude API (Programmatic)

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const response = await client.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 1024,
  tools: [
    {
      name: "get_user_by_phone",
      description: "Get user information by phone number",
      input_schema: {
        type: "object",
        properties: {
          search: { type: "string", description: "Phone number to search" },
        },
      },
    },
  ],
  messages: [
    {
      role: "user",
      content: "Find user with phone +628123456789",
    },
  ],
});
```

## MCP Endpoints

Your server exposes these endpoints:

- **SSE Transport**: `http://localhost:3000/api/mcp/sse` ✅ Recommended
- **HTTP Transport**: `http://localhost:3000/api/mcp/http`

## Authentication

The MCP server uses your NextAuth session. Make sure you're logged in to the web app first, then the MCP tools will use that session.

## Current Status

✅ MCP infrastructure configured  
✅ 2 procedures enabled as MCP tools  
✅ Authentication integrated  
✅ Ready to use  

## Need More Tools?

To enable more procedures as MCP tools, add the `mcp` metadata to any tRPC procedure:

```typescript
.meta({
  mcp: {
    enabled: true,
    name: "tool_name",
    description: "What this tool does",
  },
})
```

See [`MCP_SETUP_GUIDE.md`](MCP_SETUP_GUIDE.md) for detailed instructions.

## Start Using Now!

1. ✅ Dev server running? `npm run dev`
2. ✅ Configure Claude Desktop (see above)
3. ✅ Restart Claude Desktop
4. ✅ Ask Claude to use your tools!

**Your MCP server is accessible at: `http://localhost:3000/api/mcp/sse`**
