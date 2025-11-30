# Real Life Example

A complete example showing how to use all Alt-stack packages together in a production-like setup.

## Overview

This example demonstrates a task management system with:

- **2 Backend Services** (Hono): Authentication and business logic
- **Background Workers** (WarpStream): Notifications and report generation
- **NextJS Frontend**: Consumes both services via generated SDKs
- **Type-safe SDKs**: Generated from OpenAPI/AsyncAPI specs

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          NextJS Web App                          │
│              (uses http-client-ky + generated SDKs)              │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │                       │
                    ▼                       ▼
        ┌───────────────────┐   ┌───────────────────┐
        │   backend-auth    │   │   backend-logic   │
        │   (Hono server)   │   │   (Hono server)   │
        │                   │   │                   │
        │ - POST /signup    │◄──│ validates tokens  │
        │ - POST /login     │   │                   │
        │ - POST /logout    │   │ - GET/POST /tasks │
        │ - GET /me         │   │ - PUT/DELETE /{id}│
        │ - GET /validate   │   │                   │
        └───────────────────┘   └─────────┬─────────┘
                                          │
                                          │ triggers jobs
                                          ▼
                                ┌───────────────────┐
                                │     WarpStream    │
                                │     Workers       │
                                │                   │
                                │ - send-notification│
                                │ - generate-report │
                                └───────────────────┘
```

## Key Takeaways

### 1. End-to-End Type Safety

Types flow from Zod schemas through OpenAPI/AsyncAPI specs to generated SDKs:

```typescript
// Define once in backend-logic
const TaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(["pending", "in_progress", "completed"]),
});

// Automatically available in frontend via SDK
import type { TaskSchema } from "@real-life/backend-logic-sdk";
type Task = z.infer<typeof TaskSchema>;
```

### 2. Service-to-Service Auth

The logic service validates tokens by calling the auth service's internal endpoint:

```typescript
// backend-logic calls backend-auth
async function validateToken(token: string): Promise<string | null> {
  const res = await ky.get(`${AUTH_SERVICE_URL}/api/validate`, {
    headers: { authorization: token },
  }).json<{ valid: boolean; userId?: string }>();
  return res.valid ? res.userId ?? null : null;
}
```

### 3. Protected Procedures with Middleware

Create reusable authenticated procedures:

```typescript
const protectedProc = factory.procedure
  .errors({ 401: z.object({ error: z.object({ code: z.literal("UNAUTHORIZED") }) }) })
  .use(async ({ ctx, next }) => {
    if (!ctx.userId) throw ctx.error({ error: { code: "UNAUTHORIZED", ... } });
    return next({ ctx: { userId: ctx.userId } }); // narrow type
  });
```

### 4. Type-Safe Background Jobs

Trigger workers with full type inference from the SDK:

```typescript
import { Topics } from "@real-life/workers-sdk";

const client = await createWarpStreamClient({ jobs: Topics, ... });

// TypeScript knows the exact payload shape
await client.trigger("send-notification", {
  type: "task_created",  // must be valid enum
  userId: ctx.userId,
  taskId: id,
  taskTitle: input.body.title,
});
```

### 5. SDK-First Frontend

The frontend uses generated SDKs with `http-client-ky` for fully typed API calls:

```typescript
import { createApiClient } from "@alt-stack/http-client-ky";
import { Request, Response } from "@real-life/backend-logic-sdk";

const client = createApiClient({ baseUrl, Request, Response });

// Full autocomplete for paths, params, body, and response
const result = await client.get("/api/{id}", { params: { id: "..." } });
if (result.success) {
  console.log(result.body.title); // TypeScript knows this exists
}
```

## What You'll Learn

| Topic | Description |
|-------|-------------|
| [Project Structure](./project-structure) | Monorepo layout and package organization |
| [Auth Service](./auth-service) | Building the authentication service |
| [Logic Service](./logic-service) | Business logic with auth integration |
| [Workers](./workers) | Background job processing with WarpStream |
| [Frontend](./frontend) | NextJS app with SDK consumption |
| [SDK Generation](./sdk-generation) | Generating and using type-safe SDKs |

## Quick Start

```bash
# Clone and navigate to example
cd examples/real-life

# Install dependencies
pnpm install

# Generate SDKs
pnpm generate:all

# Start all services (in separate terminals)
pnpm --filter @real-life/backend-auth dev   # Port 3001
pnpm --filter @real-life/backend-logic dev  # Port 3002
pnpm --filter @real-life/workers dev
pnpm --filter @real-life/web dev            # Port 3000
```

## Technologies Used

| Package | Technology | Purpose |
|---------|------------|---------|
| `@alt-stack/server-hono` | Hono | Type-safe HTTP servers |
| `@alt-stack/workers-warpstream` | WarpStream/Kafka | Background job processing |
| `@alt-stack/workers-client-warpstream` | WarpStream/Kafka | Job triggering |
| `@alt-stack/zod-openapi` | OpenAPI | REST API SDK generation |
| `@alt-stack/zod-asyncapi` | AsyncAPI | Worker SDK generation |
| `@alt-stack/http-client-ky` | ky | Type-safe HTTP client with SDK integration |
| `Next.js` | React | Frontend framework |
