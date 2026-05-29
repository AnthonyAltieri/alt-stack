export {
  createAltFileRoute,
  defineServerRoute,
  generateOpenAPISpecFromServerRoutes,
} from "./server.js";
export type {
  AltStackFileRoute,
  AltStackFileRouteMetadata,
  CreateTanStackRouteHandlersOptions,
  DefinedTanStackServerRoute,
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
} from "@alt-stack/server-core";
