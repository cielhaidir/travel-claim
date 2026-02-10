import { openApiDocument } from "@/server/openapi";
import { type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  return Response.json(openApiDocument, {
    headers: {
      "Content-Type": "application/json",
    },
  });
}