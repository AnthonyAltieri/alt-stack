// Main export file for server-core
export { createRouter, mergeRouters, Router, router } from "./router.js";
export { init, publicProcedure, default400ErrorSchema, default500ErrorSchema } from "./init.js";
export type { InitOptions, InitResult } from "./init.js";
export * from "./errors.js";
export { createMiddleware, middlewareMarker } from "./middleware.js";
export type {
  MiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareResult,
  Overwrite,
} from "./middleware.js";
export type * from "./types/index.js";
export { BaseProcedureBuilder, ProcedureBuilder } from "./procedure-builder.js";
export { generateOpenAPISpec } from "./openapi.js";
export type {
  OpenAPISpec,
  GenerateOpenAPISpecOptions,
  OpenAPIPathItem,
  OpenAPIOperation,
  OpenAPIParameter,
  OpenAPIRequestBody,
  OpenAPIResponse,
} from "./openapi.js";
export { validateInput, parseSchema, mergeInputs } from "./validation.js";
export type { ParseResult, StructuredInput } from "./validation.js";
export {
  resolveTelemetryConfig,
  shouldIgnoreRoute,
  initTelemetry,
  createRequestSpan,
  endSpanWithError,
  setSpanOk,
} from "./telemetry.js";
export type {
  TelemetryConfig,
  TelemetryOption,
  ResolvedTelemetryConfig,
  Span,
} from "./telemetry.js";

