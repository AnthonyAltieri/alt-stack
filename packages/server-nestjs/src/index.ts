import {
  Router as BaseRouter,
  router as baseRouter,
  createRouter as baseCreateRouter,
  mergeRouters as baseMergeRouters,
  init as baseInit,
} from "@alt-stack/server-core";
import type { InitOptions, InitResult } from "@alt-stack/server-core";
import type { NestBaseContext } from "./types.js";

// Re-export everything from server-core except Router/router/createRouter/mergeRouters/init (which we override)
export {
  // Init
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
  withActiveSpan,
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
  InitOptions,
  InitResult,
} from "@alt-stack/server-core";

export { registerAltStack } from "./register.js";
export type { NestAppLike, RegisterAltStackOptions, RegisterAltStackDocsOptions } from "./register.js";
export type { NestBaseContext, NestServiceLocator } from "./types.js";
export { createNestMiddleware } from "./middleware.js";
export type { CreateNestMiddlewareOptions } from "./middleware.js";

export function init<TCustomContext extends object = Record<string, never>>(
  options?: InitOptions<NestBaseContext & TCustomContext>,
): InitResult<NestBaseContext & TCustomContext, typeof options> {
  return baseInit<NestBaseContext & TCustomContext>(options as InitOptions<any>) as any;
}

export class Router<
  TCustomContext extends NestBaseContext = NestBaseContext,
> extends BaseRouter<TCustomContext> {}

export function router<TCustomContext extends NestBaseContext = NestBaseContext>(
  config: Parameters<typeof baseRouter<TCustomContext>>[0],
): Router<TCustomContext> {
  return baseRouter<TCustomContext>(config) as Router<TCustomContext>;
}

export function createRouter<TCustomContext extends NestBaseContext = NestBaseContext>(
  config?: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
): Router<TCustomContext> {
  return baseCreateRouter<TCustomContext>(config) as Router<TCustomContext>;
}

export function mergeRouters<TCustomContext extends NestBaseContext = NestBaseContext>(
  ...routers: Router<TCustomContext>[]
): Router<TCustomContext> {
  return baseMergeRouters<TCustomContext>(...routers) as Router<TCustomContext>;
}
