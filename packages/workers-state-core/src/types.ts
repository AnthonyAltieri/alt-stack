export type DispatchKind = "initial" | "retry" | "redrive";

export interface FixedRetryDelayStrategy {
  type: "fixed";
  ms: number;
}

export interface ExponentialRetryDelayStrategy {
  type: "exponential";
  initialMs: number;
  multiplier?: number;
  maxMs?: number;
}

export type RetryDelayStrategy =
  | FixedRetryDelayStrategy
  | ExponentialRetryDelayStrategy;

export interface QueueRetryPolicy {
  maxRetries: number;
  delay: RetryDelayStrategy;
}

export interface QueueDeadLetterPolicy {
  queueName?: string;
}

export interface QueueDefinition {
  name: string;
  retry?: QueueRetryPolicy;
  deadLetter?: QueueDeadLetterPolicy;
}

export interface NormalizedQueueDefinition {
  name: string;
  retry?: QueueRetryPolicy;
  deadLetter?: QueueDeadLetterPolicy;
}

export interface QueueJobError {
  name: string;
  message: string;
  stack?: string;
  code?: string;
  details?: unknown;
}

export type DeadLetterReasonCode =
  | "max_retries_exceeded"
  | "manual"
  | "redrive_failed"
  | "unhandled_error";

export interface DeadLetterReason {
  code: DeadLetterReasonCode;
  message: string;
  metadata?: Record<string, string>;
}

export type QueueJobState =
  | "queued"
  | "running"
  | "succeeded"
  | "retry_scheduled"
  | "dead_letter"
  | "redrive_requested";

export interface QueueEventContext {
  payload: unknown;
  queue: NormalizedQueueDefinition;
  headers: Record<string, string>;
  dispatchKind: DispatchKind;
}

export interface QueueJobEventBase extends QueueEventContext {
  eventId: string;
  type:
    | "job_enqueued"
    | "attempt_started"
    | "attempt_succeeded"
    | "attempt_failed"
    | "retry_scheduled"
    | "moved_to_dlq"
    | "redrive_requested"
    | "redrive_dispatched";
  occurredAt: string;
  createdAt: string;
  jobId: string;
  jobName: string;
  queueName: string;
  attempt: number;
  scheduledAt?: string;
  redriveId?: string;
}

export interface JobEnqueuedEvent extends QueueJobEventBase {
  type: "job_enqueued";
}

export interface AttemptStartedEvent extends QueueJobEventBase {
  type: "attempt_started";
}

export interface AttemptSucceededEvent extends QueueJobEventBase {
  type: "attempt_succeeded";
  result?: unknown;
}

export interface AttemptFailedEvent extends QueueJobEventBase {
  type: "attempt_failed";
  error: QueueJobError;
}

export interface RetryScheduledEvent extends QueueJobEventBase {
  type: "retry_scheduled";
  error: QueueJobError;
  nextAttempt: number;
  retryAt: string;
}

export interface MovedToDeadLetterEvent extends QueueJobEventBase {
  type: "moved_to_dlq";
  error: QueueJobError;
  reason: DeadLetterReason;
}

export interface RedriveRequestedEvent extends QueueJobEventBase {
  type: "redrive_requested";
  redriveId: string;
  requestedAt: string;
  requestedBy: string;
  reason?: string;
}

export interface RedriveDispatchedEvent extends QueueJobEventBase {
  type: "redrive_dispatched";
  redriveId: string;
}

export type QueueJobEvent =
  | JobEnqueuedEvent
  | AttemptStartedEvent
  | AttemptSucceededEvent
  | AttemptFailedEvent
  | RetryScheduledEvent
  | MovedToDeadLetterEvent
  | RedriveRequestedEvent
  | RedriveDispatchedEvent;

export interface QueueJobStateSnapshot extends QueueEventContext {
  jobId: string;
  jobName: string;
  queueName: string;
  state: QueueJobState;
  attempt: number;
  createdAt: string;
  updatedAt: string;
  scheduledAt?: string;
  lastError?: QueueJobError;
  deadLetterReason?: DeadLetterReason;
  redriveId?: string;
}

export interface QueueJobHistory {
  jobId: string;
  events: QueueJobEvent[];
  state: QueueJobStateSnapshot | null;
}

export interface DeadLetterQuery {
  queueName?: string;
  jobName?: string;
  limit?: number;
}

export interface RedriveQuery {
  queueName?: string;
  jobName?: string;
  limit?: number;
}

export interface DueDispatchQuery {
  queueName?: string;
  now?: Date;
  limit?: number;
}

export interface DueDispatch {
  kind: "retry" | "redrive";
  jobId: string;
  jobName: string;
  queueName: string;
  attempt: number;
  scheduledAt?: string;
  payload: unknown;
  queue: NormalizedQueueDefinition;
  headers: Record<string, string>;
  dispatchKind: DispatchKind;
  redriveId?: string;
}

export interface RedriveRequest {
  jobId: string;
  requestedAt?: string;
  requestedBy: string;
  reason?: string;
  redriveId?: string;
  scheduledAt?: string;
}

export interface RedriveRecord {
  jobId: string;
  redriveId: string;
  queueName: string;
  jobName: string;
  requestedAt: string;
  requestedBy: string;
  reason?: string;
  dispatchedAt?: string;
}

export interface Storage {
  ensureSchema(): Promise<void>;
  append(events: QueueJobEvent[]): Promise<void>;
  getJob(jobId: string): Promise<QueueJobHistory | null>;
  getJobState(jobId: string): Promise<QueueJobStateSnapshot | null>;
  listDeadLetters(query?: DeadLetterQuery): Promise<QueueJobStateSnapshot[]>;
  listRedrives(query?: RedriveQuery): Promise<RedriveRecord[]>;
  listDueDispatches(query?: DueDispatchQuery): Promise<DueDispatch[]>;
  requestRedrive(request: RedriveRequest): Promise<RedriveRecord>;
}
