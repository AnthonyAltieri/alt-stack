# Kafka quickstart

Altstack's Kafka family is for typed **events on Kafka topics**. A Kafka procedure subscribes to a topic and receives every record assigned to its consumer group. If the unit of work is a named job that should be triggered, scheduled, or queued, use the [Workers family](../workers/quickstart.md) instead.

This quickstart keeps one router as the contract for both a consumer and a producer. A producer-only application can instead use an AsyncAPI-generated topic map and a `kafka-client-*` package.

## 1. Install and prepare Kafka

```bash
pnpm add @alt-stack/kafka-core kafkajs zod
```

You need Node.js 18 or newer, KafkaJS 2.x, Zod 4, and a reachable Kafka-compatible broker. Provision the topics used below (`user-events`) according to your broker policy. The framework does not administer topics. Keep a stable consumer `groupId`: Kafka delivers each partition record to one member of a group, while a different group receives its own copy.

## 2. Define the topic contract

```typescript title="src/router.ts"
import { kafkaRouter, ok, publicProcedure } from "@alt-stack/kafka-core";
import { z } from "zod";

const UserEvent = z.object({
  userId: z.string(),
  kind: z.enum(["created", "renamed"]),
});

export const eventRouter = kafkaRouter({
  "user-events": publicProcedure
    .input({ message: UserEvent })
    .subscribe(({ input, ctx }) => {
      console.info(`[${ctx.topic}:${ctx.partition}] ${input.kind}:${input.userId}`);
      return ok();
    }),
});
```

The object key is the literal Kafka topic. `.input({ message })` validates the decoded record value and infers `input`. Handlers return an Altstack `Result`; use `ok()` for a successful consumer with no value.

This smallest path uses the empty custom-context type, which lets `kafkaRouter({...})` infer the exact topic map. If handlers need per-record application context, use the explicit generic pattern in [Add typed context with middleware](./common-patterns.md#add-typed-context-with-middleware). The current factory does not infer custom context from procedure values.

Kafka record values are decoded as UTF-8. Altstack tries `JSON.parse` first and falls back to the raw string, so object schemas expect JSON records while `z.string()` can consume plain text.

## 3. Start the consumer

```typescript title="src/consumer.ts"
import { createConsumer } from "@alt-stack/kafka-core";
import { Kafka } from "kafkajs";
import { eventRouter } from "./router.js";

const kafka = new Kafka({
  clientId: "accounts-consumer",
  brokers: ["localhost:9092"],
});

const consumer = await createConsumer(eventRouter, {
  kafka,
  groupId: "accounts-v1",
  onError: (error) => console.error("Kafka handler failed", error),
});

const shutdown = async () => {
  await consumer.disconnect();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
```

`createConsumer` connects, subscribes to every unique router topic with `fromBeginning: false`, starts KafkaJS `consumer.run`, and returns the running KafkaJS `Consumer`. A thrown validation, middleware, or handler error is passed to `onError` and then rethrown to KafkaJS.

## 4. Produce with the same router

```typescript title="src/produce.ts"
import { createProducer } from "@alt-stack/kafka-core";
import { Kafka } from "kafkajs";
import { eventRouter } from "./router.js";

const producer = await createProducer(eventRouter, {
  kafka: new Kafka({
    clientId: "accounts-producer",
    brokers: ["localhost:9092"],
  }),
});

await producer.send(
  "user-events",
  { userId: "user_123", kind: "created" },
  { key: "user_123" },
);

await producer.disconnect();
```

The router preserves the topic-to-Zod-schema map, so both the topic literal and payload are checked by TypeScript. `send` also validates at runtime before JSON encoding the value.

## 5. Share a producer contract without server code

When another application only publishes events, generate an AsyncAPI contract rather than importing the consumer router:

```typescript
import { generateAsyncAPISpec } from "@alt-stack/kafka-core";
import { eventRouter } from "./router.js";

const spec = generateAsyncAPISpec(eventRouter, {
  title: "Accounts events",
  version: "1.0.0",
});
```

Write that object to `asyncapi.json`, generate Zod topic schemas with `@alt-stack/zod-asyncapi`, then construct either `createKafkaClient` from `@alt-stack/kafka-client-kafkajs` or `createWarpStreamClient` from `@alt-stack/kafka-client-warpstream` with the generated `Topics` object. Those are **generated-schema clients**: they publish and validate records, but do not contain consumer procedures or handlers.

## Next steps

- [Kafka common patterns](./common-patterns.md) covers middleware, router composition, multiple subscribers, producer choices, and lifecycle behavior.
- [Kafka core API](./api/core.md) documents every `@alt-stack/kafka-core` export.
- [Kafka client API](./api/client-core.md) explains the generated-schema client contract and error shapes.
