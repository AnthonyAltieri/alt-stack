/**
 * Overwrites properties in TType with properties from TWith.
 * Used to merge context types when middleware narrows context.
 */
export type Overwrite<TType, TWith> = TWith extends object
  ? Omit<TType, keyof TWith> & TWith
  : TType;

/**
 * Marker to ensure middleware properly chains through next()
 * @internal
 */
export const middlewareMarker = "middlewareMarker" as "middlewareMarker" & {
  __brand: "middlewareMarker";
};

type MiddlewareMarker = typeof middlewareMarker;

/**
 * Result wrapper for middleware execution.
 * Ensures all middleware passes through next()'s result.
 * @internal
 */
export interface MiddlewareResult<_TContextOverride> {
  readonly marker: MiddlewareMarker;
  ok: true;
  data: unknown;
}

/**
 * Middleware function type with proper context override inference.
 *
 * @example
 * ```typescript
 * const authMiddleware: MiddlewareFunction<AppContext, object, { user: User }> = async (opts) => {
 *   const { ctx, next } = opts;
 *   if (!ctx.user) throw new Error("Unauthorized");
 *   return next({ ctx: { user: ctx.user } });
 * };
 * ```
 */
export type MiddlewareFunction<
  TContext,
  TContextOverridesIn,
  $ContextOverridesOut,
> = (opts: {
  ctx: Overwrite<TContext, TContextOverridesIn>;
  next: {
    (): Promise<MiddlewareResult<TContextOverridesIn>>;
    <$ContextOverride>(opts: {
      ctx?: $ContextOverride;
    }): Promise<MiddlewareResult<$ContextOverride>>;
  };
}) => Promise<MiddlewareResult<$ContextOverridesOut>>;

/**
 * Builder for composing middleware chains with proper type inference.
 */
export interface MiddlewareBuilder<TContext, TContextOverrides> {
  pipe<$ContextOverridesOut>(
    fn:
      | MiddlewareFunction<TContext, TContextOverrides, $ContextOverridesOut>
      | MiddlewareBuilder<
          Overwrite<TContext, TContextOverrides>,
          $ContextOverridesOut
        >,
  ): MiddlewareBuilder<
    TContext,
    Overwrite<TContextOverrides, $ContextOverridesOut>
  >;

  /** @internal */
  _middlewares: MiddlewareFunction<TContext, TContextOverrides, object>[];
}

export type AnyMiddlewareFunction = MiddlewareFunction<any, any, any>;
export type AnyMiddlewareBuilder = MiddlewareBuilder<any, any>;

function createMiddlewareFactory<TContext>() {
  function createMiddlewareInner(
    middlewares: AnyMiddlewareFunction[],
  ): AnyMiddlewareBuilder {
    return {
      _middlewares: middlewares,
      pipe(middlewareBuilderOrFn) {
        const pipedMiddleware =
          "_middlewares" in middlewareBuilderOrFn
            ? middlewareBuilderOrFn._middlewares
            : [middlewareBuilderOrFn];
        return createMiddlewareInner([...middlewares, ...pipedMiddleware]);
      },
    };
  }

  function createMiddleware<$ContextOverrides>(
    fn: MiddlewareFunction<TContext, object, $ContextOverrides>,
  ): MiddlewareBuilder<TContext, $ContextOverrides> {
    return createMiddlewareInner([fn]);
  }

  return createMiddleware;
}

/**
 * Create a middleware builder for a specific context type.
 *
 * @example
 * ```typescript
 * const middleware = createMiddleware<AppContext>();
 *
 * const loggingMiddleware = middleware(async ({ ctx, next }) => {
 *   console.log(`Starting job: ${ctx.jobName}`);
 *   const result = await next();
 *   console.log(`Finished job: ${ctx.jobName}`);
 *   return result;
 * });
 * ```
 */
export function createMiddleware<TContext>() {
  return createMiddlewareFactory<TContext>();
}
