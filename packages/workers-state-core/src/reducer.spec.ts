import { describe, expect, it } from "vitest";
import { buildQueueJobHistory } from "./reducer.js";
import { buildQueueHeaders, createJobId } from "./headers.js";
import { normalizeQueueDefinition } from "./policy.js";

describe("workers-state-core reducer", () => {
  it("reduces retry and dead-letter state transitions", () => {
    const jobId = createJobId();
    const queue = normalizeQueueDefinition({
      name: "uploads",
      retry: {
        maxRetries: 1,
        delay: { type: "fixed", ms: 1000 },
      },
      deadLetter: {
        queueName: "uploads-dlq",
      },
    });
    const headers = buildQueueHeaders({
      jobId,
      attempt: 1,
      queueName: queue.name,
      createdAt: "2026-03-27T12:00:00.000Z",
      dispatchKind: "initial",
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
        headers,
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
        retryAt: "2026-03-27T12:00:06.000Z",
        payload: { fileId: "file_1" },
        queue,
        headers,
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
        headers,
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
});
