import type { z } from "zod";

// ============================================================================
// Path Parameter Extraction
// ============================================================================

/**
 * Extracts path parameters from an endpoint string
 * @example ExtractPathParams<'/users/{id}/posts/{postId}'> → 'id' | 'postId'
 */
export type ExtractPathParams<T extends string> = T extends `${string}{${infer Param}}${infer Rest}`
  ? Param extends `${infer Key}`
    ? Key | ExtractPathParams<Rest>
    : ExtractPathParams<Rest>
  : never;

// ============================================================================
// Request Type Extraction
// ============================================================================

/**
 * Extracts params type from Request object
 */
export type ExtractRequestParams<
  TRequest extends Record<string, Record<string, unknown>>,
  TEndpoint extends keyof TRequest,
  TMethod extends keyof TRequest[TEndpoint],
> = TRequest[TEndpoint][TMethod] extends { params: infer P }
  ? P extends z.ZodTypeAny
    ? z.infer<P>
    : never
  : ExtractPathParams<TEndpoint & string> extends never
    ? never
    : Record<ExtractPathParams<TEndpoint & string> & string, string>;

/**
 * Extracts query type from Request object
 */
export type ExtractRequestQuery<
  TRequest extends Record<string, Record<string, unknown>>,
  TEndpoint extends keyof TRequest,
  TMethod extends keyof TRequest[TEndpoint],
> = TRequest[TEndpoint][TMethod] extends { query: infer Q }
  ? Q extends z.ZodTypeAny
    ? z.infer<Q>
    : never
  : never;

/**
 * Extracts body type from Request object
 */
export type ExtractRequestBody<
  TRequest extends Record<string, Record<string, unknown>>,
  TEndpoint extends keyof TRequest,
  TMethod extends keyof TRequest[TEndpoint],
> = TRequest[TEndpoint][TMethod] extends { body: infer B }
  ? B extends z.ZodTypeAny
    ? z.infer<B>
    : never
  : never;

/**
 * Helper to determine if params are required
 */
export type ParamsRequired<
  TRequest extends Record<string, Record<string, unknown>>,
  TEndpoint extends keyof TRequest,
  TMethod extends keyof TRequest[TEndpoint],
> = TRequest[TEndpoint][TMethod] extends { params: z.ZodTypeAny }
  ? true
  : ExtractPathParams<TEndpoint & string> extends never
    ? false
    : true;

/**
 * Helper to determine if body is required
 */
export type BodyRequired<
  TRequest extends Record<string, Record<string, unknown>>,
  TEndpoint extends keyof TRequest,
  TMethod extends keyof TRequest[TEndpoint],
> = TRequest[TEndpoint][TMethod] extends { body: z.ZodTypeAny } ? true : false;

/**
 * Extracts endpoints that have a specific HTTP method
 */
export type EndpointsWithMethod<
  TRequest extends Record<string, Record<string, unknown>>,
  TMethod extends string,
> = {
  [K in keyof TRequest]: TMethod extends keyof TRequest[K] ? K : never;
}[keyof TRequest] &
  string;

// ============================================================================
// Response Type Extraction
// ============================================================================

/**
 * Extracts all status codes from Response object for an endpoint/method
 */
export type ExtractStatusCodes<
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
  TEndpoint extends keyof TResponse,
  TMethod extends keyof TResponse[TEndpoint],
> =
  TResponse[TEndpoint][TMethod] extends Record<string, z.ZodTypeAny>
    ? keyof TResponse[TEndpoint][TMethod] & string
    : never;

/**
 * Extracts success status codes (2xx) from Response object
 */
export type ExtractSuccessCodes<
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
  TEndpoint extends keyof TResponse,
  TMethod extends keyof TResponse[TEndpoint],
> =
  ExtractStatusCodes<TResponse, TEndpoint, TMethod> extends infer Codes
    ? Codes extends string
      ? Codes extends `2${string}`
        ? Codes
        : never
      : never
    : never;

/**
 * Extracts error status codes (non-2xx) from Response object
 */
export type ExtractErrorCodes<
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
  TEndpoint extends keyof TResponse,
  TMethod extends keyof TResponse[TEndpoint],
> =
  ExtractStatusCodes<TResponse, TEndpoint, TMethod> extends infer Codes
    ? Codes extends string
      ? Codes extends `2${string}`
        ? never
        : Codes
      : never
    : never;

/**
 * Extracts response schema for a specific status code
 */
export type ExtractResponseSchema<
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
  TEndpoint extends keyof TResponse,
  TMethod extends keyof TResponse[TEndpoint],
  TCode extends string,
> =
  TResponse[TEndpoint][TMethod] extends Record<string, z.ZodTypeAny>
    ? TCode extends keyof TResponse[TEndpoint][TMethod]
      ? TResponse[TEndpoint][TMethod][TCode]
      : never
    : never;

/**
 * Infers the success response body type (uses first success code, typically 200)
 */
export type ExtractSuccessBody<
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
  TEndpoint extends keyof TResponse,
  TMethod extends keyof TResponse[TEndpoint],
> =
  ExtractSuccessCodes<TResponse, TEndpoint, TMethod> extends infer SuccessCode
    ? SuccessCode extends string
      ? ExtractResponseSchema<TResponse, TEndpoint, TMethod, SuccessCode> extends z.ZodTypeAny
        ? z.infer<ExtractResponseSchema<TResponse, TEndpoint, TMethod, SuccessCode>>
        : never
      : never
    : never;

// ============================================================================
// Discriminated Union Response Type
// ============================================================================

/**
 * Creates a discriminated union member for a success response
 */
export type SuccessResponse<TSuccessBody, TCode extends string> = {
  success: true;
  body: TSuccessBody;
  code: TCode;
};

/**
 * Creates a discriminated union member for an error response with specific code
 */
export type ErrorResponse<TError, TCode extends string> = {
  success: false;
  error: TError;
  code: TCode;
};

/**
 * Unexpected error response (for errors not in the spec)
 */
export type UnexpectedErrorResponse = {
  success: false;
  error: unknown;
  code: number;
};

/**
 * Builds the complete discriminated union response type
 */
export type ApiResponse<
  TResponse extends Record<string, Record<string, Record<string, z.ZodTypeAny>>>,
  TEndpoint extends string,
  TMethod extends string,
> = TEndpoint extends keyof TResponse
  ? TMethod extends keyof TResponse[TEndpoint]
    ? // Success responses (one per success code)
        | (ExtractSuccessCodes<TResponse, TEndpoint, TMethod> extends infer SuccessCode
            ? SuccessCode extends string
              ? ExtractResponseSchema<
                  TResponse,
                  TEndpoint,
                  TMethod,
                  SuccessCode
                > extends z.ZodTypeAny
                ? SuccessResponse<
                    z.infer<ExtractResponseSchema<TResponse, TEndpoint, TMethod, SuccessCode>>,
                    SuccessCode
                  >
                : never
              : never
            : never)
        // Error responses (one per error code)
        | (ExtractErrorCodes<TResponse, TEndpoint, TMethod> extends infer ErrorCodes
            ? ErrorCodes extends string
              ? ExtractResponseSchema<
                  TResponse,
                  TEndpoint,
                  TMethod,
                  ErrorCodes
                > extends z.ZodTypeAny
                ? ErrorResponse<
                    z.infer<ExtractResponseSchema<TResponse, TEndpoint, TMethod, ErrorCodes>>,
                    ErrorCodes
                  >
                : never
              : never
            : never)
        // Unexpected error (catch-all)
        | UnexpectedErrorResponse
    : UnexpectedErrorResponse
  : UnexpectedErrorResponse;

// ============================================================================
// Request Options Type
// ============================================================================

/**
 * Context passed to shouldRetry callback
 */
export type RetryContext = {
  /** Current attempt number (0-indexed) */
  attempt: number;
  /** Error thrown during request (network errors, timeouts, etc.) */
  error?: unknown;
  /** HTTP response received (for retrying based on status codes) */
  response?: { status: number; statusText: string; data: unknown };
};

/**
 * Request options with conditional required fields
 */
export type RequestOptions<
  TRequest extends Record<string, Record<string, unknown>>,
  TEndpoint extends keyof TRequest,
  TMethod extends keyof TRequest[TEndpoint],
> = {
  timeout?: number;
  retries?: number;
  headers?: Record<string, unknown>;
  /** Custom retry logic - return true to retry, false to stop */
  shouldRetry?: (context: RetryContext) => boolean;
} & (ExtractRequestQuery<TRequest, TEndpoint, TMethod> extends never
  ? { query?: never }
  : { query?: ExtractRequestQuery<TRequest, TEndpoint, TMethod> }) &
  (ParamsRequired<TRequest, TEndpoint, TMethod> extends true
    ? { params: ExtractRequestParams<TRequest, TEndpoint, TMethod> }
    : ExtractRequestParams<TRequest, TEndpoint, TMethod> extends never
      ? { params?: never }
      : { params?: ExtractRequestParams<TRequest, TEndpoint, TMethod> }) &
  (BodyRequired<TRequest, TEndpoint, TMethod> extends true
    ? { body: ExtractRequestBody<TRequest, TEndpoint, TMethod> }
    : { body?: ExtractRequestBody<TRequest, TEndpoint, TMethod> });
