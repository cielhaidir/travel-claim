import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    AUTH_SECRET:
      process.env.NODE_ENV === "production"
        ? z.string()
        : z.string().optional(),
    NEXTAUTH_URL: z.string().url().optional(),
    AZURE_AD_CLIENT_ID: z.string().optional(),
    AZURE_AD_CLIENT_SECRET: z.string().optional(),
    AZURE_AD_TENANT_ID: z.string().optional(),
    DATABASE_URL: z.string().url(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    // Required for MCP SSE transport; optional when using Streamable HTTP (/api/mcp/mcp)
    REDIS_URL: z.string().url().optional(),
    // Static API token for MCP header-based authentication (e.g. used by Roo/Claude Desktop)
    MCP_API_TOKEN: z.string().optional(),
    // Email of the user to impersonate when MCP_API_TOKEN is used
    MCP_API_TOKEN_USER_EMAIL: z.string().email().optional(),
    // WhatsApp notification gateway (WA-JS / Baileys compatible API)
    WHATSAPP_BASE_URL: z.string().url().optional(),
    WHATSAPP_DEVICE_ID: z.string().optional(),
    // Basic auth credentials "username:password" — will be base64-encoded at runtime
    WHATSAPP_BASIC_AUTH: z.string().optional(),
    // Cloudflare R2 / S3-compatible storage
    R2_ACCOUNT_ID: z.string().optional(),
    R2_ACCESS_KEY_ID: z.string().optional(),
    R2_SECRET_ACCESS_KEY: z.string().optional(),
    R2_BUCKET_NAME: z.string().optional(),
    R2_PUBLIC_URL: z.string().url().optional(),
  },

  /**
   * Specify your client-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars. To expose them to the client, prefix them with
   * `NEXT_PUBLIC_`.
   */
  client: {
    // NEXT_PUBLIC_CLIENTVAR: z.string(),
  },

  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    AUTH_SECRET: process.env.AUTH_SECRET,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    AZURE_AD_CLIENT_ID: process.env.AZURE_AD_CLIENT_ID,
    AZURE_AD_CLIENT_SECRET: process.env.AZURE_AD_CLIENT_SECRET,
    AZURE_AD_TENANT_ID: process.env.AZURE_AD_TENANT_ID,
    DATABASE_URL: process.env.DATABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    REDIS_URL: process.env.REDIS_URL,
    MCP_API_TOKEN: process.env.MCP_API_TOKEN,
    MCP_API_TOKEN_USER_EMAIL: process.env.MCP_API_TOKEN_USER_EMAIL,
    WHATSAPP_BASE_URL: process.env.WHATSAPP_BASE_URL,
    WHATSAPP_DEVICE_ID: process.env.WHATSAPP_DEVICE_ID,
    WHATSAPP_BASIC_AUTH: process.env.WHATSAPP_BASIC_AUTH,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME: process.env.R2_BUCKET_NAME,
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
