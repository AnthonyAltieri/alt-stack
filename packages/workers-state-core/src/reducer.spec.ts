import { describe, expect, it } from "vitest";
import { buildQueueJobHistory } from "./reducer.js";
import { buildQueueHeaders, createJobId } from "./headers.js";
import { normalizeQueueDefinition } from "./policy.js";

describe("workers-state-core reducer", () => {
  it("reduces retry and dead-letter state transitions", () => {
    const jobId = createJobId();
    const queue = normalizeQueueDefinition({
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
    });
    const initialHeaders = buildQueueHeaders({
      jobId,
      attempt: 1,
      queueName: queue.name,
      createdAt: "2026-03-27T12:00:00.000Z",
      dispatchKind: "initial",
      retryBudget: 1,
      retryBackoffType: "static",
      retryBackoffStartingSeconds: 1,
      retryCount: 0,
      redriveCount: 0,
    });
    const retryHeaders = buildQueueHeaders({
      jobId,
      attempt: 2,
      queueName: queue.name,
      createdAt: "2026-03-27T12:00:00.000Z",
      dispatchKind: "retry",
      scheduledAt: "2026-03-27T12:00:06.000Z",
      retryBudget: 1,
      retryBackoffType: "static",
      retryBackoffStartingSeconds: 1,
      retryCount: 1,
      redriveCount: 0,
    });

    const history = buildQueueJobHistory([
      {
        eventId: "evt_1",
        type: "job_enqueued",
        occurredAt: "2026-03-27T12:00:00.000Z",
        createdAt: "2026-03-27T12:00:00.000Z",
        jobId,
        jobName: "process-upload",
        queueName: queue.name,
        attempt: 1,
        payload: { fileId: "file_1" },
        queue,
        headers: initialHeaders,
        dispatchKind: "initial",
      },
      {
        eventId: "evt_2",
        type: "retry_scheduled",
        occurredAt: "2026-03-27T12:00:01.000Z",
        createdAt: "2026-03-27T12:00:00.000Z",
        jobId,
        jobName: "process-upload",
        queueName: queue.name,
        attempt: 1,
        nextAttempt: 2,
        nextRetryCount: 1,
        retryAt: "2026-03-27T12:00:06.000Z",
        payload: { fileId: "file_1" },
        queue,
        headers: retryHeaders,
        dispatchKind: "retry",
        error: { name: "Error", message: "boom" },
      },
      {
        eventId: "evt_3",
        type: "moved_to_dlq",
        occurredAt: "2026-03-27T12:00:07.000Z",
        createdAt: "2026-03-27T12:00:00.000Z",
        jobId,
        jobName: "process-upload",
        queueName: queue.name,
        attempt: 2,
        payload: { fileId: "file_1" },
        queue,
        headers: retryHeaders,
        dispatchKind: "retry",
        error: { name: "Error", message: "boom again" },
        reason: {
          code: "max_retries_exceeded",
          message: "boom again",
        },
      },
    ]);

    expect(history?.state?.state).toBe("dead_letter");
    expect(history?.state?.deadLetterReason?.code).toBe("max_retries_exceeded");
  });

  it("marks standalone attempt failures as failed", () => {
    const jobId = createJobId();
    const queue = normalizeQueueDefinition("uploads");
    const headers = buildQueueHeaders({
      jobId,
      attempt: 1,
      queueName: queue.name,
      createdAt: "2026-03-27T12:00:00.000Z",
      dispatchKind: "initial",
      retryBudget: 0,
      retryBackoffType: "static",
      retryBackoffStartingSeconds: 0,
      retryCount: 0,
      redriveCount: 0,
    });

    const history = buildQueueJobHistory([
      {
        eventId: "evt_1",
        type: "attempt_failed",
        occurredAt: "2026-03-27T12:00:01.000Z",
        createdAt: "2026-03-27T12:00:00.000Z",
        jobId,
        jobName: "process-upload",
        queueName: queue.name,
        attempt: 1,
        payload: { fileId: "file_1" },
        queue,
        headers,
        dispatchKind: "initial",
        error: { name: "Error", message: "boom" },
      },
    ]);

    expect(history?.state?.state).toBe("failed");
    expect(history?.state?.lastError?.message).toBe("boom");
  });

  it("tracks redrive budgets and consumed redrive count through dispatch", () => {
    const jobId = createJobId();
    const queue = normalizeQueueDefinition({
      name: "uploads",
      deadLetter: {
        queueName: "uploads-dlq",
      },
      config: {
        redrive: {
          budget: 1,
        },
      },
    });

    const initialHeaders = buildQueueHeaders({
      jobId,
      attempt: 1,
      queueName: queue.name,
      createdAt: "2026-03-27T12:00:00.000Z",
      dispatchKind: "initial",
      retryBudget: 0,
      retryBackoffType: "static",
      retryBackoffStartingSeconds: 0,
      retryCount: 0,
      redriveBudget: 1,
      redriveCount: 0,
    });
    const requestedHeaders = buildQueueHeaders({
      jobId,
      attempt: 2,
      queueName: queue.name,
      createdAt: "2026-03-27T12:00:00.000Z",
      dispatchKind: "redrive",
      scheduledAt: "2026-03-27T12:00:05.000Z",
      redriveId: "redrive_1",
      retryBudget: 0,
      retryBackoffType: "static",
      retryBackoffStartingSeconds: 0,
      retryCount: 0,
      redriveBudget: 1,
      redriveCount: 1,
    });
    const dispatchedHeaders = buildQueueHeaders({
      jobId,
      attempt: 2,
      queueName: queue.name,
      createdAt: "2026-03-27T12:00:00.000Z",
      dispatchKind: "redrive",
      scheduledAt: "2026-03-27T12:00:05.000Z",
      redriveId: "redrive_1",
      retryBudget: 0,
      retryBackoffType: "static",
      retryBackoffStartingSeconds: 0,
      retryCount: 0,
      redriveBudget: 1,
      redriveCount: 1,
    });

    const history = buildQueueJobHistory([
      {
        eventId: "evt_1",
        type: "job_enqueued",
        occurredAt: "2026-03-27T12:00:00.000Z",
        createdAt: "2026-03-27T12:00:00.000Z",
        jobId,
        jobName: "process-upload",
        queueName: queue.name,
        attempt: 1,
        payload: { fileId: "file_1" },
        queue,
        headers: initialHeaders,
        dispatchKind: "initial",
      },
      {
        eventId: "evt_2",
        type: "moved_to_dlq",
        occurredAt: "2026-03-27T12:00:01.000Z",
        createdAt: "2026-03-27T12:00:00.000Z",
        jobId,
        jobName: "process-upload",
        queueName: queue.name,
        attempt: 1,
        payload: { fileId: "file_1" },
        queue,
        headers: initialHeaders,
        dispatchKind: "initial",
        error: { name: "Error", message: "boom" },
        reason: {
          code: "max_retries_exceeded",
          message: "boom",
        },
      },
      {
        eventId: "evt_3",
        type: "redrive_requested",
        occurredAt: "2026-03-27T12:00:02.000Z",
        requestedAt: "2026-03-27T12:00:02.000Z",
        requestedBy: "operator",
        redriveId: "redrive_1",
        jobId,
        jobName: "process-upload",
        queueName: queue.name,
        attempt: 2,
        createdAt: "2026-03-27T12:00:00.000Z",
        scheduledAt: "2026-03-27T12:00:05.000Z",
        payload: { fileId: "file_1" },
        queue,
        headers: requestedHeaders,
        dispatchKind: "redrive",
      },
      {
        eventId: "evt_4",
        type: "redrive_dispatched",
        occurredAt: "2026-03-27T12:00:05.000Z",
        createdAt: "2026-03-27T12:00:00.000Z",
        jobId,
        jobName: "process-upload",
        queueName: queue.name,
        attempt: 2,
        scheduledAt: "2026-03-27T12:00:05.000Z",
        payload: { fileId: "file_1" },
        queue,
        headers: dispatchedHeaders,
        dispatchKind: "redrive",
        redriveId: "redrive_1",
      },
    ]);

    expect(history?.state?.state).toBe("queued");
    expect(history?.state?.redriveBudget).toBe(1);
    expect(history?.state?.redriveCount).toBe(1);
  });
});
