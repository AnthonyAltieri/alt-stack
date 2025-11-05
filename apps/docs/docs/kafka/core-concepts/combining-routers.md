# Combining Routers

Combine multiple routers to organize your Kafka consumers by domain or feature.

## Basic Router Combination

Use `mergeKafkaRouters` to combine routers:

```typescript
import { createKafkaRouter, mergeKafkaRouters } from "@alt-stack/kafka";

const userRouter = createKafkaRouter()
  .topic("user-created", { /* ... */ })
  .handler(handleUserCreated)
  .topic("user-updated", { /* ... */ })
  .handler(handleUserUpdated);

const orderRouter = createKafkaRouter()
  .topic("order-created", { /* ... */ })
  .handler(handleOrderCreated)
  .topic("order-cancelled", { /* ... */ })
  .handler(handleOrderCancelled);

// Combine routers
const mainRouter = mergeKafkaRouters({
  users: userRouter,
  orders: orderRouter,
});

const consumer = await createConsumer(mainRouter, {
  kafka: new Kafka({
    brokers: ["localhost:9092"],
  }),
  groupId: "my-consumer-group",
});
```

## Router Constructor

You can also combine routers using the router constructor:

```typescript
const mainRouter = createKafkaRouter({
  users: userRouter,
  orders: orderRouter,
});
```

## Multiple Routers with Same Prefix

Combine multiple routers under the same prefix:

```typescript
const v1Router = createKafkaRouter()
  .topic("user-events-v1", { /* ... */ })
  .handler(handleV1);

const v2Router = createKafkaRouter()
  .topic("user-events-v2", { /* ... */ })
  .handler(handleV2);

const mainRouter = createKafkaRouter({
  users: [v1Router, v2Router],
});
```

## Shared Context

All routers share the same context type:

```typescript
interface AppContext {
  logger: Logger;
  db: Database;
}

const userRouter = createKafkaRouter<AppContext>()
  .topic("user-events", { /* ... */ })
  .handler((ctx) => {
    ctx.logger.log("Processing user event");
    // ctx.input is the parsed message
    ctx.db.save(ctx.input);
  });

const orderRouter = createKafkaRouter<AppContext>()
  .topic("order-events", { /* ... */ })
  .handler((ctx) => {
    ctx.logger.log("Processing order event");
    // ctx.input is the parsed message
    ctx.db.save(ctx.input);
  });

const mainRouter = mergeKafkaRouters({
  users: userRouter,
  orders: orderRouter,
});

const consumer = await createConsumer(mainRouter, {
  kafka: new Kafka({
    brokers: ["localhost:9092"],
  }),
  groupId: "my-consumer-group",
  createContext: (baseCtx) => ({
    logger: getLogger(),
    db: getDatabase(),
  }),
});
```

