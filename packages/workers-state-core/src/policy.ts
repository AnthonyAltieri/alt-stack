import type {
  DeadLetterReason,
  NormalizedQueueDefinition,
  NormalizedQueueExecutionConfig,
  NormalizedQueueRedriveConfig,
  NormalizedQueueRetryConfig,
  QueueDefinition,
  QueueExecutionConfig,
  QueueJobError,
  QueueRedriveConfig,
  QueueRetryConfig,
} from "./types.js";

export type QueueInputDefinition = string | QueueDefinition;

export interface RetryPlan {
  type: "retry";
  nextAttempt: number;
  nextRetryCount: number;
  delayMs: number;
  retryAt: string;
}

export interface DeadLetterPlan {
  type: "dead_letter";
  reason: DeadLetterReason;
}

export interface FailurePlan {
  type: "failure";
  reason: "terminal_failure" | "redrive_budget_exhausted";
  rethrow: boolean;
}

export type FailureAction = RetryPlan | DeadLetterPlan | FailurePlan;

export interface FailurePlanningContext {
  now?: Date;
  retry?: QueueRetryConfig;
  retryCount?: number;
  redrive?: QueueRedriveConfig;
  redriveCount?: number;
}

const DEFAULT_RETRY_CONFIG: NormalizedQueueRetryConfig = {
  budget: 0,
  backoff: {
    type: "static",
    startingSeconds: 0,
  },
};

export function normalizeQueueDefinition(
  definition: QueueInputDefinition,
): NormalizedQueueDefinition {
  if (typeof definition === "string") {
    return {
      name: definition,
      config: {
        retry: DEFAULT_RETRY_CONFIG,
      },
    };
  }

  return {
    name: definition.name,
    deadLetter: definition.deadLetter,
    config: resolveExecutionConfig(definition),
  };
}

export function normalizeRetryConfig(config?: QueueRetryConfig): NormalizedQueueRetryConfig {
  return {
    budget: config?.budget ?? DEFAULT_RETRY_CONFIG.budget,
    backoff: {
      type: config?.backoff?.type ?? DEFAULT_RETRY_CONFIG.backoff.type,
      startingSeconds: config?.backoff?.startingSeconds
        ?? DEFAULT_RETRY_CONFIG.backoff.startingSeconds,
    },
  };
}

export function normalizeRedriveConfig(
  config?: QueueRedriveConfig,
): NormalizedQueueRedriveConfig | undefined {
  if (config?.budget === undefined) {
    return undefined;
  }

  return {
    budget: config.budget,
  };
}

export function resolveRetryConfig(
  queue: Pick<QueueDefinition | NormalizedQueueDefinition, "config">,
  override?: QueueRetryConfig,
): NormalizedQueueRetryConfig {
  return normalizeRetryConfig({
    budget: override?.budget ?? queue.config?.retry?.budget,
    backoff: {
      type: override?.backoff?.type ?? queue.config?.retry?.backoff?.type,
      startingSeconds: override?.backoff?.startingSeconds
        ?? queue.config?.retry?.backoff?.startingSeconds,
    },
  });
}

export function resolveRedriveConfig(
  queue: Pick<QueueDefinition | NormalizedQueueDefinition, "config">,
  override?: QueueRedriveConfig,
): NormalizedQueueRedriveConfig | undefined {
  return normalizeRedriveConfig({
    budget: override?.budget ?? queue.config?.redrive?.budget,
  });
}

export function resolveExecutionConfig(
  queue: Pick<QueueDefinition | NormalizedQueueDefinition, "config">,
  override?: QueueExecutionConfig,
): NormalizedQueueExecutionConfig {
  const retry = resolveRetryConfig(queue, override?.retry);
  const redrive = resolveRedriveConfig(queue, override?.redrive);

  return {
    retry,
    ...(redrive === undefined ? {} : { redrive }),
  };
}

export function resolveRedriveBudget(
  queue: Pick<QueueDefinition | NormalizedQueueDefinition, "config">,
  budget?: number,
): number | undefined {
  return resolveRedriveConfig(queue, budget === undefined ? undefined : { budget })?.budget;
}

export function calculateRetryDelayMs(
  retryConfig: QueueRetryConfig | NormalizedQueueRetryConfig,
  retryNumber: number,
): number {
  const normalizedRetryConfig = normalizeRetryConfig(retryConfig);
  const baseDelayMs = normalizedRetryConfig.backoff.startingSeconds * 1000;

  if (baseDelayMs === 0) {
    return 0;
  }

  switch (normalizedRetryConfig.backoff.type) {
    case "static":
      return baseDelayMs;
    case "linear":
      return baseDelayMs * retryNumber;
    case "exponential":
      return baseDelayMs * 2 ** Math.max(retryNumber - 1, 0);
  }
}

export function planFailureAction(
  queue: NormalizedQueueDefinition,
  attempt: number,
  error: QueueJobError,
  context: FailurePlanningContext = {},
): FailureAction {
  const now = context.now ?? new Date();
  const retryConfig = resolveRetryConfig(queue, context.retry);
  const retryCount = context.retryCount ?? Math.max(attempt - 1, 0);

  if (retryCount < retryConfig.budget) {
    const nextRetryCount = retryCount + 1;
    const delayMs = calculateRetryDelayMs(retryConfig, nextRetryCount);
    return {
      type: "retry",
      nextAttempt: attempt + 1,
      nextRetryCount,
      delayMs,
      retryAt: new Date(now.getTime() + delayMs).toISOString(),
    };
  }

  const effectiveRedriveBudget = resolveRedriveBudget(queue, context.redrive?.budget);
  const redriveCount = context.redriveCount ?? 0;
  const isRedriveBudgetExhausted = redriveCount > 0
    && effectiveRedriveBudget !== undefined
    && redriveCount >= effectiveRedriveBudget;

  if (queue.deadLetter) {
    if (isRedriveBudgetExhausted) {
      return {
        type: "failure",
        reason: "redrive_budget_exhausted",
        rethrow: false,
      };
    }

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

  return {
    type: "failure",
    reason: "terminal_failure",
    rethrow: true,
  };
}
