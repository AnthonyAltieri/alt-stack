# Error Handling

Handle job failures with the Result pattern.

For comprehensive documentation on the Result type, see the [Result documentation](/result).

## Result Pattern

Handlers return `Result<Errors, Output>`:

```typescript
import { init, ok, err } from "@alt-stack/workers-trigger";

const { router, procedure } = init();

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
    .task(async ({ input }) => {
      const balance = await getBalance();
      if (balance < 0) {
        return err({
          data: {
            code: "INSUFFICIENT_FUNDS" as const,
            balance,
          },
        });
      }

      await processPayment(input.orderId);
      return ok();
    }),
});
```

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

## Success Returns

Use `ok()` for all successful returns:

```typescript
// Return data
return ok({ orderId: "123", status: "processed" });

// Void return
return ok();
```

## Retries

Kafka consumer retries are handled at the Kafka level. Configure dead letter queues in your Kafka setup for failed messages.

## See Also

- [Result Documentation](/result) - Complete guide to the Result type
