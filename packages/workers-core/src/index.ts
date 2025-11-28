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
export { createMiddleware, middlewareMarker } from "./middleware.js";
export type {
  MiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareResult,
  Overwrite,
  AnyMiddlewareFunction,
  AnyMiddlewareBuilder,
} from "./middleware.js";

// Type exports
export type * from "./types/index.js";

// Validation exports
export { validateInput, parseSchema } from "./validation.js";
export type { ParseResult } from "./validation.js";
