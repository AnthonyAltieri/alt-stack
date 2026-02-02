import {
  getSchemaExportedVariableNameForStringFormat,
} from "../registry";

/**
 * Convert an OpenAPI v3 string schema to a Zod schema string
 */
export function convertOpenAPIStringToZod(schema: {
  type: "string";
  format?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
}): string {
  // Handle enum values
  if (schema.enum) {
    return `z.enum([${schema.enum.map((value) => `'${value}'`).join(", ")}])`;
  }

  // Check for custom registered format schemas
  if (schema.format) {
    const customSchemaName =
      getSchemaExportedVariableNameForStringFormat(schema.format);
    if (customSchemaName) return customSchemaName;
  }

  // Build string schema with format modifiers
  let zodSchema = "z.string()";

  if (schema.format) {
    zodSchema += getFormatModifier(schema.format);
  }

  // Apply length constraints
  if (typeof schema.minLength === "number") {
    zodSchema += `.min(${schema.minLength})`;
  }

  if (typeof schema.maxLength === "number") {
    zodSchema += `.max(${schema.maxLength})`;
  }

  // Apply pattern constraint
  if (typeof schema.pattern === "string") {
    zodSchema += `.regex(/${schema.pattern}/)`;
  }

  return zodSchema;
}

/**
 * Get the Zod modifier for built-in string formats
 */
function getFormatModifier(format: string): string {
  switch (format) {
    case "email":
      return ".email()";
    case "url":
    case "uri":
      return ".url()";
    case "uuid":
      return ".uuid()";
    case "color-hex":
      return ".regex(/^[a-fA-F0-9]{6}$/)";
    default:
      return "";
  }
}
