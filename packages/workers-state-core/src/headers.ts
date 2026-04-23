import { randomUUID } from "node:crypto";
import type { DispatchKind, DueDispatch, RetryBackoffType } from "./types.js";

export const QUEUE_HEADER_NAMES = {
  jobId: "x-job-id",
  attempt: "x-job-attempt",
  queueName: "x-queue-name",
  scheduledAt: "x-scheduled-at",
  redriveId: "x-redrive-id",
  retryBudget: "x-retry-budget",
  retryBackoffType: "x-retry-backoff-type",
  retryBackoffStartingSeconds: "x-retry-backoff-starting-seconds",
  retryCount: "x-retry-count",
  redriveBudget: "x-redrive-budget",
  redriveCount: "x-redrive-count",
  dispatchKind: "x-dispatch-kind",
  createdAt: "x-created-at",
} as const;

export interface QueueMessageHeaders {
  jobId: string;
  attempt: number;
  queueName: string;
  createdAt: string;
  dispatchKind: DispatchKind;
  scheduledAt?: string;
  redriveId?: string;
  retryBudget: number;
  retryBackoffType: RetryBackoffType;
  retryBackoffStartingSeconds: number;
  retryCount?: number;
  redriveBudget?: number;
  redriveCount?: number;
}

export function createJobId(): string {
  return `job_${randomUUID()}`;
}

export function createRedriveId(): string {
  return `redrive_${randomUUID()}`;
}

export function buildQueueHeaders(
  headers: QueueMessageHeaders,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  return {
    ...extraHeaders,
    [QUEUE_HEADER_NAMES.jobId]: headers.jobId,
    [QUEUE_HEADER_NAMES.attempt]: String(headers.attempt),
    [QUEUE_HEADER_NAMES.queueName]: headers.queueName,
    [QUEUE_HEADER_NAMES.createdAt]: headers.createdAt,
    [QUEUE_HEADER_NAMES.dispatchKind]: headers.dispatchKind,
    [QUEUE_HEADER_NAMES.retryBudget]: String(headers.retryBudget),
    [QUEUE_HEADER_NAMES.retryBackoffType]: headers.retryBackoffType,
    [QUEUE_HEADER_NAMES.retryBackoffStartingSeconds]: String(headers.retryBackoffStartingSeconds),
    ...(headers.scheduledAt ? { [QUEUE_HEADER_NAMES.scheduledAt]: headers.scheduledAt } : {}),
    ...(headers.redriveId ? { [QUEUE_HEADER_NAMES.redriveId]: headers.redriveId } : {}),
    ...(headers.retryCount !== undefined
      ? { [QUEUE_HEADER_NAMES.retryCount]: String(headers.retryCount) }
      : {}),
    ...(headers.redriveBudget !== undefined
      ? { [QUEUE_HEADER_NAMES.redriveBudget]: String(headers.redriveBudget) }
      : {}),
    ...(headers.redriveCount !== undefined
      ? { [QUEUE_HEADER_NAMES.redriveCount]: String(headers.redriveCount) }
      : {}),
  };
}

export function parseQueueHeaders(
  headers:
    | Record<string, string | Buffer | Array<string | Buffer> | undefined>
    | undefined,
): QueueMessageHeaders | null {
  if (!headers) return null;

  const jobId = normalizeHeaderValue(headers[QUEUE_HEADER_NAMES.jobId]);
  const attemptValue = normalizeHeaderValue(headers[QUEUE_HEADER_NAMES.attempt]);
  const queueName = normalizeHeaderValue(headers[QUEUE_HEADER_NAMES.queueName]);
  const createdAt = normalizeHeaderValue(headers[QUEUE_HEADER_NAMES.createdAt]);
  const dispatchKind = normalizeHeaderValue(headers[QUEUE_HEADER_NAMES.dispatchKind]) as DispatchKind | null;
  const retryBudgetValue = normalizeHeaderValue(headers[QUEUE_HEADER_NAMES.retryBudget]);
  const retryBackoffTypeValue = normalizeHeaderValue(headers[QUEUE_HEADER_NAMES.retryBackoffType]);
  const retryBackoffStartingSecondsValue = normalizeHeaderValue(
    headers[QUEUE_HEADER_NAMES.retryBackoffStartingSeconds],
  );
  const retryCountValue = normalizeHeaderValue(headers[QUEUE_HEADER_NAMES.retryCount]);
  const redriveBudgetValue = normalizeHeaderValue(headers[QUEUE_HEADER_NAMES.redriveBudget]);
  const redriveCountValue = normalizeHeaderValue(headers[QUEUE_HEADER_NAMES.redriveCount]);

  if (
    !jobId
    || !attemptValue
    || !queueName
    || !createdAt
    || !dispatchKind
    || retryBudgetValue === null
    || retryBackoffTypeValue === null
    || retryBackoffStartingSecondsValue === null
  ) {
    return null;
  }

  const attempt = Number.parseInt(attemptValue, 10);
  if (!Number.isFinite(attempt) || attempt < 1) {
    return null;
  }

  const retryBudget = parseOptionalNonNegativeInteger(retryBudgetValue);
  if (retryBudget === null) {
    return null;
  }

  const retryBackoffType = parseRetryBackoffType(retryBackoffTypeValue);
  if (retryBackoffType === null) {
    return null;
  }

  const retryBackoffStartingSeconds = parseOptionalNonNegativeInteger(
    retryBackoffStartingSecondsValue,
  );
  if (retryBackoffStartingSeconds === null) {
    return null;
  }

  const retryCount = parseOptionalNonNegativeInteger(retryCountValue);
  if (retryCountValue !== null && retryCount === null) {
    return null;
  }

  const redriveBudget = parseOptionalNonNegativeInteger(redriveBudgetValue);
  if (redriveBudgetValue !== null && redriveBudget === null) {
    return null;
  }

  const redriveCount = parseOptionalNonNegativeInteger(redriveCountValue);
  if (redriveCountValue !== null && redriveCount === null) {
    return null;
  }

  return {
    jobId,
    attempt,
    queueName,
    createdAt,
    dispatchKind,
    scheduledAt: normalizeHeaderValue(headers[QUEUE_HEADER_NAMES.scheduledAt]) ?? undefined,
    redriveId: normalizeHeaderValue(headers[QUEUE_HEADER_NAMES.redriveId]) ?? undefined,
    retryBudget,
    retryBackoffType,
    retryBackoffStartingSeconds,
    retryCount: retryCount ?? undefined,
    redriveBudget: redriveBudget ?? undefined,
    redriveCount: redriveCount ?? undefined,
  };
}

export function dueDispatchToHeaders(dispatch: DueDispatch): QueueMessageHeaders {
  return {
    jobId: dispatch.jobId,
    attempt: dispatch.attempt,
    queueName: dispatch.queueName,
    createdAt: dispatch.headers[QUEUE_HEADER_NAMES.createdAt] ?? new Date().toISOString(),
    dispatchKind: dispatch.kind,
    scheduledAt: dispatch.scheduledAt,
    redriveId: dispatch.redriveId,
    retryBudget: dispatch.retryBudget,
    retryBackoffType: dispatch.retryBackoffType,
    retryBackoffStartingSeconds: dispatch.retryBackoffStartingSeconds,
    retryCount: dispatch.kind === "redrive" ? 0 : dispatch.retryCount,
    redriveBudget: dispatch.redriveBudget,
    redriveCount: dispatch.redriveCount,
  };
}

function normalizeHeaderValue(
  value: string | Buffer | Array<string | Buffer> | undefined,
): string | null {
  if (value === undefined) return null;
  if (Array.isArray(value)) {
    return value.length === 0 ? null : normalizeHeaderValue(value[0]);
  }
  if (typeof value === "string") return value;
  return value.toString();
}

function parseOptionalNonNegativeInteger(value: string | null): number | null {
  if (value === null) return null;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseRetryBackoffType(value: string): RetryBackoffType | null {
  if (value === "static" || value === "linear" || value === "exponential") {
    return value;
  }

  return null;
}
