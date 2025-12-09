# @alt-stack/workers-core

Framework-agnostic core for type-safe background workers with Zod validation. Follows a tRPC-style pattern for defining and organizing background jobs.

## Installation

```bash
pnpm add @alt-stack/workers-core zod
```

## Usage

```typescript
import { init, ok, err } from "@alt-stack/workers-core";
import { z } from "zod";

// Define your context type
interface AppContext {
  db: Database;
  logger: Logger;
}

// Initialize with your context
const { router, procedure } = init<AppContext>();

// Define jobs
const emailRouter = router({
  // On-demand task with Result-based error handling
  "send-welcome-email": procedure
    .input({ payload: z.object({ userId: z.string(), email: z.string() }) })
    .errors({
      INVALID_EMAIL: z.object({ code: z.literal("INVALID_EMAIL"), message: z.string() }),
    })
    .task(async ({ input, ctx }) => {
      if (!isValidEmail(input.email)) {
        return err({ data: { code: "INVALID_EMAIL" as const, message: "Invalid email format" } });
      }
      ctx.logger.info(`Sending welcome email to ${input.email}`);
      await sendEmail(input.email, "Welcome!");
      return ok();
    }),

  // Scheduled cron job
  "daily-digest": procedure
    .cron("0 9 * * *", async ({ ctx }) => {
      ctx.logger.info("Running daily digest");
      await generateDailyDigest();
      return ok();
    }),

  // Queue-based job
  "process-upload": procedure
    .input({ payload: z.object({ fileId: z.string() }) })
    .queue("uploads", async ({ input, ctx }) => {
      await processFile(input.fileId);
      return ok();
    }),
});

export { emailRouter };
```

See [`@alt-stack/result`](../result/README.md) for full Result type documentation.

## Middleware

```typescript
import { createMiddleware } from "@alt-stack/workers-core";

const middleware = createMiddleware<AppContext>();

const loggingMiddleware = middleware(async ({ ctx, next }) => {
  console.log(`Starting job: ${ctx.jobName}`);
  const start = Date.now();
  const result = await next();
  console.log(`Finished job: ${ctx.jobName} in ${Date.now() - start}ms`);
  return result;
});

// Use in procedure
const protectedProcedure = procedure.use(loggingMiddleware);
```

## AsyncAPI Spec Generation

Generate an AsyncAPI specification from your router for SDK generation:

```typescript
import { generateAsyncAPISpec } from "@alt-stack/workers-core";
import { writeFileSync } from "node:fs";

const spec = generateAsyncAPISpec(emailRouter, {
  title: "Workers API",
  version: "1.0.0",
});

writeFileSync("asyncapi.json", JSON.stringify(spec, null, 2));
```

Then generate a TypeScript SDK:

```bash
npx asyncapi-to-zod asyncapi.json -o ./sdk/index.ts
```

Use the generated SDK with worker clients:

```typescript
import { Topics } from "./sdk";
import { createTriggerClient } from "@alt-stack/workers-client-trigger";

const client = createTriggerClient({ jobs: Topics });
await client.trigger("send-welcome-email", { userId: "123", email: "user@example.com" });
```

## Provider Bindings

This is the core package. To actually run workers, you need a provider binding:

- `@alt-stack/workers-trigger` - Trigger.dev integration
- `@alt-stack/workers-warpstream` - WarpStream/Kafka integration

## Client Packages

To trigger workers from generated SDKs (without importing router definitions):

- `@alt-stack/workers-client-trigger` - Trigger.dev client
- `@alt-stack/workers-client-warpstream` - WarpStream/Kafka client

## API Reference

### `init<TContext>()`

Initialize the workers framework with a custom context type.

### `procedure`

The procedure builder for defining jobs:

- `.input({ payload: schema })` - Define input validation
- `.output(schema)` - Define output validation
- `.use(middleware)` - Add middleware
- `.task(handler)` - Create an on-demand task
- `.cron(schedule, handler)` - Create a scheduled job
- `.queue(name, handler)` - Create a queue-based job

### `router(config)`

Create a router with job definitions.

### `mergeRouters(...routers)`

Combine multiple routers into one.
