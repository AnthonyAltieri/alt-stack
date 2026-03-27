import { describe, expect, it } from "vitest";
import { init } from "./init.js";
import { ok } from "./index.js";

describe("queue configuration", () => {
  it("keeps string queue definitions backwards-compatible", () => {
    const { router, procedure } = init();

    const workerRouter = router({
      example: procedure.queue("uploads", async () => ok()),
    });

    const procedureDefinition = workerRouter.getProcedures()[0];
    expect(procedureDefinition?.queue).toBe("uploads");
    expect(procedureDefinition?.queueConfig).toEqual({ name: "uploads" });
  });

  it("stores retry and dead-letter queue metadata on queue procedures", () => {
    const { router, procedure } = init();

    const workerRouter = router({
      example: procedure.queue(
        {
          name: "uploads",
          retry: {
            maxRetries: 3,
            delay: {
              type: "fixed",
              ms: 5000,
            },
          },
          deadLetter: {
            queueName: "uploads-dlq",
          },
        },
        async () => ok(),
      ),
    });

    expect(workerRouter.getProcedures()[0]?.queueConfig).toEqual({
      name: "uploads",
      retry: {
        maxRetries: 3,
        delay: {
          type: "fixed",
          ms: 5000,
        },
      },
      deadLetter: {
        queueName: "uploads-dlq",
      },
    });
  });
});
