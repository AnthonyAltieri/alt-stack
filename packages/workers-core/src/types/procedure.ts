import type { z } from "zod";
import type { TypedWorkerContext, InferInput, InferOutput, InputConfig } from "./context.js";
import type { AnyMiddlewareFunction } from "../middleware.js";

/**
 * Configuration for cron-based scheduling
 */
export interface CronConfig {
  /** Cron expression (e.g., "0 9 * * *" for daily at 9am) */
  pattern: string;
  /** Optional timezone for the cron schedule */
  timezone?: string;
}

/**
 * A worker procedure that has been fully configured and registered
 */
export interface WorkerProcedure<
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> {
  /** Unique job name/identifier */
  jobName: string;
  /** Type of job: task (on-demand), cron (scheduled), or queue */
  type: "task" | "cron" | "queue";
  /** Cron configuration if type is "cron" */
  cron?: CronConfig;
  /** Queue name if type is "queue" */
  queue?: string;
  config: {
    input: TInput;
    output?: TOutput;
    errors?: TErrors;
  };
  handler: (opts: {
    input: InferInput<TInput>;
    ctx: TypedWorkerContext<TInput, TOutput, TErrors, TCustomContext>;
  }) =>
    | Promise<InferOutput<NonNullable<TOutput>>>
    | InferOutput<NonNullable<TOutput>>
    | void
    | Promise<void>;
  middleware: AnyMiddlewareFunction[];
}

/**
 * A procedure that is ready to be registered with a job name.
 * Created via .task(), .cron(), or .queue()
 */
export interface ReadyWorkerProcedure<
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> {
  type: "task" | "cron" | "queue";
  cron?: CronConfig;
  queue?: string;
  config: {
    input: TInput;
    output?: TOutput;
    errors?: TErrors;
  };
  handler: (opts: {
    input: InferInput<TInput>;
    ctx: TypedWorkerContext<TInput, TOutput, TErrors, TCustomContext>;
  }) =>
    | Promise<InferOutput<NonNullable<TOutput>>>
    | InferOutput<NonNullable<TOutput>>
    | void
    | Promise<void>;
  middleware: AnyMiddlewareFunction[];
}

/**
 * A procedure that is pending - has handler but job name determined by router config.
 * Created via .handler()
 */
export interface PendingWorkerProcedure<
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> {
  config: {
    input: TInput;
    output?: TOutput;
    errors?: TErrors;
  };
  handler: (opts: {
    input: InferInput<TInput>;
    ctx: TypedWorkerContext<TInput, TOutput, TErrors, TCustomContext>;
  }) =>
    | Promise<InferOutput<NonNullable<TOutput>>>
    | InferOutput<NonNullable<TOutput>>
    | void
    | Promise<void>;
  middleware: AnyMiddlewareFunction[];
}
