import { describe, expect, it } from "vitest";
import { normalizeQueueDefinition, planFailureAction } from "./policy.js";

describe("workers-state-core policy helpers", () => {
  it("normalizes a string queue definition", () => {
    expect(normalizeQueueDefinition("uploads")).toEqual({
      name: "uploads",
      config: {
        retry: {
          budget: 0,
          backoff: {
            type: "static",
            startingSeconds: 0,
          },
        },
      },
    });
  });

  it("plans a retry when the retry budget remains", () => {
    const plan = planFailureAction(
      normalizeQueueDefinition({
        name: "uploads",
        config: {
          retry: {
            budget: 2,
            backoff: {
              type: "static",
              startingSeconds: 5,
            },
          },
        },
      }),
      1,
      { name: "Error", message: "boom" },
      { now: new Date("2026-03-27T12:00:00.000Z") },
    );

    expect(plan).toEqual({
      type: "retry",
      nextAttempt: 2,
      nextRetryCount: 1,
      delayMs: 5000,
      retryAt: "2026-03-27T12:00:05.000Z",
    });
  });

  it("plans a dead-letter move after retries are exhausted", () => {
    const plan = planFailureAction(
      normalizeQueueDefinition({
        name: "uploads",
        deadLetter: {
          queueName: "uploads-dlq",
        },
        config: {
          retry: {
            budget: 1,
            backoff: {
              type: "static",
              startingSeconds: 5,
            },
          },
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

  it("stops dead-lettering once a redrive budget is exhausted", () => {
    const plan = planFailureAction(
      normalizeQueueDefinition({
        name: "uploads",
        deadLetter: {
          queueName: "uploads-dlq",
        },
        config: {
          redrive: {
            budget: 1,
          },
        },
      }),
      1,
      { name: "Error", message: "boom" },
      {
        redriveCount: 1,
      },
    );

    expect(plan).toEqual({
      type: "failure",
      reason: "redrive_budget_exhausted",
      rethrow: false,
    });
  });
});
