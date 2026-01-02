/**
 * Generates TypeScript interface/type strings from OpenAPI schemas.
 *
 * This produces concrete types that appear directly in .d.ts files,
 * rather than requiring z.infer<> resolution at the type level.
 */

import type { AnySchema } from "./types/types";

const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

function quotePropertyName(name: string): string {
  return validIdentifierRegex.test(name) ? name : `'${name}'`;
}

/**
 * Converts an OpenAPI schema to a TypeScript type string.
 *
 * @example
 * schemaToTypeString({ type: 'string' }) // => 'string'
 * schemaToTypeString({ type: 'object', properties: { id: { type: 'string' } } }) // => '{ id?: string }'
 */
export function schemaToTypeString(schema: AnySchema): string {
  if (!schema || typeof schema !== "object") return "unknown";

  // Handle $ref
  if (schema["$ref"] && typeof schema["$ref"] === "string") {
    const match = (schema["$ref"] as string).match(
      /#\/components\/schemas\/(.+)/,
    );
    let result = "unknown";
    if (match && match[1]) {
      // Decode URI-encoded schema names (e.g., %20 -> space)
      result = decodeURIComponent(match[1]);
    }
    if (schema["nullable"] === true) {
      result = `(${result} | null)`;
    }
    return result;
  }

  let result: string = "unknown";

  // Handle oneOf (union)
  if ("oneOf" in schema && Array.isArray(schema["oneOf"])) {
    const unionMembers = (schema["oneOf"] as AnySchema[]).map((s) =>
      schemaToTypeString(s),
    );
    result = unionMembers.length > 1 ? `(${unionMembers.join(" | ")})` : unionMembers[0] ?? "unknown";
  }
  // Handle allOf (intersection)
  else if ("allOf" in schema && Array.isArray(schema["allOf"])) {
    const intersectionMembers = (schema["allOf"] as AnySchema[]).map((s) =>
      schemaToTypeString(s),
    );
    result = intersectionMembers.length > 1
      ? `(${intersectionMembers.join(" & ")})`
      : intersectionMembers[0] ?? "unknown";
  }
  // Handle anyOf (union, similar to oneOf)
  else if ("anyOf" in schema && Array.isArray(schema["anyOf"])) {
    const unionMembers = (schema["anyOf"] as AnySchema[]).map((s) =>
      schemaToTypeString(s),
    );
    result = unionMembers.length > 1 ? `(${unionMembers.join(" | ")})` : unionMembers[0] ?? "unknown";
  }
  // Handle type-based schemas
  else {
    switch (schema["type"]) {
      case "string":
        if (schema["enum"] && Array.isArray(schema["enum"])) {
          // String enum
          result = (schema["enum"] as string[])
            .map((v) => JSON.stringify(v))
            .join(" | ");
        } else {
          result = "string";
        }
        break;
      case "number":
      case "integer":
        if (schema["enum"] && Array.isArray(schema["enum"])) {
          // Numeric enum
          result = (schema["enum"] as number[]).map((v) => String(v)).join(" | ");
        } else {
          result = "number";
        }
        break;
      case "boolean":
        result = "boolean";
        break;
      case "null":
        result = "null";
        break;
      case "array":
        if (schema["items"]) {
          const itemType = schemaToTypeString(schema["items"] as AnySchema);
          result = `Array<${itemType}>`;
        } else {
          result = "unknown[]";
        }
        break;
      case "object":
        result = objectSchemaToTypeString(schema);
        break;
      default:
        // Try to detect object from properties
        if (schema["properties"]) {
          result = objectSchemaToTypeString(schema);
        } else if (schema["enum"] && Array.isArray(schema["enum"])) {
          // Untyped enum
          result = (schema["enum"] as unknown[])
            .map((v) => JSON.stringify(v))
            .join(" | ");
        } else {
          result = "unknown";
        }
        break;
    }
  }

  // Handle nullable
  if (schema["nullable"] === true) {
    result = `(${result} | null)`;
  }

  return result;
}

/**
 * Converts an OpenAPI object schema to a TypeScript object type string.
 */
function objectSchemaToTypeString(schema: AnySchema): string {
  const properties = schema["properties"] as Record<string, AnySchema> | undefined;
  const required = new Set((schema["required"] as string[]) ?? []);
  const additionalProperties = schema["additionalProperties"];

  if (!properties && !additionalProperties) {
    return "Record<string, unknown>";
  }

  const propertyStrings: string[] = [];

  if (properties) {
    for (const [propName, propSchema] of Object.entries(properties)) {
      const isRequired = required.has(propName);
      const propType = schemaToTypeString(propSchema);
      const quotedName = quotePropertyName(propName);
      propertyStrings.push(
        `${quotedName}${isRequired ? "" : "?"}: ${propType}`,
      );
    }
  }

  // Handle additionalProperties
  if (additionalProperties === true) {
    propertyStrings.push("[key: string]: unknown");
  } else if (
    typeof additionalProperties === "object" &&
    additionalProperties !== null
  ) {
    const additionalType = schemaToTypeString(additionalProperties as AnySchema);
    propertyStrings.push(`[key: string]: ${additionalType}`);
  }

  return `{ ${propertyStrings.join("; ")} }`;
}

/**
 * Generates a full TypeScript interface declaration.
 *
 * @example
 * generateInterface('User', { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] })
 * // => 'export interface User { id: string; }'
 */
export function generateInterface(name: string, schema: AnySchema): string {
  const properties = schema["properties"] as Record<string, AnySchema> | undefined;
  const required = new Set((schema["required"] as string[]) ?? []);

  // For non-object types, use type alias instead of interface
  if (schema["type"] !== "object" && !properties) {
    return `export type ${name} = ${schemaToTypeString(schema)};`;
  }

  const lines: string[] = [];
  lines.push(`export interface ${name} {`);

  if (properties) {
    for (const [propName, propSchema] of Object.entries(properties)) {
      const isRequired = required.has(propName);
      const propType = schemaToTypeString(propSchema);
      const quotedName = quotePropertyName(propName);
      lines.push(`  ${quotedName}${isRequired ? "" : "?"}: ${propType};`);
    }
  }

  // Handle additionalProperties
  const additionalProperties = schema["additionalProperties"];
  if (additionalProperties === true) {
    lines.push("  [key: string]: unknown;");
  } else if (
    typeof additionalProperties === "object" &&
    additionalProperties !== null
  ) {
    const additionalType = schemaToTypeString(additionalProperties as AnySchema);
    lines.push(`  [key: string]: ${additionalType};`);
  }

  lines.push("}");
  return lines.join("\n");
}
