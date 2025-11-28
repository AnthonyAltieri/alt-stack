# Middleware

Add cross-cutting concerns like logging, metrics, or authentication.

## Basic Middleware

```typescript
const { procedure } = init();

const loggedProcedure = procedure.use(async ({ ctx, next }) => {
  console.log(`Processing message from ${ctx.topic}`);
  const result = await next();
  console.log(`Completed processing`);
  return result;
});

const router = kafkaRouter({
  events: loggedProcedure
    .input({ message: EventSchema })
    .subscribe(({ input }) => {
      // Logging middleware runs before/after this
    }),
});
```

## Context Extension

Middleware can add properties to context:

```typescript
const authMiddleware = procedure.use(async ({ ctx, next }) => {
  const user = await getUserFromMessage(ctx.message);
  return next({ ctx: { user } });
});

const router = kafkaRouter({
  "protected-events": authMiddleware
    .input({ message: EventSchema })
    .subscribe(({ input, ctx }) => {
      // ctx.user is available and typed
      console.log(`User: ${ctx.user.name}`);
    }),
});
```

## Reusable Middleware with createMiddleware

```typescript
import { createMiddleware } from "@alt-stack/kafka";

interface AppContext {
  logger: Logger;
}

const metricsMiddleware = createMiddleware<AppContext>()(async ({ ctx, next }) => {
  const start = Date.now();
  const result = await next();
  const duration = Date.now() - start;
  metrics.recordDuration(ctx.topic, duration);
  return result;
});
```

## Chaining Middleware

```typescript
const { procedure } = init<AppContext>();

const protectedProcedure = procedure
  .use(loggingMiddleware)
  .use(authMiddleware)
  .use(metricsMiddleware);

// All three middleware run in order
const router = kafkaRouter({
  events: protectedProcedure
    .input({ message: EventSchema })
    .subscribe(({ input, ctx }) => {}),
});
```

## Piping Middleware Builders

```typescript
const authChain = createMiddleware<AppContext>()
  .pipe(validateSession)
  .pipe(loadUser);

// Use the chain
const protectedProcedure = procedure.use(authChain);
```
