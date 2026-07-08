import { describe, expect, it } from "vitest";
import { simulateTaskExecution } from "./assistant.js";

describe("simulateTaskExecution", () => {
  it("returns a deterministic result for successful tasks", () => {
    const result = simulateTaskExecution(
      {
        title: "Generate invoice export",
        description: "Pull the April invoices and mark the batch ready",
        failAfterRetries: 0,
        alwaysFail: false,
      },
      1,
    );

    expect(result).toContain("Task processed");
    expect(result).toContain("Retry attempt: 1");
    expect(result).toContain("Generate invoice export");
  });

  it("fails for the configured number of retries before succeeding", () => {
    expect(() => simulateTaskExecution(
      {
        title: "Rebuild cache",
        description: null,
        failAfterRetries: 1,
        alwaysFail: false,
      },
      1,
    )).toThrow("Simulated transient task failure");

    expect(simulateTaskExecution(
      {
        title: "Rebuild cache",
        description: null,
        failAfterRetries: 1,
        alwaysFail: false,
      },
      2,
    )).toContain("Retry attempt: 2");
  });

  it("always fails when alwaysFail is enabled", () => {
    expect(() => simulateTaskExecution(
      {
        title: "Replay poisoned event",
        description: null,
        failAfterRetries: 0,
        alwaysFail: true,
      },
      1,
    )).toThrow("Simulated persistent task failure");
  });
});
