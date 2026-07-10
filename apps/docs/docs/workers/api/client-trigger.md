# Trigger.dev generated client API Documentation

Package: `@alt-stack/workers-client-trigger`

This client triggers published Trigger.dev tasks using a generated Zod `JobsMap`. It is a caller-side client, not the server adapter that creates task definitions.

## `createTriggerClient`

```typescript
function createTriggerClient<T extends JobsMap>(
  options: TriggerClientOptions<T>,
): WorkerClient<T>
```

Construction is synchronous and opens no connection.

```typescript
import { createTriggerClient } from "@alt-stack/workers-client-trigger";
import { Topics } from "./generated-jobs.js";

const client = createTriggerClient({ jobs: Topics });

const run = await client.trigger(
  "send-welcome-email",
  { userId: "u_123", email: "ada@example.com" },
  { idempotencyKey: "welcome:u_123" },
);
```

### `TriggerClientOptions<T>`

| Property | Type | Required | Behavior |
| --- | --- | --- | --- |
| `jobs` | `T extends JobsMap` | yes | exact job schemas for types and runtime validation |
| `onError` | `(error: Error) => void` | no | called before validation or Trigger errors are thrown |

### Runtime behavior

- `trigger` validates, then calls Trigger.dev `tasks.trigger(jobName, payload, { idempotencyKey, delay })`.
- `triggerBatch` validates the entire array, then calls `tasks.batchTrigger`; each item receives the same `idempotencyKey` and `delay` values.
- `maxRetries` and `metadata` from `TriggerOptions` are currently ignored.
- `disconnect()` is a no-op because the SDK client holds no persistent producer.
- Validation throws `ValidationError`; SDK failures throw `TriggerError`. There is no connection phase.

## Re-exports

`WorkerClient`, `JobsMap`, `TriggerOptions`, `TriggerResult`, `WorkerClientError`, `ValidationError`, `TriggerError`, and `ConnectionError` are re-exported from [worker client core](./client-core.md).
