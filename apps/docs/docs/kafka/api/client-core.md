# Kafka client core API Documentation

Package: `@alt-stack/kafka-client-core`

This package contains the transport-neutral contract shared by generated-schema Kafka clients. It does not connect to a broker and it does not consume events. Applications normally install one runtime binding—`@alt-stack/kafka-client-kafkajs` or `@alt-stack/kafka-client-warpstream`—which re-exports these types and errors.

## Types

### `TopicsMap`

```typescript
type TopicsMap = Record<string, z.ZodTypeAny>;
```

A runtime map from exact topic names to Zod message schemas. `@alt-stack/zod-asyncapi` produces this shape. Keys control the topic-name union; values control compile-time payload inference and runtime validation.

### `SendOptions`

| Property | Type | Behavior |
| --- | --- | --- |
| `key` | `string \| Buffer \| null` | Kafka record key; defaults to `null` in both bindings |
| `partition` | `number` | explicit target partition passed to KafkaJS |
| `headers` | `Record<string, string \| Buffer>` | Kafka record headers |
| `timestamp` | `string` | KafkaJS record timestamp |

When used with `sendBatch`, one options object is copied to every record.

### `KafkaClient<T, TProducer = unknown>`

```typescript
interface KafkaClient<T extends TopicsMap, TProducer = unknown> {
  send<K extends keyof T & string>(
    topic: K,
    message: z.infer<T[K]>,
    options?: SendOptions,
  ): Promise<void>;

  sendBatch<K extends keyof T & string>(
    topic: K,
    messages: z.infer<T[K]>[],
    options?: SendOptions,
  ): Promise<void>;

  disconnect(): Promise<void>;
  readonly producer: TProducer;
}
```

- `send` validates one payload, JSON-stringifies it, and publishes one record.
- `sendBatch` validates every payload before publishing the batch. The first invalid index rejects the operation before the broker send.
- `disconnect` releases the binding's producer resources.
- `producer` is the binding-specific escape hatch. Both current bindings use KafkaJS `Producer`.

## Errors

Every class sets its `name` property to the class name.

### `KafkaClientError`

```typescript
new KafkaClientError(message: string, cause?: unknown)
```

Base class. Public properties are the standard `Error` fields plus readonly `cause`.

### `ValidationError`

```typescript
new ValidationError(topic: string, message: string, details?: unknown)
```

Extends `KafkaClientError`. It adds readonly `topic` and `details`. Current bindings place Zod issues in `details`. No broker request is made after this error.

### `SendError`

```typescript
new SendError(topic: string, message: string, cause?: unknown)
```

Extends `KafkaClientError`. It adds readonly `topic`; `cause` contains the producer failure.

### `ConnectionError`

```typescript
new ConnectionError(message: string, cause?: unknown)
```

Extends `KafkaClientError`. Bindings throw it when the initial producer connection fails.

## Public export list

`TopicsMap`, `SendOptions`, `KafkaClient`, `KafkaClientError`, `ValidationError`, `SendError`, and `ConnectionError` are the complete public surface.
