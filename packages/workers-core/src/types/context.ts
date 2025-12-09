import type { z } from "zod";
import type { Result, ResultError } from "@alt-stack/result";

export type InferOutput<T extends z.ZodTypeAny> = z.infer<T>;

export type InferErrorSchemas<T extends Record<string, z.ZodTypeAny>> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type ErrorUnion<T extends Record<string, z.ZodTypeAny>> =
  InferErrorSchemas<T>[keyof InferErrorSchemas<T>];

/**
 * Infer the Result type for a worker handler based on errors and output schemas.
 * Errors must extend Error with a readonly _tag property.
 */
export type WorkerHandlerResult<
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
  TOutput extends z.ZodTypeAny | undefined,
> = Result<InferOutput<NonNullable<TOutput>> | void, ResultError>;

export interface InputConfig {
  payload?: z.ZodTypeAny;
}

export type InferInput<T extends InputConfig> = T extends { payload: infer P }
  ? P extends z.ZodTypeAny
    ? z.infer<P>
    : undefined
  : undefined;

/**
 * Base context interface for workers.
 * Provider adapters extend this with their own context (e.g., trigger.dev task context).
 */
export interface BaseWorkerContext {
  /** Unique identifier for this job execution */
  jobId: string;
  /** Name of the job being executed */
  jobName: string;
  /** Current attempt number (starts at 1) */
  attempt: number;
}

/**
 * Typed context for worker procedures with full type inference.
 */
export type TypedWorkerContext<
  TInput extends InputConfig,
  _TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> = BaseWorkerContext &
  TCustomContext & {
    input: InferInput<TInput>;
  };
