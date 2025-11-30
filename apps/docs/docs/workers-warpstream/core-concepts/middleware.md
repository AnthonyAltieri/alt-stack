# Middleware

Add cross-cutting logic to job handlers.

## Basic Middleware

```typescript
const { router, procedure } = init<AppContext>();

const loggedProcedure = procedure.use(async ({ ctx, next }) => {
  console.log(`Starting job: ${ctx.jobName}`);
  const start = Date.now();
  
  const result = await next();
  
  console.log(`Completed in ${Date.now() - start}ms`);
  return result;
});

const jobRouter = router({
  "my-job": loggedProcedure
    .input({ payload: z.object({ id: z.string() }) })
    .task(async ({ input }) => {
      // Logging happens automatically
    }),
});
```

## Extend Context

```typescript
const withMetrics = procedure.use(async ({ ctx, next }) => {
  return next({
    ctx: {
      metrics: new MetricsClient(),
    },
  });
});

// Now ctx.metrics is available in handlers
const jobRouter = router({
  "tracked-job": withMetrics
    .input({ payload: z.object({ id: z.string() }) })
    .task(async ({ ctx }) => {
      ctx.metrics.increment("jobs.processed");
    }),
});
```

## Chain Middleware

```typescript
const authedProcedure = procedure
  .use(loggingMiddleware)
  .use(metricsMiddleware)
  .use(rateLimitMiddleware);
```


