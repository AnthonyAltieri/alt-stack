import { randomUUID } from "node:crypto";
import type { DispatchKind, DueDispatch } from "./types.js";

export const QUEUE_HEADER_NAMES = {
  jobId: "x-job-id",
  attempt: "x-job-attempt",
  queueName: "x-queue-name",
  scheduledAt: "x-scheduled-at",
  redriveId: "x-redrive-id",
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
    ...(headers.scheduledAt ? { [QUEUE_HEADER_NAMES.scheduledAt]: headers.scheduledAt } : {}),
    ...(headers.redriveId ? { [QUEUE_HEADER_NAMES.redriveId]: headers.redriveId } : {}),
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

  if (!jobId || !attemptValue || !queueName || !createdAt || !dispatchKind) {
    return null;
  }

  const attempt = Number.parseInt(attemptValue, 10);
  if (!Number.isFinite(attempt) || attempt < 1) {
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
