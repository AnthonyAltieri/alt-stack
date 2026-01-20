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

export type ZodOpenApiRegistrationString<
  F extends SupportedStringFormat = SupportedStringFormat,
> = {
  /** The name of the schema variable, IMPORTANT: must be named the same as the variable name */
  schemaExportedVariableName: string;
  type: "string";
  description?: string;
  format: F;
};

export type ZodOpenApiRegistrationStrings<
  Fs extends
    readonly SupportedStringFormat[] = readonly SupportedStringFormat[],
> = {
  /** The name of the schema variable, IMPORTANT: must be named the same as the variable name */
  schemaExportedVariableName: string;
  type: "string";
  description?: string;
  formats: Fs;
};

export type ZodOpenApiRegistrationPrimitive = {
  /** The name of the schema variable, IMPORTANT: must be named the same as the variable name */
  schemaExportedVariableName: string;
  description?: string;
  type: "number" | "integer" | "boolean";
};

export type ZodOpenApiRegistration =
  | ZodOpenApiRegistrationString
  | ZodOpenApiRegistrationStrings
  | ZodOpenApiRegistrationPrimitive;

// ============================================================================
// Type Guards
// ============================================================================

function isStringRegistration(
  reg: ZodOpenApiRegistration,
): reg is ZodOpenApiRegistrationString {
  return reg.type === "string" && "format" in reg;
}

function isStringsRegistration(
  reg: ZodOpenApiRegistration,
): reg is ZodOpenApiRegistrationStrings {
  return reg.type === "string" && "formats" in reg;
}

function isSupportedStringFormat(
  format: string,
): format is SupportedStringFormat {
  return Object.prototype.hasOwnProperty.call(SUPPORTED_STRING_FORMATS_MAP, format);
}

// ============================================================================
// Helper Functions
// ============================================================================

type TypeFormatPair = { type: string; format: string | undefined };

function getTypeFormatPairs(reg: ZodOpenApiRegistration): TypeFormatPair[] {
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
 * Global registry for mapping Zod schemas to OpenAPI schema representations
 */
class ZodSchemaRegistry {
  private readonly map = new Map<z.ZodTypeAny, ZodOpenApiRegistration>();

  /**
   * Register a Zod schema with its OpenAPI representation
   */
  register<F extends SupportedStringFormat>(
    schema: z.ZodTypeAny,
    registration: ZodOpenApiRegistrationString<F>,
  ): void;
  register<Fs extends readonly SupportedStringFormat[]>(
    schema: z.ZodTypeAny,
    registration: ZodOpenApiRegistrationStrings<Fs>,
  ): void;
  register(
    schema: z.ZodTypeAny,
    registration: ZodOpenApiRegistrationPrimitive,
  ): void;
  register(schema: z.ZodTypeAny, registration: ZodOpenApiRegistration): void {
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
              `duplicate Zod OpenAPI registration for (type, format)=('${type}', '${format as string}')`,
            );
          }
        }
      }
    }

    this.map.set(schema, registration);
  }

  /**
   * Get the OpenAPI schema for a given Zod schema
   */
  getOpenApiSchema(schema: z.ZodTypeAny): ZodOpenApiRegistration | undefined {
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
    format: SupportedStringFormat | string,
  ): string | undefined {
    if (!isSupportedStringFormat(format)) return undefined;
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

  /**
   * Reverse-lookup helper: given a primitive type, return the registered schema's exported variable name
   */
  getSchemaExportedVariableNameForPrimitiveType(
    type: ZodOpenApiRegistrationPrimitive["type"],
  ): string | undefined {
    for (const registration of this.map.values()) {
      if (registration.type === type) {
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
 * Helper function to register a Zod schema with its OpenAPI representation
 */
export function registerZodSchemaToOpenApiSchema(
  schema: z.ZodTypeAny,
  openApiSchema: ZodOpenApiRegistration,
): void {
  schemaRegistry.register(schema, openApiSchema as any);
}

/**
 * Convenience helper to get an exported schema variable name for a given string format
 */
export function getSchemaExportedVariableNameForStringFormat(
  format: SupportedStringFormat | string,
): string | undefined {
  return schemaRegistry.getSchemaExportedVariableNameForStringFormat(format);
}

/**
 * Convenience helper to get an exported schema variable name for a given primitive type
 */
export function getSchemaExportedVariableNameForPrimitiveType(
  type: ZodOpenApiRegistrationPrimitive["type"],
): string | undefined {
  return schemaRegistry.getSchemaExportedVariableNameForPrimitiveType(type);
}

/**
 * Clear all registered schemas in the global registry
 */
export function clearZodSchemaToOpenApiSchemaRegistry(): void {
  schemaRegistry.clear();
}
