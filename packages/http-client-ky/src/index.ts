// Client factory
export { createApiClient } from "./client.js";
export type { KyClientOptions, KyApiClient, KyInstance, KyOptions, KyResponse } from "./client.js";

// Executor
export { KyExecutor } from "./executor.js";
export type { KyExecutorOptions } from "./executor.js";

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

