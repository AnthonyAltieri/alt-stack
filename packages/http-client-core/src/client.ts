import { z } from "zod";
import type {
  ApiResponse,
  RequestOptions,
  ExtractRequestBody,
  SuccessResponse,
  ErrorResponse,
  UnexpectedErrorResponse,
  EndpointsWithMethod,
  RetryContext,
  HttpExecutor,
  ExecuteResponse,
} from "./types.js";
import { UnexpectedApiClientError, ValidationError } from "./errors.js";

// ============================================================================
// Types
// ============================================================================

export interface ApiClientOptions<
  TRequest extends Record<string, Record<string, unknown>>,
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
  TRawResponse = unknown,
> {
  baseUrl: string;
  headers?: Record<string, unknown>;
  Request: TRequest;
  Response: TResponse;
  /**
   * Called when Zod validation fails for request or response data.
   * This is only invoked for schema parse failures (i.e. when Zod would throw),
   * not for other validation errors like missing path params.
   */
  onValidationError?: ApiClientValidationErrorHandler<TRawResponse>;
  executor: HttpExecutor<TRawResponse>;
}

export type ApiClientValidationErrorLocation = "params" | "query" | "body" | "response";

export type ApiClientValidationErrorContext<TRawResponse = unknown> = {
  kind: "request" | "response";
  location: ApiClientValidationErrorLocation;
  endpoint: string;
  method: string;
  /** Human-readable context string (also used as the thrown ValidationError message). */
  message: string;
  /** The data that failed validation. */
  data: unknown;
  /** Zod issues produced by the schema. */
  issues: z.ZodIssue[];
  /** The underlying ZodError object. */
  zodError: z.ZodError;
  /** Response-only context. */
  status?: number;
  statusCode?: string;
  statusText?: string;
  raw?: TRawResponse;
};

export type ApiClientValidationErrorHandler<TRawResponse = unknown> = (
  context: ApiClientValidationErrorContext<TRawResponse>,
) => void;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Interpolates path parameters into endpoint string
 */
function interpolatePath(endpoint: string, params: Record<string, unknown>): string {
  let result = endpoint;
  for (const [key, value] of Object.entries(params)) {
    result = result.replace(`{${key}}`, String(value));
  }
  return result;
}

/**
 * Builds query string from query object
 */
function buildQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculates exponential backoff delay
 */
function calculateBackoff(attempt: number, baseDelay: number = 1000): number {
  return Math.min(baseDelay * Math.pow(2, attempt), 30000); // Max 30 seconds
}

// ============================================================================
// ApiClient Class
// ============================================================================

export class ApiClient<
  TRequest extends Record<string, Record<string, unknown>>,
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
  TRawResponse = unknown,
> {
  constructor(public readonly options: ApiClientOptions<TRequest, TResponse, TRawResponse>) {}

  private safeInvokeOnValidationError(
    context: ApiClientValidationErrorContext<TRawResponse>,
  ): void {
    if (!this.options.onValidationError) return;
    try {
      this.options.onValidationError(context);
    } catch {
      // Never allow a user-provided callback to affect control-flow, retries, etc.
    }
  }

  private validateSchema<TSchema extends z.ZodTypeAny>(
    schema: TSchema,
    data: unknown,
    message: string,
    context: Omit<
      ApiClientValidationErrorContext<TRawResponse>,
      "data" | "issues" | "zodError" | "message"
    >,
  ): z.infer<TSchema> {
    const parsed = schema.safeParse(data);
    if (parsed.success) return parsed.data;

    this.safeInvokeOnValidationError({
      ...context,
      message,
      data,
      issues: parsed.error.issues,
      zodError: parsed.error,
    });

    throw new ValidationError(message, parsed.error.issues, context.endpoint, context.method);
  }

  /**
   * Makes a GET request
   */
  async get<TEndpoint extends EndpointsWithMethod<TRequest, "GET">>(
    endpoint: TEndpoint,
    options: RequestOptions<TRequest, TEndpoint, "GET">,
  ): Promise<ApiResponse<TResponse, TEndpoint, "GET", TRawResponse>> {
    return this.request("GET", endpoint as string, options);
  }

  /**
   * Makes a POST request
   */
  async post<TEndpoint extends EndpointsWithMethod<TRequest, "POST">>(
    endpoint: TEndpoint,
    options: RequestOptions<TRequest, TEndpoint, "POST"> & {
      body: ExtractRequestBody<TRequest, TEndpoint, "POST">;
    },
  ): Promise<ApiResponse<TResponse, TEndpoint, "POST", TRawResponse>> {
    return this.request("POST", endpoint as string, options);
  }

  /**
   * Makes a PUT request
   */
  async put<TEndpoint extends EndpointsWithMethod<TRequest, "PUT">>(
    endpoint: TEndpoint,
    options: RequestOptions<TRequest, TEndpoint, "PUT"> & {
      body: ExtractRequestBody<TRequest, TEndpoint, "PUT">;
    },
  ): Promise<ApiResponse<TResponse, TEndpoint, "PUT", TRawResponse>> {
    return this.request("PUT", endpoint as string, options);
  }

  /**
   * Makes a PATCH request
   */
  async patch<TEndpoint extends EndpointsWithMethod<TRequest, "PATCH">>(
    endpoint: TEndpoint,
    options: RequestOptions<TRequest, TEndpoint, "PATCH"> & {
      body: ExtractRequestBody<TRequest, TEndpoint, "PATCH">;
    },
  ): Promise<ApiResponse<TResponse, TEndpoint, "PATCH", TRawResponse>> {
    return this.request("PATCH", endpoint as string, options);
  }

  /**
   * Makes a DELETE request
   */
  async delete<TEndpoint extends EndpointsWithMethod<TRequest, "DELETE">>(
    endpoint: TEndpoint,
    options: RequestOptions<TRequest, TEndpoint, "DELETE">,
  ): Promise<ApiResponse<TResponse, TEndpoint, "DELETE", TRawResponse>> {
    return this.request("DELETE", endpoint as string, options);
  }

  /**
   * Internal request method
   */
  private async request<
    TEndpoint extends keyof TRequest & string,
    TMethod extends keyof TRequest[TEndpoint] & string,
  >(
    method: string,
    endpoint: string,
    options: RequestOptions<TRequest, TEndpoint, TMethod> & {
      body?: ExtractRequestBody<TRequest, TEndpoint, TMethod>;
    },
  ): Promise<ApiResponse<TResponse, TEndpoint, TMethod, TRawResponse>> {
    const {
      params = {},
      query = {},
      body,
      timeout,
      retries = 0,
      headers: requestHeaders = {},
      shouldRetry,
    } = options;

    // Validate and interpolate path
    const pathParams = this.validatePathParams(endpoint, params, method);
    const interpolatedPath = interpolatePath(endpoint, pathParams);

    // Validate query if schema exists
    const queryParams = this.validateQuery(endpoint, method, query);

    // Validate body if schema exists
    if (body !== undefined) {
      this.validateBody(endpoint, method, body);
    }

    // Build URL
    const queryString = buildQueryString(queryParams);
    const url = `${this.options.baseUrl}${interpolatedPath}${queryString}`;

    // Merge headers
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.options.headers) {
      for (const [key, value] of Object.entries(this.options.headers)) {
        if (value !== undefined && value !== null) {
          headers[key] = String(value);
        }
      }
    }
    for (const [key, value] of Object.entries(requestHeaders)) {
      if (value !== undefined && value !== null) {
        headers[key] = String(value);
      }
    }

    // Make request with retry logic
    let lastError: unknown;
    let lastResult: ExecuteResponse<TRawResponse> | undefined;
    let attempt = 0;

    while (attempt <= retries) {
      try {
        const result = await this.options.executor.execute({
          method,
          url,
          headers,
          body: body !== undefined && (method === "POST" || method === "PUT" || method === "PATCH")
            ? JSON.stringify(body)
            : undefined,
          timeout,
        });

        // Check custom shouldRetry for response-based retry (e.g., 5xx errors)
        if (shouldRetry && attempt < retries) {
          const retryContext: RetryContext = {
            attempt,
            response: { status: result.status, statusText: result.statusText, data: result.data },
          };
          if (shouldRetry(retryContext)) {
            lastResult = result;
            const delay = calculateBackoff(attempt);
            await sleep(delay);
            attempt++;
            continue;
          }
        }

        return this.handleResponse(result, endpoint, method) as ApiResponse<
          TResponse,
          TEndpoint,
          TMethod,
          TRawResponse
        >;
      } catch (error: unknown) {
        lastError = error;

        // Don't retry on validation errors
        if (error instanceof ValidationError) {
          throw error;
        }

        // Check custom shouldRetry or fall back to default behavior
        if (attempt < retries) {
          const retryContext: RetryContext = { attempt, error };

          if (shouldRetry) {
            if (shouldRetry(retryContext)) {
              const delay = calculateBackoff(attempt);
              await sleep(delay);
              attempt++;
              continue;
            }
            // Custom shouldRetry returned false, stop retrying
            break;
          }

          // Default behavior: don't retry on 4xx client errors
          if (
            error instanceof UnexpectedApiClientError &&
            error.code !== undefined &&
            error.code >= 400 &&
            error.code < 500
          ) {
            throw error;
          }

          // Default: retry on network errors
          const delay = calculateBackoff(attempt);
          await sleep(delay);
          attempt++;
        } else {
          break;
        }
      }
    }

    // If we have a last result (from response-based retry), return it
    if (lastResult) {
      return this.handleResponse(lastResult, endpoint, method) as ApiResponse<
        TResponse,
        TEndpoint,
        TMethod,
        TRawResponse
      >;
    }

    // If we get here, all retries failed
    if (lastError instanceof Error) {
      throw lastError;
    }
    throw new UnexpectedApiClientError(
      "Request failed after retries",
      undefined,
      endpoint,
      method,
      lastError,
    );
  }

  /**
   * Validates path parameters against Request schema
   */
  private validatePathParams(
    endpoint: string,
    params: Record<string, unknown>,
    method: string,
  ): Record<string, unknown> {
    const requestDef = this.options.Request[endpoint]?.[method];
    if (!requestDef || typeof requestDef !== "object") {
      // No schema, but check if path has params
      const requiredParams = this.getPathParamNames(endpoint);
      if (requiredParams.length > 0 && Object.keys(params).length === 0) {
        throw new ValidationError(
          `Missing required path parameters: ${requiredParams.join(", ")}`,
          { missing: requiredParams },
          endpoint,
          method,
        );
      }
      return params;
    }

    const paramsSchema = (requestDef as { params?: z.ZodTypeAny }).params;
    if (paramsSchema) {
      return this.validateSchema(paramsSchema, params, "Path parameters validation failed", {
        kind: "request",
        location: "params",
        endpoint,
        method,
      }) as Record<string, unknown>;
    }

    // Check if endpoint requires params but none provided
    const requiredParams = this.getPathParamNames(endpoint);
    if (requiredParams.length > 0 && Object.keys(params).length === 0) {
      throw new ValidationError(
        `Missing required path parameters: ${requiredParams.join(", ")}`,
        { missing: requiredParams },
        endpoint,
        method,
      );
    }

    return params;
  }

  /**
   * Validates query parameters against Request schema
   */
  private validateQuery(
    endpoint: string,
    method: string,
    query: Record<string, unknown>,
  ): Record<string, unknown> {
    const requestDef = this.options.Request[endpoint]?.[method];
    if (!requestDef || typeof requestDef !== "object") {
      return query;
    }

    const querySchema = (requestDef as { query?: z.ZodTypeAny }).query;
    if (querySchema) {
      return this.validateSchema(querySchema, query, "Query parameters validation failed", {
        kind: "request",
        location: "query",
        endpoint,
        method,
      }) as Record<string, unknown>;
    }

    return query;
  }

  /**
   * Validates body against Request schema
   */
  private validateBody(endpoint: string, method: string, body: unknown): void {
    const requestDef = this.options.Request[endpoint]?.[method];
    if (!requestDef || typeof requestDef !== "object") {
      return;
    }

    const bodySchema = (requestDef as { body?: z.ZodTypeAny }).body;
    if (bodySchema) {
      this.validateSchema(bodySchema, body, "Request body validation failed", {
        kind: "request",
        location: "body",
        endpoint,
        method,
      });
    }
  }

  /**
   * Gets path parameter names from endpoint string
   */
  private getPathParamNames(endpoint: string): string[] {
    const matches = endpoint.matchAll(/\{([^}]+)\}/g);
    return Array.from(matches, (m) => m[1]).filter((name): name is string => name !== undefined);
  }

  /**
   * Handles the response and returns discriminated union
   */
  private handleResponse(
    result: ExecuteResponse<TRawResponse>,
    endpoint: string,
    method: string,
  ):
    | SuccessResponse<unknown, string, TRawResponse>
    | ErrorResponse<unknown, string, TRawResponse>
    | UnexpectedErrorResponse<TRawResponse> {
    const { status, statusText, data, raw } = result;
    const statusCode = String(status);

    // Get schema from Response for this status code
    const responseSchema =
      endpoint in this.options.Response
        ? this.options.Response[endpoint]?.[method]?.[statusCode]
        : undefined;

    if (!responseSchema) {
      // No schema defined for this status code
      if (statusCode.startsWith("2")) {
        return {
          success: true,
          body: data,
          code: statusCode,
          raw,
        } as SuccessResponse<unknown, string, TRawResponse>;
      }
      return {
        success: false,
        error: new UnexpectedApiClientError(
          `Unexpected error response: ${statusText}`,
          status,
          endpoint,
          method,
          data,
        ),
        code: status,
        raw,
      } as UnexpectedErrorResponse<TRawResponse>;
    }

    // Validate against schema
    try {
      const validated = this.validateSchema(
        responseSchema,
        data,
        `Response validation failed for ${statusCode}`,
        {
          kind: "response",
          location: "response",
          endpoint,
          method,
          status,
          statusCode,
          statusText,
          raw,
        },
      );

      if (statusCode.startsWith("2")) {
        return {
          success: true,
          body: validated,
          code: statusCode,
          raw,
        } as SuccessResponse<unknown, string, TRawResponse>;
      }

      return {
        success: false,
        error: validated,
        code: statusCode,
        raw,
      } as ErrorResponse<unknown, string, TRawResponse>;
    } catch {
      // Validation failed
      return {
        success: false,
        error: new UnexpectedApiClientError(
          `Response validation failed: ${statusText}`,
          status,
          endpoint,
          method,
          data,
        ),
        code: status,
        raw,
      } as UnexpectedErrorResponse<TRawResponse>;
    }
  }
}
