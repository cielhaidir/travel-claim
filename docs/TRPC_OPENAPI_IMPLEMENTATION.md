# tRPC to OpenAPI Implementation Guide

## Overview

This document describes the implementation of REST API endpoints using trpc-to-openapi for the Travel Claim Management System. All tRPC procedures are now accessible via both tRPC and REST API.

## Architecture

### Components

1. **OpenAPI Metadata** - Added to all 88 procedures across 10 routers
2. **OpenAPI Document Generator** - `src/server/openapi.ts`
3. **OpenAPI Specification Endpoint** - `/api/openapi.json`
4. **REST API Handler** - `/api/[...openapi]/route.ts`

### Endpoint Structure

All REST endpoints follow this pattern:
- **Base URL**: `http://localhost:3000/api`
- **Path Structure**: `/api/{resource-name}/{id?}/{action?}`
- **Authentication**: Bearer token via `Authorization` header

## Available Endpoints

### Posts
- `GET /api/posts/hello` - Public hello endpoint
- `GET /api/posts/secret` - Protected secret message

### Departments (8 endpoints)
- `GET /api/departments` - List all departments
- `GET /api/departments/{id}` - Get department by ID
- `GET /api/departments/by-code/{code}` - Get department by code
- `GET /api/departments/hierarchy` - Get department hierarchy
- `POST /api/departments` - Create department (Admin)
- `PUT /api/departments/{id}` - Update department (Admin)
- `DELETE /api/departments/{id}` - Delete department (Admin)
- `POST /api/departments/{id}/restore` - Restore department (Admin)

### Users (13 endpoints)
- `GET /api/users/me` - Get current user
- `GET /api/users` - List all users (Admin)
- `GET /api/users/{id}` - Get user by ID
- `GET /api/users/direct-reports` - Get direct reports
- `GET /api/users/hierarchy` - Get user hierarchy
- `POST /api/users` - Create user (Admin)
- `PUT /api/users/{id}` - Update user (Admin)
- `PATCH /api/users/me` - Update current user
- `POST /api/users/change-password` - Change password
- `DELETE /api/users/{id}` - Delete user (Admin)
- `POST /api/users/{id}/restore` - Restore user (Admin)

### Travel Requests (11 endpoints)
- `GET /api/travel-requests` - List travel requests
- `GET /api/travel-requests/{id}` - Get travel request by ID
- `GET /api/travel-requests/pending-approvals` - Get pending approvals
- `GET /api/travel-requests/statistics` - Get statistics
- `POST /api/travel-requests` - Create travel request
- `PUT /api/travel-requests/{id}` - Update travel request
- `POST /api/travel-requests/{id}/submit` - Submit for approval
- `POST /api/travel-requests/{id}/lock` - Lock request (Manager)
- `POST /api/travel-requests/{id}/close` - Close request (Manager)
- `DELETE /api/travel-requests/{id}` - Delete travel request

### Approvals (9 endpoints)
- `GET /api/approvals/my` - Get my approvals
- `GET /api/approvals/pending-count` - Get pending count
- `GET /api/approvals/{id}` - Get approval by ID
- `POST /api/approvals/{approvalId}/approve-travel-request` - Approve travel
- `POST /api/approvals/{approvalId}/reject-travel-request` - Reject travel
- `POST /api/approvals/{approvalId}/request-revision` - Request revision
- `POST /api/approvals/{approvalId}/approve-claim` - Approve claim
- `POST /api/approvals/{approvalId}/reject-claim` - Reject claim
- `POST /api/approvals/{approvalId}/request-claim-revision` - Request claim revision

### Claims (10 endpoints)
- `GET /api/claims` - List claims
- `GET /api/claims/{id}` - Get claim by ID
- `GET /api/claims/by-travel-request/{travelRequestId}` - Get claims by travel request
- `GET /api/claims/statistics` - Get statistics (Finance)
- `POST /api/claims/entertainment` - Create entertainment claim
- `POST /api/claims/non-entertainment` - Create non-entertainment claim
- `PUT /api/claims/{id}` - Update claim
- `POST /api/claims/{id}/submit` - Submit claim
- `POST /api/claims/{id}/mark-paid` - Mark as paid (Finance)
- `DELETE /api/claims/{id}` - Delete claim

### Attachments (7 endpoints)
- `GET /api/attachments/by-claim/{claimId}` - Get attachments by claim
- `GET /api/attachments/{id}` - Get attachment by ID
- `GET /api/attachments/{id}/download-url` - Get download URL
- `POST /api/attachments` - Create attachment
- `POST /api/attachments/batch` - Create multiple attachments
- `PATCH /api/attachments/{id}` - Update attachment
- `DELETE /api/attachments/{id}` - Delete attachment

### Notifications (13 endpoints)
- `GET /api/notifications/my` - Get my notifications
- `GET /api/notifications/unread-count` - Get unread count
- `GET /api/notifications/{id}` - Get notification by ID
- `GET /api/notifications/statistics` - Get statistics
- `POST /api/notifications` - Create notification (Admin)
- `POST /api/notifications/batch` - Create batch notifications (Admin)
- `PATCH /api/notifications/{id}/mark-read` - Mark as read
- `POST /api/notifications/mark-all-read` - Mark all as read
- `POST /api/notifications/mark-many-read` - Mark many as read
- `PATCH /api/notifications/{id}/status` - Update status
- `POST /api/notifications/{id}/resend` - Resend notification
- `DELETE /api/notifications/{id}` - Delete notification
- `DELETE /api/notifications/all-read` - Delete all read

### Audit Logs (10 endpoints)
- `GET /api/audit-logs` - List audit logs (Admin)
- `GET /api/audit-logs/{id}` - Get audit log by ID
- `GET /api/audit-logs/by-entity` - Get by entity
- `GET /api/audit-logs/my-actions` - Get my actions
- `GET /api/audit-logs/travel-request/{travelRequestId}` - Get travel request trail
- `GET /api/audit-logs/claim/{claimId}` - Get claim trail
- `GET /api/audit-logs/recent-activity` - Get recent activity
- `GET /api/audit-logs/statistics` - Get statistics (Admin)
- `GET /api/audit-logs/search` - Search audit logs
- `GET /api/audit-logs/export` - Export audit logs (Admin)

### Dashboard (5 endpoints)
- `GET /api/dashboard/my` - Get my dashboard
- `GET /api/dashboard/manager` - Get manager dashboard (Manager)
- `GET /api/dashboard/finance` - Get finance dashboard (Finance)
- `GET /api/dashboard/travel-trends` - Get travel trends
- `GET /api/dashboard/expense-analysis` - Get expense analysis

## Testing the Implementation

### 1. View OpenAPI Specification

Start the development server:
```bash
npm run dev
```

Access the OpenAPI spec:
```bash
curl http://localhost:3000/api/openapi.json
```

### 2. Test Public Endpoints

Test the hello endpoint:
```bash
curl http://localhost:3000/api/posts/hello
```

Expected response:
```json
{
  "greeting": "hello from tRPC"
}
```

### 3. Test Protected Endpoints

First, obtain a session token by logging in through the web interface at `http://localhost:3000/login`.

Then use the token:
```bash
curl -H "Authorization: Bearer YOUR_SESSION_TOKEN" \
  http://localhost:3000/api/users/me
```

### 4. Test with Query Parameters

List departments with filters:
```bash
curl "http://localhost:3000/api/departments?limit=10&cursor=abc123"
```

### 5. Test POST Requests

Create a department (requires admin token):
```bash
curl -X POST http://localhost:3000/api/departments \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "IT",
    "name": "Information Technology",
    "description": "IT Department"
  }'
```

### 6. Test with Path Parameters

Get user by ID:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/api/users/user_123
```

## Integration with API Clients

### Swagger UI

You can use the OpenAPI spec with Swagger UI or similar tools:

1. Install Swagger UI (optional):
```bash
npm install swagger-ui-react
```

2. Create a page to render the spec:
```typescript
import SwaggerUI from 'swagger-ui-react';
import 'swagger-ui-react/swagger-ui.css';

export default function ApiDocs() {
  return <SwaggerUI url="/api/openapi.json" />;
}
```

### Postman

1. Import the OpenAPI spec into Postman
2. Use `http://localhost:3000/api/openapi.json` as the source
3. Postman will generate a collection with all endpoints

### Code Generation

Generate TypeScript client from the spec:
```bash
npx openapi-typescript http://localhost:3000/api/openapi.json --output src/types/api.ts
```

## Authentication

All protected endpoints require authentication via NextAuth session token:

```typescript
const headers = {
  'Authorization': 'Bearer YOUR_SESSION_TOKEN',
  'Content-Type': 'application/json'
};
```

Role-based access control:
- **Public**: No authentication required
- **Protected**: Requires valid session
- **Supervisor/Manager/Director**: Requires specific roles
- **Finance**: Requires FINANCE or ADMIN role
- **Admin**: Requires ADMIN role

## Error Handling

The API returns standard HTTP status codes:
- `200` - Success
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (no/invalid token)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `409` - Conflict (e.g., duplicate entry)
- `500` - Internal Server Error

Error response format:
```json
{
  "error": {
    "message": "Error description",
    "code": "TRPC_ERROR_CODE"
  }
}
```

## Important Notes

### Zod Version Compatibility

⚠️ **Important**: The project uses Zod v3.24.2, but trpc-to-openapi requires Zod v4. The package was installed with `--legacy-peer-deps` flag. While this works for basic functionality, some advanced Zod features might not be fully supported in the OpenAPI spec generation.

### SuperJSON Transformer

The tRPC configuration uses SuperJSON for data transformation (Dates, BigInt, etc.). However, OpenAPI/REST clients won't automatically handle these transformations. Consider:
- Using ISO strings for dates in REST API
- Documenting special types in API spec
- Adding custom serialization for complex types

### Limitations

1. **Cursor-based pagination**: Not standard REST. Consider adding offset-based pagination for REST clients.
2. **Nested Prisma includes**: May result in large response payloads.
3. **File uploads**: Attachment creation via REST API may require multipart/form-data handling.

## Next Steps

1. **Add API Documentation UI**: Implement Swagger UI or ReDoc
2. **Add Rate Limiting**: Protect REST endpoints from abuse
3. **Add CORS Configuration**: For cross-origin requests
4. **Add API Versioning**: Plan for future API changes
5. **Add OpenAPI Examples**: Enhance documentation with request/response examples
6. **Add Integration Tests**: Test REST endpoints alongside tRPC
7. **Consider Zod v4 Upgrade**: For full trpc-to-openapi compatibility

## Resources

- [trpc-to-openapi Documentation](https://github.com/jlalmes/trpc-openapi)
- [OpenAPI Specification](https://swagger.io/specification/)
- [tRPC Documentation](https://trpc.io/)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)