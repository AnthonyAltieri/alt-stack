import type { z } from "zod";
import type { InputConfig } from "./types.js";
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
          details: (result.error as any).errors,
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

  if (config.params) {
    const result = await parseSchema(config.params, params);
    if (!result.success) {
      throw new ValidationError(
        result.error?.message || "Params validation failed",
        result.error?.details,
      );
    }
    Object.assign(validated, result.data);
  }

  if (config.query) {
    const result = await parseSchema(config.query, query);
    if (!result.success) {
      throw new ValidationError(
        result.error?.message || "Query validation failed",
        result.error?.details,
      );
    }
    Object.assign(validated, result.data);
  }

  if (config.body) {
    const result = await parseSchema(config.body, body);
    if (!result.success) {
      throw new ValidationError(
        result.error?.message || "Body validation failed",
        result.error?.details,
      );
    }
    if (result.data && typeof result.data === "object" && !Array.isArray(result.data)) {
      Object.assign(validated, result.data);
    } else {
      validated.body = result.data;
    }
  }

  return validated;
}

