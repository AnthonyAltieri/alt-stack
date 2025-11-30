import { describe, it, expect } from "vitest";
import { z } from "zod";
import type { JobsMap, WorkerClient, TriggerOptions, TriggerResult } from "./types.js";

describe("types", () => {
  it("should allow defining a JobsMap", () => {
    const jobs = {
      "send-email": z.object({ to: z.string(), subject: z.string() }),
      "process-image": z.object({ url: z.string() }),
    } satisfies JobsMap;

    expect(Object.keys(jobs)).toHaveLength(2);
  });

  it("should type TriggerOptions correctly", () => {
    const options: TriggerOptions = {
      idempotencyKey: "unique-123",
      delay: "PT5M",
      maxRetries: 3,
      metadata: { source: "api" },
    };

    expect(options.idempotencyKey).toBe("unique-123");
  });

  it("should type TriggerResult correctly", () => {
    const result: TriggerResult = {
      id: "job-run-123",
    };

    expect(result.id).toBe("job-run-123");
  });

  it("should allow minimal TriggerOptions", () => {
    const options: TriggerOptions = {};
    expect(options).toBeDefined();
  });

  it("should allow Date in delay option", () => {
    const options: TriggerOptions = {
      delay: new Date("2025-01-01"),
    };

    expect(options.delay).toBeInstanceOf(Date);
  });
});


