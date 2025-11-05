# Middleware

Apply middleware at router-level or procedure-level to add cross-cutting concerns like logging, metrics, or error handling.

## Router-Level Middleware

Apply middleware to all topics in a router:

```typescript
import { createKafkaRouter, createMiddleware } from "@alt-stack/kafka";
import { z } from "zod";

interface AppContext {
  logger: {
    log: (message: string) => void;
  };
}

const loggingMiddleware = createMiddleware<AppContext>(
  async ({ ctx, next }) => {
    ctx.logger.log(`Processing message from topic ${ctx.topic}`);
    const result = await next();
    ctx.logger.log(`Completed processing message from topic ${ctx.topic}`);
    return result;
  },
);

const router = createKafkaRouter<AppContext>()
  .use(loggingMiddleware)
  .topic("user-events", {
    input: {
      message: z.object({
        userId: z.string(),
      }),
    },
  })
  .handler((ctx) => {
    // ctx.logger is available from middleware
    // ctx.input is the parsed message
    ctx.logger.log(`Processing user ${ctx.input.userId}`);
  });
```

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

Chain multiple middleware on the same router or procedure:

```typescript
const router = createKafkaRouter<AppContext>()
  .use(loggingMiddleware)
  .use(metricsMiddleware)
  .topic("user-events", {
    input: {
      message: UserEventSchema,
    },
  })
  .handler(/* ... */);
```

Middleware executes in the order they're defined.

