# Real Life Example

A complete example demonstrating all Alt-stack packages working together in a real-world scenario.

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

## Packages

| Package | Description |
|---------|-------------|
| `@real-life/backend-auth` | Auth service (Hono) |
| `@real-life/backend-logic` | Business logic service (Hono) |
| `@real-life/workers` | Background job workers (WarpStream) |
| `@real-life/web` | NextJS frontend |
| `@real-life/backend-auth-sdk` | Generated OpenAPI SDK |
| `@real-life/backend-logic-sdk` | Generated OpenAPI SDK |
| `@real-life/workers-sdk` | Generated AsyncAPI SDK |

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (for WarpStream, or use a managed instance)

### Install Dependencies

```bash
cd examples/real-life
pnpm install
```

### Generate SDKs

```bash
# Generate all specs and SDKs
pnpm generate:all
```

### Start Services

```bash
# Terminal 1: Start auth service
pnpm --filter @real-life/backend-auth dev

# Terminal 2: Start logic service
pnpm --filter @real-life/backend-logic dev

# Terminal 3: Start workers (requires WarpStream)
pnpm --filter @real-life/workers dev

# Terminal 4: Start web app
pnpm --filter @real-life/web dev
```

### Environment Variables

```bash
# backend-logic
AUTH_SERVICE_URL=http://localhost:3001
WARPSTREAM_URL=localhost:9092

# workers
WARPSTREAM_URL=localhost:9092
GROUP_ID=real-life-workers

# web
NEXT_PUBLIC_AUTH_URL=http://localhost:3001
NEXT_PUBLIC_LOGIC_URL=http://localhost:3002
```

## SDK Generation Flow

1. Services define routers with Zod schemas
2. `generate-spec.ts` scripts produce OpenAPI/AsyncAPI JSON
3. `zod-openapi`/`zod-asyncapi` CLI generates TypeScript SDKs
4. SDKs export schemas and Request/Response types
5. Consumers import SDKs and use them with type safety

## Key Patterns

### Service-to-Service Auth
`backend-logic` validates tokens by calling `backend-auth/api/validate`:

```typescript
const res = await ky.get(`${AUTH_SERVICE_URL}/api/validate`, {
  headers: { authorization: token },
}).json<{ valid: boolean; userId?: string }>();
```

### Worker Triggering
`backend-logic` triggers jobs via the WarpStream client:

```typescript
await workerClient.trigger("send-notification", {
  type: "task_created",
  userId: ctx.userId,
  taskId: id,
  taskTitle: input.body.title,
});
```

### SDK Consumption
Frontend uses `@alt-stack/http-client-ky` with generated SDKs:

```typescript
import { createApiClient } from "@alt-stack/http-client-ky";
import { Request, Response } from "@real-life/backend-logic-sdk";

const client = createApiClient({
  baseUrl: "http://localhost:3002",
  Request,
  Response,
});

// Type-safe API call with automatic validation
const result = await client.get("/api/", {});
if (result.success) {
  console.log(result.body); // Typed as Task[]
}
```

