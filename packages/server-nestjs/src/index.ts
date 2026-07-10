import {
  Router as BaseRouter,
  router as baseRouter,
  createRouter as baseCreateRouter,
  combineRouters as baseCombineRouters,
  init as baseInit,
} from "@alt-stack/server-core";
import type {
  InitOptions,
  InitResult,
  RouteSignaturesForConfig,
  RouterRouteSignatures,
  ValidateRouterCombination,
  ValidateRouterConfig,
} from "@alt-stack/server-core";
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
  HttpMethod,
  Procedure,
  ReadyProcedure,
  PendingProcedure,
  RouteSignature,
  RouteSignaturesForConfig,
  RouterContext,
  RouterConfigValue,
  RouterRouteSignatures,
  ValidateRouterCombination,
  ValidateRouterConfig,
} from "@alt-stack/server-core";

export { registerAltStack } from "./register.js";
export type {
  NestAppLike,
  NestCorsOptions,
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
  TRouteSignatures extends string = string,
> extends BaseRouter<TCustomContext, TRouteSignatures> {}

export function router<
  TCustomContext extends NestBaseContext = NestBaseContext,
  const TConfig extends Record<string, unknown> = Record<string, unknown>,
>(
  config: TConfig & ValidateRouterConfig<TConfig, TCustomContext>,
): Router<TCustomContext, RouteSignaturesForConfig<TConfig>> {
  return baseRouter<TCustomContext, TConfig>(config) as Router<
    TCustomContext,
    RouteSignaturesForConfig<TConfig>
  >;
}

export function createRouter<TCustomContext extends NestBaseContext = NestBaseContext>(
  config?: Record<string, Router<TCustomContext>>,
): Router<TCustomContext> {
  return baseCreateRouter<TCustomContext>(config) as Router<TCustomContext>;
}

export function combineRouters<
  TCustomContext extends NestBaseContext,
  const TRouters extends readonly [
    Router<TCustomContext, string>,
    ...Router<TCustomContext, string>[],
  ],
>(
  ...routers: TRouters & ValidateRouterCombination<TRouters>
): Router<TCustomContext, RouterRouteSignatures<TRouters[number]>> {
  const combine = baseCombineRouters as unknown as (
    ...items: Router<TCustomContext, string>[]
  ) => Router<TCustomContext, RouterRouteSignatures<TRouters[number]>>;
  return combine(...routers);
}
