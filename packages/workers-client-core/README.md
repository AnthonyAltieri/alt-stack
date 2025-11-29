# @alt-stack/workers-client-core

Core types and interfaces for type-safe worker clients. This package provides the base interfaces used by runtime-specific implementations.

## Installation

```bash
pnpm add @alt-stack/workers-client-core zod
```

## Types

### `WorkerClient<T>`

The main interface for triggering workers:

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

### `TriggerOptions`

Options for triggering jobs:

```typescript
interface TriggerOptions {
  idempotencyKey?: string;
  delay?: string | Date;
  maxRetries?: number;
  metadata?: Record<string, string>;
}
```

### Error Classes

- `WorkerClientError` - Base error class
- `ValidationError` - Payload validation failed
- `TriggerError` - Job triggering failed
- `ConnectionError` - Connection to backend failed

## Implementations

- `@alt-stack/workers-client-trigger` - Trigger.dev
- `@alt-stack/workers-client-warpstream` - WarpStream/Kafka

