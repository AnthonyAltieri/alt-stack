# Error Handling

Handle job failures gracefully.

## Error Callback

```typescript
const worker = await createWorker(router, {
  kafka: { brokers: ["localhost:9092"] },
  groupId: "workers",
  onError: async (error, ctx) => {
    console.error(`Job ${ctx.jobName} failed:`, error);
    
    // Send to error tracking
    await sentry.captureException(error, {
      extra: {
        jobId: ctx.jobId,
        jobName: ctx.jobName,
        attempt: ctx.attempt,
      },
    });
  },
});
```

## Typed Errors

Define expected error shapes:

```typescript
const jobRouter = router({
  "process-payment": procedure
    .input({ payload: z.object({ orderId: z.string() }) })
    .errors({
      INSUFFICIENT_FUNDS: z.object({
        code: z.literal("INSUFFICIENT_FUNDS"),
        balance: z.number(),
      }),
      CARD_DECLINED: z.object({
        code: z.literal("CARD_DECLINED"),
        reason: z.string(),
      }),
    })
    .task(async ({ input, ctx }) => {
      const balance = await getBalance();
      if (balance < 0) {
        throw ctx.error({
          code: "INSUFFICIENT_FUNDS",
          balance,
        });
      }
    }),
});
```

## Retries

Kafka consumer retries are handled at the Kafka level. Configure dead letter queues in your Kafka setup for failed messages.


