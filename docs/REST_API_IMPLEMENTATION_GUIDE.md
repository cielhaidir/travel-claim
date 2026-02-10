# REST API Implementation Guide

This guide provides a complete blueprint for implementing REST APIs for the Travel and Claim Management System.

## Overview

The REST APIs are built using Next.js 14 App Router with the following structure:
- **Base Path**: `/api`
- **Authentication**: NextAuth.js session-based
- **Response Format**: Standardized JSON responses
- **Error Handling**: Centralized error handling with proper HTTP status codes

## Completed Implementations

### ✅ 1. Utility Functions (`src/lib/api/rest-utils.ts`)

Provides:
- `withAuth()` - Authentication wrapper
- `withRoles()` - Role-based access control
- `successResponse()` - Standard success response
- `errorResponse()` - Standard error response
- `validateBody()` - Zod schema validation
- `parseQuery()` - Query parameter parsing
- `getPaginationParams()` - Pagination helpers

### ✅ 2. Departments API

**Files Created:**
- `src/app/api/departments/route.ts`
- `src/app/api/departments/[id]/route.ts`

**Endpoints:**
- `GET /api/departments` - List all departments
- `POST /api/departments` - Create department (Admin only)
- `GET /api/departments/:id` - Get department by ID
- `PATCH /api/departments/:id` - Update department (Admin only)
- `DELETE /api/departments/:id` - Delete department (Admin only)

## Implementation Templates

### Standard CRUD Pattern

```typescript
// GET /api/resource - List all
export const GET = withAuth(async (request: NextRequest) => {
  const query = parseQuery(request);
  const pagination = getPaginationParams(request);
  
  const [items, total] = await Promise.all([
    db.resource.findMany({
      skip: pagination.skip,
      take: pagination.limit,
      where: { /* filters */ },
    }),
    db.resource.count({ where: { /* filters */ } }),
  ]);

  return successResponse(
    items,
    createPaginationMeta(pagination.page, pagination.limit, total)
  );
});

// POST /api/resource - Create
const createSchema = z.object({
  // define schema
});

export const POST = withAuth(async (request: NextRequest) => {
  const body = await validateBody(request, createSchema);
  
  const item = await db.resource.create({
    data: body,
  });

  return successResponse(item, undefined, 201);
});

// GET /api/resource/[id] - Get by ID
export const GET = withAuth(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const item = await db.resource.findUnique({
      where: { id: params.id },
    });

    if (!item) {
      throw new ApiError("Resource not found", "NOT_FOUND", 404);
    }

    return successResponse(item);
  }
);

// PATCH /api/resource/[id] - Update
export const PATCH = withAuth(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    const body = await validateBody(request, updateSchema);
    
    const updated = await db.resource.update({
      where: { id: params.id },
      data: body,
    });

    return successResponse(updated);
  }
);

// DELETE /api/resource/[id] - Delete
export const DELETE = withAuth(
  async (request: NextRequest, { params }: { params: { id: string } }) => {
    await db.resource.delete({
      where: { id: params.id },
    });

    return successResponse({ message: "Deleted successfully" });
  }
);
```

## Required API Endpoints

### 1. Users API (`/api/users`)

**Files to Create:**
- `src/app/api/users/route.ts`
- `src/app/api/users/[id]/route.ts`
- `src/app/api/users/me/route.ts`
- `src/app/api/users/[id]/hierarchy/route.ts`

**Endpoints:**
```
GET    /api/users              - List users
POST   /api/users              - Create user (Admin)
GET    /api/users/me           - Get current user
PATCH  /api/users/me           - Update current user
GET    /api/users/:id          - Get user by ID
PATCH  /api/users/:id          - Update user (Admin)
DELETE /api/users/:id          - Delete user (Admin)
GET    /api/users/:id/hierarchy - Get user hierarchy
```

### 2. Travel Requests API (`/api/travel-requests`)

**Files to Create:**
- `src/app/api/travel-requests/route.ts`
- `src/app/api/travel-requests/[id]/route.ts`
- `src/app/api/travel-requests/[id]/submit/route.ts`
- `src/app/api/travel-requests/[id]/lock/route.ts`
- `src/app/api/travel-requests/[id]/close/route.ts`

**Endpoints:**
```
GET    /api/travel-requests              - List travel requests
POST   /api/travel-requests              - Create travel request
GET    /api/travel-requests/:id          - Get travel request
PATCH  /api/travel-requests/:id          - Update travel request
DELETE /api/travel-requests/:id          - Delete travel request
POST   /api/travel-requests/:id/submit   - Submit for approval
POST   /api/travel-requests/:id/lock     - Lock request (Finance)
POST   /api/travel-requests/:id/close    - Close request (Finance)
```

### 3. Approvals API (`/api/approvals`)

**Files to Create:**
- `src/app/api/approvals/route.ts`
- `src/app/api/approvals/[id]/route.ts`
- `src/app/api/approvals/[id]/approve/route.ts`
- `src/app/api/approvals/[id]/reject/route.ts`
- `src/app/api/approvals/[id]/revise/route.ts`
- `src/app/api/approvals/pending/route.ts`

**Endpoints:**
```
GET    /api/approvals                  - List approvals
GET    /api/approvals/pending          - Get pending approvals
GET    /api/approvals/:id              - Get approval by ID
POST   /api/approvals/:id/approve      - Approve
POST   /api/approvals/:id/reject       - Reject
POST   /api/approvals/:id/revise       - Request revision
```

### 4. Claims API (`/api/claims`)

**Files to Create:**
- `src/app/api/claims/route.ts`
- `src/app/api/claims/[id]/route.ts`
- `src/app/api/claims/[id]/submit/route.ts`
- `src/app/api/claims/[id]/pay/route.ts`

**Endpoints:**
```
GET    /api/claims              - List claims
POST   /api/claims              - Create claim
GET    /api/claims/:id          - Get claim
PATCH  /api/claims/:id          - Update claim
DELETE /api/claims/:id          - Delete claim
POST   /api/claims/:id/submit   - Submit claim
POST   /api/claims/:id/pay      - Mark as paid (Finance)
```

### 5. Attachments API (`/api/attachments`)

**Files to Create:**
- `src/app/api/attachments/route.ts`
- `src/app/api/attachments/[id]/route.ts`
- `src/app/api/attachments/[id]/download/route.ts`
- `src/app/api/attachments/upload/route.ts`

**Endpoints:**
```
GET    /api/attachments              - List attachments
POST   /api/attachments              - Create attachment metadata
POST   /api/attachments/upload       - Upload file
GET    /api/attachments/:id          - Get attachment
DELETE /api/attachments/:id          - Delete attachment
GET    /api/attachments/:id/download - Download file
```

### 6. Notifications API (`/api/notifications`)

**Files to Create:**
- `src/app/api/notifications/route.ts`
- `src/app/api/notifications/[id]/route.ts`
- `src/app/api/notifications/[id]/read/route.ts`
- `src/app/api/notifications/read-all/route.ts`

**Endpoints:**
```
GET    /api/notifications              - List notifications
GET    /api/notifications/:id          - Get notification
DELETE /api/notifications/:id          - Delete notification
POST   /api/notifications/:id/read     - Mark as read
POST   /api/notifications/read-all     - Mark all as read
```

### 7. Audit Logs API (`/api/audit-logs`)

**Files to Create:**
- `src/app/api/audit-logs/route.ts`
- `src/app/api/audit-logs/[id]/route.ts`
- `src/app/api/audit-logs/export/route.ts`

**Endpoints:**
```
GET    /api/audit-logs           - List audit logs (Manager+)
GET    /api/audit-logs/:id       - Get audit log (Manager+)
GET    /api/audit-logs/export    - Export audit logs (Admin)
```

### 8. Dashboard API (`/api/dashboard`)

**Files to Create:**
- `src/app/api/dashboard/my/route.ts`
- `src/app/api/dashboard/manager/route.ts`
- `src/app/api/dashboard/finance/route.ts`
- `src/app/api/dashboard/analytics/route.ts`

**Endpoints:**
```
GET    /api/dashboard/my         - User dashboard
GET    /api/dashboard/manager    - Manager dashboard
GET    /api/dashboard/finance    - Finance dashboard
GET    /api/dashboard/analytics  - Analytics data
```

## Request/Response Examples

### Standard Success Response
```json
{
  "success": true,
  "data": {
    "id": "clxxx",
    "name": "Example"
  },
  "meta": {
    "page": 1,
    "limit": 50,
    "total": 100,
    "hasMore": true
  }
}
```

### Standard Error Response
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Resource not found",
    "details": null
  }
}
```

### Authentication
All requests (except login) require authentication via NextAuth session cookie.

### Common Query Parameters
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 50, max: 100)
- `sort` - Sort field
- `order` - Sort order (asc/desc)
- Specific filters per resource

## HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (validation error)
- `401` - Unauthorized (not authenticated)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (duplicate entry)
- `500` - Internal Server Error

## Role-Based Access Control

Use the `withRoles()` wrapper:

```typescript
// Admin only
export const DELETE = withRoles(["ADMIN"], async (request) => {
  // handler
});

// Manager, Director, or Admin
export const GET = withRoles(["MANAGER", "DIRECTOR", "ADMIN"], async (request) => {
  // handler
});

// Finance or Admin
export const POST = withRoles(["FINANCE", "ADMIN"], async (request) => {
  // handler
});
```

## Validation Schemas

Use Zod for request validation:

```typescript
const createTravelRequestSchema = z.object({
  purpose: z.string().min(10),
  destination: z.string().min(1),
  travelType: z.enum(["SALES", "OPERATIONAL", "MEETING", "TRAINING"]),
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
  estimatedBudget: z.number().positive().optional(),
});

export const POST = withAuth(async (request) => {
  const body = await validateBody(request, createTravelRequestSchema);
  // use validated body
});
```

## File Upload Handling

For file uploads, use FormData:

```typescript
export const POST = withAuth(async (request: NextRequest) => {
  const formData = await request.formData();
  const file = formData.get("file") as File;
  
  if (!file) {
    throw new ApiError("File is required", "BAD_REQUEST", 400);
  }

  // Validate file
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (file.size > maxSize) {
    throw new ApiError("File too large", "BAD_REQUEST", 400);
  }

  // Save file logic here
  
  return successResponse({ filename: file.name }, undefined, 201);
});
```

## Testing REST APIs

### Using cURL

```bash
# GET request
curl -X GET http://localhost:3000/api/departments \
  -H "Cookie: next-auth.session-token=..."

# POST request
curl -X POST http://localhost:3000/api/departments \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{"name":"Engineering","code":"ENG"}'

# PATCH request
curl -X PATCH http://localhost:3000/api/departments/clxxx \
  -H "Content-Type: application/json" \
  -H "Cookie: next-auth.session-token=..." \
  -d '{"name":"Updated Name"}'
```

### Using Postman/Insomnia

1. Set up environment with base URL
2. Configure authentication (session cookie)
3. Create requests for each endpoint
4. Test with various payloads

## Next Steps

1. **Complete remaining endpoints** using the templates provided
2. **Add OpenAPI documentation** using tools like `swagger-jsdoc`
3. **Implement rate limiting** for API protection
4. **Add request logging** for monitoring
5. **Create API tests** using Jest or Vitest
6. **Set up API versioning** if needed (e.g., `/api/v1/...`)

## Additional Resources

- **tRPC Routers**: The tRPC implementations can serve as business logic reference
- **Prisma Client**: Use the existing `db` instance from `@/server/db`
- **NextAuth**: Session management via `getServerSession(authOptions)`
- **Zod**: Schema validation library

## Summary

You now have:
1. ✅ Complete tRPC API implementation (internal use)
2. ✅ REST API utilities and error handling
3. ✅ Department REST API (complete example)
4. 📋 Templates and guidelines for remaining endpoints

Follow the patterns established in the Department API to implement the remaining REST endpoints.