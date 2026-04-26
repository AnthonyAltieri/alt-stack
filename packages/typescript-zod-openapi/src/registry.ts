import { z } from "zod";

// ============================================================================
// Constants
// ============================================================================

export const SUPPORTED_STRING_FORMATS = [
  "color-hex",
  "date",
  "date-time",
  "email",
  "iso-date",
  "iso-date-time",
  "objectid",
  "uri",
  "url",
  "uuid",
] as const;

/**
 * Built-in OpenAPI string formats this package translates into Zod method
 * calls (`.email()`, `.uuid()`, …) via `getFormatModifier`. Custom formats
 * (any other string) are still allowed in registrations — they don't pick
 * up an automatic Zod modifier; the registered schema's exported variable
 * name is referenced directly instead.
 */
export type SupportedStringFormat = (typeof SUPPORTED_STRING_FORMATS)[number];

// ============================================================================
// Types
// ============================================================================

export type ZodOpenApiRegistrationString<F extends string = string> = {
  /** The name of the schema variable, IMPORTANT: must be named the same as the variable name */
  schemaExportedVariableName: string;
  type: "string";
  description?: string;
  format: F;
};

export type ZodOpenApiRegistrationStrings<
  Fs extends readonly string[] = readonly string[],
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
  register<F extends string>(
    schema: z.ZodTypeAny,
    registration: ZodOpenApiRegistrationString<F>,
  ): void;
  register<Fs extends readonly string[]>(
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
   * Reverse-lookup helper: given a string format, return the registered schema's
   * exported variable name. Honors both built-in `SupportedStringFormat` values
   * and arbitrary custom formats supplied via `registerZodSchemaToOpenApiSchema`.
   */
  getSchemaExportedVariableNameForStringFormat(
    format: string,
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
        (registration.formats as readonly string[]).includes(format)
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
 * Convenience helper to get an exported schema variable name for a given
 * string format. Accepts both built-in `SupportedStringFormat` values and
 * arbitrary custom formats registered by the caller.
 */
export function getSchemaExportedVariableNameForStringFormat(
  format: string,
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
