import { z } from "zod";
import type {
  InferOutput,
  InputConfig,
  TypedContext,
  InferInput,
  Procedure,
  ReadyProcedure,
  PendingProcedure,
} from "./types/index.js";
import type {
  MiddlewareFunction,
  MiddlewareBuilder,
  Overwrite,
} from "./middleware.js";

function convertPathToHono(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

// Helper type to merge InputConfigs
type MergeInputConfig<
  TBase extends InputConfig,
  TOverride extends InputConfig,
> = {
  params: TOverride["params"] extends z.ZodTypeAny
    ? TOverride["params"]
    : TBase["params"];
  query: TOverride["query"] extends z.ZodTypeAny
    ? TOverride["query"]
    : TBase["query"];
  body: TOverride["body"] extends z.ZodTypeAny
    ? TOverride["body"]
    : TBase["body"];
};

// Helper type to merge error configs - unions schemas when status codes overlap
type MergeErrors<
  TBaseErrors extends Record<number, z.ZodTypeAny> | undefined,
  TRouteErrors extends Record<number, z.ZodTypeAny> | undefined,
> =
  TRouteErrors extends Record<number, z.ZodTypeAny>
    ? TBaseErrors extends Record<number, z.ZodTypeAny>
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
 * Base procedure builder that accumulates configuration and middleware
 * The key innovation: TCustomContext tracks the narrowed context type through middleware chain
 * TDefaultErrors tracks default 400/500 error schemas from init() for proper ctx.error() typing
 */
export class BaseProcedureBuilder<
  TBaseInput extends InputConfig = {
    params?: never;
    query?: never;
    body?: never;
  },
  TBaseOutput extends z.ZodTypeAny | undefined = undefined,
  TBaseErrors extends Record<number, z.ZodTypeAny> | undefined = undefined,
  TCustomContext extends object = Record<string, never>,
  TRouter = unknown,
  TDefaultErrors extends Record<number, z.ZodTypeAny> = {},
> {
  private _baseConfig: {
    input: TBaseInput;
    output?: TBaseOutput;
    errors?: TBaseErrors;
  };

  // Middleware stored with type erasure for runtime, but builder generic tracks narrowed context
  private _middleware: Array<
    (opts: {
      ctx: TypedContext<
        InputConfig,
        Record<number, z.ZodTypeAny> | undefined,
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
        proc: Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, z.ZodTypeAny> | undefined,
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
   * Add middleware with automatic context override inference
   * Accepts either a single middleware function or a pre-built middleware chain
   * TypeScript infers $ContextOverridesOut from what's passed to next() in the middleware
   *
   * @example
   * ```typescript
   * // Single middleware
   * const protected = builder.use(async ({ ctx, next }) => {
   *   if (!ctx.user) throw new Error("Unauthorized");
   *   return next({ ctx: { user: ctx.user } }); // narrows user to non-null
   * });
   *
   * // Pre-built chain
   * const authChain = createMiddleware<AppContext>()(authMiddleware);
   * const protected = builder.use(authChain);
   * ```
   */
  use<$ContextOverridesOut>(
    middlewareOrBuilder:
      | MiddlewareFunction<
          TypedContext<
            InputConfig,
            MergeErrors<TDefaultErrors, TBaseErrors>,
            TCustomContext
          >,
          object,
          $ContextOverridesOut
        >
      | MiddlewareBuilder<
          TypedContext<
            InputConfig,
            MergeErrors<TDefaultErrors, TBaseErrors>,
            TCustomContext
          >,
          $ContextOverridesOut
        >,
  ): BaseProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    TBaseErrors,
    Overwrite<TCustomContext, $ContextOverridesOut>,
    TRouter,
    TDefaultErrors
  > {
    // Extract middleware array from builder or wrap single middleware
    const newMiddleware =
      "_middlewares" in middlewareOrBuilder
        ? middlewareOrBuilder._middlewares
        : [middlewareOrBuilder];

    return new BaseProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TBaseErrors,
      Overwrite<TCustomContext, $ContextOverridesOut>,
      TRouter,
      TDefaultErrors
    >(
      this._baseConfig,
      [...this._middleware, ...newMiddleware] as any,
      this.router,
    );
  }

  input<TInput extends InputConfig>(
    input: TInput,
  ): BaseProcedureBuilder<
    MergeInputConfig<TBaseInput, TInput>,
    TBaseOutput,
    TBaseErrors,
    TCustomContext,
    TRouter,
    TDefaultErrors
  > {
    return new BaseProcedureBuilder<
      MergeInputConfig<TBaseInput, TInput>,
      TBaseOutput,
      TBaseErrors,
      TCustomContext,
      TRouter,
      TDefaultErrors
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
  ): BaseProcedureBuilder<
    TBaseInput,
    TOutput,
    TBaseErrors,
    TCustomContext,
    TRouter,
    TDefaultErrors
  > {
    return new BaseProcedureBuilder<
      TBaseInput,
      TOutput,
      TBaseErrors,
      TCustomContext,
      TRouter,
      TDefaultErrors
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

  errors<TErrors extends Record<number, z.ZodTypeAny>>(
    errors: TErrors,
  ): BaseProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    MergeErrors<TBaseErrors, TErrors>,
    TCustomContext,
    TRouter,
    TDefaultErrors
  > {
    return new BaseProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      MergeErrors<TBaseErrors, TErrors>,
      TCustomContext,
      TRouter,
      TDefaultErrors
    >(
      {
        input: this._baseConfig.input,
        output: this._baseConfig.output,
        errors: { ...this._baseConfig.errors, ...errors } as MergeErrors<TBaseErrors, TErrors>,
      },
      this._middleware,
      this.router,
    );
  }

  on<
    TRouterProvided extends {
      register: (
        proc: Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, z.ZodTypeAny> | undefined,
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
    TDefaultErrors
  > {
    return new BaseProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TBaseErrors,
      TCustomContext,
      TRouterProvided,
      TDefaultErrors
    >(this._baseConfig, this._middleware, router);
  }

  /**
   * HTTP method handlers that return ReadyProcedure (for use in router config)
   */
  get(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedContext<TBaseInput, MergeErrors<TDefaultErrors, TBaseErrors>, TCustomContext>;
    }) =>
      | Promise<InferOutput<NonNullable<TBaseOutput>> | Response>
      | InferOutput<NonNullable<TBaseOutput>>
      | Response,
  ): ReadyProcedure<TBaseInput, TBaseOutput, MergeErrors<TDefaultErrors, TBaseErrors>, TCustomContext> {
    return {
      method: "GET",
      config: this._baseConfig as any,
      handler,
      middleware: this._middleware as any,
    };
  }

  post(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedContext<TBaseInput, MergeErrors<TDefaultErrors, TBaseErrors>, TCustomContext>;
    }) =>
      | Promise<InferOutput<NonNullable<TBaseOutput>> | Response>
      | InferOutput<NonNullable<TBaseOutput>>
      | Response,
  ): ReadyProcedure<TBaseInput, TBaseOutput, MergeErrors<TDefaultErrors, TBaseErrors>, TCustomContext> {
    return {
      method: "POST",
      config: this._baseConfig as any,
      handler,
      middleware: this._middleware as any,
    };
  }

  put(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedContext<TBaseInput, MergeErrors<TDefaultErrors, TBaseErrors>, TCustomContext>;
    }) =>
      | Promise<InferOutput<NonNullable<TBaseOutput>> | Response>
      | InferOutput<NonNullable<TBaseOutput>>
      | Response,
  ): ReadyProcedure<TBaseInput, TBaseOutput, MergeErrors<TDefaultErrors, TBaseErrors>, TCustomContext> {
    return {
      method: "PUT",
      config: this._baseConfig as any,
      handler,
      middleware: this._middleware as any,
    };
  }

  patch(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedContext<TBaseInput, MergeErrors<TDefaultErrors, TBaseErrors>, TCustomContext>;
    }) =>
      | Promise<InferOutput<NonNullable<TBaseOutput>> | Response>
      | InferOutput<NonNullable<TBaseOutput>>
      | Response,
  ): ReadyProcedure<TBaseInput, TBaseOutput, MergeErrors<TDefaultErrors, TBaseErrors>, TCustomContext> {
    return {
      method: "PATCH",
      config: this._baseConfig as any,
      handler,
      middleware: this._middleware as any,
    };
  }

  delete(
    handler: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedContext<TBaseInput, MergeErrors<TDefaultErrors, TBaseErrors>, TCustomContext>;
    }) =>
      | Promise<InferOutput<NonNullable<TBaseOutput>> | Response>
      | InferOutput<NonNullable<TBaseOutput>>
      | Response,
  ): ReadyProcedure<TBaseInput, TBaseOutput, MergeErrors<TDefaultErrors, TBaseErrors>, TCustomContext> {
    return {
      method: "DELETE",
      config: this._baseConfig as any,
      handler,
      middleware: this._middleware as any,
    };
  }

  /**
   * Generic handler method that returns PendingProcedure (method determined later)
   */
  handler(
    handlerFn: (opts: {
      input: InferInput<TBaseInput>;
      ctx: TypedContext<TBaseInput, MergeErrors<TDefaultErrors, TBaseErrors>, TCustomContext>;
    }) =>
      | Promise<InferOutput<NonNullable<TBaseOutput>> | Response>
      | InferOutput<NonNullable<TBaseOutput>>
      | Response,
  ): PendingProcedure<TBaseInput, TBaseOutput, MergeErrors<TDefaultErrors, TBaseErrors>, TCustomContext> {
    return {
      config: this._baseConfig as any,
      handler: handlerFn,
      middleware: this._middleware as any,
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
  ) =>
    | Promise<InferOutput<NonNullable<TOutput>> | Response>
    | InferOutput<NonNullable<TOutput>>
    | Response;
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
          Record<number, z.ZodTypeAny> | undefined,
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
    ) =>
      | Promise<InferOutput<NonNullable<TOutput>> | Response>
      | InferOutput<NonNullable<TOutput>>
      | Response,
  ): TRouter {
    this._handler = fn;
    if (!this._registered) {
      this.router.register(
        this.build() as unknown as Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, z.ZodTypeAny> | undefined,
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
