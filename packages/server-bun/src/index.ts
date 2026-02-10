import {
  Router as BaseRouter,
  router as baseRouter,
  createRouter as baseCreateRouter,
  mergeRouters as baseMergeRouters,
} from "@alt-stack/server-core";
import type { BunBaseContext } from "./types.ts";

// Re-export everything from server-core except Router and router utilities (which we override)
export {
  // Init
  init,
  publicProcedure,
  default400ErrorSchema,
  default500ErrorSchema,
  // Result utilities
  ok,
  err,
  isOk,
  isErr,
  isResult,
  map,
  flatMap,
  mapError,
  catchError,
  unwrap,
  unwrapOr,
  unwrapOrElse,
  match,
  fold,
  tryCatch,
  tryCatchAsync,
  isResultError,
  assertResultError,
  ResultAggregateError,
  TaggedError,
  // Middleware
  createMiddleware,
  createMiddlewareWithErrors,
  middlewareMarker,
  middlewareOk,
  // Procedure builders
  BaseProcedureBuilder,
  ProcedureBuilder,
  // OpenAPI
  generateOpenAPISpec,
  // Validation
  validateInput,
  parseSchema,
  mergeInputs,
  // Telemetry
  resolveTelemetryConfig,
  shouldIgnoreRoute,
  initTelemetry,
  createRequestSpan,
  endSpanWithError,
  setSpanOk,
  // Error extraction
  extractTagsFromSchema,
  findHttpStatusForError,
} from "@alt-stack/server-core";

// Re-export all types from server-core
export type {
  Result,
  Ok,
  Err,
  ResultError,
  InferErrorTag,
  InferErrorTags,
  NarrowError,
  InitOptions,
  InitResult,
  MiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareResult,
  MiddlewareResultSuccess,
  MiddlewareFunctionWithErrors,
  MiddlewareBuilderWithErrors,
  MiddlewareBuilderWithErrorsStaged,
  AnyMiddlewareBuilderWithErrors,
  AnyMiddlewareFunctionWithErrors,
  Overwrite,
  OpenAPISpec,
  GenerateOpenAPISpecOptions,
  OpenAPIPathItem,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIRequestBody,
  OpenAPIResponse,
  ParseResult,
  StructuredInput,
  TelemetryConfig,
  TelemetryOption,
  ResolvedTelemetryConfig,
  Span,
  InputConfig,
  TypedContext,
  BaseContext,
  InferInput,
  Procedure,
  ReadyProcedure,
  PendingProcedure,
} from "@alt-stack/server-core";

// Pre-typed Router with Bun context baked in
export class Router<
  TCustomContext extends BunBaseContext = BunBaseContext,
> extends BaseRouter<TCustomContext> {}

/**
 * Pre-typed router function with Bun context as default.
 * Routes defined with this function will have `ctx.bun` properly typed.
 */
export function router<TCustomContext extends BunBaseContext = BunBaseContext>(
  config: Parameters<typeof baseRouter<TCustomContext>>[0],
): Router<TCustomContext> {
  return baseRouter<TCustomContext>(config) as Router<TCustomContext>;
}

/**
 * Pre-typed createRouter function with Bun context as default.
 */
export function createRouter<TCustomContext extends BunBaseContext = BunBaseContext>(
  config?: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
): Router<TCustomContext> {
  return baseCreateRouter<TCustomContext>(config) as Router<TCustomContext>;
}

/**
 * Pre-typed mergeRouters function with Bun context as default.
 */
export function mergeRouters<TCustomContext extends BunBaseContext = BunBaseContext>(
  ...routers: Router<TCustomContext>[]
): Router<TCustomContext> {
  return baseMergeRouters<TCustomContext>(...routers) as Router<TCustomContext>;
}

// Export Bun-specific functionality
export { createServer } from "./server.ts";
export { createDocsRouter } from "./docs.ts";
export type { CreateDocsRouterOptions } from "./docs.ts";
export type { BunBaseContext, BunServer } from "./types.ts";
