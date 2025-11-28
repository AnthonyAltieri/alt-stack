/**
 * Base error class for worker errors
 */
export class WorkerError extends Error {
  constructor(
    message: string,
    public readonly code: string = "WORKER_ERROR",
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "WorkerError";
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
      },
    };
  }
}

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends WorkerError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", details);
    this.name = "ValidationError";
  }
}

/**
 * Error thrown when job processing fails
 */
export class ProcessingError extends WorkerError {
  constructor(message: string, details?: unknown) {
    super(message, "PROCESSING_ERROR", details);
    this.name = "ProcessingError";
  }
}

/**
 * Error thrown when a job should be retried
 */
export class RetryableError extends WorkerError {
  constructor(
    message: string,
    public readonly retryAfter?: number,
    details?: unknown,
  ) {
    super(message, "RETRYABLE_ERROR", details);
    this.name = "RetryableError";
  }
}

/**
 * Error thrown when a job should not be retried
 */
export class NonRetryableError extends WorkerError {
  constructor(message: string, details?: unknown) {
    super(message, "NON_RETRYABLE_ERROR", details);
    this.name = "NonRetryableError";
  }
}
