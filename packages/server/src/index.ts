// Main export file
export { createRouter, mergeRouters, Router, router } from "./router.js";
export { createServer } from "./server.js";
export { init, publicProcedure, default400ErrorSchema, default500ErrorSchema } from "./init.js";
export type { InitOptions, InitResult } from "./init.js";
export * from "./errors.js";
export { createMiddleware } from "./middleware.js";
export type {
  Middleware,
  MiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareResult,
  Overwrite,
} from "./middleware.js";
export type * from "./types/index.js";
export { BaseProcedureBuilder, ProcedureBuilder } from "./procedure-builder.js";
export { generateOpenAPISpec, createDocsRouter } from "./openapi.js";
export type {
  OpenAPISpec,
  GenerateOpenAPISpecOptions,
  CreateDocsRouterOptions,
} from "./openapi.js";
