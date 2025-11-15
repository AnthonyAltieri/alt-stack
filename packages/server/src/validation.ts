import { z } from "zod";
import type { InputConfig } from "./types/index.js";
import { ValidationError } from "./errors.js";

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

export async function validateInput<T extends InputConfig>(
  config: T,
  params: Record<string, unknown>,
  query: Record<string, unknown>,
  body: unknown,
): Promise<Record<string, unknown>> {
  const validated: Record<string, unknown> = {};
  const validationErrors: Array<[z.ZodError, "body" | "param" | "query", unknown]> = [];

  if (config.params) {
    const result = await parseSchema(config.params, params);
    if (!result.success) {
      const zodError = result.error?.details as z.ZodError;
      if (zodError) {
        validationErrors.push([zodError, "param", params]);
      }
    } else {
      Object.assign(validated, result.data);
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
      Object.assign(validated, result.data);
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
      if (result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
        Object.assign(validated, result.data);
      } else {
        validated.body = result.data;
      }
    }
  }

  // Throw with all accumulated errors if any validation failed
  if (validationErrors.length > 0) {
    throw new ValidationError(
      "Validation failed",
      {
        errors: validationErrors,
      },
    );
  }

  return validated;
}

