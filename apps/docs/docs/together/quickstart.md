# Altstack Together quickstart

This walkthrough closes the HTTP contract loop first, then extends the same pattern to a background job. The HTTP portion runs locally without an external service. The worker portion requires a Kafka-compatible broker such as WarpStream.

## What you will build

```text
Zod router
  -> OpenAPI document
  -> generated Request/Response schemas
  -> validated Fetch client

Zod job router
  -> AsyncAPI document
  -> generated Topics schemas
  -> validated WarpStream producer
  -> WarpStream worker
```

## 1. Create the project and install the HTTP path

```bash
mkdir altstack-contract-demo
cd altstack-contract-demo
pnpm init
pnpm pkg set type=module
mkdir -p src/contracts src/generated
pnpm add @alt-stack/server-hono @alt-stack/http-client-fetch hono zod @hono/node-server
pnpm add -D @alt-stack/zod-openapi tsx typescript @types/node
```

Create `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
```

Create `src/contracts/users.ts`:

```typescript
import { init, ok, type HonoBaseContext } from "@alt-stack/server-hono";
import { z } from "zod";

const internalErrorSchema = z.object({
  _tag: z.literal("InternalServerError"),
  message: z.string(),
  details: z.array(z.string()),
});

const t = init<HonoBaseContext>({
  default500Error: () => [
    internalErrorSchema,
    {
      _tag: "InternalServerError" as const,
      message: "Internal server error",
      details: [],
    },
  ],
});

export const defaultErrorHandlers = t.defaultErrorHandlers;

export const usersRouter = t.router({
  "/users/{id}": t.procedure
    .input({ params: z.object({ id: z.string() }) })
    .output(z.object({ id: z.string(), name: z.string() }))
    .get(({ input }) =>
      ok({ id: input.params.id, name: "Ada Lovelace" }),
    ),
});
```

The schema belongs with the service that owns the boundary. Application code receives the parsed `input.params.id`, and the adapter validates the returned `Ok` value.

## 2. Host the router

Create `src/server.ts`:

```typescript
import { serve } from "@hono/node-server";
import { createServer } from "@alt-stack/server-hono";
import { defaultErrorHandlers, usersRouter } from "./contracts/users.js";

const app = createServer(
  { "/api": usersRouter },
  { defaultErrorHandlers },
);

serve({ fetch: app.fetch, port: 3000 });
```

Start it:

```bash
pnpm exec tsx src/server.ts
```

`GET http://localhost:3000/api/users/u_123` now returns a validated JSON response. The custom 500 handler deliberately redacts thrown messages and stacks; the current Hono fallback exposes them when `defaultErrorHandlers` is omitted.

## 3. Generate OpenAPI and a TypeScript SDK

Create `src/generate-openapi.ts`:

```typescript
import { writeFileSync } from "node:fs";
import { generateOpenAPISpec } from "@alt-stack/server-hono";
import { usersRouter } from "./contracts/users.js";

const openapi = generateOpenAPISpec(
  { "/api": usersRouter },
  { title: "Users API", version: "1.0.0" },
);

writeFileSync("openapi.json", JSON.stringify(openapi, null, 2));
```

Run the spec generator and then the OpenAPI CLI:

```bash
pnpm exec tsx src/generate-openapi.ts
pnpm exec zod-openapi openapi.json --output src/generated/users-api.ts
```

The generated file exports endpoint schemas plus `Request` and `Response` maps. Commit the OpenAPI document or generated SDK according to your release workflow; do not hand-edit the generated file.

## 4. Call the contract through Fetch

Create `src/client.ts`:

```typescript
import { createApiClient } from "@alt-stack/http-client-fetch";
import { Request, Response } from "./generated/users-api.js";

const client = createApiClient({
  baseUrl: "http://localhost:3000",
  Request,
  Response,
});

const result = await client.get("/api/users/{id}", {
  params: { id: "u_123" },
});

if (result.success) {
  console.log(result.code, result.body.name);
} else {
  console.error("Unexpected response", result.code, result.error);
}
```

Run it while the server is listening:

```bash
pnpm exec tsx src/client.ts
```

The client validates path parameters before sending and validates the response schema selected by the status code. This router declares only status 200, so its failure branch is the numeric unexpected-response shape. For a contract with declared non-2xx statuses, `success` first separates success from failure and `typeof result.code === "string"` then distinguishes a declared status from a numeric unexpected failure. Account for the current server error-envelope mismatch described in [Altstack Together API Documentation](./documentation.md#current-server-error-compatibility-boundary).

## 5. Add a background-job contract

Install the worker definition, runtime, client, and AsyncAPI generator:

```bash
pnpm add @alt-stack/workers-warpstream @alt-stack/workers-client-warpstream kafkajs zod
pnpm add -D @alt-stack/zod-asyncapi
```

Create `src/contracts/jobs.ts`:

```typescript
import { init, ok } from "@alt-stack/workers-warpstream";
import { z } from "zod";

const w = init();

export const jobsRouter = w.router({
  "send-welcome": w.procedure
    .input({
      payload: z.object({
        userId: z.string(),
        email: z.string().email(),
      }),
    })
    .task(async ({ input }) => {
      console.log(`Welcome ${input.email} for ${input.userId}`);
      return ok();
    }),
});
```

Create `src/generate-asyncapi.ts`:

```typescript
import { writeFileSync } from "node:fs";
import { generateAsyncAPISpec } from "@alt-stack/workers-warpstream";
import { jobsRouter } from "./contracts/jobs.js";

const asyncapi = generateAsyncAPISpec(jobsRouter, {
  title: "Users jobs",
  version: "1.0.0",
});

writeFileSync("asyncapi.json", JSON.stringify(asyncapi, null, 2));
```

Generate the document and then the TypeScript schemas:

```bash
pnpm exec tsx src/generate-asyncapi.ts
pnpm exec zod-asyncapi asyncapi.json --output src/generated/jobs.ts
```

The generated file exports `Topics`, keyed by job name.

Provision the exact `send-welcome` topic before connecting. The generated WarpStream client sets `allowAutoTopicCreation: false`. For a local Kafka installation with its admin CLI available:

```bash
kafka-topics.sh \
  --bootstrap-server localhost:9092 \
  --create --if-not-exists \
  --topic send-welcome \
  --partitions 1 \
  --replication-factor 1
```

For hosted WarpStream, create the same topic through the provider's supported administration path.

## 6. Run and trigger the job

The following snippets assume a Kafka-compatible broker is reachable through `WARPSTREAM_URL`.

Create `src/worker.ts`:

```typescript
import { createWorker } from "@alt-stack/workers-warpstream";
import { jobsRouter } from "./contracts/jobs.js";

const bootstrapServer = process.env.WARPSTREAM_URL ?? "localhost:9092";

const worker = await createWorker(jobsRouter, {
  kafka: { brokers: [bootstrapServer] },
  groupId: "users-workers",
});

const shutdown = async () => {
  await worker.disconnect();
  process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
```

Create `src/producer.ts`:

```typescript
import { createWarpStreamClient } from "@alt-stack/workers-client-warpstream";
import { Topics } from "./generated/jobs.js";

const client = await createWarpStreamClient({
  bootstrapServer: process.env.WARPSTREAM_URL ?? "localhost:9092",
  jobs: Topics,
});

await client.trigger("send-welcome", {
  userId: "u_123",
  email: "ada@example.test",
});

await client.disconnect();
```

Start the worker in one terminal, then trigger the job from another:

```bash
pnpm exec tsx src/worker.ts
pnpm exec tsx src/producer.ts
```

The producer validates the payload with the generated schema. The worker validates it again at the consumer boundary before the handler runs. A returned worker `Err` is currently treated as a normal handler return; throw when the broker must observe failed processing and apply its error/retry behavior.

Finally, verify every source file and generated contract together:

```bash
pnpm exec tsc --noEmit
```

## Where to go deeper

- [Altstack Together common patterns](./common-patterns.md) covers ownership, generation in CI, versioning, idempotency, and observability.
- [Altstack Together API Documentation](./documentation.md) maps artifacts and runtime contracts across families.
- Family references: [Servers](../server/api/core.md), [HTTP clients](../http-client/api/core.md), [Workers](../workers/api/core.md), and [Code generation](../codegen/api/generated-sdks.md).
