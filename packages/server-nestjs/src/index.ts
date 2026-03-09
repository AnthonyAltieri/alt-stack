import {
  Router as BaseRouter,
  router as baseRouter,
  createRouter as baseCreateRouter,
  mergeRouters as baseMergeRouters,
  init as baseInit,
} from "@alt-stack/server-core";
import type { InitOptions, InitResult } from "@alt-stack/server-core";
import type { NestBaseContext } from "./types.js";

export {
  publicProcedure,
  default400ErrorSchema,
  default500ErrorSchema,
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
  createMiddleware,
  createMiddlewareWithErrors,
  middlewareMarker,
  middlewareOk,
  BaseProcedureBuilder,
  ProcedureBuilder,
  generateOpenAPISpec,
  validateInput,
  parseSchema,
  mergeInputs,
  resolveTelemetryConfig,
  shouldIgnoreRoute,
  initTelemetry,
  createRequestSpan,
  endSpanWithError,
  setSpanOk,
  withActiveSpan,
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

export { registerAltStack } from "./register.js";
export type {
  NestAppLike,
  RegisterAltStackOptions,
  RegisterAltStackDocsOptions,
} from "./register.js";
export { createNestMiddleware } from "./middleware.js";
export type { CreateNestMiddlewareOptions } from "./middleware.js";
export type { NestBaseContext, NestServiceLocator } from "./types.js";

export function init<TCustomContext extends object = Record<string, never>>(
  options?: InitOptions<NestBaseContext & TCustomContext>,
): InitResult<NestBaseContext & TCustomContext, typeof options> {
  return baseInit<NestBaseContext & TCustomContext>(
    options as InitOptions<any>,
  ) as InitResult<NestBaseContext & TCustomContext, typeof options>;
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
