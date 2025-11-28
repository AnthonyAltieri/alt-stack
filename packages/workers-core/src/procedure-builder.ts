import { z } from "zod";
import type {
  InferOutput,
  InputConfig,
  TypedWorkerContext,
  InferInput,
  WorkerProcedure,
  ReadyWorkerProcedure,
  PendingWorkerProcedure,
  CronConfig,
} from "./types/index.js";
import type {
  MiddlewareFunction,
  MiddlewareBuilder,
  Overwrite,
} from "./middleware.js";

// Helper type to merge InputConfigs
type MergeInputConfig<TBase extends InputConfig, TOverride extends InputConfig> = {
  payload: TOverride["payload"] extends z.ZodTypeAny
    ? TOverride["payload"]
    : TBase["payload"];
};

// Helper type to merge error configs
type MergeErrors<
  TBaseErrors extends Record<string, z.ZodTypeAny> | undefined,
  TRouteErrors extends Record<string, z.ZodTypeAny> | undefined,
> =
  TRouteErrors extends Record<string, z.ZodTypeAny>
    ? TBaseErrors extends Record<string, z.ZodTypeAny>
      ? {
          [K in keyof TBaseErrors | keyof TRouteErrors]: K extends keyof TBaseErrors
            ? K extends keyof TRouteErrors
              ? TBaseErrors[K] | TRouteErrors[K]
              : TBaseErrors[K]
            : K extends keyof TRouteErrors
              ? TRouteErrors[K]
              : never;
        }
      : TRouteErrors
    : TBaseErrors;

/**
 * Base procedure builder that accumulates configuration and middleware.
 * TCustomContext tracks the narrowed context type through the middleware chain.
 */
export class BaseWorkerProcedureBuilder<
  TBaseInput extends InputConfig = { payload?: never },
  TBaseOutput extends z.ZodTypeAny | undefined = undefined,
  TBaseErrors extends Record<string, z.ZodTypeAny> | undefined = undefined,
  TCustomContext extends object = Record<string, never>,
  TRouter = unknown,
> {
  private _baseConfig: {
    input: TBaseInput;
    output?: TBaseOutput;
    errors?: TBaseErrors;
  };

  private _middleware: Array<
    (opts: {
      ctx: TypedWorkerContext<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<string, z.ZodTypeAny> | undefined,
        any
      >;
      next: (opts?: { ctx?: any }) => Promise<any>;
    }) => Promise<any>
  > = [];

  constructor(
    baseConfig?: {
      input?: TBaseInput;
      output?: TBaseOutput;
      errors?: TBaseErrors;
    },
    middleware?: Array<any>,
    private router?: TRouter & {
      register: (
        proc: WorkerProcedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<string, z.ZodTypeAny> | undefined,
          any
        >,
      ) => void;
    },
  ) {
    this._baseConfig = {
      input: (baseConfig?.input ?? {}) as TBaseInput,
      output: baseConfig?.output,
      errors: baseConfig?.errors,
    };
    if (middleware) {
      this._middleware = [...middleware];
    }
  }

  /**
   * Add middleware with automatic context override inference.
   */
  use<$ContextOverridesOut>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          TypedWorkerContext<InputConfig, undefined, TBaseErrors, TCustomContext>,
          object,
          $ContextOverridesOut
        >
      | MiddlewareBuilder<
          TypedWorkerContext<InputConfig, undefined, TBaseErrors, TCustomContext>,
          $ContextOverridesOut
        >,
  ): BaseWorkerProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    TBaseErrors,
    Overwrite<TCustomContext, $ContextOverridesOut>,
    TRouter
  > {
    const newMiddleware =
      "_middlewares" in middlewareOrBuilder
        ? middlewareOrBuilder._middlewares
        : [middlewareOrBuilder];

    return new BaseWorkerProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TBaseErrors,
      Overwrite<TCustomContext, $ContextOverridesOut>,
      TRouter
    >(this._baseConfig, [...this._middleware, ...newMiddleware] as any, this.router);
  }

  /**
   * Define input schema for the job payload.
   */
  input<TInput extends InputConfig>(
    input: TInput,
  ): BaseWorkerProcedureBuilder<
    MergeInputConfig<TBaseInput, TInput>,
    TBaseOutput,
    TBaseErrors,
    TCustomContext,
    TRouter
  > {
    return new BaseWorkerProcedureBuilder<
      MergeInputConfig<TBaseInput, TInput>,
      TBaseOutput,
      TBaseErrors,
      TCustomContext,
      TRouter
    >(
      {
        input: { ...this._baseConfig.input, ...input } as MergeInputConfig<
          TBaseInput,
          TInput
        >,
        output: this._baseConfig.output,
        errors: this._baseConfig.errors,
      },
      this._middleware,
      this.router,
    );
  }

  /**
   * Define output schema for the job result.
   */
  output<TOutput extends z.ZodTypeAny>(
    output: TOutput,
  ): BaseWorkerProcedureBuilder<
    TBaseInput,
    TOutput,
    TBaseErrors,
    TCustomContext,
    TRouter
  > {
    return new BaseWorkerProcedureBuilder<
      TBaseInput,
      TOutput,
      TBaseErrors,
      TCustomContext,
      TRouter
    >(
      {
        input: this._baseConfig.input,
        output,
        errors: this._baseConfig.errors,
      },
      this._middleware,
      this.router,
    );
  }

  /**
   * Define error schemas for the job.
   */
  errors<TErrors extends Record<string, z.ZodTypeAny>>(
    errors: TErrors,
  ): BaseWorkerProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TBaseErrors, TErrors>,
    TCustomContext,
    TRouter
  > {
    return new BaseWorkerProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      MergeErrors<TBaseErrors, TErrors>,
      TCustomContext,
      TRouter
    >(
      {
        input: this._baseConfig.input,
        output: this._baseConfig.output,
        errors: { ...this._baseConfig.errors, ...errors } as MergeErrors<
          TBaseErrors,
          TErrors
        >,
      },
      this._middleware,
      this.router,
    );
  }

  /**
   * Create an on-demand task that can be triggered programmatically.
   */
  task(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedWorkerContext<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext>;
    }) =>
      | Promise<InferOutput<NonNullable<TBaseOutput>>>
      | InferOutput<NonNullable<TBaseOutput>>
      | void
      | Promise<void>,
  ): ReadyWorkerProcedure<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext> {
    return {
      type: "task",
      config: this._baseConfig as any,
      handler,
      middleware: this._middleware as any,
    };
  }

  /**
   * Create a scheduled job that runs on a cron schedule.
   *
   * @example
   * ```typescript
   * procedure.cron("0 9 * * *", async ({ ctx }) => {
   *   // Runs daily at 9am
   * });
   *
   * // With timezone
   * procedure.cron({ pattern: "0 9 * * *", timezone: "America/New_York" }, async ({ ctx }) => {
   *   // Runs daily at 9am EST
   * });
   * ```
   */
  cron(
    schedule: string | CronConfig,
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedWorkerContext<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext>;
    }) =>
      | Promise<InferOutput<NonNullable<TBaseOutput>>>
      | InferOutput<NonNullable<TBaseOutput>>
      | void
      | Promise<void>,
  ): ReadyWorkerProcedure<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext> {
    const cronConfig: CronConfig =
      typeof schedule === "string" ? { pattern: schedule } : schedule;

    return {
      type: "cron",
      cron: cronConfig,
      config: this._baseConfig as any,
      handler,
      middleware: this._middleware as any,
    };
  }

  /**
   * Create a queue-based job that processes messages from a specific queue.
   */
  queue(
    queueName: string,
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedWorkerContext<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext>;
    }) =>
      | Promise<InferOutput<NonNullable<TBaseOutput>>>
      | InferOutput<NonNullable<TBaseOutput>>
      | void
      | Promise<void>,
  ): ReadyWorkerProcedure<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext> {
    return {
      type: "queue",
      queue: queueName,
      config: this._baseConfig as any,
      handler,
      middleware: this._middleware as any,
    };
  }

  /**
   * Generic handler method that returns a PendingWorkerProcedure.
   * Job type is determined by the router config.
   */
  handler(
    handlerFn: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedWorkerContext<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext>;
    }) =>
      | Promise<InferOutput<NonNullable<TBaseOutput>>>
      | InferOutput<NonNullable<TBaseOutput>>
      | void
      | Promise<void>,
  ): PendingWorkerProcedure<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext> {
    return {
      config: this._baseConfig as any,
      handler: handlerFn,
      middleware: this._middleware as any,
    };
  }
}
