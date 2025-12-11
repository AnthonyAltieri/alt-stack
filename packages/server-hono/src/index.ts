import {
  Router as BaseRouter,
  router as baseRouter,
  createRouter as baseCreateRouter,
  mergeRouters as baseMergeRouters,
} from "@alt-stack/server-core";
import type { HonoBaseContext } from "./types.js";

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
  RouterConfigValue,
} from "@alt-stack/server-core";

// Pre-typed Router with Hono context baked in
export class Router<
  TCustomContext extends HonoBaseContext = HonoBaseContext,
> extends BaseRouter<TCustomContext> {}

/**
 * Pre-typed router function with Hono context as default.
 * Routes defined with this function will have `ctx.hono` properly typed.
 */
export function router<TCustomContext extends HonoBaseContext = HonoBaseContext>(
  config: Parameters<typeof baseRouter<TCustomContext>>[0],
): Router<TCustomContext> {
  return baseRouter<TCustomContext>(config) as Router<TCustomContext>;
}

/**
 * Pre-typed createRouter function with Hono context as default.
 */
export function createRouter<TCustomContext extends HonoBaseContext = HonoBaseContext>(
  config?: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
): Router<TCustomContext> {
  return baseCreateRouter<TCustomContext>(config) as Router<TCustomContext>;
}

/**
 * Pre-typed mergeRouters function with Hono context as default.
 */
export function mergeRouters<TCustomContext extends HonoBaseContext = HonoBaseContext>(
  ...routers: Router<TCustomContext>[]
): Router<TCustomContext> {
  return baseMergeRouters<TCustomContext>(...routers) as Router<TCustomContext>;
}

// Export Hono-specific functionality
export { createServer } from "./server.js";
export { createDocsRouter } from "./docs.js";
export type { CreateDocsRouterOptions } from "./docs.js";
export type { HonoBaseContext } from "./types.js";
