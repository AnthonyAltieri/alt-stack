import { z } from "zod";
import type {
  InferOutput,
  InputConfig,
  TypedContext,
  ProcedureConfig,
} from "./types.js";

function convertPathToHono(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
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
  ) =>
    | Promise<InferOutput<NonNullable<TOutput>>>
    | InferOutput<NonNullable<TOutput>>;
  middleware: Array<
    (opts: {
      ctx: TypedContext<TInput, TErrors, TCustomContext>;
      next: (opts?: {
        ctx: Partial<TypedContext<TInput, TErrors, TCustomContext>>;
      }) => Promise<TypedContext<TInput, TErrors, TCustomContext> | Response>;
    }) => Promise<TypedContext<TInput, TErrors, TCustomContext> | Response>
  >;
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
  body: TOverride["body"] extends z.ZodTypeAny ? TOverride["body"] : TBase["body"];
};

// Helper type to merge error configs - unions schemas when status codes overlap
// When both procedure and route define the same status code, the schemas are unioned
// This allows ctx.error() to accept either schema for that status code
type MergeErrors<
  TBaseErrors extends Record<number, z.ZodTypeAny> | undefined,
  TRouteErrors extends Record<number, z.ZodTypeAny> | undefined,
> = TRouteErrors extends Record<number, z.ZodTypeAny>
  ? TBaseErrors extends Record<number, z.ZodTypeAny>
    ? {
        // Union all keys from both error configs
        [K in keyof TBaseErrors | keyof TRouteErrors]: K extends keyof TBaseErrors
          ? K extends keyof TRouteErrors
            ? TBaseErrors[K] | TRouteErrors[K] // Both define this status code - union the schemas
            : TBaseErrors[K] // Only base defines this status code
          : K extends keyof TRouteErrors
            ? TRouteErrors[K] // Only route defines this status code
            : never;
      }
    : TRouteErrors
  : TBaseErrors;

export class BaseProcedureBuilder<
  TBaseInput extends InputConfig = { params?: never; query?: never; body?: never },
  TBaseOutput extends z.ZodTypeAny | undefined = undefined,
  TBaseErrors extends Record<number, z.ZodTypeAny> | undefined = undefined,
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
      ctx: TypedContext<InputConfig, Record<number, z.ZodTypeAny> | undefined, TCustomContext>;
      next: (opts?: {
        ctx: Partial<TypedContext<InputConfig, Record<number, z.ZodTypeAny> | undefined, TCustomContext>>;
      }) => Promise<TypedContext<InputConfig, Record<number, z.ZodTypeAny> | undefined, TCustomContext> | Response>;
    }) => Promise<TypedContext<InputConfig, Record<number, z.ZodTypeAny> | undefined, TCustomContext> | Response>
  > = [];

  constructor(
    baseConfig?: {
      input?: TBaseInput;
      output?: TBaseOutput;
      errors?: TBaseErrors;
    },
    middleware?: Array<
      (opts: {
        ctx: TypedContext<InputConfig, Record<number, z.ZodTypeAny> | undefined, TCustomContext>;
        next: (opts?: {
          ctx: Partial<TypedContext<InputConfig, Record<number, z.ZodTypeAny> | undefined, TCustomContext>>;
        }) => Promise<TypedContext<InputConfig, Record<number, z.ZodTypeAny> | undefined, TCustomContext> | Response>;
      }) => Promise<TypedContext<InputConfig, Record<number, z.ZodTypeAny> | undefined, TCustomContext> | Response>
    >,
    private router?: TRouter & {
      register: (
        proc: Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, z.ZodTypeAny> | undefined,
          TCustomContext
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

  use(
    middleware: (opts: {
      ctx: TypedContext<InputConfig, Record<number, z.ZodTypeAny> | undefined, TCustomContext>;
      next: (opts?: {
        ctx: Partial<TypedContext<InputConfig, Record<number, z.ZodTypeAny> | undefined, TCustomContext>>;
      }) => Promise<TypedContext<InputConfig, Record<number, z.ZodTypeAny> | undefined, TCustomContext> | Response>;
    }) => Promise<TypedContext<InputConfig, Record<number, z.ZodTypeAny> | undefined, TCustomContext> | Response>,
  ): BaseProcedureBuilder<
    TBaseInput,
    TBaseOutput,
    TBaseErrors,
    TCustomContext,
    TRouter
  > {
    return new BaseProcedureBuilder<
      TBaseInput,
      TBaseOutput,
      TBaseErrors,
      TCustomContext,
      TRouter
    >(this._baseConfig, [...this._middleware, middleware], this.router);
  }

  input<TInput extends InputConfig>(
    input: TInput,
  ): BaseProcedureBuilder<
    MergeInputConfig<TBaseInput, TInput>,
    TBaseOutput,
    TBaseErrors,
    TCustomContext,
    TRouter
  > {
    return new BaseProcedureBuilder<
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
  ): BaseProcedureBuilder<TBaseInput, TOutput, TBaseErrors, TCustomContext, TRouter> {
    return new BaseProcedureBuilder<TBaseInput, TOutput, TBaseErrors, TCustomContext, TRouter>(
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
  ): BaseProcedureBuilder<TBaseInput, TBaseOutput, TErrors, TCustomContext, TRouter> {
    return new BaseProcedureBuilder<TBaseInput, TBaseOutput, TErrors, TCustomContext, TRouter>(
      {
        input: this._baseConfig.input,
        output: this._baseConfig.output,
        errors,
      },
      this._middleware,
      this.router,
    );
  }

  on<TRouterProvided extends {
    register: (
      proc: Procedure<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<number, z.ZodTypeAny> | undefined,
        TCustomContext
      >,
    ) => void;
  }>(
    router: TRouterProvided,
  ): BaseProcedureBuilder<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext, TRouterProvided> {
    return new BaseProcedureBuilder<TBaseInput, TBaseOutput, TBaseErrors, TCustomContext, TRouterProvided>(
      this._baseConfig,
      this._middleware,
      router,
    );
  }

  get<
    TPath extends string,
    TInput extends InputConfig,
    TOutput extends z.ZodTypeAny | undefined,
    TErrors extends Record<number, z.ZodTypeAny> | undefined,
  >(
    path: TPath,
    config: ProcedureConfig<TPath, TInput, TOutput, TErrors>,
    router?: TRouter & {
      register: (
        proc: Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      ) => void;
    },
  ): ProcedureBuilder<
    MergeInputConfig<TBaseInput, TInput>,
    TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
    MergeErrors<TBaseErrors, TErrors>,
    TCustomContext,
    TRouter
  > {
    const targetRouter = router ?? this.router;
    if (!targetRouter) {
      throw new Error("Procedure must be created from a router or a router must be provided");
    }
    // Merge errors: union schemas when status codes overlap
    const mergedErrors = config.errors || this._baseConfig.errors
      ? (() => {
          const base = this._baseConfig.errors || {};
          const route = config.errors || {};
          const merged: Record<number, z.ZodTypeAny> = {};
          
          // Add all base errors
          for (const [code, schema] of Object.entries(base)) {
            merged[Number(code)] = schema as z.ZodTypeAny;
          }
          
          // Add route errors, unioning if status code already exists
          for (const [code, routeSchema] of Object.entries(route)) {
            const statusCode = Number(code);
            const baseSchema = merged[statusCode];
            if (baseSchema) {
              // Both procedure and route define this status code - union the schemas
              merged[statusCode] = z.union([
                baseSchema,
                routeSchema as z.ZodTypeAny,
              ]) as z.ZodTypeAny;
            } else {
              // Only route defines this status code
              merged[statusCode] = routeSchema as z.ZodTypeAny;
            }
          }
          
          return merged;
        })()
      : undefined;
    const mergedConfig = {
      input: { ...this._baseConfig.input, ...config.input } as MergeInputConfig<
        TBaseInput,
        TInput
      >,
      output: config.output ?? this._baseConfig.output,
      errors: mergedErrors,
    };
    // Convert middleware types to match ProcedureBuilder's expected type
    const typedMiddleware = this._middleware.map((mw) =>
      mw as unknown as (opts: {
        ctx: TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext>;
        next: (opts?: {
          ctx: Partial<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext>>;
        }) => Promise<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext> | Response>;
      }) => Promise<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext> | Response>
    );
    const builder = new ProcedureBuilder<
      MergeInputConfig<TBaseInput, TInput>,
      TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
      MergeErrors<TBaseErrors, TErrors>,
      TCustomContext,
      TRouter
    >("GET", convertPathToHono(path), mergedConfig, targetRouter, typedMiddleware);
    return builder;
  }

  post<
    TPath extends string,
    TInput extends InputConfig,
    TOutput extends z.ZodTypeAny | undefined,
    TErrors extends Record<number, z.ZodTypeAny> | undefined,
  >(
    path: TPath,
    config: ProcedureConfig<TPath, TInput, TOutput, TErrors>,
    router?: TRouter & {
      register: (
        proc: Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      ) => void;
    },
  ): ProcedureBuilder<
    MergeInputConfig<TBaseInput, TInput>,
    TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
    MergeErrors<TBaseErrors, TErrors>,
    TCustomContext,
    TRouter
  > {
    const targetRouter = router ?? this.router;
    if (!targetRouter) {
      throw new Error("Procedure must be created from a router or a router must be provided");
    }
    // Merge errors: union schemas when status codes overlap
    const mergedErrors = config.errors || this._baseConfig.errors
      ? (() => {
          const base = this._baseConfig.errors || {};
          const route = config.errors || {};
          const merged: Record<number, z.ZodTypeAny> = {};
          
          // Add all base errors
          for (const [code, schema] of Object.entries(base)) {
            merged[Number(code)] = schema as z.ZodTypeAny;
          }
          
          // Add route errors, unioning if status code already exists
          for (const [code, routeSchema] of Object.entries(route)) {
            const statusCode = Number(code);
            const baseSchema = merged[statusCode];
            if (baseSchema) {
              // Both procedure and route define this status code - union the schemas
              merged[statusCode] = z.union([
                baseSchema,
                routeSchema as z.ZodTypeAny,
              ]) as z.ZodTypeAny;
            } else {
              // Only route defines this status code
              merged[statusCode] = routeSchema as z.ZodTypeAny;
            }
          }
          
          return merged;
        })()
      : undefined;
    const mergedConfig = {
      input: { ...this._baseConfig.input, ...config.input } as MergeInputConfig<
        TBaseInput,
        TInput
      >,
      output: config.output ?? this._baseConfig.output,
      errors: mergedErrors,
    };
    const typedMiddleware = this._middleware.map((mw) =>
      mw as unknown as (opts: {
        ctx: TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext>;
        next: (opts?: {
          ctx: Partial<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext>>;
        }) => Promise<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext> | Response>;
      }) => Promise<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext> | Response>
    );
    const builder = new ProcedureBuilder<
      MergeInputConfig<TBaseInput, TInput>,
      TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
      MergeErrors<TBaseErrors, TErrors>,
      TCustomContext,
      TRouter
    >("POST", convertPathToHono(path), mergedConfig, targetRouter, typedMiddleware);
    return builder;
  }

  put<
    TPath extends string,
    TInput extends InputConfig,
    TOutput extends z.ZodTypeAny | undefined,
    TErrors extends Record<number, z.ZodTypeAny> | undefined,
  >(
    path: TPath,
    config: ProcedureConfig<TPath, TInput, TOutput, TErrors>,
    router?: TRouter & {
      register: (
        proc: Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      ) => void;
    },
  ): ProcedureBuilder<
    MergeInputConfig<TBaseInput, TInput>,
    TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
    MergeErrors<TBaseErrors, TErrors>,
    TCustomContext,
    TRouter
  > {
    const targetRouter = router ?? this.router;
    if (!targetRouter) {
      throw new Error("Procedure must be created from a router or a router must be provided");
    }
    // Merge errors: union schemas when status codes overlap
    const mergedErrors = config.errors || this._baseConfig.errors
      ? (() => {
          const base = this._baseConfig.errors || {};
          const route = config.errors || {};
          const merged: Record<number, z.ZodTypeAny> = {};
          
          // Add all base errors
          for (const [code, schema] of Object.entries(base)) {
            merged[Number(code)] = schema as z.ZodTypeAny;
          }
          
          // Add route errors, unioning if status code already exists
          for (const [code, routeSchema] of Object.entries(route)) {
            const statusCode = Number(code);
            const baseSchema = merged[statusCode];
            if (baseSchema) {
              // Both procedure and route define this status code - union the schemas
              merged[statusCode] = z.union([
                baseSchema,
                routeSchema as z.ZodTypeAny,
              ]) as z.ZodTypeAny;
            } else {
              // Only route defines this status code
              merged[statusCode] = routeSchema as z.ZodTypeAny;
            }
          }
          
          return merged;
        })()
      : undefined;
    const mergedConfig = {
      input: { ...this._baseConfig.input, ...config.input } as MergeInputConfig<
        TBaseInput,
        TInput
      >,
      output: config.output ?? this._baseConfig.output,
      errors: mergedErrors,
    };
    const typedMiddleware = this._middleware.map((mw) =>
      mw as unknown as (opts: {
        ctx: TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext>;
        next: (opts?: {
          ctx: Partial<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext>>;
        }) => Promise<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext> | Response>;
      }) => Promise<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext> | Response>
    );
    const builder = new ProcedureBuilder<
      MergeInputConfig<TBaseInput, TInput>,
      TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
      MergeErrors<TBaseErrors, TErrors>,
      TCustomContext,
      TRouter
    >("PUT", convertPathToHono(path), mergedConfig, targetRouter, typedMiddleware);
    return builder;
  }

  patch<
    TPath extends string,
    TInput extends InputConfig,
    TOutput extends z.ZodTypeAny | undefined,
    TErrors extends Record<number, z.ZodTypeAny> | undefined,
  >(
    path: TPath,
    config: ProcedureConfig<TPath, TInput, TOutput, TErrors>,
    router?: TRouter & {
      register: (
        proc: Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      ) => void;
    },
  ): ProcedureBuilder<
    MergeInputConfig<TBaseInput, TInput>,
    TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
    MergeErrors<TBaseErrors, TErrors>,
    TCustomContext,
    TRouter
  > {
    const targetRouter = router ?? this.router;
    if (!targetRouter) {
      throw new Error("Procedure must be created from a router or a router must be provided");
    }
    // Merge errors: union schemas when status codes overlap
    const mergedErrors = config.errors || this._baseConfig.errors
      ? (() => {
          const base = this._baseConfig.errors || {};
          const route = config.errors || {};
          const merged: Record<number, z.ZodTypeAny> = {};
          
          // Add all base errors
          for (const [code, schema] of Object.entries(base)) {
            merged[Number(code)] = schema as z.ZodTypeAny;
          }
          
          // Add route errors, unioning if status code already exists
          for (const [code, routeSchema] of Object.entries(route)) {
            const statusCode = Number(code);
            const baseSchema = merged[statusCode];
            if (baseSchema) {
              // Both procedure and route define this status code - union the schemas
              merged[statusCode] = z.union([
                baseSchema,
                routeSchema as z.ZodTypeAny,
              ]) as z.ZodTypeAny;
            } else {
              // Only route defines this status code
              merged[statusCode] = routeSchema as z.ZodTypeAny;
            }
          }
          
          return merged;
        })()
      : undefined;
    const mergedConfig = {
      input: { ...this._baseConfig.input, ...config.input } as MergeInputConfig<
        TBaseInput,
        TInput
      >,
      output: config.output ?? this._baseConfig.output,
      errors: mergedErrors,
    };
    const typedMiddleware = this._middleware.map((mw) =>
      mw as unknown as (opts: {
        ctx: TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext>;
        next: (opts?: {
          ctx: Partial<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext>>;
        }) => Promise<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext> | Response>;
      }) => Promise<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext> | Response>
    );
    const builder = new ProcedureBuilder<
      MergeInputConfig<TBaseInput, TInput>,
      TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
      MergeErrors<TBaseErrors, TErrors>,
      TCustomContext,
      TRouter
    >("PATCH", convertPathToHono(path), mergedConfig, targetRouter, typedMiddleware);
    return builder;
  }

  delete<
    TPath extends string,
    TInput extends InputConfig,
    TOutput extends z.ZodTypeAny | undefined,
    TErrors extends Record<number, z.ZodTypeAny> | undefined,
  >(
    path: TPath,
    config: ProcedureConfig<TPath, TInput, TOutput, TErrors>,
    router?: TRouter & {
      register: (
        proc: Procedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      ) => void;
    },
  ): ProcedureBuilder<
    MergeInputConfig<TBaseInput, TInput>,
    TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
    MergeErrors<TBaseErrors, TErrors>,
    TCustomContext,
    TRouter
  > {
    const targetRouter = router ?? this.router;
    if (!targetRouter) {
      throw new Error("Procedure must be created from a router or a router must be provided");
    }
    // Merge errors: union schemas when status codes overlap
    const mergedErrors = config.errors || this._baseConfig.errors
      ? (() => {
          const base = this._baseConfig.errors || {};
          const route = config.errors || {};
          const merged: Record<number, z.ZodTypeAny> = {};
          
          // Add all base errors
          for (const [code, schema] of Object.entries(base)) {
            merged[Number(code)] = schema as z.ZodTypeAny;
          }
          
          // Add route errors, unioning if status code already exists
          for (const [code, routeSchema] of Object.entries(route)) {
            const statusCode = Number(code);
            const baseSchema = merged[statusCode];
            if (baseSchema) {
              // Both procedure and route define this status code - union the schemas
              merged[statusCode] = z.union([
                baseSchema,
                routeSchema as z.ZodTypeAny,
              ]) as z.ZodTypeAny;
            } else {
              // Only route defines this status code
              merged[statusCode] = routeSchema as z.ZodTypeAny;
            }
          }
          
          return merged;
        })()
      : undefined;
    const mergedConfig = {
      input: { ...this._baseConfig.input, ...config.input } as MergeInputConfig<
        TBaseInput,
        TInput
      >,
      output: config.output ?? this._baseConfig.output,
      errors: mergedErrors,
    };
    const typedMiddleware = this._middleware.map((mw) =>
      mw as unknown as (opts: {
        ctx: TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext>;
        next: (opts?: {
          ctx: Partial<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext>>;
        }) => Promise<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext> | Response>;
      }) => Promise<TypedContext<MergeInputConfig<TBaseInput, TInput>, MergeErrors<TBaseErrors, TErrors>, TCustomContext> | Response>
    );
    const builder = new ProcedureBuilder<
      MergeInputConfig<TBaseInput, TInput>,
      TOutput extends z.ZodTypeAny ? TOutput : TBaseOutput,
      MergeErrors<TBaseErrors, TErrors>,
      TCustomContext,
      TRouter
    >("DELETE", convertPathToHono(path), mergedConfig, targetRouter, typedMiddleware);
    return builder;
  }
}

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
    | Promise<InferOutput<NonNullable<TOutput>>>
    | InferOutput<NonNullable<TOutput>>;
  private _middleware: Array<
    (opts: {
      ctx: TypedContext<TInput, TErrors, TCustomContext>;
      next: () => Promise<
        TypedContext<TInput, TErrors, TCustomContext> | Response
      >;
    }) => Promise<TypedContext<TInput, TErrors, TCustomContext> | Response>
  > = [];
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
    initialMiddleware?: Array<
      (opts: {
        ctx: TypedContext<TInput, TErrors, TCustomContext>;
        next: (opts?: {
          ctx: Partial<TypedContext<TInput, TErrors, TCustomContext>>;
        }) => Promise<TypedContext<TInput, TErrors, TCustomContext> | Response>;
      }) => Promise<TypedContext<TInput, TErrors, TCustomContext> | Response>
    >,
  ) {
    this._config = config;
    if (initialMiddleware) {
      this._middleware = [...initialMiddleware];
    }
  }

  use(
    middleware: (opts: {
      ctx: TypedContext<TInput, TErrors, TCustomContext>;
      next: (opts?: {
        ctx: Partial<TypedContext<TInput, TErrors, TCustomContext>>;
      }) => Promise<TypedContext<TInput, TErrors, TCustomContext> | Response>;
    }) => Promise<TypedContext<TInput, TErrors, TCustomContext> | Response>,
  ): this {
    this._middleware.push(middleware);
    return this;
  }

  handler(
    fn: (
      ctx: TypedContext<TInput, TErrors, TCustomContext>,
    ) =>
      | Promise<InferOutput<NonNullable<TOutput>>>
      | InferOutput<NonNullable<TOutput>>,
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
      middleware: this._middleware,
    };
  }
}
