/**
 * Base error class for API client errors
 */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly endpoint?: string,
    public readonly method?: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
    Object.setPrototypeOf(this, ApiClientError.prototype);
  }
}

/**
 * Unexpected error that doesn't match any defined error schema
 * Used in the discriminated union for errors not in the OpenAPI spec
 */
export class UnexpectedApiClientError extends ApiClientError {
  constructor(
    message: string,
    public readonly code?: number,
    endpoint?: string,
    method?: string,
    cause?: unknown,
  ) {
    super(message, endpoint, method, cause);
    this.name = "UnexpectedApiClientError";
    Object.setPrototypeOf(this, UnexpectedApiClientError.prototype);
  }
}

/**
 * Validation error for request/response schema validation failures
 */
export class ValidationError extends ApiClientError {
  constructor(
    message: string,
    public readonly validationErrors: unknown,
    endpoint?: string,
    method?: string,
  ) {
    super(message, endpoint, method);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Timeout error when request exceeds configured timeout
 */
export class TimeoutError extends ApiClientError {
  constructor(
    public readonly timeout: number,
    endpoint?: string,
    method?: string,
    cause?: unknown,
  ) {
    super(`Request timeout after ${timeout}ms`, endpoint, method, cause);
    this.name = "TimeoutError";
    Object.setPrototypeOf(this, TimeoutError.prototype);
  }
}

