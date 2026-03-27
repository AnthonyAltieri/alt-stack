import type {
  DeadLetterReason,
  NormalizedQueueDefinition,
  QueueDefinition,
  QueueJobError,
  QueueRetryPolicy,
} from "./types.js";

export type QueueInputDefinition = string | QueueDefinition;

export interface RetryPlan {
  type: "retry";
  nextAttempt: number;
  delayMs: number;
  retryAt: string;
}

export interface DeadLetterPlan {
  type: "dead_letter";
  reason: DeadLetterReason;
}

export interface FailurePlan {
  type: "failure";
}

export type FailureAction = RetryPlan | DeadLetterPlan | FailurePlan;

export function normalizeQueueDefinition(
  definition: QueueInputDefinition,
): NormalizedQueueDefinition {
  if (typeof definition === "string") {
    return { name: definition };
  }

  return {
    name: definition.name,
    retry: definition.retry,
    deadLetter: definition.deadLetter,
  };
}

export function calculateRetryDelayMs(
  retryPolicy: QueueRetryPolicy,
  nextAttempt: number,
): number {
  const strategy = retryPolicy.delay;

  if (strategy.type === "fixed") {
    return strategy.ms;
  }

  const exponent = Math.max(nextAttempt - 2, 0);
  const multiplier = strategy.multiplier ?? 2;
  const computed = strategy.initialMs * multiplier ** exponent;
  return strategy.maxMs === undefined ? computed : Math.min(computed, strategy.maxMs);
}

export function planFailureAction(
  queue: NormalizedQueueDefinition,
  attempt: number,
  error: QueueJobError,
  now = new Date(),
): FailureAction {
  const maxRetries = queue.retry?.maxRetries ?? 0;

  if (attempt <= maxRetries) {
    const delayMs = calculateRetryDelayMs(queue.retry!, attempt + 1);
    return {
      type: "retry",
      nextAttempt: attempt + 1,
      delayMs,
      retryAt: new Date(now.getTime() + delayMs).toISOString(),
    };
  }

  if (queue.deadLetter) {
    return {
      type: "dead_letter",
      reason: {
        code: "max_retries_exceeded",
        message: error.message,
        metadata: {
          failedAttempt: String(attempt),
        },
      },
    };
  }

  return { type: "failure" };
}
