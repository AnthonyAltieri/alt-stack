/**
 * Overwrites properties in TType with properties from TWith
 * Used to merge context types when middleware narrows context
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
 * Result wrapper for middleware execution
 * Ensures all middleware passes through next()'s result
 * @internal
 */
export interface MiddlewareResult<_TContextOverride> {
  readonly marker: MiddlewareMarker;
  ok: true;
  data: unknown;
}

/**
 * Middleware function type with proper context override inference
 *
 * Following tRPC's pattern with overloaded next() signatures:
 * - TContext: Base context type
 * - TContextOverridesIn: Context modifications from previous middleware
 * - $ContextOverridesOut: Context modifications this middleware produces
 *
 * The overloaded next() allows TypeScript to infer the override type from usage.
 *
 * @example
 * ```typescript
 * const authMiddleware: MiddlewareFunction<AppContext, object, { user: User }> = async (opts) => {
 *   const { ctx, next } = opts;
 *   if (!ctx.user) {
 *     throw new Error("Unauthorized");
 *   }
 *   return next({ ctx: { user: ctx.user } });
 * };
 * ```
 */
export type MiddlewareFunction<TContext, TContextOverridesIn, $ContextOverridesOut> = (opts: {
  ctx: Overwrite<TContext, TContextOverridesIn>;
  next: {
    (): Promise<MiddlewareResult<TContextOverridesIn>>;
    <$ContextOverride>(opts: {
      ctx?: $ContextOverride;
    }): Promise<MiddlewareResult<$ContextOverride>>;
  };
}) => Promise<MiddlewareResult<$ContextOverridesOut>>;

/**
 * Builder for composing middleware chains with proper type inference
 * Allows creating reusable middleware chains that can be piped together
 *
 * @example
 * ```typescript
 * const authChain = createMiddleware<AppContext>()
 *   .pipe(validateSession)
 *   .pipe(loadUser);
 *
 * const procedure = builder.use(authChain);
 * ```
 */
export interface MiddlewareBuilder<TContext, TContextOverrides> {
  /**
   * Compose another middleware or builder into this chain
   */
  pipe<$ContextOverridesOut>(
    fn:
      | MiddlewareFunction<TContext, TContextOverrides, $ContextOverridesOut>
      | MiddlewareBuilder<Overwrite<TContext, TContextOverrides>, $ContextOverridesOut>,
  ): MiddlewareBuilder<TContext, Overwrite<TContextOverrides, $ContextOverridesOut>>;

  /**
   * Internal array of middleware functions in this chain
   * @internal
   */
  _middlewares: MiddlewareFunction<TContext, TContextOverrides, object>[];
}

export type AnyMiddlewareFunction = MiddlewareFunction<any, any, any>;
export type AnyMiddlewareBuilder = MiddlewareBuilder<any, any>;

/**
 * Factory for creating middleware builders
 * @internal
 */
function createMiddlewareFactory<TContext>() {
  function createMiddlewareInner(middlewares: AnyMiddlewareFunction[]): AnyMiddlewareBuilder {
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
 * Create a middleware builder for a specific context type
 * Use this to build reusable middleware chains with proper type inference
 *
 * @example
 * ```typescript
 * interface AppContext {
 *   logger: Logger;
 * }
 *
 * const middleware = createMiddleware<AppContext>();
 *
 * const loggingMiddleware = middleware(async ({ ctx, next }) => {
 *   ctx.logger.log("Processing message");
 *   return next();
 * });
 * ```
 */
export function createMiddleware<TContext>() {
  return createMiddlewareFactory<TContext>();
}
