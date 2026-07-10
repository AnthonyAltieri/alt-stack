# `@alt-stack/workers-client-trigger`

Caller-side Trigger.dev client typed and validated by a generated Zod job map. This package triggers tasks; `@alt-stack/workers-trigger` is the server adapter that defines them.

## Requirements

- Trigger.dev SDK 3.x
- Zod 3.25+ or Zod 4

```bash
pnpm add @alt-stack/workers-client-trigger @trigger.dev/sdk zod
```

## Usage

```typescript
import { createTriggerClient } from "@alt-stack/workers-client-trigger";
import { Topics } from "./generated-jobs.js";

const client = createTriggerClient({
  jobs: Topics,
  onError: (error) => console.error(error),
});

const run = await client.trigger(
  "send-welcome-email",
  { email: "ada@example.com" },
  { idempotencyKey: "welcome:ada" },
);
```

The client forwards `idempotencyKey` and `delay`. It currently ignores `maxRetries` and `metadata`. Batch entries receive the same option values. `disconnect()` is a no-op because no persistent producer is opened.

## Documentation

- [Worker client contract](../../apps/docs/docs/workers/api/client-core.md)
- [Trigger client API](../../apps/docs/docs/workers/api/client-trigger.md)

## License

MIT

