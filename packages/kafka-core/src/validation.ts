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

export async function validateMessage<T extends InputConfig>(
  config: T,
  messageValue: Buffer | null,
): Promise<Record<string, unknown>> {
  if (!config.message) {
    return {};
  }

  let parsedValue: unknown;
  try {
    if (messageValue === null) {
      parsedValue = null;
    } else {
      const messageString = messageValue.toString("utf-8");
      try {
        parsedValue = JSON.parse(messageString);
      } catch {
        // If not JSON, treat as string
        parsedValue = messageString;
      }
    }
  } catch (error) {
    throw new ValidationError(
      "Failed to parse message value",
      error instanceof Error ? error.message : "Unknown error",
    );
  }

  const result = await parseSchema(config.message, parsedValue);
  if (!result.success) {
    throw new ValidationError(
      result.error?.message || "Message validation failed",
      result.error?.details,
    );
  }

  return result.data as Record<string, unknown>;
}

