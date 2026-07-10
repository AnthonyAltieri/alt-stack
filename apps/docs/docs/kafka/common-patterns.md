# Kafka common patterns

## Choose events, not jobs

A Kafka procedure says, “when a record arrives on this topic, handle that event.” Its identity is the topic, and delivery is governed by Kafka partitions and consumer groups. A Worker procedure says, “execute this named job”; a Worker adapter turns that contract into Trigger.dev tasks or Kafka-backed job messages.

Use Kafka for event streams, cross-service facts, replayable records, or an existing Kafka protocol. Use [Workers](../workers/common-patterns.md) when callers should trigger a named unit of background work.

## Compose topic namespaces

`kafkaRouter` accepts procedures and nested routers. Each nesting boundary joins topic segments with `/`:

```typescript
import { init, kafkaRouter, ok } from "@alt-stack/kafka-core";
import { z } from "zod";

const { procedure } = init();

const orderEvents = kafkaRouter({
  created: procedure
    .input({ message: z.object({ orderId: z.string() }) })
    .subscribe(() => ok()),
});

const events = kafkaRouter({
  orders: orderEvents,
});

// Registered topic: "orders/created"
```

`KafkaRouter.merge(prefix, router)` uses the same `/` join and removes one trailing `/` from the prefix. `mergeKafkaRouters(a, b)` combines routers without adding a prefix. It does not deduplicate topics.

## Run more than one procedure for a topic deliberately

A router can contain multiple procedures with the same topic, usually after merging. `createConsumer` runs them sequentially for each record in registration order. It validates the message and calls `createContext` separately for each procedure. A failure stops the remaining procedures for that record and is rethrown to KafkaJS.

If the handlers need independent delivery, give them separate consumers with separate group IDs instead of stacking them on one router.

## Add typed context with middleware

`init<AppContext>()` fixes the context expected by every procedure. `createContext` builds that context for each record. Middleware can observe Kafka metadata and add narrowed fields:

```typescript
import {
  createMiddleware,
  init,
  kafkaRouter,
  ok,
  type BaseKafkaContext,
  type TypedKafkaContext,
} from "@alt-stack/kafka-core";
import { z } from "zod";

interface AppContext {
  requestId?: string;
}

const { procedure } = init<AppContext>();

type KafkaCtx = TypedKafkaContext<
  { message?: never },
  undefined,
  undefined,
  AppContext
>;

const middleware = createMiddleware<KafkaCtx>();
const withRequestId = middleware(async ({ ctx, next }) =>
  next({
    ctx: {
      requestId: ctx.message.headers?.requestId?.toString() ?? crypto.randomUUID(),
    },
  }),
);

const tracedProcedure = procedure.use(withRequestId);

const eventProcedure = tracedProcedure
  .input({ message: z.object({ id: z.string() }) })
  .subscribe(({ input, ctx }) => {
    console.info(ctx.requestId, input.id);
    return ok();
  });

const config = { events: eventProcedure };
const events = kafkaRouter<AppContext, typeof config>(config);
```

The current object-based factory does not infer custom context from procedure values. Supplying both `AppContext` and `typeof config` is required here: the first generic makes `createConsumer(events, { createContext })` expect `AppContext`, and the second preserves the exact `events` topic/schema map. Supplying only `kafkaRouter<AppContext>(...)` widens that map.

Middleware executes in declaration order. It must return `next()` (or the result obtained from it) so the chain retains the context updates. Ordinary throwing middleware is the working runtime path. The public `createMiddlewareWithErrors` surface records typed schemas, but router registration drops its runtime flags and the consumer does not unwrap its Result response. Do not use that path operationally until the adapter implements it.

## Keep result errors explicit

Kafka handlers are typed to return `Result<value, ResultError>`, and the package re-exports `ok`, `err`, `TaggedError`, and the main Result helpers. However, the current consumer does not branch on the returned Result. Both `ok(...)` and `err(...)` complete the handler normally unless output validation rejects the envelope.

Throw an `Error` when KafkaJS must observe failed processing. Validation throws `ValidationError`; other handler or middleware throws normally reach `onError` and are rethrown unchanged. `onError` is an observation hook, not a recovery hook. Kafka retry and offset behavior remains KafkaJS behavior.

`.errors(...)` records schemas and contributes to types, but a returned `Err` is not matched against them by the current consumer. `ProcessingError` is used only by an internal error function added to the runtime context; that function is not part of the declared public context type.

### Current output-validation behavior

The procedure type requires a `Result`, but the current consumer passes the entire returned `Result` object to an `.output()` schema. A schema for only the successful inner value therefore does not match `ok(value)`. Until the runtime unwraps successful results, omit `.output()` on live Kafka handlers or define a schema for the actual Result envelope. This limitation also applies to the current Worker adapters.

## Select the producer boundary

| Producer | Contract source | Best fit |
| --- | --- | --- |
| `createProducer(router, options)` from `kafka-core` | live `KafkaRouter` | same service or monorepo package can import the router |
| `createKafkaClient({ topics, kafka })` | generated Zod `Topics` map | producer-only service using KafkaJS configuration or an existing Kafka instance |
| `createWarpStreamClient({ bootstrapServer, topics })` | generated Zod `Topics` map | producer-only service using the adapter's fixed WarpStream-oriented defaults |

All three validate messages before sending, JSON-stringify values, accept `key`, `partition`, `headers`, and `timestamp`, and expose `sendBatch`. Batch options apply to every record.

The `kafka-core` producer reports plain `Error` objects. The generated-schema clients report `ValidationError`, `SendError`, and `ConnectionError` from `@alt-stack/kafka-client-core` and invoke `onError` before throwing.

## Generate and consume AsyncAPI

```typescript
import { generateAsyncAPISpec } from "@alt-stack/kafka-core";

const spec = generateAsyncAPISpec(events, {
  title: "Commerce events",
  version: "2.0.0",
  description: "Events published by commerce services",
});
```

The generator emits AsyncAPI 3.0 channels for all registered topics. Channel IDs replace `/`, `-`, `_`, and `.` with `_`; channel `address` retains the real topic. Each operation has `action: "send"`, because the generated contract describes messages a publisher sends to Kafka. Zod message schemas become JSON Schema; conversion failures fall back to `{ type: "object" }` and log a warning.

Generated client schema maps are runtime values. Pass the `Topics` object itself—not a TypeScript-only type—to a client so it can call `safeParse` before sending.

## Configure the broker explicitly

`createConsumer`, `createProducer`, and the KafkaJS generated client accept either a KafkaJS `Kafka` instance or `KafkaConfig`. Use the instance form when the application owns authentication, TLS, logging, instrumentation, or broker discovery.

The dedicated Kafka WarpStream client accepts only `bootstrapServer`, `clientId`, and `producerConfig`; its current options do not expose KafkaJS `ssl` or `sasl`. Use the KafkaJS client with an explicitly configured `Kafka` instance when those settings are required.

The WarpStream clients disable automatic topic creation and force LZ4 compression on sends. Provision topics and ensure the broker supports the selected compression.

## Shut down both sides

`createConsumer` returns a connected KafkaJS consumer. `createProducer` and both generated clients return connected producers. Register process shutdown handlers and await `disconnect()` so in-flight work and network resources have a chance to close.

## See also

- [Kafka core API](./api/core.md)
- [Kafka client core API](./api/client-core.md)
- [KafkaJS client API](./api/kafkajs.md)
- [WarpStream Kafka client API](./api/warpstream.md)
