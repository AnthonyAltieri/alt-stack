import type { z } from "zod";
import { ApiClient, type ApiClientValidationErrorHandler, type Logger } from "@alt-stack/http-client-core";
import { FetchExecutor, type FetchExecutorOptions } from "./executor.js";

/**
 * Options for creating a fetch-based API client
 */
export interface FetchClientOptions<
  TRequest extends Record<string, Record<string, unknown>>,
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
> {
  baseUrl: string;
  headers?: Record<string, unknown>;
  Request: TRequest;
  Response: TResponse;
  /**
   * Called when Zod validation fails for request or response data.
   */
  onValidationError?: ApiClientValidationErrorHandler<Response>;
  /**
   * Optional logger used for internal client logging.
   */
  logger?: Logger;
  /**
   * Additional fetch options to pass to every request.
   * Useful for credentials, cache, mode, etc.
   */
  fetchOptions?: FetchExecutorOptions["fetchOptions"];
}

/**
 * Type alias for the fetch-based API client.
 * The raw response type is the native Response object.
 */
export type FetchApiClient<
  TRequest extends Record<string, Record<string, unknown>>,
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
> = ApiClient<TRequest, TResponse, Response>;

/**
 * Creates a type-safe API client using native fetch.
 *
 * @example
 * ```typescript
 * import { createApiClient } from "@alt-stack/http-client-fetch";
 * import { Request, Response } from "./generated-types.js";
 *
 * const client = createApiClient({
 *   baseUrl: "https://api.example.com",
 *   Request,
 *   Response,
 *   fetchOptions: { credentials: "include" },
 * });
 *
 * const result = await client.get("/users/{id}", { params: { id: "123" } });
 *
 * if (result.success) {
 *   console.log(result.body);
 *   // Access raw Response if needed
 *   console.log(result.raw.headers.get("x-request-id"));
 * }
 * ```
 */
export function createApiClient<
  TRequest extends Record<string, Record<string, unknown>>,
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
>(options: FetchClientOptions<TRequest, TResponse>): FetchApiClient<TRequest, TResponse> {
  const executor = new FetchExecutor({ fetchOptions: options.fetchOptions });

  return new ApiClient({
    baseUrl: options.baseUrl,
    headers: options.headers,
    Request: options.Request,
    Response: options.Response,
    onValidationError: options.onValidationError,
    logger: options.logger,
    executor,
  });
}
