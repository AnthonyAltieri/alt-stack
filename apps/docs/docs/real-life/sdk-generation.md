# SDK Generation

Type-safe SDKs are generated from OpenAPI and AsyncAPI specs.

## Generation Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Define routes with Zod schemas                                │
│    └── router({ "/users": procedure.output(UserSchema).get(...) })│
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│ 2. Generate spec file                                            │
│    └── generateOpenAPISpec({ api: router }) → openapi.json       │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│ 3. Generate SDK from spec                                        │
│    └── zod-openapi openapi.json -o src/index.ts                  │
└───────────────────────────────┬──────────────────────────────────┘
                                │
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│ 4. SDK exports Zod schemas + Request/Response types              │
│    └── import { UserSchema, Request, Response } from "sdk"       │
└──────────────────────────────────────────────────────────────────┘
```

## OpenAPI SDK (REST APIs)

### Generate Spec Script

```typescript title="apps/backend-auth/src/generate-spec.ts"
import { writeFileSync } from "fs";
import { generateOpenAPISpec } from "@alt-stack/server-hono";
import { authRouter } from "./index.js";

const spec = generateOpenAPISpec({ api: authRouter }, {
  title: "Auth API",
  version: "1.0.0",
});

writeFileSync("openapi.json", JSON.stringify(spec, null, 2));
console.log("Generated openapi.json");
```

### SDK Package

```json title="packages/backend-auth-sdk/package.json"
{
  "name": "@real-life/backend-auth-sdk",
  "scripts": {
    "generate": "zod-openapi ../../apps/backend-auth/openapi.json -o src/index.ts"
  },
  "devDependencies": {
    "@alt-stack/zod-openapi": "workspace:*"
  }
}
```

### Generated Output

```typescript title="packages/backend-auth-sdk/src/index.ts (generated)"
import { z } from "zod";

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string(),
});
export type User = z.infer<typeof UserSchema>;

export const Request = {
  "/api/signup": {
    POST: {
      body: z.object({
        email: z.string().email(),
        password: z.string().min(8),
        name: z.string().min(1),
      }),
    },
  },
  // ...
} as const;

export const Response = {
  "/api/signup": {
    POST: {
      "200": z.object({ user: UserSchema, session: SessionSchema }),
      "409": z.object({ _tag: z.literal("EmailExistsError"), message: z.string() }),
    },
  },
  // ...
} as const;
```

## AsyncAPI SDK (Workers)

### Generate Spec Script

```typescript title="apps/workers/src/generate-spec.ts"
import { writeFileSync } from "fs";
import { generateAsyncAPISpec } from "@alt-stack/workers-warpstream";
import { jobRouter } from "./index.js";

const spec = generateAsyncAPISpec(jobRouter, {
  title: "Real Life Workers",
  version: "1.0.0",
});

writeFileSync("asyncapi.json", JSON.stringify(spec, null, 2));
console.log("Generated asyncapi.json");
```

### SDK Package

```json title="packages/workers-sdk/package.json"
{
  "name": "@real-life/workers-sdk",
  "scripts": {
    "generate": "zod-asyncapi ../../apps/workers/asyncapi.json -o src/index.ts"
  },
  "devDependencies": {
    "@alt-stack/zod-asyncapi": "workspace:*"
  }
}
```

### Generated Output

```typescript title="packages/workers-sdk/src/index.ts (generated)"
import { z } from "zod";

export const SendNotificationPayloadSchema = z.object({
  type: z.enum(["task_created", "task_completed", "task_assigned"]),
  userId: z.string(),
  taskId: z.string(),
  taskTitle: z.string(),
});

export const Topics = {
  "send-notification": SendNotificationPayloadSchema,
  "generate-report": GenerateReportPayloadSchema,
} as const;

export type TopicName = keyof typeof Topics;
export type MessageType<T extends TopicName> = z.infer<typeof Topics[T]>;
```

## Running Generation

```bash
# Generate all specs and SDKs
pnpm generate:all

# Or individually
pnpm --filter @real-life/backend-auth generate
pnpm --filter @real-life/backend-logic generate
pnpm --filter @real-life/workers generate
```

## CI/CD Integration

See [CI/CD SDK Generation](/guides/ci-cd-sdk-generation) for automating SDK generation in GitHub Actions.

