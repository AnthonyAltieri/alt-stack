// Re-export Result utilities from @alt-stack/result for convenience
export {
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
} from "@alt-stack/result";
export type { Result, Ok, Err, InferMessageErrors, TaggedError } from "@alt-stack/result";

// Router exports
export {
  createWorkerRouter,
  mergeWorkerRouters,
  workerRouter,
  WorkerRouter,
} from "./router.js";

// Procedure builder exports
export { BaseWorkerProcedureBuilder } from "./procedure-builder.js";

// Init exports
export { init, publicProcedure } from "./init.js";
export type { InitOptions, InitResult } from "./init.js";

// Error exports
export * from "./errors.js";

// Middleware exports
export { createMiddleware, createMiddlewareWithErrors, middlewareMarker, middlewareOk } from "./middleware.js";
export type {
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
  AnyMiddlewareFunction,
  AnyMiddlewareBuilder,
} from "./middleware.js";

// Type exports
export type * from "./types/index.js";

// Validation exports
export { validateInput, parseSchema } from "./validation.js";
export type { ParseResult } from "./validation.js";

// AsyncAPI exports
export { generateAsyncAPISpec } from "./asyncapi.js";
export type {
  AsyncAPISpec,
  AsyncAPIChannel,
  AsyncAPIOperation,
  AsyncAPIMessage,
  GenerateAsyncAPISpecOptions,
  ExtractJobNames,
  ExtractPayloadType,
} from "./asyncapi.js";
