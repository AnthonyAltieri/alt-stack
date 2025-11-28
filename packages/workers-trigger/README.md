# @alt-stack/workers-trigger

Trigger.dev integration for `@alt-stack/workers-core`. Create type-safe background jobs with tRPC-style patterns.

## Installation

```bash
pnpm add @alt-stack/workers-trigger @trigger.dev/sdk zod
```

## Setup

1. Follow the [Trigger.dev setup guide](https://trigger.dev/docs/quick-start) to initialize your project.

2. Define your worker router:

```typescript
// src/workers/email.ts
import { init } from "@alt-stack/workers-trigger";
import { z } from "zod";

interface AppContext {
  db: Database;
}

const { router, procedure } = init<AppContext>();

export const emailRouter = router({
  // On-demand task
  "send-welcome-email": procedure
    .input({ payload: z.object({ userId: z.string(), email: z.string() }) })
    .task(async ({ input, ctx }) => {
      await sendEmail(input.email, "Welcome!");
    }),

  // Scheduled cron job - runs daily at 9am
  "daily-digest": procedure
    .cron("0 9 * * *", async ({ ctx }) => {
      await generateDailyDigest();
    }),
});
```

3. Create the worker and export tasks:

```typescript
// src/trigger/tasks.ts
import { createWorker } from "@alt-stack/workers-trigger";
import { emailRouter } from "../workers/email";
import { db } from "../db";

export const { tasks } = createWorker(emailRouter, {
  createContext: async (baseCtx) => ({
    db,
    // baseCtx.trigger contains Trigger.dev utilities
    logger: baseCtx.trigger.logger,
  }),
});

// Export individual tasks for Trigger.dev to discover
export const sendWelcomeEmail = tasks["send-welcome-email"];
export const dailyDigest = tasks["daily-digest"];
```

4. Trigger tasks from your application:

```typescript
// src/api/users.ts
import { tasks } from "@trigger.dev/sdk/v3";
import type { sendWelcomeEmail } from "../trigger/tasks";

export async function createUser(email: string) {
  const user = await db.users.create({ email });

  // Trigger the background job
  await tasks.trigger<typeof sendWelcomeEmail>("send-welcome-email", {
    userId: user.id,
    email: user.email,
  });

  return user;
}
```

## Features

### On-demand Tasks

```typescript
const myTask = procedure
  .input({ payload: z.object({ id: z.string() }) })
  .task(async ({ input, ctx }) => {
    // Process the task
    return { processed: true };
  });
```

### Scheduled (Cron) Jobs

```typescript
const dailyJob = procedure
  .cron("0 9 * * *", async ({ ctx }) => {
    // Runs daily at 9am UTC
  });

// With timezone
const timezoneJob = procedure
  .cron({ pattern: "0 9 * * *", timezone: "America/New_York" }, async ({ ctx }) => {
    // Runs daily at 9am EST
  });
```

### Middleware

```typescript
import { createMiddleware } from "@alt-stack/workers-trigger";

const middleware = createMiddleware<AppContext>();

const loggingMiddleware = middleware(async ({ ctx, next }) => {
  ctx.trigger.logger.info(`Starting job: ${ctx.jobName}`);
  const result = await next();
  ctx.trigger.logger.info(`Finished job: ${ctx.jobName}`);
  return result;
});

const myProcedure = procedure.use(loggingMiddleware);
```

### Error Handling

```typescript
const { tasks } = createWorker(router, {
  createContext: async (baseCtx) => ({ db }),
  onError: async (error, ctx) => {
    ctx.trigger.logger.error(`Job ${ctx.jobName} failed:`, { error });
    // Send to error tracking service
    await reportError(error, { jobId: ctx.jobId });
  },
});
```

## Context

The context (`ctx`) in handlers includes:

- `jobId` - Unique identifier for this job execution
- `jobName` - Name of the job being executed
- `attempt` - Current attempt number (starts at 1)
- `trigger` - The Trigger.dev context with utilities:
  - `trigger.logger` - Structured logging
  - `trigger.wait` - Wait utilities
  - `trigger.run` - Run metadata
- Any custom context from `createContext`

## API Reference

### `createWorker(router, options)`

Creates Trigger.dev tasks from a worker router.

**Options:**
- `createContext` - Function to create custom context for each job
- `onError` - Error handler for job failures

**Returns:**
- `tasks` - Object with all created tasks, keyed by job name
