# Worker client core API Documentation

Package: `@alt-stack/workers-client-core`

This package defines the transport-neutral client contract for jobs generated from AsyncAPI. It contains no Trigger.dev or Kafka connection. Runtime bindings re-export its complete public surface.

## Types

### `JobsMap`

```typescript
type JobsMap = Record<string, z.ZodTypeAny>;
```

A runtime map from exact job names to Zod payload schemas. Keys form the job-name union and values provide both TypeScript inference and `safeParse` validation.

### `TriggerOptions`

| Property | Type | Intended meaning |
| --- | --- | --- |
| `idempotencyKey` | `string` | prevent or correlate duplicate work; provider behavior differs |
| `delay` | `string \| Date` | ISO 8601 duration or date for providers that support delayed execution |
| `maxRetries` | `number` | retry limit; currently not forwarded by either generated client |
| `metadata` | `Record<string, string>` | provider metadata; the WarpStream client turns it into Kafka headers |

See each binding's documentation for the supported subset.

### `TriggerResult`

```typescript
interface TriggerResult {
  id: string;
}
```

Trigger.dev returns its run handle ID. The WarpStream binding generates a local ID before publishing; it is not a server run ID or Kafka offset.

### `WorkerClient<T extends JobsMap>`

```typescript
interface WorkerClient<T extends JobsMap> {
  trigger<K extends keyof T & string>(
    jobName: K,
    payload: z.infer<T[K]>,
    options?: TriggerOptions,
  ): Promise<TriggerResult>;

  triggerBatch<K extends keyof T & string>(
    jobName: K,
    payloads: z.infer<T[K]>[],
    options?: TriggerOptions,
  ): Promise<TriggerResult[]>;

  disconnect(): Promise<void>;
}
```

Both methods validate all payloads before calling the provider. Batch options are applied to every entry. `disconnect` closes persistent resources when a binding has them.

## Errors

Every class sets `name` to its class name.

### `WorkerClientError`

`new WorkerClientError(message, cause?)` is the base class. It adds readonly `cause` to the standard Error fields.

### `ValidationError`

`new ValidationError(jobName, message, details?)` adds readonly `jobName` and `details`; current bindings put Zod issues in `details`. It occurs before provider work.

### `TriggerError`

`new TriggerError(jobName, message, cause?)` adds readonly `jobName`. The original provider or KafkaJS error is in `cause`.

### `ConnectionError`

`new ConnectionError(message, cause?)` represents initial persistent connection failure. The WarpStream binding throws it; the Trigger binding has no connection phase but re-exports the class.

## Complete export list

`JobsMap`, `TriggerOptions`, `TriggerResult`, `WorkerClient`, `WorkerClientError`, `ValidationError`, `TriggerError`, and `ConnectionError` are every public export.
