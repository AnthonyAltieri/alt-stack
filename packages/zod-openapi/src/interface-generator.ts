/**
 * Generates TypeScript interface/type strings from OpenAPI schemas.
 *
 * This produces concrete types that appear directly in .d.ts files,
 * rather than requiring z.infer<> resolution at the type level.
 */

import {
  getSchemaExportedVariableNameForPrimitiveType,
  getSchemaExportedVariableNameForStringFormat,
} from "./registry";
import type { AnySchema } from "./types/types";

const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

type SchemaToTypeOptions = {
  outputSchemaNames?: Set<string>;
};

function quotePropertyName(name: string): string {
  return validIdentifierRegex.test(name) ? name : `'${name}'`;
}

function toPascalCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[^a-zA-Z0-9]/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
}

export function schemaExportNameToOutputAlias(name: string): string {
  return `${toPascalCase(name)}Output`;
}

function registerOutputSchemaName(
  schemaName: string,
  options?: SchemaToTypeOptions,
): string {
  options?.outputSchemaNames?.add(schemaName);
  return schemaExportNameToOutputAlias(schemaName);
}

function getRegisteredOutputAlias(
  schema: AnySchema,
  options?: SchemaToTypeOptions,
): string | undefined {
  if (!schema || typeof schema !== "object") return undefined;

  if (schema["type"] === "string" && typeof schema["format"] === "string") {
    const customSchemaName = getSchemaExportedVariableNameForStringFormat(
      schema["format"],
    );
    if (customSchemaName) {
      return registerOutputSchemaName(customSchemaName, options);
    }
  }

  if (
    schema["type"] === "number" ||
    schema["type"] === "integer" ||
    schema["type"] === "boolean"
  ) {
    const customSchemaName = getSchemaExportedVariableNameForPrimitiveType(
      schema["type"],
    );
    if (customSchemaName) {
      return registerOutputSchemaName(customSchemaName, options);
    }
  }

  return undefined;
}

/**
 * Converts an OpenAPI schema to a TypeScript type string.
 *
 * @example
 * schemaToTypeString({ type: 'string' }) // => 'string'
 * schemaToTypeString({ type: 'object', properties: { id: { type: 'string' } } }) // => '{ id?: string }'
 */
export function schemaToTypeString(
  schema: AnySchema,
  options?: SchemaToTypeOptions,
): string {
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
      schemaToTypeString(s, options),
    );
    result = unionMembers.length > 1 ? `(${unionMembers.join(" | ")})` : unionMembers[0] ?? "unknown";
  }
  // Handle allOf (intersection)
  else if ("allOf" in schema && Array.isArray(schema["allOf"])) {
    const intersectionMembers = (schema["allOf"] as AnySchema[]).map((s) =>
      schemaToTypeString(s, options),
    );
    result = intersectionMembers.length > 1
      ? `(${intersectionMembers.join(" & ")})`
      : intersectionMembers[0] ?? "unknown";
  }
  // Handle anyOf (union, similar to oneOf)
  else if ("anyOf" in schema && Array.isArray(schema["anyOf"])) {
    const unionMembers = (schema["anyOf"] as AnySchema[]).map((s) =>
      schemaToTypeString(s, options),
    );
    result = unionMembers.length > 1 ? `(${unionMembers.join(" | ")})` : unionMembers[0] ?? "unknown";
  }
  // Handle type-based schemas
  else {
    switch (schema["type"]) {
      case "string": {
        const registeredAlias = getRegisteredOutputAlias(schema, options);
        if (registeredAlias) {
          result = registeredAlias;
        } else if (schema["enum"] && Array.isArray(schema["enum"])) {
          // String enum
          result = (schema["enum"] as string[])
            .map((v) => JSON.stringify(v))
            .join(" | ");
        } else {
          result = "string";
        }
        break;
      }
      case "number":
      case "integer": {
        const registeredAlias = getRegisteredOutputAlias(schema, options);
        if (registeredAlias) {
          result = registeredAlias;
        } else if (schema["enum"] && Array.isArray(schema["enum"])) {
          // Numeric enum
          result = (schema["enum"] as number[]).map((v) => String(v)).join(" | ");
        } else {
          result = "number";
        }
        break;
      }
      case "boolean":
        result = getRegisteredOutputAlias(schema, options) ?? "boolean";
        break;
      case "null":
        result = "null";
        break;
      case "array":
        if (schema["items"]) {
          const itemType = schemaToTypeString(schema["items"] as AnySchema, options);
          result = `Array<${itemType}>`;
        } else {
          result = "unknown[]";
        }
        break;
      case "object":
        result = objectSchemaToTypeString(schema, options);
        break;
      default:
        // Try to detect object from properties
        if (schema["properties"]) {
          result = objectSchemaToTypeString(schema, options);
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
function objectSchemaToTypeString(
  schema: AnySchema,
  options?: SchemaToTypeOptions,
): string {
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
      const propType = schemaToTypeString(propSchema, options);
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
    const additionalType = schemaToTypeString(additionalProperties as AnySchema, options);
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
export function generateInterface(
  name: string,
  schema: AnySchema,
  options?: SchemaToTypeOptions,
): string {
  const properties = schema["properties"] as Record<string, AnySchema> | undefined;
  const required = new Set((schema["required"] as string[]) ?? []);

  // For non-object types, use type alias instead of interface
  if (schema["type"] !== "object" && !properties) {
    return `export type ${name} = ${schemaToTypeString(schema, options)};`;
  }

  const lines: string[] = [];
  lines.push(`export interface ${name} {`);

  if (properties) {
    for (const [propName, propSchema] of Object.entries(properties)) {
      const isRequired = required.has(propName);
      const propType = schemaToTypeString(propSchema, options);
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
    const additionalType = schemaToTypeString(additionalProperties as AnySchema, options);
    lines.push(`  [key: string]: ${additionalType};`);
  }

  lines.push("}");
  return lines.join("\n");
}
