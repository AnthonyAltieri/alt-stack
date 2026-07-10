# `@alt-stack/workers-client-core`

Transport-neutral types and errors for clients that trigger jobs from generated Zod maps. It opens no connection and executes no worker handler.

Most applications install a binding that re-exports this surface:

- `@alt-stack/workers-client-trigger`
- `@alt-stack/workers-client-warpstream`

## Contract

```typescript
import type { JobsMap, WorkerClient } from "@alt-stack/workers-client-core";
import { z } from "zod";

const Jobs = {
  resize: z.object({ imageId: z.string() }),
} satisfies JobsMap;

declare const client: WorkerClient<typeof Jobs>;

const run = await client.trigger("resize", { imageId: "img_123" });
console.info(run.id);
```

`triggerBatch` validates and triggers multiple payloads. `TriggerOptions` contains `idempotencyKey`, `delay`, `maxRetries`, and `metadata`, but each binding supports only a subset.

## Errors

- `WorkerClientError(message, cause?)` is the base class.
- `ValidationError(jobName, message, details?)` represents Zod failure.
- `TriggerError(jobName, message, cause?)` represents provider send/trigger failure.
- `ConnectionError(message, cause?)` represents persistent connection failure.

## Documentation

[Complete client-core API](../../apps/docs/docs/workers/api/client-core.md)

## License

MIT

