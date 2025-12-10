import { z } from "zod";
import type {
  InputConfig,
  TypedContext,
  InferInput,
  Procedure,
  ReadyProcedure,
  PendingProcedure,
  StringInputObjectSchema,
  HandlerResult,
} from "./types/index.js";
import type {
  MiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareBuilderWithErrors,
  AnyMiddlewareBuilderWithErrors,
  Overwrite,
} from "./middleware.js";

/**
 * Validates that params/query schemas in InputConfig accept string input.
 * Returns TInput if valid, otherwise makes params/query `never` to cause compile error.
 */
type ValidateStringInput<TInput extends InputConfig> = (TInput["params"] extends z.ZodTypeAny
  ? { params: StringInputObjectSchema<TInput["params"]> }
  : {}) &
  (TInput["query"] extends z.ZodTypeAny
    ? { query: StringInputObjectSchema<TInput["query"]> }
    : {}) &
  (TInput["body"] extends z.ZodTypeAny ? { body: TInput["body"] } : {});

// Helper type to merge InputConfigs
type MergeInputConfig<TBase extends InputConfig, TOverride extends InputConfig> = {
  params: TOverride["params"] extends z.ZodTypeAny ? TOverride["params"] : TBase["params"];
  query: TOverride["query"] extends z.ZodTypeAny ? TOverride["query"] : TBase["query"];
  body: TOverride["body"] extends z.ZodTypeAny ? TOverride["body"] : TBase["body"];
};

/**
 * Error config value type - must be a Zod schema with `_tag: z.literal("...")`
 * The schema documents the error shape for OpenAPI generation and the _tag
 * literal is extracted for type-safe error enforcement.
 */
type ErrorConfigValue = z.ZodTypeAny;

// Helper type to merge error configs - unions schemas when status codes overlap
type MergeErrors<
  TBaseErrors extends Record<number, ErrorConfigValue> | undefined,
  TRouteErrors extends Record<number, ErrorConfigValue> | undefined,
> =
  TRouteErrors extends Record<number, ErrorConfigValue>
    ? TBaseErrors extends Record<number, ErrorConfigValue>
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
 * Base procedure builder that accumulates configuration and middleware
 * The key innovation: TCustomContext tracks the narrowed context type through middleware chain
 * TDefaultErrors tracks default 400/500 error schemas from init() for proper ctx.error() typing
 * TMiddlewareErrors tracks error schemas accumulated from middleware with errors
 */
export class BaseProcedureBuilder<
  TBaseInput extends InputConfig = {
    params?: never;
    query?: never;
    body?: never;
  },
  TBaseOutput extends z.ZodTypeAny | undefined = undefined,
  TBaseErrors extends Record<number, ErrorConfigValue> | undefined = undefined,
  TCustomContext extends object = Record<string, never>,
  TRouter = unknown,
  TDefaultErrors extends Record<number, ErrorConfigValue> = {},
  TMiddlewareErrors extends Record<number, ErrorConfigValue> = {},
> {
  private _baseConfig: {
    input: TBaseInput;
    output?: TBaseOutput;
    errors?: TBaseErrors;
  };

  // Middleware stored with type erasure for runtime, but builder generic tracks narrowed context
  private _middleware: Array<
    (opts: {
      ctx: TypedContext<InputConfig, Record<number, ErrorConfigValue> | undefined, any>;
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
        proc: Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, ErrorConfigValue> | undefined,
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
   * Add middleware with automatic context override inference
   * Accepts either a single middleware function, a pre-built middleware chain,
   * or a MiddlewareBuilderWithErrors (created via createMiddlewareWithErrors)
   *
   * When using MiddlewareBuilderWithErrors, its error schemas are accumulated
   * into the procedure's error union.
   *
   * @example
   * ```typescript
   * // Single middleware (throws on error)
   * const protected = builder.use(async ({ ctx, next }) => {
   *   if (!ctx.user) throw new Error("Unauthorized");
   *   return next({ ctx: { user: ctx.user } }); // narrows user to non-null
   * });
   *
   * // Pre-built chain
   * const authChain = createMiddleware<AppContext>()(authMiddleware);
   * const protected = builder.use(authChain);
   *
   * // Middleware with errors (returns Result)
   * const authMiddleware = createMiddlewareWithErrors<AppContext>()
   *   .errors({ 401: z.object({ message: z.string() }) })
   *   .fn(async ({ ctx, next }) => {
   *     if (!ctx.user) return err({ _httpCode: 401, data: { message: "Unauthorized" } });
   *     return next({ ctx: { user: ctx.user } });
   *   });
   * const protected = builder.use(authMiddleware); // 401 error merged into procedure
   * ```
   */
  use<$ContextOverridesOut, $MiddlewareErrors extends Record<number, ErrorConfigValue> = {}>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          TypedContext<
            InputConfig,
            MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
            TCustomContext
          >,
          object,
          $ContextOverridesOut
        >
      | MiddlewareBuilder<
          TypedContext<
            InputConfig,
            MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
            TCustomContext
          >,
          $ContextOverridesOut
        >
      | MiddlewareBuilderWithErrors<
          TypedContext<
            InputConfig,
            MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
            TCustomContext
          >,
          $ContextOverridesOut,
          $MiddlewareErrors
        >,
  ): BaseProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    TBaseErrors,
    Overwrite<TCustomContext, $ContextOverridesOut>,
    TRouter,
    TDefaultErrors,
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

      return new BaseProcedureBuilder<
        TBaseInput,
        TBaseOutput,
        TBaseErrors,
        Overwrite<TCustomContext, $ContextOverridesOut>,
        TRouter,
        TDefaultErrors,
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

    return new BaseProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TBaseErrors,
      Overwrite<TCustomContext, $ContextOverridesOut>,
      TRouter,
      TDefaultErrors,
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
    input: TInput & ValidateStringInput<TInput>,
  ): BaseProcedureBuilder<
    MergeInputConfig<TBaseInput, TInput>,
    TBaseOutput,
    TBaseErrors,
    TCustomContext,
    TRouter,
    TDefaultErrors,
    TMiddlewareErrors
  > {
    return new BaseProcedureBuilder<
      MergeInputConfig<TBaseInput, TInput>,
      TBaseOutput,
      TBaseErrors,
      TCustomContext,
      TRouter,
      TDefaultErrors,
      TMiddlewareErrors
    >(
      {
        input: { ...this._baseConfig.input, ...input } as MergeInputConfig<TBaseInput, TInput>,
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
  ): BaseProcedureBuilder<
    TBaseInput,
    TOutput,
    TBaseErrors,
    TCustomContext,
    TRouter,
    TDefaultErrors,
    TMiddlewareErrors
  > {
    return new BaseProcedureBuilder<
      TBaseInput,
      TOutput,
      TBaseErrors,
      TCustomContext,
      TRouter,
      TDefaultErrors,
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

  errors<TErrors extends Record<number, ErrorConfigValue>>(
    errors: TErrors,
  ): BaseProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TBaseErrors, TErrors>,
    TCustomContext,
    TRouter,
    TDefaultErrors,
    TMiddlewareErrors
  > {
    return new BaseProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      MergeErrors<TBaseErrors, TErrors>,
      TCustomContext,
      TRouter,
      TDefaultErrors,
      TMiddlewareErrors
    >(
      {
        input: this._baseConfig.input,
        output: this._baseConfig.output,
        errors: { ...this._baseConfig.errors, ...errors } as MergeErrors<TBaseErrors, TErrors>,
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
        proc: Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, ErrorConfigValue> | undefined,
          TCustomContext
        >,
      ) => void;
    },
  >(
    router: TRouterProvided,
  ): BaseProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    TBaseErrors,
    TCustomContext,
    TRouterProvided,
    TDefaultErrors,
    TMiddlewareErrors
  > {
    return new BaseProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TBaseErrors,
      TCustomContext,
      TRouterProvided,
      TDefaultErrors,
      TMiddlewareErrors
    >(
      this._baseConfig,
      this._middleware,
      router,
      this._middlewareErrors,
      this._middlewareWithErrorsFlags,
    );
  }

  // Helper type for combined errors
  private _allErrors(): MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>> {
    // Runtime: merge all errors for OpenAPI generation
    return {
      ...this._middlewareErrors,
      ...this._baseConfig.errors,
    } as any;
  }

  /**
   * HTTP method handlers that return ReadyProcedure (for use in router config)
   */
  get(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedContext<
        TBaseInput,
        MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
        TCustomContext
      >;
    }) =>
      | HandlerResult<
          MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
          TBaseOutput
        >
      | Promise<
          HandlerResult<
            MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
            TBaseOutput
          >
        >,
  ): ReadyProcedure<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
    TCustomContext
  > {
    return {
      method: "GET",
      config: {
        ...this._baseConfig,
        errors: this._allErrors(),
      } as any,
      handler,
      middleware: this._middleware as any,
      middlewareWithErrorsFlags: this._middlewareWithErrorsFlags,
    };
  }

  post(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedContext<
        TBaseInput,
        MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
        TCustomContext
      >;
    }) =>
      | HandlerResult<
          MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
          TBaseOutput
        >
      | Promise<
          HandlerResult<
            MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
            TBaseOutput
          >
        >,
  ): ReadyProcedure<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
    TCustomContext
  > {
    return {
      method: "POST",
      config: {
        ...this._baseConfig,
        errors: this._allErrors(),
      } as any,
      handler,
      middleware: this._middleware as any,
      middlewareWithErrorsFlags: this._middlewareWithErrorsFlags,
    };
  }

  put(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedContext<
        TBaseInput,
        MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
        TCustomContext
      >;
    }) =>
      | HandlerResult<
          MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
          TBaseOutput
        >
      | Promise<
          HandlerResult<
            MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
            TBaseOutput
          >
        >,
  ): ReadyProcedure<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
    TCustomContext
  > {
    return {
      method: "PUT",
      config: {
        ...this._baseConfig,
        errors: this._allErrors(),
      } as any,
      handler,
      middleware: this._middleware as any,
      middlewareWithErrorsFlags: this._middlewareWithErrorsFlags,
    };
  }

  patch(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedContext<
        TBaseInput,
        MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
        TCustomContext
      >;
    }) =>
      | HandlerResult<
          MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
          TBaseOutput
        >
      | Promise<
          HandlerResult<
            MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
            TBaseOutput
          >
        >,
  ): ReadyProcedure<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
    TCustomContext
  > {
    return {
      method: "PATCH",
      config: {
        ...this._baseConfig,
        errors: this._allErrors(),
      } as any,
      handler,
      middleware: this._middleware as any,
      middlewareWithErrorsFlags: this._middlewareWithErrorsFlags,
    };
  }

  delete(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedContext<
        TBaseInput,
        MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
        TCustomContext
      >;
    }) =>
      | HandlerResult<
          MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
          TBaseOutput
        >
      | Promise<
          HandlerResult<
            MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
            TBaseOutput
          >
        >,
  ): ReadyProcedure<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
    TCustomContext
  > {
    return {
      method: "DELETE",
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
   * Generic handler method that returns PendingProcedure (method determined later)
   */
  handler(
    handlerFn: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedContext<
        TBaseInput,
        MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
        TCustomContext
      >;
    }) =>
      | HandlerResult<
          MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
          TBaseOutput
        >
      | Promise<
          HandlerResult<
            MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
            TBaseOutput
          >
        >,
  ): PendingProcedure<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TDefaultErrors, MergeErrors<TBaseErrors, TMiddlewareErrors>>,
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

/**
 * Procedure builder for a specific route path and method
 * Builds up the final procedure with middleware and handler
 */
export class ProcedureBuilder<
  TInput extends InputConfig,
  TOutput extends z.ZodTypeAny | undefined,
  TErrors extends Record<number, z.ZodTypeAny> | undefined,
  TCustomContext extends object = Record<string, never>,
  TRouter = unknown,
> {
  private _config: {
    input: TInput;
    output?: TOutput;
    errors?: TErrors;
  };
  private _handler?: (
    ctx: TypedContext<TInput, TErrors, TCustomContext>,
  ) => HandlerResult<TErrors, TOutput> | Promise<HandlerResult<TErrors, TOutput>>;
  private _middleware: Array<any> = [];
  private _registered = false;

  constructor(
    private method: string,
    private path: string,
    config: {
      input: TInput;
      output?: TOutput;
      errors?: TErrors;
    },
    private router: TRouter & {
      register: (
        proc: Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, ErrorConfigValue> | undefined,
          TCustomContext
        >,
      ) => void;
    },
    initialMiddleware?: Array<any>,
  ) {
    this._config = config;
    if (initialMiddleware) {
      this._middleware = [...initialMiddleware];
    }
  }

  use(middleware: any): this {
    this._middleware.push(middleware);
    return this;
  }

  handler(
    fn: (
      ctx: TypedContext<TInput, TErrors, TCustomContext>,
    ) => HandlerResult<TErrors, TOutput> | Promise<HandlerResult<TErrors, TOutput>>,
  ): TRouter {
    this._handler = fn;
    if (!this._registered) {
      this.router.register(
        this.build() as unknown as Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, ErrorConfigValue> | undefined,
          TCustomContext
        >,
      );
      this._registered = true;
    }
    return this.router;
  }

  build(): Procedure<TInput, TOutput, TErrors, TCustomContext> {
    if (!this._handler) {
      throw new Error(`Handler not defined for ${this.method} ${this.path}`);
    }
    return {
      method: this.method,
      path: this.path,
      config: this._config,
      handler: this._handler,
      middleware: this._middleware as any,
    };
  }
}

