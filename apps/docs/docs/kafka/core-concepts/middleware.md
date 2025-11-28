# Middleware

Apply middleware to procedures to add cross-cutting concerns like logging, metrics, or error handling.

## Procedure-Level Middleware

Apply middleware to specific topics:

```typescript
const router = createKafkaRouter()
  .topic("sensitive-events", {
    input: {
      message: z.object({
        data: z.string(),
      }),
    },
  })
  .use(async ({ ctx, next }) => {
    // Log before handler
    console.log(`Processing sensitive event from partition ${ctx.partition}`);
    return next();
  })
  .handler((ctx) => {
    // ctx.input is the parsed message
    processSensitiveData(ctx.input);
  });
```

## Context Extension

Middleware can extend the context by passing updated context to `next()`:

```typescript
const metricsMiddleware = createMiddleware<AppContext>(
  async ({ ctx, next }) => {
    const start = Date.now();
    const result = await next();
    const duration = Date.now() - start;
    metrics.recordDuration(ctx.topic, duration);
    return result;
  },
);

const userMiddleware = createMiddleware<AppContext>(
  async ({ ctx, next }) => {
    const user = await getUserFromMessage(ctx.input.message);
    return next({ ctx: { user } });
  },
);
```

## Multiple Middleware

Chain multiple middleware on the same procedure:

```typescript
const router = kafkaRouter({
  "user-events": procedure
    .input({ message: UserEventSchema })
    .use(loggingMiddleware)
    .use(metricsMiddleware)
    .subscribe(({ input, ctx }) => {
      // handle message
    }),
});
```

Middleware executes in the order they're defined.

