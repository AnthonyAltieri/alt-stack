import type { z } from "zod";
import type { KafkaMessage } from "kafkajs";
import type { AnyMiddlewareFunction } from "./middleware.js";
import type { Result, ResultError } from "@alt-stack/result";

export type InferOutput<T extends z.ZodTypeAny> = z.infer<T>;

export type InferErrorSchemas<T extends Record<string, z.ZodTypeAny>> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type ErrorUnion<T extends Record<string, z.ZodTypeAny>> =
  InferErrorSchemas<T>[keyof InferErrorSchemas<T>];

/**
 * Infer the Result type for a handler based on errors and output schemas.
 * Errors must extend Error with a readonly _tag property.
 */
export type KafkaHandlerResult<
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
  TOutput extends z.ZodTypeAny | undefined,
> = Result<InferOutput<NonNullable<TOutput>> | void, ResultError>;

export interface InputConfig {
  message?: z.ZodTypeAny;
}

export type InferInput<T extends InputConfig> = T extends { message: infer M }
  ? M extends z.ZodTypeAny
    ? z.infer<M>
    : never
  : never;

export interface BaseKafkaContext {
  message: KafkaMessage;
  topic: string;
  partition: number;
  offset: string;
}

export type TypedKafkaContext<
  TInput extends InputConfig,
  _TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> = BaseKafkaContext &
  TCustomContext & {
    input: InferInput<TInput>;
  };

export interface ProcedureConfig<
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
> {
  input: TInput;
  output?: TOutput;
  errors?: TErrors;
}

/**
 * A Kafka procedure that has been fully configured and registered
 */
export interface KafkaProcedure<
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<string, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> {
  topic: string;
  config: {
    input: TInput;
    output?: TOutput;
    errors?: TErrors;
  };
  handler: (opts: {
    input: InferInput<TInput>;
    ctx: TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>;
  }) => KafkaHandlerResult<TErrors, TOutput> | Promise<KafkaHandlerResult<TErrors, TOutput>>;
  middleware: AnyMiddlewareFunction[];
}

/**
 * A procedure that is ready to be registered with a topic
 * Has a handler defined via .subscribe()
 */
export interface ReadyKafkaProcedure<
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
    ctx: TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>;
  }) => KafkaHandlerResult<TErrors, TOutput> | Promise<KafkaHandlerResult<TErrors, TOutput>>;
  middleware: AnyMiddlewareFunction[];
  /** Flags indicating which middleware return Result types (true) vs throw (false) */
  middlewareWithErrorsFlags?: boolean[];
}

/**
 * A procedure that is pending - has handler but topic determined by router config
 * Created via .handler()
 */
export interface PendingKafkaProcedure<
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
    ctx: TypedKafkaContext<TInput, TOutput, TErrors, TCustomContext>;
  }) => KafkaHandlerResult<TErrors, TOutput> | Promise<KafkaHandlerResult<TErrors, TOutput>>;
  middleware: AnyMiddlewareFunction[];
  /** Flags indicating which middleware return Result types (true) vs throw (false) */
  middlewareWithErrorsFlags?: boolean[];
}
