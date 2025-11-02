import type { Context } from "hono";
import type { z } from "zod";

export type InferOutput<T extends z.ZodTypeAny> = z.infer<T>;

export type InferErrorSchemas<T extends Record<number, z.ZodTypeAny>> = {
  [K in keyof T]: z.infer<T[K]>;
};

export type ErrorUnion<T extends Record<number, z.ZodTypeAny>> =
  InferErrorSchemas<T>[keyof InferErrorSchemas<T>];

export type AcceptsStringInput<T extends z.ZodTypeAny> =
  z.input<T> extends string
    ? T
    : z.input<T> extends Record<string, unknown>
      ? keyof z.input<T> extends never
        ? T
        : {
              [K in keyof z.input<T>]: string extends z.input<T>[K]
                ? true
                : z.input<T>[K] extends string | undefined
                  ? true
                  : false;
            }[keyof z.input<T>] extends true
          ? T
          : never
      : never;

export type ExtractPathParams<T extends string> =
  T extends `${string}{${infer Param}}${infer Rest}`
    ? Param extends `${infer Key}`
      ? Key | ExtractPathParams<Rest>
      : ExtractPathParams<Rest>
    : never;

export type RequireParamsForPath<
  TPath extends string,
  TParams extends z.ZodTypeAny | undefined,
> =
  ExtractPathParams<TPath> extends never
    ? TParams
    : TParams extends z.ZodTypeAny
      ? ExtractPathParams<TPath> extends keyof z.infer<TParams>
        ? TParams
        : never
      : never;

export interface InputConfig {
  params?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  body?: z.ZodTypeAny;
}

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

export type InferInput<T extends InputConfig> = (T extends { params: infer P }
  ? P extends z.ZodTypeAny
    ? z.infer<P>
    : {}
  : {}) &
  (T extends { query: infer Q }
    ? Q extends z.ZodTypeAny
      ? z.infer<Q>
      : {}
    : {}) &
  (T extends { body: infer B }
    ? B extends z.ZodTypeAny
      ? z.infer<B>
      : {}
    : {});

export interface BaseContext {
  hono: Context;
}

export type TypedContext<
  TInput extends InputConfig,
  TErrors extends Record<number, z.ZodTypeAny> | undefined,
  TCustomContext extends Record<string, unknown> = Record<string, never>,
> = BaseContext &
  TCustomContext & {
    input: InferInput<TInput>;
    error: TErrors extends Record<number, z.ZodTypeAny>
      ? (error: ErrorUnion<TErrors>) => never
      : never;
  };

export type Middleware<
  TContextIn extends BaseContext,
  TContextOut extends BaseContext = TContextIn,
> = (opts: {
  ctx: TContextIn;
  next: (opts?: {
    ctx: Partial<TContextOut>;
  }) => Promise<TContextOut | Response>;
}) => Promise<TContextOut | Response>;

/**
 * Helper function to create middleware with proper context typing.
 * Eliminates the need for type assertions when using middleware with routers.
 *
 * @example
 * ```typescript
 * const requireAuth = createMiddleware<AppContext>(async ({ ctx, next }) => {
 *   // ctx is automatically typed as BaseContext & AppContext
 *   if (!ctx.user) {
 *     return ctx.hono.json({ error: "Unauthorized" }, 401) as Response;
 *   }
 *   return next();
 * });
 *
 * const router = createRouter<AppContext>()
 *   .use(requireAuth)
 *   .get("/profile", { ... })
 * ```
 */
export function createMiddleware<
  TCustomContext extends Record<string, unknown>,
>(
  middleware: Middleware<
    BaseContext & TCustomContext,
    BaseContext & TCustomContext
  >,
): Middleware<BaseContext, BaseContext> {
  return middleware as unknown as Middleware<BaseContext, BaseContext>;
}
