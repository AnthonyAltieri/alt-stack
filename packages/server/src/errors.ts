export class ServerError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ServerError";
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

export class ValidationError extends ServerError {
  constructor(message: string, details?: unknown) {
    super(400, "VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends ServerError {
  constructor(message: string = "Resource not found", details?: unknown) {
    super(404, "NOT_FOUND", message, details);
    this.name = "NotFoundError";
  }
}

export class UnauthorizedError extends ServerError {
  constructor(message: string = "Unauthorized", details?: unknown) {
    super(401, "UNAUTHORIZED", message, details);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends ServerError {
  constructor(message: string = "Forbidden", details?: unknown) {
    super(403, "FORBIDDEN", message, details);
    this.name = "ForbiddenError";
  }
}

export class BadRequestError extends ServerError {
  constructor(message: string, details?: unknown) {
    super(400, "BAD_REQUEST", message, details);
    this.name = "BadRequestError";
  }
}

export class InternalServerError extends ServerError {
  constructor(message: string = "Internal server error", details?: unknown) {
    super(500, "INTERNAL_SERVER_ERROR", message, details);
    this.name = "InternalServerError";
  }
}

