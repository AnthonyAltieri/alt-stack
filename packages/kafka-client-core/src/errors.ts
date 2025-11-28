/**
 * Base error class for Kafka client errors.
 */
export class KafkaClientError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "KafkaClientError";
  }
}

/**
 * Error thrown when message validation fails.
 */
export class ValidationError extends KafkaClientError {
  constructor(
    public readonly topic: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Error thrown when sending a message fails.
 */
export class SendError extends KafkaClientError {
  constructor(
    public readonly topic: string,
    message: string,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = "SendError";
  }
}

/**
 * Error thrown when connection fails.
 */
export class ConnectionError extends KafkaClientError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ConnectionError";
  }
}
