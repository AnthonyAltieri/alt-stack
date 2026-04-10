import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { init, ok, buildQueueHeaders } from "@alt-stack/workers-core";
import type { Storage, DueDispatch, QueueJobEvent } from "@alt-stack/workers-core";
import { createJobClient, dispatchDueJobs } from "./client.js";
import { createWorker } from "./worker.js";

function createStorageMock(overrides: Partial<Storage> = {}): Storage {
  return {
    ensureSchema: vi.fn(async () => undefined),
    append: vi.fn(async (_events: QueueJobEvent[]) => undefined),
    getJob: vi.fn(async () => null),
    getJobState: vi.fn(async () => null),
    listDeadLetters: vi.fn(async () => []),
    listRedrives: vi.fn(async () => []),
    listDueDispatches: vi.fn(async () => []),
    requestRedrive: vi.fn(async () => {
      throw new Error("not implemented in test");
    }),
    ...overrides,
  };
}

function createProducerMock() {
  return {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    send: vi.fn(async () => undefined),
  };
}

describe("workers-warpstream state backend", () => {
  it("records an enqueue event when the router-backed client uses storage", async () => {
    const { router, procedure } = init();
    const storage = createStorageMock();
    const producer = createProducerMock();
    const kafka = {
      producer: () => producer,
    } as unknown as import("kafkajs").Kafka;

    const workerRouter = router({
      "process-upload": procedure
        .input({ payload: z.object({ fileId: z.string() }) })
        .queue(
          {
            name: "uploads",
            config: {
              retry: {
                budget: 1,
                backoff: {
                  type: "static",
                  startingSeconds: 1,
                },
              },
            },
          },
          async () => ok(),
        ),
    });

    const client = await createJobClient(workerRouter, {
      kafka,
      storage,
    });

    await client.enqueue(
      "process-upload",
      { fileId: "file_1" } as never,
      {
        key: "tenant-1",
        config: {
          redrive: {
            budget: 2,
          },
        },
      },
    );

    expect(producer.send).toHaveBeenCalledTimes(1);
    expect(storage.append).toHaveBeenCalledTimes(1);

    const appendedEvents = vi.mocked(storage.append).mock.calls[0]?.[0];
    expect(appendedEvents?.[0]?.type).toBe("job_enqueued");
    expect(appendedEvents?.[0]?.queueName).toBe("uploads");
    expect(appendedEvents?.[0]?.key).toBe("tenant-1");
    expect(appendedEvents?.[0]?.headers["x-retry-budget"]).toBe("1");
    expect(appendedEvents?.[0]?.headers["x-retry-backoff-type"]).toBe("static");
    expect(appendedEvents?.[0]?.headers["x-retry-backoff-starting-seconds"]).toBe("1");
    expect(appendedEvents?.[0]?.headers["x-retry-count"]).toBe("0");
    expect(appendedEvents?.[0]?.headers["x-redrive-budget"]).toBe("2");
    expect(appendedEvents?.[0]?.headers["x-redrive-count"]).toBe("0");
  });

  it("dispatches due retries and records the queued event", async () => {
    const producer = createProducerMock();
    const dueDispatch: DueDispatch = {
      kind: "retry",
      jobId: "job_1",
      jobName: "process-upload",
      queueName: "uploads",
      attempt: 2,
      scheduledAt: "2026-03-27T12:00:05.000Z",
      payload: { fileId: "file_1" },
      queue: {
        name: "uploads",
        config: {
          retry: {
            budget: 1,
            backoff: {
              type: "static",
              startingSeconds: 1,
            },
          },
        },
      },
      headers: buildQueueHeaders({
        jobId: "job_1",
        attempt: 1,
        queueName: "uploads",
        createdAt: "1711540800000",
        dispatchKind: "initial",
        retryBudget: 1,
        retryBackoffType: "static",
        retryBackoffStartingSeconds: 1,
        retryCount: 0,
      }),
      key: "tenant-1",
      dispatchKind: "retry",
      retryBudget: 1,
      retryBackoffType: "static",
      retryBackoffStartingSeconds: 1,
      retryCount: 1,
      redriveCount: 0,
    };
    const storage = createStorageMock({
      listDueDispatches: vi.fn(async () => [dueDispatch]),
    });
    const kafka = {
      producer: () => producer,
    } as unknown as import("kafkajs").Kafka;

    const result = await dispatchDueJobs({
      kafka,
      storage,
    });

    expect(result).toEqual({
      dispatched: 1,
      jobIds: ["job_1"],
    });
    expect(producer.send).toHaveBeenCalledTimes(1);
    expect(storage.append).toHaveBeenCalledTimes(1);
    const sendCall = vi.mocked(producer.send).mock.calls[0] as
      | [{ messages: Array<{ key?: string | Buffer | null }> }]
      | undefined;
    const producedMessage = sendCall?.[0]?.messages[0];
    expect(producedMessage?.key).toBe("tenant-1");
    const event = vi.mocked(storage.append).mock.calls[0]?.[0]?.[0];
    expect(event?.type).toBe("job_enqueued");
    expect(event?.attempt).toBe(2);
    expect(event?.key).toBe("tenant-1");
  });

  it("increments the redrive count when dispatching due redrives", async () => {
    const producer = createProducerMock();
    const dueDispatch: DueDispatch = {
      kind: "redrive",
      jobId: "job_1",
      jobName: "process-upload",
      queueName: "uploads",
      attempt: 2,
      scheduledAt: "2026-03-27T12:00:05.000Z",
      payload: { fileId: "file_1" },
      queue: {
        name: "uploads",
        deadLetter: {
          queueName: "uploads-dlq",
        },
        config: {
          retry: {
            budget: 0,
            backoff: {
              type: "static",
              startingSeconds: 0,
            },
          },
          redrive: {
            budget: 1,
          },
        },
      },
      headers: buildQueueHeaders({
        jobId: "job_1",
        attempt: 2,
        queueName: "uploads",
        createdAt: "1711540800000",
        dispatchKind: "redrive",
        redriveId: "redrive_1",
        retryBudget: 0,
        retryBackoffType: "static",
        retryBackoffStartingSeconds: 0,
        retryCount: 0,
        redriveBudget: 1,
        redriveCount: 1,
      }),
      key: "tenant-1",
      dispatchKind: "redrive",
      redriveId: "redrive_1",
      retryBudget: 0,
      retryBackoffType: "static",
      retryBackoffStartingSeconds: 0,
      retryCount: 0,
      redriveBudget: 1,
      redriveCount: 1,
    };
    const storage = createStorageMock({
      listDueDispatches: vi.fn(async () => [dueDispatch]),
    });
    const kafka = {
      producer: () => producer,
    } as unknown as import("kafkajs").Kafka;

    await dispatchDueJobs({
      kafka,
      storage,
    });

    const sendArgs = vi.mocked(producer.send).mock.calls.at(0);
    const sendCall = sendArgs?.at(0) as
      | { messages: Array<{ headers?: Record<string, string> }> }
      | undefined;
    expect(sendCall?.messages[0]?.headers?.["x-redrive-count"]).toBe("1");
    expect(sendCall?.messages[0]?.headers?.["x-retry-count"]).toBe("0");
    const event = vi.mocked(storage.append).mock.calls[0]?.[0]?.[0];
    expect(event?.type).toBe("redrive_dispatched");
    expect(event?.headers["x-redrive-count"]).toBe("1");
    expect(event?.headers["x-retry-count"]).toBe("0");
  });

  it("converts managed queue failures into retry state instead of rethrowing", async () => {
    const { router, procedure } = init();
    const storage = createStorageMock();
    const messageHeaders = buildQueueHeaders({
      jobId: "job_1",
      attempt: 1,
      queueName: "uploads",
      createdAt: Date.now().toString(),
      dispatchKind: "initial",
      retryBudget: 1,
      retryBackoffType: "static",
      retryBackoffStartingSeconds: 1,
      retryCount: 0,
    });
    const consumer = {
      connect: vi.fn(async () => undefined),
      subscribe: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      run: vi.fn(async ({ eachMessage }: { eachMessage: (payload: {
        topic: string;
        partition: number;
        message: {
          offset: string;
          value: Buffer;
          headers: Record<string, string>;
        };
      }) => Promise<void> }) => {
        await eachMessage({
          topic: "process-upload",
          partition: 0,
          message: {
            offset: "1",
            value: Buffer.from(JSON.stringify({ fileId: "file_1" })),
            headers: messageHeaders,
          },
        });
      }),
    };
    const kafka = {
      consumer: () => consumer,
    } as unknown as import("kafkajs").Kafka;

    const workerRouter = router({
      "process-upload": procedure
        .input({ payload: z.object({ fileId: z.string() }) })
        .queue(
          {
            name: "uploads",
            deadLetter: {
              queueName: "uploads-dlq",
            },
            config: {
              retry: {
                budget: 1,
                backoff: {
                  type: "static",
                  startingSeconds: 1,
                },
              },
            },
          },
          async () => {
            throw new Error("boom");
          },
        ),
    });

    await createWorker(workerRouter, {
      kafka,
      groupId: "workers",
      storage,
    });

    expect(storage.append).toHaveBeenCalledTimes(3);
    const eventBatches = vi
      .mocked(storage.append)
      .mock.calls.map((call: [QueueJobEvent[]]) => call[0][0]?.type);
    expect(eventBatches).toEqual([
      "attempt_started",
      "attempt_failed",
      "retry_scheduled",
    ]);
  });

  it("unwraps ok() values before validating worker output schemas", async () => {
    const { router, procedure } = init();
    const handler = vi.fn(async ({ input }: { input: { fileId: string } }) =>
      ok({ fileId: input.fileId }),
    );
    const consumer = {
      connect: vi.fn(async () => undefined),
      subscribe: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      run: vi.fn(async ({ eachMessage }: { eachMessage: (payload: {
        topic: string;
        partition: number;
        message: {
          offset: string;
          value: Buffer;
          headers: Record<string, string>;
        };
      }) => Promise<void> }) => {
        await eachMessage({
          topic: "process-upload",
          partition: 0,
          message: {
            offset: "1",
            value: Buffer.from(JSON.stringify({ fileId: "file_1" })),
            headers: {},
          },
        });
      }),
    };
    const kafka = {
      consumer: () => consumer,
    } as unknown as import("kafkajs").Kafka;

    const workerRouter = router({
      "process-upload": procedure
        .input({ payload: z.object({ fileId: z.string() }) })
        .output(z.object({ fileId: z.string() }))
        .queue("uploads", handler),
    });

    await expect(
      createWorker(workerRouter, {
        kafka,
        groupId: "workers",
      }),
    ).resolves.toEqual({
      disconnect: expect.any(Function),
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("rethrows managed queue failures that have no retry or dead-letter policy", async () => {
    const { router, procedure } = init();
    const storage = createStorageMock();
    const messageHeaders = buildQueueHeaders({
      jobId: "job_2",
      attempt: 1,
      queueName: "uploads",
      createdAt: Date.now().toString(),
      dispatchKind: "initial",
      retryBudget: 0,
      retryBackoffType: "static",
      retryBackoffStartingSeconds: 0,
      retryCount: 0,
    });
    const consumer = {
      connect: vi.fn(async () => undefined),
      subscribe: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      run: vi.fn(async ({ eachMessage }: { eachMessage: (payload: {
        topic: string;
        partition: number;
        message: {
          offset: string;
          key: Buffer;
          value: Buffer;
          headers: Record<string, string>;
        };
      }) => Promise<void> }) => {
        await eachMessage({
          topic: "process-upload",
          partition: 0,
          message: {
            offset: "1",
            key: Buffer.from("tenant-2"),
            value: Buffer.from(JSON.stringify({ fileId: "file_2" })),
            headers: messageHeaders,
          },
        });
      }),
    };
    const kafka = {
      consumer: () => consumer,
    } as unknown as import("kafkajs").Kafka;

    const workerRouter = router({
      "process-upload": procedure
        .input({ payload: z.object({ fileId: z.string() }) })
        .queue(
          {
            name: "uploads",
          },
          async () => {
            throw new Error("boom");
          },
        ),
    });

    await expect(
      createWorker(workerRouter, {
        kafka,
        groupId: "workers",
        storage,
      }),
    ).rejects.toThrow("boom");

    expect(storage.append).toHaveBeenCalledTimes(2);
    const eventTypes = vi
      .mocked(storage.append)
      .mock.calls.map((call: [QueueJobEvent[]]) => call[0][0]?.type);
    expect(eventTypes).toEqual(["attempt_started", "attempt_failed"]);
    const failedEvent = vi.mocked(storage.append).mock.calls[1]?.[0]?.[0];
    expect(failedEvent?.key).toBe("tenant-2");
  });

  it("stops at failed once a redrive budget is exhausted", async () => {
    const { router, procedure } = init();
    const storage = createStorageMock();
    const messageHeaders = buildQueueHeaders({
      jobId: "job_3",
      attempt: 2,
      queueName: "uploads",
      createdAt: Date.now().toString(),
      dispatchKind: "redrive",
      redriveId: "redrive_1",
      retryBudget: 0,
      retryBackoffType: "static",
      retryBackoffStartingSeconds: 0,
      retryCount: 0,
      redriveBudget: 1,
      redriveCount: 1,
    });
    const consumer = {
      connect: vi.fn(async () => undefined),
      subscribe: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
      run: vi.fn(async ({ eachMessage }: { eachMessage: (payload: {
        topic: string;
        partition: number;
        message: {
          offset: string;
          key: Buffer;
          value: Buffer;
          headers: Record<string, string>;
        };
      }) => Promise<void> }) => {
        await eachMessage({
          topic: "process-upload",
          partition: 0,
          message: {
            offset: "1",
            key: Buffer.from("tenant-3"),
            value: Buffer.from(JSON.stringify({ fileId: "file_3" })),
            headers: messageHeaders,
          },
        });
      }),
    };
    const kafka = {
      consumer: () => consumer,
    } as unknown as import("kafkajs").Kafka;

    const workerRouter = router({
      "process-upload": procedure
        .input({ payload: z.object({ fileId: z.string() }) })
        .queue(
          {
            name: "uploads",
            deadLetter: {
              queueName: "uploads-dlq",
            },
            config: {
              redrive: {
                budget: 1,
              },
            },
          },
          async () => {
            throw new Error("boom");
          },
        ),
    });

    await expect(
      createWorker(workerRouter, {
        kafka,
        groupId: "workers",
        storage,
      }),
    ).resolves.toEqual({
      disconnect: expect.any(Function),
    });

    const eventTypes = vi
      .mocked(storage.append)
      .mock.calls.map((call: [QueueJobEvent[]]) => call[0][0]?.type);
    expect(eventTypes).toEqual(["attempt_started", "attempt_failed"]);
  });
});
