# `@alt-stack/workers-core`

Provider-neutral typed job procedures, routers, middleware, validation, AsyncAPI 3.0 generation, and OpenTelemetry helpers.

This package defines contracts but does not execute jobs. Use `@alt-stack/workers-trigger` to create Trigger.dev tasks or `@alt-stack/workers-warpstream` to consume Kafka-backed job messages.

## Requirements

- Node.js 18+
- Zod 4
- optional `@opentelemetry/api` 1.x for tracing/metrics

```bash
pnpm add @alt-stack/workers-core zod
```

## Define jobs

```typescript
import { init, ok } from "@alt-stack/workers-core";
import { z } from "zod";

interface AppContext {
  mailer: { send(email: string): Promise<void> };
}

const { router, procedure } = init<AppContext>();

export const jobs = router({
  "send-welcome-email": procedure
    .input({ payload: z.object({ email: z.string().email() }) })
    .task(async ({ input, ctx }) => {
      await ctx.mailer.send(input.email);
      return ok();
    }),

  "daily-digest": procedure.cron("0 9 * * *", async () => ok()),
});
```

`.task`, `.cron`, and `.queue` record provider-neutral procedure types. Adapter support differs: Trigger.dev schedules cron procedures; the WarpStream adapter does not. Current adapters do not use the `.queue(name)` field to configure provider queues.

## Contracts and clients

`generateAsyncAPISpec(jobs)` emits task and queue payloads and excludes cron procedures. Generate a runtime Zod map with `@alt-stack/zod-asyncapi`, then give that map to a `workers-client-*` binding in caller applications.

## Important current behavior

Adapters treat returned Result objects—including `Err`—as normal handler results. Throw when the provider must observe failure. Output schemas currently parse the entire Result envelope, and Result-returning middleware from `createMiddlewareWithErrors` is not unwrapped.

## Documentation

- [Workers quickstart](../../apps/docs/docs/workers/quickstart.md)
- [Common patterns](../../apps/docs/docs/workers/common-patterns.md)
- [Complete core API](../../apps/docs/docs/workers/api/core.md)

## License

MIT
