export class KafkaError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "KafkaError";
  }

  toJSON() {
    const result: {
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
    } = {
      error: {
        code: this.code,
        message: this.message,
      },
    };
    if (this.details) {
      result.error.details = this.details;
    }
    return result;
  }
}

export class ValidationError extends KafkaError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class ProcessingError extends KafkaError {
  constructor(message: string, details?: unknown) {
    super("PROCESSING_ERROR", message, details);
    this.name = "ProcessingError";
  }
}

