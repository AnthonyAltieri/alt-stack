import type { z } from "zod";

export type CliDefinitionErrorCode =
  | "invalid-cli-identity"
  | "invalid-command-name"
  | "invalid-argument-definition"
  | "invalid-option-definition"
  | "command-conflict";

export class CliDefinitionError extends Error {
  constructor(
    public readonly code: CliDefinitionErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CliDefinitionError";
  }
}

export type CliUsageErrorCode =
  | "unknown-command"
  | "unknown-option"
  | "missing-option-value"
  | "duplicate-option"
  | "invalid-input"
  | "unexpected-argument";

export class CliUsageError extends Error {
  constructor(
    public readonly code: CliUsageErrorCode,
    message: string,
    public readonly commandPath: readonly string[],
    public readonly issues?: readonly z.ZodIssue[],
  ) {
    super(message);
    this.name = "CliUsageError";
  }
}
