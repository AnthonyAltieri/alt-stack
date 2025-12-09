import type { z } from "zod";
import type { TypedContext, InferInput, InferOutput, InputConfig, HandlerResult } from "./context.js";
import type { AnyMiddlewareFunction } from "../middleware.js";

export type ExtractPathParams<T extends string> = T extends `${string}{${infer Param}}${infer Rest}`
  ? Param extends `${infer Key}`
    ? Key | ExtractPathParams<Rest>
    : ExtractPathParams<Rest>
  : never;

export type RequireParamsForPath<TPath extends string, TParams extends z.ZodTypeAny | undefined> =
  ExtractPathParams<TPath> extends never
    ? TParams
    : TParams extends z.ZodTypeAny
      ? ExtractPathParams<TPath> extends keyof z.infer<TParams>
        ? TParams
        : never
      : never;

export interface ProcedureConfig<
  TPath extends string,
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<number, z.ZodTypeAny> | undefined,
> {
  input: ExtractPathParams<TPath> extends never
    ? TInput
    : TInput extends { params: infer P }
      ? P extends z.ZodTypeAny
        ? ExtractPathParams<TPath> extends keyof z.infer<P>
          ? TInput
          : never
        : never
      : never;
  output?: TOutput;
  errors?: TErrors;
}

export interface Procedure<
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<number, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> {
  method: string;
  path: string;
  config: {
    input: TInput;
    output?: TOutput;
    errors?: TErrors;
  };
  handler: (
    ctx: TypedContext<TInput, TErrors, TCustomContext>,
  ) => HandlerResult<TErrors, TOutput> | Promise<HandlerResult<TErrors, TOutput>>;
  middleware: AnyMiddlewareFunction[];
}

export interface ReadyProcedure<
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<number, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> {
  method: string;
  config: {
    input: TInput;
    output?: TOutput;
    errors?: TErrors;
  };
  handler: (opts: {
    input: InferInput<TInput>;
    ctx: TypedContext<TInput, TErrors, TCustomContext>;
  }) => HandlerResult<TErrors, TOutput> | Promise<HandlerResult<TErrors, TOutput>>;
  middleware: AnyMiddlewareFunction[];
  /** Flags indicating which middleware return Result types (true) vs throw (false) */
  middlewareWithErrorsFlags?: boolean[];
}

export interface PendingProcedure<
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<number, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
> {
  config: {
    input: TInput;
    output?: TOutput;
    errors?: TErrors;
  };
  handler: (opts: {
    input: InferInput<TInput>;
    ctx: TypedContext<TInput, TErrors, TCustomContext>;
  }) => HandlerResult<TErrors, TOutput> | Promise<HandlerResult<TErrors, TOutput>>;
  middleware: AnyMiddlewareFunction[];
  /** Flags indicating which middleware return Result types (true) vs throw (false) */
  middlewareWithErrorsFlags?: boolean[];
}

