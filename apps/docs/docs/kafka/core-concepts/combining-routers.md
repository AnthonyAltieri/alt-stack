# Combining Routers

Organize consumers by domain using nested routers.

## Nested Routers

Use nested `kafkaRouter` for topic prefixing:

```typescript
import { init, kafkaRouter } from "@alt-stack/kafka-core";

const { procedure } = init<AppContext>();

const userRouter = kafkaRouter<AppContext>({
  created: procedure.input({ message: UserCreatedSchema }).subscribe(handleUserCreated),
  updated: procedure.input({ message: UserUpdatedSchema }).subscribe(handleUserUpdated),
});

const orderRouter = kafkaRouter<AppContext>({
  created: procedure.input({ message: OrderCreatedSchema }).subscribe(handleOrderCreated),
  cancelled: procedure.input({ message: OrderCancelledSchema }).subscribe(handleOrderCancelled),
});

// Topics become: users/created, users/updated, orders/created, orders/cancelled
const mainRouter = kafkaRouter<AppContext>({
  users: userRouter,
  orders: orderRouter,
});
```

## Merging Flat Routers

Use `mergeKafkaRouters` to combine routers without prefixing:

```typescript
import { mergeKafkaRouters } from "@alt-stack/kafka-core";

const router1 = kafkaRouter({
  "user-events": procedure.input({ message: UserSchema }).subscribe(() => {}),
});

const router2 = kafkaRouter({
  "order-events": procedure.input({ message: OrderSchema }).subscribe(() => {}),
});

// Topics remain: user-events, order-events (no prefix)
const mainRouter = mergeKafkaRouters(router1, router2);
```

## Using init() Factory

```typescript
const { router, mergeRouters, procedure } = init<AppContext>();

const r1 = router();
r1.registerProcedure("events", procedure.input({ message: Schema }).subscribe(() => {}));

const r2 = router();
r2.registerProcedure("other", procedure.input({ message: Schema }).subscribe(() => {}));

const merged = mergeRouters(r1, r2);
```
