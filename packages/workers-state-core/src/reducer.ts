import type {
  QueueJobEvent,
  QueueJobHistory,
  QueueJobStateSnapshot,
  RedriveDispatchedEvent,
  RedriveRequestedEvent,
  RetryScheduledEvent,
} from "./types.js";
import { parseQueueHeaders } from "./headers.js";

export function reduceQueueJobEvent(
  previous: QueueJobStateSnapshot | null,
  event: QueueJobEvent,
): QueueJobStateSnapshot {
  const parsedHeaders = parseQueueHeaders(event.headers);
  const base: Omit<QueueJobStateSnapshot, "state"> = {
    jobId: event.jobId,
    jobName: event.jobName,
    queueName: event.queueName,
    attempt: event.attempt,
    createdAt: previous?.createdAt ?? event.createdAt,
    updatedAt: event.occurredAt,
    payload: event.payload,
    queue: event.queue,
    headers: event.headers,
    key: event.key,
    dispatchKind: event.dispatchKind,
    retryBudget: parsedHeaders?.retryBudget ?? previous?.retryBudget ?? event.queue.config.retry.budget,
    retryBackoffType: parsedHeaders?.retryBackoffType
      ?? previous?.retryBackoffType
      ?? event.queue.config.retry.backoff.type,
    retryBackoffStartingSeconds: parsedHeaders?.retryBackoffStartingSeconds
      ?? previous?.retryBackoffStartingSeconds
      ?? event.queue.config.retry.backoff.startingSeconds,
    retryCount: parsedHeaders?.retryCount ?? previous?.retryCount ?? 0,
    redriveBudget: parsedHeaders?.redriveBudget ?? previous?.redriveBudget,
    redriveCount: parsedHeaders?.redriveCount ?? previous?.redriveCount ?? 0,
  };

  switch (event.type) {
    case "job_enqueued":
      return {
        ...base,
        state: "queued",
        scheduledAt: event.scheduledAt,
        redriveId: event.redriveId,
      };
    case "attempt_started":
      return {
        ...base,
        state: "running",
        scheduledAt: event.scheduledAt,
        redriveId: event.redriveId,
      };
    case "attempt_succeeded":
      return {
        ...base,
        state: "succeeded",
        redriveId: event.redriveId,
      };
    case "attempt_failed":
      return {
        ...base,
        state: "failed",
        lastError: event.error,
        redriveId: event.redriveId,
      };
    case "retry_scheduled":
      return reduceRetryScheduled(base, event);
    case "moved_to_dlq":
      return {
        ...base,
        state: "dead_letter",
        lastError: event.error,
        deadLetterReason: event.reason,
        redriveId: event.redriveId,
      };
    case "redrive_requested":
      return reduceRedriveRequested(base, event);
    case "redrive_dispatched":
      return reduceRedriveDispatched(base, event);
  }
}

export function buildQueueJobHistory(events: QueueJobEvent[]): QueueJobHistory | null {
  if (events.length === 0) return null;

  let current: QueueJobStateSnapshot | null = null;
  for (const event of events) {
    current = reduceQueueJobEvent(current, event);
  }

  return {
    jobId: events[0]!.jobId,
    events,
    state: current,
  };
}

function reduceRetryScheduled(
  base: Omit<QueueJobStateSnapshot, "state">,
  event: RetryScheduledEvent,
): QueueJobStateSnapshot {
  return {
    ...base,
    state: "retry_scheduled",
    attempt: event.nextAttempt,
    retryCount: event.nextRetryCount,
    scheduledAt: event.retryAt,
    lastError: event.error,
    redriveId: event.redriveId,
    dispatchKind: "retry",
  };
}

function reduceRedriveRequested(
  base: Omit<QueueJobStateSnapshot, "state">,
  event: RedriveRequestedEvent,
): QueueJobStateSnapshot {
  return {
    ...base,
    state: "redrive_requested",
    scheduledAt: event.scheduledAt,
    redriveId: event.redriveId,
    dispatchKind: "redrive",
  };
}

function reduceRedriveDispatched(
  base: Omit<QueueJobStateSnapshot, "state">,
  event: RedriveDispatchedEvent,
): QueueJobStateSnapshot {
  return {
    ...base,
    state: "queued",
    scheduledAt: event.scheduledAt,
    redriveId: event.redriveId,
    dispatchKind: "redrive",
  };
}
