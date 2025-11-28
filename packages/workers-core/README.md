# @alt-stack/workers-core

Framework-agnostic core for type-safe background workers with Zod validation. Follows a tRPC-style pattern for defining and organizing background jobs.

## Installation

```bash
pnpm add @alt-stack/workers-core zod
```

## Usage

```typescript
import { init } from "@alt-stack/workers-core";
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
  // On-demand task
  "send-welcome-email": procedure
    .input({ payload: z.object({ userId: z.string(), email: z.string() }) })
    .task(async ({ input, ctx }) => {
      ctx.logger.info(`Sending welcome email to ${input.email}`);
      await sendEmail(input.email, "Welcome!");
    }),

  // Scheduled cron job
  "daily-digest": procedure
    .cron("0 9 * * *", async ({ ctx }) => {
      ctx.logger.info("Running daily digest");
      await generateDailyDigest();
    }),

  // Queue-based job
  "process-upload": procedure
    .input({ payload: z.object({ fileId: z.string() }) })
    .queue("uploads", async ({ input, ctx }) => {
      await processFile(input.fileId);
    }),
});

export { emailRouter };
```

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

## Provider Bindings

This is the core package. To actually run workers, you need a provider binding:

- `@alt-stack/workers-trigger` - Trigger.dev integration

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
