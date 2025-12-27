import type { ZodError } from "zod";

export interface StructuredLogError {
  type: "ZodValidationError";
  message: string;
  issueCount: number;
  issues: Array<{
    path: string;
    message: string;
    code: string;
  }>;
  input?: unknown;
}

/**
 * Formats ZodError into a human-readable string
 */
export function zodErrorToString(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/**
 * Formats ZodError for structured logging systems
 * Includes optional input data for debugging
 */
export function zodErrorToStructuredLog(error: ZodError, input?: unknown): StructuredLogError {
  return {
    type: "ZodValidationError",
    message: zodErrorToString(error),
    issueCount: error.issues.length,
    issues: error.issues.map((issue) => ({
      path: issue.path.join(".") || "(root)",
      message: issue.message,
      code: issue.code,
    })),
    ...(input !== undefined && { input }),
  };
}
