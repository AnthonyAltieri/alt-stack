import { z } from "zod";
import type { InputConfig } from "./types/index.js";

/**
 * Internal error for validation failures.
 * This is an internal implementation detail and not exported for consumers.
 * Consumers should define their own error classes using TaggedError.
 */
class InternalValidationError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ValidationError";
  }
}

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    details?: unknown;
  };
}

export async function parseSchema<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
): Promise<ParseResult<z.infer<T>>> {
  try {
    const result = await schema.safeParseAsync(data);
    if (result.success) {
      return { success: true, data: result.data };
    }
      return {
        success: false,
        error: {
          message: "Validation failed",
          details: result.error, // Return full ZodError
        },
      };
  } catch (error) {
    return {
      success: false,
      error: {
        message: error instanceof Error ? error.message : "Validation error",
      },
    };
  }
}

export function mergeInputs(
  params: Record<string, unknown>,
  query: Record<string, unknown>,
  body: unknown,
): Record<string, unknown> {
  return {
    ...params,
    ...query,
    ...(body && typeof body === "object" && !Array.isArray(body)
      ? body
      : { body }),
  };
}

export interface StructuredInput {
  params: unknown;
  query: unknown;
  body: unknown;
}

export async function validateInput<T extends InputConfig>(
  config: T,
  params: Record<string, unknown>,
  query: Record<string, unknown>,
  body: unknown,
): Promise<StructuredInput> {
  const validationErrors: Array<[z.ZodError, "body" | "param" | "query", unknown]> = [];
  let validatedParams: unknown = undefined;
  let validatedQuery: unknown = undefined;
  let validatedBody: unknown = undefined;

  if (config.params) {
    const result = await parseSchema(config.params, params);
    if (!result.success) {
      const zodError = result.error?.details as z.ZodError;
      if (zodError) {
        validationErrors.push([zodError, "param", params]);
      }
    } else {
      validatedParams = result.data;
    }
  }

  if (config.query) {
    const result = await parseSchema(config.query, query);
    if (!result.success) {
      const zodError = result.error?.details as z.ZodError;
      if (zodError) {
        validationErrors.push([zodError, "query", query]);
      }
    } else {
      validatedQuery = result.data;
    }
  }

  if (config.body) {
    const result = await parseSchema(config.body, body);
    if (!result.success) {
      const zodError = result.error?.details as z.ZodError;
      if (zodError) {
        validationErrors.push([zodError, "body", body]);
      }
    } else {
      validatedBody = result.data;
    }
  }

  // Throw with all accumulated errors if any validation failed
  if (validationErrors.length > 0) {
    throw new InternalValidationError(
      "Validation failed",
      {
        errors: validationErrors,
      },
    );
  }

  return {
    params: validatedParams,
    query: validatedQuery,
    body: validatedBody,
  };
}

