import { z } from "zod";
import type {
  ApiResponse,
  RequestOptions,
  ExtractRequestBody,
  SuccessResponse,
  ErrorResponse,
  UnexpectedErrorResponse,
  EndpointsWithMethod,
} from "./types.js";
import { UnexpectedApiClientError, ValidationError } from "./errors.js";

// ============================================================================
// Types
// ============================================================================

export interface ApiClientOptions<
  TRequest extends Record<string, Record<string, unknown>>,
  TResponse extends Record<
    string,
    Record<string, Record<string, z.ZodTypeAny>>
  >,
> {
  baseUrl: string;
  headers?: Record<string, unknown>;
  Request: TRequest;
  Response: TResponse;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Interpolates path parameters into endpoint string
 */
function interpolatePath(
  endpoint: string,
  params: Record<string, unknown>,
): string {
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

/**
 * Validates data against a Zod schema
 */
function validate<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  data: unknown,
  errorMessage: string,
): z.infer<TSchema> {
  try {
    return schema.parse(data);
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        errorMessage,
        error.issues,
        undefined,
        undefined,
      );
    }
    throw error;
  }
}

// ============================================================================
// ApiClient Class
// ============================================================================

export class ApiClient<
  TRequest extends Record<string, Record<string, unknown>>,
  TResponse extends Record<
    string,
    Record<string, Record<string, z.ZodTypeAny>>
  >,
> {
  constructor(public readonly options: ApiClientOptions<TRequest, TResponse>) {}

  /**
   * Makes a GET request
   */
  async get<TEndpoint extends EndpointsWithMethod<TRequest, "GET">>(
    endpoint: TEndpoint,
    options: RequestOptions<TRequest, TEndpoint, "GET">,
  ): Promise<ApiResponse<TResponse, TEndpoint, "GET">> {
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
  ): Promise<ApiResponse<TResponse, TEndpoint, "POST">> {
    return this.request("POST", endpoint as string, options);
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
  ): Promise<ApiResponse<TResponse, TEndpoint, TMethod>> {
    const {
      params = {},
      query = {},
      body,
      timeout,
      retries = 0,
      headers: requestHeaders = {},
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
    const headers = {
      "Content-Type": "application/json",
      ...this.options.headers,
      ...requestHeaders,
    };

    // Make request with retry logic
    let lastError: unknown;
    let attempt = 0;

    while (attempt <= retries) {
      try {
        const result = await this.makeFetchRequest(
          method,
          url,
          headers,
          body,
          timeout,
        );

        return this.handleResponse(result, endpoint, method) as ApiResponse<
          TResponse,
          TEndpoint,
          TMethod
        >;
      } catch (error: unknown) {
        lastError = error;

        // Don't retry on validation errors or client errors (4xx)
        if (
          error instanceof ValidationError ||
          (error instanceof UnexpectedApiClientError &&
            error.code !== undefined &&
            error.code >= 400 &&
            error.code < 500)
        ) {
          throw error;
        }

        // Retry on network errors or server errors (5xx)
        if (attempt < retries) {
          const delay = calculateBackoff(attempt);
          await sleep(delay);
          attempt++;
        } else {
          break;
        }
      }
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
      return validate(
        paramsSchema,
        params,
        "Path parameters validation failed",
      ) as Record<string, unknown>;
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
      return validate(
        querySchema,
        query,
        "Query parameters validation failed",
      ) as Record<string, unknown>;
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
      validate(bodySchema, body, "Request body validation failed");
    }
  }

  /**
   * Gets path parameter names from endpoint string
   */
  private getPathParamNames(endpoint: string): string[] {
    const matches = endpoint.matchAll(/\{([^}]+)\}/g);
    return Array.from(matches, (m) => m[1]).filter(
      (name): name is string => name !== undefined,
    );
  }

  /**
   * Makes the actual fetch request
   */
  private async makeFetchRequest(
    method: string,
    url: string,
    headers: Record<string, unknown>,
    body?: unknown,
    timeout?: number,
  ): Promise<{ status: number; statusText: string; data: unknown }> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    if (timeout !== undefined) {
      timeoutId = setTimeout(() => controller.abort(), timeout);
    }

    try {
      const fetchOptions: RequestInit = {
        method,
        headers: headers as HeadersInit,
        signal: controller.signal,
      };

      if (
        body !== undefined &&
        (method === "POST" || method === "PUT" || method === "PATCH")
      ) {
        fetchOptions.body = JSON.stringify(body);
      }

      const response = await fetch(url, fetchOptions);

      let data: unknown;
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        try {
          data = await response.json();
        } catch {
          data = await response.text();
        }
      } else {
        data = await response.text();
      }

      return {
        status: response.status,
        statusText: response.statusText,
        data,
      };
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new UnexpectedApiClientError(
          `Request timeout after ${timeout}ms`,
          undefined,
          url,
          method,
          error,
        );
      }
      throw new UnexpectedApiClientError(
        `Network error: ${error instanceof Error ? error.message : String(error)}`,
        undefined,
        url,
        method,
        error,
      );
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Handles the response and returns discriminated union
   */
  private handleResponse(
    result: { status: number; statusText: string; data: unknown },
    endpoint: string,
    method: string,
  ):
    | SuccessResponse<unknown, string>
    | ErrorResponse<unknown, string>
    | UnexpectedErrorResponse {
    const { status, statusText, data } = result;
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
        } as SuccessResponse<unknown, string>;
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
      } as UnexpectedErrorResponse;
    }

    // Validate against schema
    try {
      const validated = validate(
        responseSchema,
        data,
        `Response validation failed for ${statusCode}`,
      );

      if (statusCode.startsWith("2")) {
        return {
          success: true,
          body: validated,
          code: statusCode,
        } as SuccessResponse<unknown, string>;
      }

      return {
        success: false,
        error: validated,
        code: statusCode,
      } as ErrorResponse<unknown, string>;
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
      } as UnexpectedErrorResponse;
    }
  }
}

/**
 * Factory function to create an ApiClient instance
 */
export function createApiClient<
  TRequest extends Record<string, Record<string, unknown>>,
  TResponse extends Record<
    string,
    Record<string, Record<string, z.ZodTypeAny>>
  >,
>(
  options: ApiClientOptions<TRequest, TResponse>,
): ApiClient<TRequest, TResponse> {
  return new ApiClient(options);
}
