# Example Workers Application

This example demonstrates how to use `@alt-stack/workers-trigger` to create type-safe background jobs with Trigger.dev.

## Setup

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Initialize Trigger.dev (if not already done):
   ```bash
   npx trigger init
   ```

3. Start the Trigger.dev dev server:
   ```bash
   pnpm dev
   ```

## Project Structure

```
src/
├── context.ts           # Application context shared across workers
├── routers/
│   ├── email.ts         # Email-related background jobs
│   ├── user.ts          # User-related background jobs
│   └── index.ts         # Combined router
├── trigger/
│   └── tasks.ts         # Trigger.dev task exports
└── index.ts             # Main entry point
```

## Features Demonstrated

### On-demand Tasks

Tasks that can be triggered programmatically:

```typescript
// Define
const emailRouter = router({
  "send-welcome-email": procedure
    .input({ payload: z.object({ userId: z.string(), email: z.string() }) })
    .task(async ({ input, ctx }) => {
      // Send email
    }),
});

// Trigger from your app
import { tasks } from "@trigger.dev/sdk/v3";
await tasks.trigger("send-welcome-email", { userId: "123", email: "user@example.com" });
```

### Scheduled (Cron) Jobs

Tasks that run on a schedule:

```typescript
"daily-digest": procedure
  .cron("0 9 * * *", async ({ ctx }) => {
    // Runs daily at 9 AM UTC
  }),
```

### Queue-based Jobs

Tasks that process items from a queue:

```typescript
"process-bulk-email": procedure
  .input({ payload: z.object({ emails: z.array(z.string()) }) })
  .queue("bulk-emails", async ({ input }) => {
    // Process bulk emails
  }),
```

### Middleware

Reusable middleware for logging, auth, etc:

```typescript
const loggingMiddleware = middleware(async ({ ctx, next }) => {
  console.log(`Starting job: ${ctx.jobName}`);
  const result = await next();
  console.log(`Finished job: ${ctx.jobName}`);
  return result;
});

const loggedProcedure = procedure.use(loggingMiddleware);
```

### Custom Context

Share application context (database, services) across all workers:

```typescript
const { tasks } = createWorker(router, {
  createContext: async (baseCtx) => ({
    db: getDatabase(),
    // baseCtx.trigger has Trigger.dev utilities
  }),
});
```

## Triggering Tasks

From your application code:

```typescript
import { tasks } from "@trigger.dev/sdk/v3";
import type { sendWelcomeEmail } from "./trigger/tasks";

// Type-safe triggering
const handle = await tasks.trigger<typeof sendWelcomeEmail>("send-welcome-email", {
  userId: "user_123",
  email: "user@example.com", 
  name: "John Doe",
});

console.log("Task ID:", handle.id);
```

## Learn More

- [Trigger.dev Documentation](https://trigger.dev/docs)
- [@alt-stack/workers-trigger README](../../packages/workers-trigger/README.md)
- [@alt-stack/workers-core README](../../packages/workers-core/README.md)
