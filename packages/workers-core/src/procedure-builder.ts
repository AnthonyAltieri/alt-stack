import { z } from "zod";
import type {
  InputConfig,
  TypedWorkerContext,
  InferInput,
  WorkerProcedure,
  ReadyWorkerProcedure,
  PendingWorkerProcedure,
  CronConfig,
  WorkerHandlerResult,
} from "./types/index.js";
import type {
  MiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareBuilderWithErrors,
  AnyMiddlewareBuilderWithErrors,
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
 * TMiddlewareErrors tracks error schemas accumulated from middleware with errors.
 */
export class BaseWorkerProcedureBuilder<
  TBaseInput extends InputConfig = { payload?: never },
  TBaseOutput extends z.ZodTypeAny | undefined = undefined,
  TBaseErrors extends Record<string, z.ZodTypeAny> | undefined = undefined,
  TCustomContext extends object = Record<string, never>,
  TRouter = unknown,
  TMiddlewareErrors extends Record<string, z.ZodTypeAny> = {},
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

  private _middlewareErrors: TMiddlewareErrors;
  private _middlewareWithErrorsFlags: boolean[] = [];

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
    middlewareErrors?: TMiddlewareErrors,
    middlewareWithErrorsFlags?: boolean[],
  ) {
    this._baseConfig = {
      input: (baseConfig?.input ?? {}) as TBaseInput,
      output: baseConfig?.output,
      errors: baseConfig?.errors,
    };
    this._middlewareErrors = (middlewareErrors ?? {}) as TMiddlewareErrors;
    if (middleware) {
      this._middleware = [...middleware];
    }
    if (middlewareWithErrorsFlags) {
      this._middlewareWithErrorsFlags = [...middlewareWithErrorsFlags];
    }
  }

  /**
   * Add middleware with automatic context override inference.
   */
  use<$ContextOverridesOut, $MiddlewareErrors extends Record<string, z.ZodTypeAny> = {}>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          TypedWorkerContext<
            InputConfig,
            undefined,
            MergeErrors<TBaseErrors, TMiddlewareErrors>,
            TCustomContext
          >,
          object,
          $ContextOverridesOut
        >
      | MiddlewareBuilder<
          TypedWorkerContext<
            InputConfig,
            undefined,
            MergeErrors<TBaseErrors, TMiddlewareErrors>,
            TCustomContext
          >,
          $ContextOverridesOut
        >
      | MiddlewareBuilderWithErrors<
          TypedWorkerContext<
            InputConfig,
            undefined,
            MergeErrors<TBaseErrors, TMiddlewareErrors>,
            TCustomContext
          >,
          $ContextOverridesOut,
          $MiddlewareErrors
        >,
  ): BaseWorkerProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    TBaseErrors,
    Overwrite<TCustomContext, $ContextOverridesOut>,
    TRouter,
    MergeErrors<TMiddlewareErrors, $MiddlewareErrors>
  > {
    if (
      "_fn" in middlewareOrBuilder &&
      "_errors" in middlewareOrBuilder &&
      middlewareOrBuilder._fn
    ) {
      const builder = middlewareOrBuilder as AnyMiddlewareBuilderWithErrors;
      const mergedErrors = {
        ...this._middlewareErrors,
        ...builder._errors,
      } as MergeErrors<TMiddlewareErrors, $MiddlewareErrors>;

      return new BaseWorkerProcedureBuilder<
        TBaseInput,
        TBaseOutput,
        TBaseErrors,
        Overwrite<TCustomContext, $ContextOverridesOut>,
        TRouter,
        MergeErrors<TMiddlewareErrors, $MiddlewareErrors>
      >(
        this._baseConfig,
        [...this._middleware, builder._fn] as any,
        this.router,
        mergedErrors,
        [...this._middlewareWithErrorsFlags, true],
      );
    }

    const newMiddleware =
      "_middlewares" in middlewareOrBuilder
        ? (middlewareOrBuilder as MiddlewareBuilder<any, any>)._middlewares
        : [middlewareOrBuilder];

    const newFlags = newMiddleware.map(() => false);

    return new BaseWorkerProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TBaseErrors,
      Overwrite<TCustomContext, $ContextOverridesOut>,
      TRouter,
      MergeErrors<TMiddlewareErrors, $MiddlewareErrors>
    >(
      this._baseConfig,
      [...this._middleware, ...newMiddleware] as any,
      this.router,
      this._middlewareErrors as MergeErrors<TMiddlewareErrors, $MiddlewareErrors>,
      [...this._middlewareWithErrorsFlags, ...newFlags],
    );
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
    TRouter,
    TMiddlewareErrors
  > {
    return new BaseWorkerProcedureBuilder<
      MergeInputConfig<TBaseInput, TInput>,
      TBaseOutput,
      TBaseErrors,
      TCustomContext,
      TRouter,
      TMiddlewareErrors
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
      this._middlewareErrors,
      this._middlewareWithErrorsFlags,
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
    TRouter,
    TMiddlewareErrors
  > {
    return new BaseWorkerProcedureBuilder<
      TBaseInput,
      TOutput,
      TBaseErrors,
      TCustomContext,
      TRouter,
      TMiddlewareErrors
    >(
      {
        input: this._baseConfig.input,
        output,
        errors: this._baseConfig.errors,
      },
      this._middleware,
      this.router,
      this._middlewareErrors,
      this._middlewareWithErrorsFlags,
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
    TRouter,
    TMiddlewareErrors
  > {
    return new BaseWorkerProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      MergeErrors<TBaseErrors, TErrors>,
      TCustomContext,
      TRouter,
      TMiddlewareErrors
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
      this._middlewareErrors,
      this._middlewareWithErrorsFlags,
    );
  }

  private _allErrors(): MergeErrors<TBaseErrors, TMiddlewareErrors> {
    return {
      ...this._middlewareErrors,
      ...this._baseConfig.errors,
    } as any;
  }

  /**
   * Create an on-demand task that can be triggered programmatically.
   */
  task(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedWorkerContext<
        TBaseInput,
        TBaseOutput,
        MergeErrors<TBaseErrors, TMiddlewareErrors>,
        TCustomContext
      >;
    }) =>
      | WorkerHandlerResult<MergeErrors<TBaseErrors, TMiddlewareErrors>, TBaseOutput>
      | Promise<WorkerHandlerResult<MergeErrors<TBaseErrors, TMiddlewareErrors>, TBaseOutput>>,
  ): ReadyWorkerProcedure<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TBaseErrors, TMiddlewareErrors>,
    TCustomContext
  > {
    return {
      type: "task",
      config: {
        ...this._baseConfig,
        errors: this._allErrors(),
      } as any,
      handler,
      middleware: this._middleware as any,
      middlewareWithErrorsFlags: this._middlewareWithErrorsFlags,
    };
  }

  /**
   * Create a scheduled job that runs on a cron schedule.
   */
  cron(
    schedule: string | CronConfig,
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedWorkerContext<
        TBaseInput,
        TBaseOutput,
        MergeErrors<TBaseErrors, TMiddlewareErrors>,
        TCustomContext
      >;
    }) =>
      | WorkerHandlerResult<MergeErrors<TBaseErrors, TMiddlewareErrors>, TBaseOutput>
      | Promise<WorkerHandlerResult<MergeErrors<TBaseErrors, TMiddlewareErrors>, TBaseOutput>>,
  ): ReadyWorkerProcedure<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TBaseErrors, TMiddlewareErrors>,
    TCustomContext
  > {
    const cronConfig: CronConfig =
      typeof schedule === "string" ? { pattern: schedule } : schedule;

    return {
      type: "cron",
      cron: cronConfig,
      config: {
        ...this._baseConfig,
        errors: this._allErrors(),
      } as any,
      handler,
      middleware: this._middleware as any,
      middlewareWithErrorsFlags: this._middlewareWithErrorsFlags,
    };
  }

  /**
   * Create a queue-based job that processes messages from a specific queue.
   */
  queue(
    queueName: string,
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedWorkerContext<
        TBaseInput,
        TBaseOutput,
        MergeErrors<TBaseErrors, TMiddlewareErrors>,
        TCustomContext
      >;
    }) =>
      | WorkerHandlerResult<MergeErrors<TBaseErrors, TMiddlewareErrors>, TBaseOutput>
      | Promise<WorkerHandlerResult<MergeErrors<TBaseErrors, TMiddlewareErrors>, TBaseOutput>>,
  ): ReadyWorkerProcedure<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TBaseErrors, TMiddlewareErrors>,
    TCustomContext
  > {
    return {
      type: "queue",
      queue: queueName,
      config: {
        ...this._baseConfig,
        errors: this._allErrors(),
      } as any,
      handler,
      middleware: this._middleware as any,
      middlewareWithErrorsFlags: this._middlewareWithErrorsFlags,
    };
  }

  /**
   * Generic handler method that returns a PendingWorkerProcedure.
   * Job type is determined by the router config.
   */
  handler(
    handlerFn: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedWorkerContext<
        TBaseInput,
        TBaseOutput,
        MergeErrors<TBaseErrors, TMiddlewareErrors>,
        TCustomContext
      >;
    }) =>
      | WorkerHandlerResult<MergeErrors<TBaseErrors, TMiddlewareErrors>, TBaseOutput>
      | Promise<WorkerHandlerResult<MergeErrors<TBaseErrors, TMiddlewareErrors>, TBaseOutput>>,
  ): PendingWorkerProcedure<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TBaseErrors, TMiddlewareErrors>,
    TCustomContext
  > {
    return {
      config: {
        ...this._baseConfig,
        errors: this._allErrors(),
      } as any,
      handler: handlerFn,
      middleware: this._middleware as any,
      middlewareWithErrorsFlags: this._middlewareWithErrorsFlags,
    };
  }
}
