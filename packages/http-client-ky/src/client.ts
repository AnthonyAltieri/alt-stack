import type { z } from "zod";
import type { KyInstance, Options as KyOptions, KyResponse } from "ky";
import { ApiClient, type ApiClientValidationErrorHandler } from "@alt-stack/http-client-core";
import { KyExecutor, type KyExecutorOptions } from "./executor.js";

/**
 * Options for creating a ky-based API client
 */
export interface KyClientOptions<
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
  onValidationError?: ApiClientValidationErrorHandler<KyResponse>;
  /**
   * Use a custom ky instance.
   * Useful for pre-configured ky instances with hooks, defaults, etc.
   */
  ky?: KyInstance;
  /**
   * Additional ky options to pass to every request.
   * Useful for hooks, retry config, prefixUrl, etc.
   */
  kyOptions?: KyExecutorOptions["kyOptions"];
}

/**
 * Type alias for the ky-based API client.
 * The raw response type is the KyResponse object.
 */
export type KyApiClient<
  TRequest extends Record<string, Record<string, unknown>>,
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
> = ApiClient<TRequest, TResponse, KyResponse>;

/**
 * Creates a type-safe API client using ky.
 *
 * @example
 * ```typescript
 * import { createApiClient } from "@alt-stack/http-client-ky";
 * import { Request, Response } from "./generated-types.js";
 *
 * const client = createApiClient({
 *   baseUrl: "https://api.example.com",
 *   Request,
 *   Response,
 *   kyOptions: {
 *     hooks: {
 *       beforeRequest: [(request) => {
 *         console.log("Making request to:", request.url);
 *       }],
 *     },
 *   },
 * });
 *
 * const result = await client.get("/users/{id}", { params: { id: "123" } });
 *
 * if (result.success) {
 *   console.log(result.body);
 *   // Access raw KyResponse if needed
 *   console.log(result.raw.headers.get("x-request-id"));
 * }
 * ```
 */
export function createApiClient<
  TRequest extends Record<string, Record<string, unknown>>,
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
>(options: KyClientOptions<TRequest, TResponse>): KyApiClient<TRequest, TResponse> {
  const executor = new KyExecutor({
    ky: options.ky,
    kyOptions: options.kyOptions,
  });

  return new ApiClient({
    baseUrl: options.baseUrl,
    headers: options.headers,
    Request: options.Request,
    Response: options.Response,
    onValidationError: options.onValidationError,
    executor,
  });
}

// Re-export ky types for convenience
export type { KyInstance, KyOptions, KyResponse };
