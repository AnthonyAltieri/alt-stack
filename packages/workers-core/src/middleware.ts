import type { z } from "zod";
import type { Result, ResultError } from "@alt-stack/result";
import { ok as resultOk, err as resultErr, isOk, isErr } from "@alt-stack/result";

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
 * Success result from middleware execution with typed context override.
 * Used by MiddlewareFunctionWithErrors to wrap success in Result type.
 * @internal
 */
export interface MiddlewareResultSuccess<TContextOverride> {
  readonly marker: MiddlewareMarker;
  ctx: TContextOverride;
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

// ============================================================================
// Middleware with Errors (Result-based)
// ============================================================================

/**
 * Middleware function type that can return errors via Result type.
 * For Workers, errors use string codes instead of HTTP status codes.
 */
export type MiddlewareFunctionWithErrors<
  TContext,
  TContextOverridesIn,
  $ContextOverridesOut,
  $ErrorsOut extends Record<string, z.ZodTypeAny>,
> = (opts: {
  ctx: Overwrite<TContext, TContextOverridesIn>;
  next: {
    (): Promise<Result<MiddlewareResultSuccess<TContextOverridesIn>, any>>;
    <$ContextOverride>(opts: {
      ctx: $ContextOverride;
    }): Promise<Result<MiddlewareResultSuccess<$ContextOverride>, any>>;
  };
}) => Promise<Result<MiddlewareResultSuccess<$ContextOverridesOut>, ResultError>>;

/**
 * Any middleware function with errors (type-erased for runtime)
 */
export type AnyMiddlewareFunctionWithErrors = MiddlewareFunctionWithErrors<any, any, any, any>;

/**
 * Staged middleware builder after errors() called, awaiting fn()
 */
export interface MiddlewareBuilderWithErrorsStaged<
  TContext,
  TContextOverrides,
  TErrors extends Record<string, z.ZodTypeAny>,
> {
  fn<$ContextOverridesOut>(
    fn: MiddlewareFunctionWithErrors<TContext, TContextOverrides, $ContextOverridesOut, TErrors>,
  ): MiddlewareBuilderWithErrors<TContext, $ContextOverridesOut, TErrors>;
}

/**
 * Middleware builder that includes error definitions.
 */
export interface MiddlewareBuilderWithErrors<
  TContext,
  TContextOverrides,
  TErrors extends Record<string, z.ZodTypeAny> = {},
> {
  errors<$Errors extends Record<string, z.ZodTypeAny>>(
    errors: $Errors,
  ): MiddlewareBuilderWithErrorsStaged<TContext, TContextOverrides, TErrors & $Errors>;

  /** @internal */
  _errors: TErrors;

  /** @internal */
  _fn: AnyMiddlewareFunctionWithErrors | null;
}

export type AnyMiddlewareBuilderWithErrors = MiddlewareBuilderWithErrors<any, any, any>;

/**
 * Create middleware builder that can return typed errors via Result pattern.
 * For Workers, errors use string codes (e.g., "INVALID_JOB") instead of HTTP status codes.
 *
 * @example
 * ```typescript
 * const authMiddleware = createMiddlewareWithErrors<AppContext>()
 *   .errors({
 *     UNAUTHORIZED: z.object({
 *       code: z.literal("UNAUTHORIZED"),
 *       message: z.string()
 *     }),
 *   })
 *   .fn(async ({ ctx, next }) => {
 *     if (!ctx.user) {
 *       return err({
 *         data: { code: "UNAUTHORIZED" as const, message: "Authentication required" },
 *       });
 *     }
 *     return next({ ctx: { user: ctx.user } });
 *   });
 * ```
 */
export function createMiddlewareWithErrors<TContext>(): {
  errors<$Errors extends Record<string, z.ZodTypeAny>>(
    errors: $Errors,
  ): MiddlewareBuilderWithErrorsStaged<TContext, object, $Errors>;
} {
  return {
    errors<$Errors extends Record<string, z.ZodTypeAny>>(
      errors: $Errors,
    ): MiddlewareBuilderWithErrorsStaged<TContext, object, $Errors> {
      return {
        fn<$ContextOverridesOut>(
          fn: MiddlewareFunctionWithErrors<TContext, object, $ContextOverridesOut, $Errors>,
        ): MiddlewareBuilderWithErrors<TContext, $ContextOverridesOut, $Errors> {
          return createMiddlewareBuilderWithErrorsImpl<TContext, $ContextOverridesOut, $Errors>(
            errors,
            fn as AnyMiddlewareFunctionWithErrors,
          );
        },
      };
    },
  };
}

function createMiddlewareBuilderWithErrorsImpl<
  TContext,
  TContextOverrides,
  TErrors extends Record<string, z.ZodTypeAny>,
>(
  errors: TErrors,
  fn: AnyMiddlewareFunctionWithErrors,
): MiddlewareBuilderWithErrors<TContext, TContextOverrides, TErrors> {
  return {
    _errors: errors,
    _fn: fn,

    errors<$Errors extends Record<string, z.ZodTypeAny>>(
      newErrors: $Errors,
    ): MiddlewareBuilderWithErrorsStaged<TContext, TContextOverrides, TErrors & $Errors> {
      const mergedErrors = { ...errors, ...newErrors } as TErrors & $Errors;
      return {
        fn<$NewContextOverridesOut>(
          newFn: MiddlewareFunctionWithErrors<
            TContext,
            TContextOverrides,
            $NewContextOverridesOut,
            TErrors & $Errors
          >,
        ): MiddlewareBuilderWithErrors<TContext, $NewContextOverridesOut, TErrors & $Errors> {
          return createMiddlewareBuilderWithErrorsImpl<
            TContext,
            $NewContextOverridesOut,
            TErrors & $Errors
          >(mergedErrors, newFn as AnyMiddlewareFunctionWithErrors);
        },
      };
    },
  };
}

/**
 * Helper to create a successful middleware result with context for next()
 * @internal
 */
export function middlewareOk<TCtx>(ctx: TCtx): Result<MiddlewareResultSuccess<TCtx>, never> {
  return resultOk({ marker: middlewareMarker, ctx });
}

export { resultOk, resultErr, isOk, isErr };
