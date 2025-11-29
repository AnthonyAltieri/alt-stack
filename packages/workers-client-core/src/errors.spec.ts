import { describe, it, expect } from "vitest";
import {
  WorkerClientError,
  ValidationError,
  TriggerError,
  ConnectionError,
} from "./errors.js";

describe("WorkerClientError", () => {
  it("should create base error with message", () => {
    const error = new WorkerClientError("test error");
    expect(error.message).toBe("test error");
    expect(error.name).toBe("WorkerClientError");
    expect(error.cause).toBeUndefined();
  });

  it("should create error with cause", () => {
    const cause = new Error("original");
    const error = new WorkerClientError("wrapped error", cause);
    expect(error.message).toBe("wrapped error");
    expect(error.cause).toBe(cause);
  });
});

describe("ValidationError", () => {
  it("should create validation error with job name", () => {
    const error = new ValidationError("my-job", "invalid payload");
    expect(error.jobName).toBe("my-job");
    expect(error.message).toBe("invalid payload");
    expect(error.name).toBe("ValidationError");
  });

  it("should include details", () => {
    const details = [{ path: ["email"], message: "invalid email" }];
    const error = new ValidationError("send-email", "validation failed", details);
    expect(error.details).toEqual(details);
  });
});

describe("TriggerError", () => {
  it("should create trigger error with job name and cause", () => {
    const cause = new Error("network failure");
    const error = new TriggerError("process-image", "failed to trigger", cause);
    expect(error.jobName).toBe("process-image");
    expect(error.message).toBe("failed to trigger");
    expect(error.cause).toBe(cause);
    expect(error.name).toBe("TriggerError");
  });
});

describe("ConnectionError", () => {
  it("should create connection error", () => {
    const error = new ConnectionError("failed to connect to broker");
    expect(error.message).toBe("failed to connect to broker");
    expect(error.name).toBe("ConnectionError");
  });
});

