import { z } from "zod";
import type {
  InferOutput,
  InputConfig,
  TypedKafkaContext,
  InferInput,
  KafkaProcedure,
  ReadyKafkaProcedure,
  PendingKafkaProcedure,
} from "./types.js";
import type {
  MiddlewareFunction,
  MiddlewareBuilder,
  Overwrite,
} from "./middleware.js";

// Helper type to merge InputConfigs
type MergeInputConfig<
  TBase extends InputConfig,
  TOverride extends InputConfig,
> = {
  message: TOverride["message"] extends z.ZodTypeAny
    ? TOverride["message"]
    : TBase["message"];
};

// Helper type to merge error configs - unions schemas when error codes overlap
type MergeErrors<
  TBaseErrors extends Record<string, z.ZodTypeAny> | undefined,
  TRouteErrors extends Record<string, z.ZodTypeAny> | undefined,
> =
  TRouteErrors extends Record<string, z.ZodTypeAny>
    ? TBaseErrors extends Record<string, z.ZodTypeAny>
      ? {
          [K in
            | keyof TBaseErrors
            | keyof TRouteErrors]: K extends keyof TBaseErrors
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
 * The key innovation: TCustomContext tracks the narrowed context type through middleware chain.
 */
export class BaseKafkaProcedureBuilder<
  TBaseInput extends InputConfig = { message?: never },
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

  // Middleware stored with type erasure for runtime, but builder generic tracks narrowed context
  private _middleware: Array<
    (opts: {
      ctx: TypedKafkaContext<
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
        proc: KafkaProcedure<
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
   * Accepts either a single middleware function or a pre-built middleware chain.
   */
  use<$ContextOverridesOut>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          TypedKafkaContext<InputConfig, undefined, TBaseErrors, TCustomContext>,
          object,
          $ContextOverridesOut
        >
      | MiddlewareBuilder<
          TypedKafkaContext<InputConfig, undefined, TBaseErrors, TCustomContext>,
          $ContextOverridesOut
        >,
  ): BaseKafkaProcedureBuilder<
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

    return new BaseKafkaProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TBaseErrors,
      Overwrite<TCustomContext, $ContextOverridesOut>,
      TRouter
    >(this._baseConfig, [...this._middleware, ...newMiddleware] as any, this.router);
  }

  input<TInput extends InputConfig>(
    input: TInput,
  ): BaseKafkaProcedureBuilder<
    MergeInputConfig<TBaseInput, TInput>,
    TBaseOutput,
    TBaseErrors,
    TCustomContext,
    TRouter
  > {
    return new BaseKafkaProcedureBuilder<
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

  output<TOutput extends z.ZodTypeAny>(
    output: TOutput,
  ): BaseKafkaProcedureBuilder<
    TBaseInput,
    TOutput,
    TBaseErrors,
    TCustomContext,
    TRouter
  > {
    return new BaseKafkaProcedureBuilder<
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

  errors<TErrors extends Record<string, z.ZodTypeAny>>(
    errors: TErrors,
  ): BaseKafkaProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TBaseErrors, TErrors>,
    TCustomContext,
    TRouter
  > {
    return new BaseKafkaProcedureBuilder<
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

  on<
    TRouterProvided extends {
      register: (
        proc: KafkaProcedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<string, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      ) => void;
    },
  >(
    router: TRouterProvided,
  ): BaseKafkaProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    TBaseErrors,
    TCustomContext,
    TRouterProvided
  > {
    return new BaseKafkaProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TBaseErrors,
      TCustomContext,
      TRouterProvided
    >(this._baseConfig, this._middleware, router);
  }

  /**
   * Subscribe handler that returns ReadyKafkaProcedure (for use in router config)
   */
  subscribe(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedKafkaContext<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext>;
    }) =>
      | Promise<InferOutput<NonNullable<TBaseOutput>>>
      | InferOutput<NonNullable<TBaseOutput>>
      | void
      | Promise<void>,
  ): ReadyKafkaProcedure<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext> {
    return {
      config: this._baseConfig as any,
      handler,
      middleware: this._middleware as any,
    };
  }

  /**
   * Generic handler method that returns PendingKafkaProcedure (topic determined later)
   */
  handler(
    handlerFn: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedKafkaContext<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext>;
    }) =>
      | Promise<InferOutput<NonNullable<TBaseOutput>>>
      | InferOutput<NonNullable<TBaseOutput>>
      | void
      | Promise<void>,
  ): PendingKafkaProcedure<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext> {
    return {
      config: this._baseConfig as any,
      handler: handlerFn,
      middleware: this._middleware as any,
    };
  }
}

