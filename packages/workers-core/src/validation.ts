import type { z } from "zod";
import type { InputConfig, InferInput } from "./types/index.js";
import { ValidationError } from "./errors.js";

export interface ParseResult<T> {
  success: boolean;
  data?: T;
  error?: z.ZodError;
}

/**
 * Parse a value against a Zod schema
 */
export function parseSchema<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  value: unknown,
): ParseResult<z.infer<TSchema>> {
  const result = schema.safeParse(value);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Validate job input against the configured schema
 */
export async function validateInput<TInput extends InputConfig>(
  inputConfig: TInput,
  payload: unknown,
): Promise<InferInput<TInput>> {
  if (!inputConfig.payload) {
    return payload as InferInput<TInput>;
  }

  const result = parseSchema(inputConfig.payload, payload);
  if (!result.success) {
    throw new ValidationError("Payload validation failed", {
      errors: result.error?.issues.map((e) => ({
        path: e.path.join("."),
        message: e.message,
      })),
    });
  }

  return result.data as InferInput<TInput>;
}
