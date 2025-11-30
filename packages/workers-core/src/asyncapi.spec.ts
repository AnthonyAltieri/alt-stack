import { describe, it, expect } from "vitest";
import { z } from "zod";
import { generateAsyncAPISpec } from "./asyncapi.js";
import { init } from "./init.js";

describe("generateAsyncAPISpec", () => {
  it("should generate spec with task procedures", () => {
    const { router, procedure } = init();

    const testRouter = router({
      "send-email": procedure
        .input({ payload: z.object({ userId: z.string(), email: z.string().email() }) })
        .task(async () => {}),
    });

    const spec = generateAsyncAPISpec(testRouter, {
      title: "Test API",
      version: "1.0.0",
    });

    expect(spec.asyncapi).toBe("3.0.0");
    expect(spec.info.title).toBe("Test API");
    expect(spec.info.version).toBe("1.0.0");
    expect(Object.keys(spec.channels)).toHaveLength(1);
    expect(spec.channels["send_email"]).toBeDefined();
    expect(spec.channels["send_email"]?.address).toBe("send-email");
  });

  it("should generate spec with queue procedures", () => {
    const { router, procedure } = init();

    const testRouter = router({
      "process-upload": procedure
        .input({ payload: z.object({ fileId: z.string() }) })
        .queue("uploads", async () => {}),
    });

    const spec = generateAsyncAPISpec(testRouter);

    expect(Object.keys(spec.channels)).toHaveLength(1);
    expect(spec.channels["process_upload"]).toBeDefined();
  });

  it("should exclude cron procedures from spec", () => {
    const { router, procedure } = init();

    const testRouter = router({
      "send-email": procedure
        .input({ payload: z.object({ email: z.string() }) })
        .task(async () => {}),
      "daily-digest": procedure.cron("0 9 * * *", async () => {}),
    });

    const spec = generateAsyncAPISpec(testRouter);

    // Only task should be included, not cron
    expect(Object.keys(spec.channels)).toHaveLength(1);
    expect(spec.channels["send_email"]).toBeDefined();
    expect(spec.channels["daily_digest"]).toBeUndefined();
  });

  it("should generate message schemas", () => {
    const { router, procedure } = init();

    const testRouter = router({
      "create-user": procedure
        .input({
          payload: z.object({
            name: z.string(),
            age: z.number(),
          }),
        })
        .task(async () => {}),
    });

    const spec = generateAsyncAPISpec(testRouter);

    expect(spec.components?.schemas).toBeDefined();
    expect(spec.components?.schemas?.["CreateUserPayload"]).toBeDefined();
    expect(spec.components?.messages?.["CreateUserMessage"]).toBeDefined();
  });

  it("should generate operations for each procedure", () => {
    const { router, procedure } = init();

    const testRouter = router({
      "send-notification": procedure
        .input({ payload: z.object({ message: z.string() }) })
        .task(async () => {}),
    });

    const spec = generateAsyncAPISpec(testRouter);

    expect(spec.operations).toBeDefined();
    expect(spec.operations?.["triggerSendNotification"]).toBeDefined();
    expect(spec.operations?.["triggerSendNotification"]?.action).toBe("send");
  });

  it("should handle procedures without payload schema", () => {
    const { router, procedure } = init();

    const testRouter = router({
      "simple-task": procedure.task(async () => {}),
    });

    const spec = generateAsyncAPISpec(testRouter);

    expect(Object.keys(spec.channels)).toHaveLength(1);
    // Should have a default object type for payload
    expect(spec.components?.messages?.["SimpleTaskMessage"]?.payload).toEqual({
      type: "object",
    });
  });

  it("should use default values when options not provided", () => {
    const { router, procedure } = init();

    const testRouter = router({
      test: procedure
        .input({ payload: z.object({ id: z.string() }) })
        .task(async () => {}),
    });

    const spec = generateAsyncAPISpec(testRouter);

    expect(spec.info.title).toBe("Workers API");
    expect(spec.info.version).toBe("1.0.0");
  });

  it("should include description when provided", () => {
    const { router, procedure } = init();

    const testRouter = router({
      test: procedure
        .input({ payload: z.object({ id: z.string() }) })
        .task(async () => {}),
    });

    const spec = generateAsyncAPISpec(testRouter, {
      description: "My API description",
    });

    expect(spec.info.description).toBe("My API description");
  });

  it("should handle multiple procedures", () => {
    const { router, procedure } = init();

    const testRouter = router({
      "task-one": procedure
        .input({ payload: z.object({ a: z.string() }) })
        .task(async () => {}),
      "task-two": procedure
        .input({ payload: z.object({ b: z.number() }) })
        .task(async () => {}),
      "queue-one": procedure
        .input({ payload: z.object({ c: z.boolean() }) })
        .queue("my-queue", async () => {}),
    });

    const spec = generateAsyncAPISpec(testRouter);

    expect(Object.keys(spec.channels)).toHaveLength(3);
    expect(Object.keys(spec.operations ?? {})).toHaveLength(3);
  });
});


