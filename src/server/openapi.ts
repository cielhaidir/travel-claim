import { generateOpenApiDocument } from "trpc-to-openapi";
import { appRouter } from "@/server/api/root";

export const openApiDocument = generateOpenApiDocument(appRouter, {
  title: "Travel Claim Management System API",
  description: "REST API for managing travel requests, claims, approvals, and related entities",
  version: "1.0.0",
  baseUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api",
  tags: [
    "Posts",
    "Departments", 
    "Users",
    "Travel Requests",
    "Approvals",
    "Claims",
    "Attachments",
    "Notifications",
    "Audit Logs",
    "Dashboard"
  ],
  securitySchemes: {
    bearerAuth: {
      type: "http",
      scheme: "bearer",
      bearerFormat: "JWT",
      description: "NextAuth session token"
    }
  }
});