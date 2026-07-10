# `@alt-stack/kafka-core`

Typed Kafka event procedures, consumers, router-derived producers, middleware, and AsyncAPI 3.0 generation.

Use this package when a service owns Kafka topic handlers or shares the live router with a producer. A producer-only application that consumes a generated contract should use `@alt-stack/kafka-client-kafkajs` or `@alt-stack/kafka-client-warpstream` instead. For named background jobs rather than domain events, use the Workers family.

## Requirements

- Node.js 18+
- KafkaJS 2.x
- Zod 4
- a reachable Kafka-compatible broker and provisioned topics

```bash
pnpm add @alt-stack/kafka-core kafkajs zod
```

## Define and consume an event

```typescript
import { createConsumer, kafkaRouter, ok, publicProcedure } from "@alt-stack/kafka-core";
import { z } from "zod";

const events = kafkaRouter({
  "user-events": publicProcedure
    .input({
      message: z.object({
        userId: z.string(),
        kind: z.enum(["created", "renamed"]),
      }),
    })
    .subscribe(({ input, ctx }) => {
      console.info(ctx.topic, `${input.kind}:${input.userId}`);
      return ok();
    }),
});

const consumer = await createConsumer(events, {
  kafka: { clientId: "accounts", brokers: ["localhost:9092"] },
  groupId: "accounts-v1",
});

process.once("SIGTERM", () => consumer.disconnect());
```

`createConsumer` connects, subscribes to every unique router topic from the latest offset for the group, starts KafkaJS `consumer.run`, and returns the KafkaJS `Consumer`.

## Produce from the router

```typescript
import { createProducer } from "@alt-stack/kafka-core";

const producer = await createProducer(events, {
  kafka: { clientId: "publisher", brokers: ["localhost:9092"] },
});

await producer.send("user-events", {
  userId: "u_123",
  kind: "created",
});

await producer.disconnect();
```

The topic and payload are inferred from the router and validated before JSON encoding.

## Important current behavior

Handlers return Altstack `Result` objects, but the consumer does not currently treat `Err` as a Kafka failure. Throw when KafkaJS must observe a failed record. `.output(schema)` currently parses the entire Result envelope, and result-based middleware from `createMiddlewareWithErrors` is not unwrapped by the consumer.

## Documentation

- [Kafka quickstart](../../apps/docs/docs/kafka/quickstart.md)
- [Common patterns](../../apps/docs/docs/kafka/common-patterns.md)
- [Complete core API](../../apps/docs/docs/kafka/api/core.md)

## License

MIT
