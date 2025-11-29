/**
 * Base error class for worker client errors.
 */
export class WorkerClientError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "WorkerClientError";
  }
}

/**
 * Error thrown when payload validation fails.
 */
export class ValidationError extends WorkerClientError {
  constructor(
    public readonly jobName: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Error thrown when triggering a job fails.
 */
export class TriggerError extends WorkerClientError {
  constructor(
    public readonly jobName: string,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = "TriggerError";
  }
}

/**
 * Error thrown when connection fails.
 */
export class ConnectionError extends WorkerClientError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ConnectionError";
  }
}

