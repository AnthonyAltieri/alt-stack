import { describe, expect, it } from "vitest";
import { normalizeQueueDefinition, planFailureAction } from "./policy.js";

describe("workers-state-core policy helpers", () => {
  it("normalizes a string queue definition", () => {
    expect(normalizeQueueDefinition("uploads")).toEqual({ name: "uploads" });
  });

  it("plans a retry when the retry budget remains", () => {
    const plan = planFailureAction(
      normalizeQueueDefinition({
        name: "uploads",
        retry: {
          maxRetries: 2,
          delay: { type: "fixed", ms: 5000 },
        },
      }),
      1,
      { name: "Error", message: "boom" },
      new Date("2026-03-27T12:00:00.000Z"),
    );

    expect(plan).toEqual({
      type: "retry",
      nextAttempt: 2,
      delayMs: 5000,
      retryAt: "2026-03-27T12:00:05.000Z",
    });
  });

  it("plans a dead-letter move after retries are exhausted", () => {
    const plan = planFailureAction(
      normalizeQueueDefinition({
        name: "uploads",
        retry: {
          maxRetries: 1,
          delay: { type: "fixed", ms: 5000 },
        },
        deadLetter: {
          queueName: "uploads-dlq",
        },
      }),
      2,
      { name: "Error", message: "boom" },
    );

    expect(plan.type).toBe("dead_letter");
    if (plan.type === "dead_letter") {
      expect(plan.reason.code).toBe("max_retries_exceeded");
    }
  });
});
