import { z } from "zod";

// ============================================================================
// Constants
// ============================================================================

const SUPPORTED_STRING_FORMATS_MAP = {
  "color-hex": 1,
  date: 1,
  "date-time": 1,
  email: 1,
  "iso-date": 1,
  "iso-date-time": 1,
  objectid: 1,
  uri: 1,
  url: 1,
  uuid: 1,
} as const;

export const SUPPORTED_STRING_FORMATS = Object.keys(
  SUPPORTED_STRING_FORMATS_MAP,
) as unknown as keyof typeof SUPPORTED_STRING_FORMATS_MAP;

type SupportedStringFormat = typeof SUPPORTED_STRING_FORMATS;

// ============================================================================
// Types
// ============================================================================

export type ZodAsyncApiRegistrationString<
  F extends SupportedStringFormat = SupportedStringFormat,
> = {
  /** The name of the schema variable, IMPORTANT: must be named the same as the variable name */
  schemaExportedVariableName: string;
  type: "string";
  description?: string;
  format: F;
};

export type ZodAsyncApiRegistrationStrings<
  Fs extends readonly SupportedStringFormat[] = readonly SupportedStringFormat[],
> = {
  /** The name of the schema variable, IMPORTANT: must be named the same as the variable name */
  schemaExportedVariableName: string;
  type: "string";
  description?: string;
  formats: Fs;
};

export type ZodAsyncApiRegistrationPrimitive = {
  /** The name of the schema variable, IMPORTANT: must be named the same as the variable name */
  schemaExportedVariableName: string;
  description?: string;
  type: "number" | "integer" | "boolean";
};

export type ZodAsyncApiRegistration =
  | ZodAsyncApiRegistrationString
  | ZodAsyncApiRegistrationStrings
  | ZodAsyncApiRegistrationPrimitive;

// ============================================================================
// Type Guards
// ============================================================================

function isStringRegistration(
  reg: ZodAsyncApiRegistration,
): reg is ZodAsyncApiRegistrationString {
  return reg.type === "string" && "format" in reg;
}

function isStringsRegistration(
  reg: ZodAsyncApiRegistration,
): reg is ZodAsyncApiRegistrationStrings {
  return reg.type === "string" && "formats" in reg;
}

// ============================================================================
// Helper Functions
// ============================================================================

type TypeFormatPair = { type: string; format: string | undefined };

function getTypeFormatPairs(reg: ZodAsyncApiRegistration): TypeFormatPair[] {
  if (isStringRegistration(reg)) {
    return [{ type: "string", format: reg.format }];
  }

  if (isStringsRegistration(reg)) {
    return reg.formats.map((f) => ({ type: "string", format: f }));
  }

  return [];
}

// ============================================================================
// Registry Class
// ============================================================================

/**
 * Global registry for mapping Zod schemas to AsyncAPI schema representations
 */
class ZodSchemaRegistry {
  private readonly map = new Map<z.ZodTypeAny, ZodAsyncApiRegistration>();

  /**
   * Register a Zod schema with its AsyncAPI representation
   */
  register<F extends SupportedStringFormat>(
    schema: z.ZodTypeAny,
    registration: ZodAsyncApiRegistrationString<F>,
  ): void;
  register<Fs extends readonly SupportedStringFormat[]>(
    schema: z.ZodTypeAny,
    registration: ZodAsyncApiRegistrationStrings<Fs>,
  ): void;
  register(
    schema: z.ZodTypeAny,
    registration: ZodAsyncApiRegistrationPrimitive,
  ): void;
  register(schema: z.ZodTypeAny, registration: ZodAsyncApiRegistration): void {
    const newPairs = getTypeFormatPairs(registration);

    if (newPairs.length > 0) {
      for (const [existingSchema, existingRegistration] of this.map.entries()) {
        if (existingSchema === schema) continue;

        const existingPairs = getTypeFormatPairs(existingRegistration);
        for (const { type, format } of newPairs) {
          if (
            existingPairs.some((p) => p.type === type && p.format === format)
          ) {
            throw new Error(
              `duplicate Zod AsyncAPI registration for (type, format)=('${type}', '${format as string}')`,
            );
          }
        }
      }
    }

    this.map.set(schema, registration);
  }

  /**
   * Get the AsyncAPI schema for a given Zod schema
   */
  getAsyncApiSchema(schema: z.ZodTypeAny): ZodAsyncApiRegistration | undefined {
    return this.map.get(schema);
  }

  /**
   * Check if a Zod schema is registered
   */
  isRegistered(schema: z.ZodTypeAny): boolean {
    return this.map.has(schema);
  }

  /**
   * Clear all registered schemas
   */
  clear(): void {
    this.map.clear();
  }

  /**
   * Reverse-lookup helper: given a string format, return the registered schema's exported variable name
   */
  getSchemaExportedVariableNameForStringFormat(
    format: SupportedStringFormat,
  ): string | undefined {
    for (const registration of this.map.values()) {
      if (registration.type !== "string") continue;

      if (
        isStringRegistration(registration) &&
        registration.format === format
      ) {
        return registration.schemaExportedVariableName;
      }

      if (
        isStringsRegistration(registration) &&
        registration.formats.includes(format)
      ) {
        return registration.schemaExportedVariableName;
      }
    }
    return undefined;
  }
}

// ============================================================================
// Global Registry Instance
// ============================================================================

export const schemaRegistry = new ZodSchemaRegistry();

// ============================================================================
// Public API
// ============================================================================

/**
 * Helper function to register a Zod schema with its AsyncAPI representation
 */
export function registerZodSchemaToAsyncApiSchema(
  schema: z.ZodTypeAny,
  asyncApiSchema: ZodAsyncApiRegistration,
): void {
  schemaRegistry.register(schema, asyncApiSchema as any);
}

/**
 * Convenience helper to get an exported schema variable name for a given string format
 */
export function getSchemaExportedVariableNameForStringFormat(
  format: SupportedStringFormat,
): string | undefined {
  return schemaRegistry.getSchemaExportedVariableNameForStringFormat(format);
}

/**
 * Clear all registered schemas in the global registry
 */
export function clearZodSchemaToAsyncApiSchemaRegistry(): void {
  schemaRegistry.clear();
}

