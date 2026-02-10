import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z, ZodError } from "zod";
import { authOptions } from "@/server/auth/config";
import { Role } from "../../../generated/prisma";

// Standard API response format
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    hasMore?: boolean;
  };
}

// Error response helper
export function errorResponse(
  message: string,
  code: string = "INTERNAL_ERROR",
  status: number = 500,
  details?: any
): NextResponse<ApiResponse> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
    },
    { status }
  );
}

// Success response helper
export function successResponse<T>(
  data: T,
  meta?: ApiResponse["meta"],
  status: number = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
      meta,
    },
    { status }
  );
}

// Get authenticated session
export async function getAuthSession(request: NextRequest) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    throw new ApiError("Unauthorized", "UNAUTHORIZED", 401);
  }
  
  return session;
}

// Custom API Error class
export class ApiError extends Error {
  constructor(
    message: string,
    public code: string = "INTERNAL_ERROR",
    public status: number = 500,
    public details?: any
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Check user role
export function checkRole(userRole: Role, allowedRoles: Role[]): boolean {
  return allowedRoles.includes(userRole);
}

// Require specific roles
export function requireRoles(userRole: Role, allowedRoles: Role[]) {
  if (!checkRole(userRole, allowedRoles)) {
    throw new ApiError(
      "Insufficient permissions",
      "FORBIDDEN",
      403
    );
  }
}

// Validate request body with Zod schema
export async function validateBody<T>(
  request: NextRequest,
  schema: z.ZodSchema<T>
): Promise<T> {
  try {
    const body = await request.json();
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiError(
        "Validation error",
        "VALIDATION_ERROR",
        400,
        error.errors
      );
    }
    throw new ApiError("Invalid JSON body", "BAD_REQUEST", 400);
  }
}

// Parse query parameters
export function parseQuery(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  return {
    get: (key: string) => searchParams.get(key),
    getAll: (key: string) => searchParams.getAll(key),
    has: (key: string) => searchParams.has(key),
    getNumber: (key: string, defaultValue?: number) => {
      const value = searchParams.get(key);
      if (!value) return defaultValue;
      const num = parseInt(value, 10);
      return isNaN(num) ? defaultValue : num;
    },
    getBoolean: (key: string, defaultValue?: boolean) => {
      const value = searchParams.get(key);
      if (!value) return defaultValue;
      return value === "true" || value === "1";
    },
    getDate: (key: string) => {
      const value = searchParams.get(key);
      if (!value) return undefined;
      const date = new Date(value);
      return isNaN(date.getTime()) ? undefined : date;
    },
  };
}

// Handle API errors uniformly
export function handleApiError(error: unknown): NextResponse<ApiResponse> {
  console.error("API Error:", error);

  if (error instanceof ApiError) {
    return errorResponse(error.message, error.code, error.status, error.details);
  }

  if (error instanceof ZodError) {
    return errorResponse(
      "Validation error",
      "VALIDATION_ERROR",
      400,
      error.errors
    );
  }

  // Prisma errors
  if (error && typeof error === "object" && "code" in error) {
    const prismaError = error as { code: string; meta?: any };
    
    switch (prismaError.code) {
      case "P2002":
        return errorResponse(
          "A record with this value already exists",
          "DUPLICATE_ENTRY",
          409
        );
      case "P2025":
        return errorResponse(
          "Record not found",
          "NOT_FOUND",
          404
        );
      case "P2003":
        return errorResponse(
          "Foreign key constraint failed",
          "FOREIGN_KEY_ERROR",
          400
        );
      default:
        return errorResponse(
          "Database error",
          "DATABASE_ERROR",
          500
        );
    }
  }

  return errorResponse(
    "An unexpected error occurred",
    "INTERNAL_ERROR",
    500
  );
}

// Wrapper for API route handlers with error handling
export function withErrorHandler(
  handler: (request: NextRequest, context?: any) => Promise<NextResponse>
) {
  return async (request: NextRequest, context?: any) => {
    try {
      return await handler(request, context);
    } catch (error) {
      return handleApiError(error);
    }
  };
}

// Wrapper for authenticated API routes
export function withAuth(
  handler: (
    request: NextRequest,
    context: { session: Awaited<ReturnType<typeof getAuthSession>>; params?: any }
  ) => Promise<NextResponse>
) {
  return withErrorHandler(async (request: NextRequest, routeContext?: any) => {
    const session = await getAuthSession(request);
    return handler(request, { session, params: routeContext?.params });
  });
}

// Wrapper for role-protected API routes
export function withRoles(
  allowedRoles: Role[],
  handler: (
    request: NextRequest,
    context: { session: Awaited<ReturnType<typeof getAuthSession>>; params?: any }
  ) => Promise<NextResponse>
) {
  return withAuth(async (request, context) => {
    requireRoles(context.session.user.role, allowedRoles);
    return handler(request, context);
  });
}

// Extract route params from context
export function getRouteParams(context: any): Record<string, string> {
  return context?.params || {};
}

// Pagination helpers
export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export function getPaginationParams(
  request: NextRequest,
  defaultLimit: number = 50,
  maxLimit: number = 100
): PaginationParams {
  const query = parseQuery(request);
  const page = Math.max(1, query.getNumber("page", 1) ?? 1);
  const limit = Math.min(
    maxLimit,
    Math.max(1, query.getNumber("limit", defaultLimit) ?? defaultLimit)
  );
  const skip = (page - 1) * limit;

  return { page, limit, skip };
}

export function createPaginationMeta(
  page: number,
  limit: number,
  total: number
): ApiResponse["meta"] {
  return {
    page,
    limit,
    total,
    hasMore: page * limit < total,
  };
}