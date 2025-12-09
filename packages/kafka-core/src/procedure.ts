import { z } from "zod";
import type {
  InputConfig,
  TypedKafkaContext,
  InferInput,
  KafkaProcedure,
  ReadyKafkaProcedure,
  PendingKafkaProcedure,
  KafkaHandlerResult,
} from "./types.js";
import type {
  MiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareBuilderWithErrors,
  AnyMiddlewareBuilderWithErrors,
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
 * TMiddlewareErrors tracks error schemas accumulated from middleware with errors.
 */
export class BaseKafkaProcedureBuilder<
  TBaseInput extends InputConfig = { message?: never },
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

  // Track middleware error schemas for merging at runtime
  private _middlewareErrors: TMiddlewareErrors;

  // Track which middleware are Result-based (have _fn)
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
        proc: KafkaProcedure<
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
   * Accepts either a single middleware function, a pre-built middleware chain,
   * or a MiddlewareBuilderWithErrors (created via createMiddlewareWithErrors)
   */
  use<$ContextOverridesOut, $MiddlewareErrors extends Record<string, z.ZodTypeAny> = {}>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          TypedKafkaContext<
            InputConfig,
            undefined,
            MergeErrors<TBaseErrors, TMiddlewareErrors>,
            TCustomContext
          >,
          object,
          $ContextOverridesOut
        >
      | MiddlewareBuilder<
          TypedKafkaContext<
            InputConfig,
            undefined,
            MergeErrors<TBaseErrors, TMiddlewareErrors>,
            TCustomContext
          >,
          $ContextOverridesOut
        >
      | MiddlewareBuilderWithErrors<
          TypedKafkaContext<
            InputConfig,
            undefined,
            MergeErrors<TBaseErrors, TMiddlewareErrors>,
            TCustomContext
          >,
          $ContextOverridesOut,
          $MiddlewareErrors
        >,
  ): BaseKafkaProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    TBaseErrors,
    Overwrite<TCustomContext, $ContextOverridesOut>,
    TRouter,
    MergeErrors<TMiddlewareErrors, $MiddlewareErrors>
  > {
    // Check if this is a MiddlewareBuilderWithErrors (has _fn and _errors)
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

      return new BaseKafkaProcedureBuilder<
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

    // Extract middleware array from builder or wrap single middleware
    const newMiddleware =
      "_middlewares" in middlewareOrBuilder
        ? (middlewareOrBuilder as MiddlewareBuilder<any, any>)._middlewares
        : [middlewareOrBuilder];

    // Track that these middleware are NOT Result-based
    const newFlags = newMiddleware.map(() => false);

    return new BaseKafkaProcedureBuilder<
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

  input<TInput extends InputConfig>(
    input: TInput,
  ): BaseKafkaProcedureBuilder<
    MergeInputConfig<TBaseInput, TInput>,
    TBaseOutput,
    TBaseErrors,
    TCustomContext,
    TRouter,
    TMiddlewareErrors
  > {
    return new BaseKafkaProcedureBuilder<
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

  output<TOutput extends z.ZodTypeAny>(
    output: TOutput,
  ): BaseKafkaProcedureBuilder<
    TBaseInput,
    TOutput,
    TBaseErrors,
    TCustomContext,
    TRouter,
    TMiddlewareErrors
  > {
    return new BaseKafkaProcedureBuilder<
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

  errors<TErrors extends Record<string, z.ZodTypeAny>>(
    errors: TErrors,
  ): BaseKafkaProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TBaseErrors, TErrors>,
    TCustomContext,
    TRouter,
    TMiddlewareErrors
  > {
    return new BaseKafkaProcedureBuilder<
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
    TRouterProvided,
    TMiddlewareErrors
  > {
    return new BaseKafkaProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TBaseErrors,
      TCustomContext,
      TRouterProvided,
      TMiddlewareErrors
    >(
      this._baseConfig,
      this._middleware,
      router,
      this._middlewareErrors,
      this._middlewareWithErrorsFlags,
    );
  }

  // Helper method for combined errors
  private _allErrors(): MergeErrors<TBaseErrors, TMiddlewareErrors> {
    return {
      ...this._middlewareErrors,
      ...this._baseConfig.errors,
    } as any;
  }

  /**
   * Subscribe handler that returns ReadyKafkaProcedure (for use in router config)
   */
  subscribe(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedKafkaContext<
        TBaseInput,
        TBaseOutput,
        MergeErrors<TBaseErrors, TMiddlewareErrors>,
        TCustomContext
      >;
    }) =>
      | KafkaHandlerResult<MergeErrors<TBaseErrors, TMiddlewareErrors>, TBaseOutput>
      | Promise<KafkaHandlerResult<MergeErrors<TBaseErrors, TMiddlewareErrors>, TBaseOutput>>,
  ): ReadyKafkaProcedure<
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
      handler,
      middleware: this._middleware as any,
      middlewareWithErrorsFlags: this._middlewareWithErrorsFlags,
    };
  }

  /**
   * Generic handler method that returns PendingKafkaProcedure (topic determined later)
   */
  handler(
    handlerFn: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedKafkaContext<
        TBaseInput,
        TBaseOutput,
        MergeErrors<TBaseErrors, TMiddlewareErrors>,
        TCustomContext
      >;
    }) =>
      | KafkaHandlerResult<MergeErrors<TBaseErrors, TMiddlewareErrors>, TBaseOutput>
      | Promise<KafkaHandlerResult<MergeErrors<TBaseErrors, TMiddlewareErrors>, TBaseOutput>>,
  ): PendingKafkaProcedure<
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

