import { openApiDocument } from "@/server/openapi";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(openApiDocument, {
    headers: {
      "Content-Type": "application/json",
    },
  });
}