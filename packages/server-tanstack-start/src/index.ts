import type { TanStackBaseContext } from "./types.js";
import {
  Router as BaseRouter,
  createRouter as baseCreateRouter,
  mergeRouters as baseMergeRouters,
  router as baseRouter,
} from "@alt-stack/server-core";

export {
  createRequestHandler,
  createRouteHandlers,
  createServerRoute,
  Router,
} from "./server.js";
export type {
  CreateTanStackRouteHandlersOptions,
  TanStackRouteMethods,
} from "./server.js";
export {
  tanStackPathToOpenApiPath,
} from "./path.js";
export type {
  ExtractTanStackPathParams,
  TanStackPathToOpenApiPath,
} from "./path.js";
export type {
  TanStackBaseContext,
  TanStackHttpMethod,
  TanStackRouteParams,
  TanStackServerRoute,
  TanStackServerRouteHandler,
  TanStackServerRouteHandlerArgs,
} from "./types.js";

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

export function router<
  TCustomContext extends TanStackBaseContext = TanStackBaseContext,
>(
  config: Parameters<typeof baseRouter<TCustomContext>>[0],
): BaseRouter<TCustomContext> {
  return baseRouter<TCustomContext>(config);
}

export function createRouter<
  TCustomContext extends TanStackBaseContext = TanStackBaseContext,
>(
  config?: Record<
    string,
    BaseRouter<TCustomContext> | BaseRouter<TCustomContext>[]
  >,
): BaseRouter<TCustomContext> {
  return baseCreateRouter<TCustomContext>(config);
}

export function mergeRouters<
  TCustomContext extends TanStackBaseContext = TanStackBaseContext,
>(...routers: BaseRouter<TCustomContext>[]): BaseRouter<TCustomContext> {
  return baseMergeRouters<TCustomContext>(...routers);
}
