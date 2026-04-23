import type {
  DeadLetterReason,
  QueueJobState,
  RetryBackoffType,
  RedriveRecord,
} from "@alt-stack/workers-core";
import { z } from "zod";

export type TaskProcessingStatus = "queued" | "completed" | "enqueue_failed";
export type TaskPresentationState = QueueJobState | "enqueue_failed";
export type DashboardActivityType =
  | "submitted"
  | "running"
  | "retry"
  | "completed"
  | "dead_letter"
  | "failed"
  | "redrive_requested"
  | "enqueue_failed";

const optionalNonNegativeIntInputSchema = z.preprocess(
  (value) => value === null || value === "" ? undefined : value,
  z.number().int().min(0).optional(),
);
const nonNegativeIntInputSchema = z.preprocess(
  (value) => value === null || value === "" ? undefined : value,
  z.number().int().min(0),
);
const retryBackoffTypeSchema = z.enum(["static", "linear", "exponential"]);

export const createTaskRequestSchema = z.object({
  title: z.string().trim().min(1, "Task title is required").max(120),
  description: z
    .string()
    .trim()
    .max(2_000)
    .optional()
    .transform((value) => value && value.length > 0 ? value : null),
  failAfterRetries: nonNegativeIntInputSchema.default(0),
  alwaysFail: z.boolean().default(false),
  config: z.object({
    retry: z.object({
      budget: optionalNonNegativeIntInputSchema,
      backoff: z.object({
        type: retryBackoffTypeSchema.optional(),
        startingSeconds: optionalNonNegativeIntInputSchema,
      }).optional(),
    }).optional(),
    redrive: z.object({
      budget: optionalNonNegativeIntInputSchema,
    }).optional(),
  }).optional(),
});

export const taskQueuePayloadSchema = z.object({
  taskId: z.string().min(1),
});

export interface StoredTask {
  id: string;
  title: string;
  description: string | null;
  failAfterRetries: number;
  alwaysFail: boolean;
  processingStatus: TaskProcessingStatus;
  jobId: string | null;
  retryBudget: number;
  retryBackoffType: RetryBackoffType;
  retryBackoffStartingSeconds: number;
  redriveBudget: number | null;
  result: string | null;
  enqueueError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskView extends StoredTask {
  state: TaskPresentationState;
  attempt: number | null;
  deadLetterReason?: DeadLetterReason;
  updatedAtFromQueue: string | null;
  retryCount: number;
  redriveCount: number;
  redriveRemaining: number | null;
  canRedrive: boolean;
}

export interface TaskJobRecord {
  taskId: string;
  title: string;
  description: string | null;
  failAfterRetries: number;
  alwaysFail: boolean;
  jobId: string;
  createdAt: string;
  updatedAt: string;
  processingStatus: TaskProcessingStatus;
  retryBudget: number;
  retryBackoffType: RetryBackoffType;
  retryBackoffStartingSeconds: number;
  redriveBudget: number | null;
  result: string | null;
  enqueueError: string | null;
}

export interface TaskJobView extends TaskJobRecord {
  state: TaskPresentationState;
  attempt: number | null;
  deadLetterReason?: DeadLetterReason;
  updatedAtFromQueue: string | null;
  retryCount: number;
  redriveCount: number;
  redriveRemaining: number | null;
  canRedrive: boolean;
}

export interface DashboardStats {
  total: number;
  queued: number;
  running: number;
  retryScheduled: number;
  succeeded: number;
  deadLetter: number;
  failed: number;
  enqueueFailed: number;
}

export interface DashboardActivity {
  id: string;
  timestamp: string;
  type: DashboardActivityType;
  label: string;
  detail: string;
}

export interface DashboardData {
  stats: DashboardStats;
  tasks: TaskView[];
  jobs: TaskJobView[];
  deadLetters: TaskJobView[];
  redrives: Array<RedriveRecord & Partial<TaskJobRecord>>;
  activity: DashboardActivity[];
}

export type CreateTaskRequest = z.output<typeof createTaskRequestSchema>;
export type TaskQueuePayload = z.infer<typeof taskQueuePayloadSchema>;

export interface CreateTaskResult {
  taskId: string;
  jobId: string;
}
