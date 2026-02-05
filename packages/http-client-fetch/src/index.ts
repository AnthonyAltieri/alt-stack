// Client factory
export { createApiClient } from "./client.js";
export type { FetchClientOptions, FetchApiClient } from "./client.js";

// Executor
export { FetchExecutor } from "./executor.js";
export type { FetchExecutorOptions } from "./executor.js";

// Re-export core types and errors
export {
  ApiClient,
  ApiClientError,
  UnexpectedApiClientError,
  ValidationError,
  TimeoutError,
} from "@alt-stack/http-client-core";

export type {
  ApiClientOptions,
  ApiClientValidationErrorLocation,
  ApiClientValidationErrorContext,
  ApiClientValidationErrorHandler,
  Logger,
  HttpExecutor,
  ExecuteRequest,
  ExecuteResponse,
  ExtractPathParams,
  ExtractRequestParams,
  ExtractRequestQuery,
  ExtractRequestBody,
  ParamsRequired,
  BodyRequired,
  EndpointsWithMethod,
  RequestOptions,
  RetryContext,
  ExtractStatusCodes,
  ExtractSuccessCodes,
  ExtractErrorCodes,
  ExtractResponseSchema,
  ExtractSuccessBody,
  SuccessResponse,
  ErrorResponse,
  UnexpectedErrorResponse,
  ApiResponse,
} from "@alt-stack/http-client-core";
