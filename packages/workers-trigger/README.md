# `@alt-stack/workers-trigger`

Trigger.dev SDK v3 server adapter for `@alt-stack/workers-core`. It re-exports the core API, so one package can define job routers and turn them into Trigger.dev task definitions.

## Requirements

- Node.js 18+
- Trigger.dev SDK 3.x and a configured Trigger.dev project
- Zod 4

```bash
pnpm add @alt-stack/workers-trigger @trigger.dev/sdk zod
```

## Usage

```typescript
import { createWorker, init, ok } from "@alt-stack/workers-trigger";
import { z } from "zod";

const { router, procedure } = init<{ mailer: Mailer }>();

const jobs = router({
  "send-welcome-email": procedure
    .input({ payload: z.object({ email: z.string().email() }) })
    .task(async ({ input, ctx }) => {
      await ctx.mailer.send(input.email);
      return ok();
    }),
});

export const { tasks } = createWorker(jobs, {
  createContext: () => ({ mailer }),
  onError: (error, ctx) => console.error(ctx.jobName, error),
});

export const sendWelcomeEmail = tasks["send-welcome-email"];
```

Export task entries from a source path Trigger.dev discovers. Tasks with payload schemas use `schemaTask`; tasks without them use `task`; cron procedures use `schedules.task`. Queue names and cron timezones are not currently forwarded.

Returned Altstack `Err` values do not fail a Trigger.dev run; throw to enter `onError` and provider failure handling. Optional `telemetry` creates OpenTelemetry spans when the API is installed/configured.

## Documentation

- [Workers quickstart](../../apps/docs/docs/workers/quickstart.md)
- [Trigger adapter API](../../apps/docs/docs/workers/api/trigger.md)
- [Core API re-exported by this package](../../apps/docs/docs/workers/api/core.md)

## License

MIT
