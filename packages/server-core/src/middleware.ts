import type { BaseContext } from "./types/context.js";

/**
 * Overwrites properties in TType with properties from TWith
 * This is used to merge context types when middleware narrows context
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
 *   // TypeScript infers { user: User } from this call
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
      | MiddlewareBuilder<
          Overwrite<TContext, TContextOverrides>,
          $ContextOverridesOut
        >,
  ): MiddlewareBuilder<
    TContext,
    Overwrite<TContextOverrides, $ContextOverridesOut>
  >;

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
 * Create a middleware builder for a specific context type
 * Use this to build reusable middleware chains with proper type inference
 *
 * @example
 * ```typescript
 * interface AppContext {
 *   user: User | null;
 * }
 *
 * const middleware = createMiddleware<AppContext>();
 *
 * const authMiddleware = middleware(async ({ ctx, next }) => {
 *   if (!ctx.user) {
 *     throw new Error("Unauthorized");
 *   }
 *   return next({ ctx: { user: ctx.user } });
 * });
 * ```
 */
export function createMiddleware<TContext>() {
  return createMiddlewareFactory<TContext>();
}

/**
 * Legacy middleware type for router-level middleware
 * This type doesn't provide the same level of type inference
 * @deprecated Use MiddlewareFunction and createMiddleware instead
 */
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
 * const requireAuth = createLegacyMiddleware<AppContext>(async ({ ctx, next }) => {
 *   // ctx is automatically typed as BaseContext & AppContext
 *   if (!ctx.user) {
 *     throw new Error("Unauthorized");
 *   }
 *   return next();
 * });
 *
 * const router = createRouter<AppContext>()
 *   .use(requireAuth)
 *   .get("/profile", { ... })
 * ```
 * @deprecated Use createMiddleware instead
 */
export function createLegacyMiddleware<TCustomContext extends object>(
  middleware: Middleware<
    BaseContext & TCustomContext,
    BaseContext & TCustomContext
  >,
): Middleware<BaseContext, BaseContext> {
  return middleware as unknown as Middleware<BaseContext, BaseContext>;
}

