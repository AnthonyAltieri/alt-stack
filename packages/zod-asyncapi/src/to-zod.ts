import type { AnySchema } from "./types.js";

// ============================================================================
// Type Converters
// ============================================================================

function convertStringToZod(schema: AnySchema): string {
  if (schema["enum"] && Array.isArray(schema["enum"])) {
    const values = schema["enum"] as string[];
    return `z.enum([${values.map((v) => `'${v}'`).join(", ")}])`;
  }

  let result = "z.string()";

  const format = schema["format"];
  if (format === "email") result += ".email()";
  else if (format === "url" || format === "uri") result += ".url()";
  else if (format === "uuid") result += ".uuid()";

  if (typeof schema["minLength"] === "number") {
    result += `.min(${schema["minLength"]})`;
  }
  if (typeof schema["maxLength"] === "number") {
    result += `.max(${schema["maxLength"]})`;
  }
  if (typeof schema["pattern"] === "string") {
    result += `.regex(/${schema["pattern"]}/)`;
  }

  return result;
}

function convertNumberToZod(schema: AnySchema): string {
  let result = "z.number()";

  if (schema["type"] === "integer") {
    result += ".int()";
  }
  if (typeof schema["minimum"] === "number") {
    result += `.min(${schema["minimum"]})`;
  }
  if (typeof schema["maximum"] === "number") {
    result += `.max(${schema["maximum"]})`;
  }

  return result;
}

function convertArrayToZod(
  schema: AnySchema,
  convert: (s: AnySchema) => string,
): string {
  const items = schema["items"];
  let itemZod = "z.unknown()";

  if (items && typeof items === "object") {
    itemZod = convert(items as AnySchema);
  }

  let result = `z.array(${itemZod})`;

  if (typeof schema["minItems"] === "number") {
    result += `.min(${schema["minItems"]})`;
  }
  if (typeof schema["maxItems"] === "number") {
    result += `.max(${schema["maxItems"]})`;
  }

  return result;
}

function convertObjectToZod(
  schema: AnySchema,
  convert: (s: AnySchema) => string,
): string {
  const properties = (schema["properties"] as Record<string, AnySchema>) ?? {};
  const propertyNames = Object.keys(properties);

  if (propertyNames.length === 0) {
    if (schema["additionalProperties"] === false) {
      return "z.object({}).strict()";
    }
    return "z.record(z.string(), z.unknown())";
  }

  const required = new Set((schema["required"] as string[]) ?? []);
  const entries: string[] = [];

  for (const [name, propSchema] of Object.entries(properties)) {
    let zodProp = convert(propSchema);
    if (!required.has(name)) {
      zodProp += ".optional()";
    }
    entries.push(`${name}: ${zodProp}`);
  }

  let result = `z.object({ ${entries.join(", ")} })`;

  if (schema["additionalProperties"] === false) {
    result += ".strict()";
  }

  return result;
}

function convertUnionToZod(
  schemas: AnySchema[],
  convert: (s: AnySchema) => string,
): string {
  const items = schemas.map((s) => convert(s));
  return `z.union([${items.join(", ")}])`;
}

function convertIntersectionToZod(
  schemas: AnySchema[],
  convert: (s: AnySchema) => string,
): string {
  if (schemas.length === 0) return "z.unknown()";
  if (schemas.length === 1) return convert(schemas[0]!);

  const items = schemas.map((s) => convert(s));
  return `z.intersection(${items.join(", ")})`;
}

// ============================================================================
// Main Converter
// ============================================================================

export function convertSchemaToZodString(schema: AnySchema): string {
  if (!schema || typeof schema !== "object") return "z.unknown()";

  // Handle $ref
  if (schema["$ref"] && typeof schema["$ref"] === "string") {
    const ref = schema["$ref"] as string;
    // Handle #/components/schemas/Name
    const schemaMatch = ref.match(/#\/components\/schemas\/(.+)/);
    if (schemaMatch?.[1]) {
      let result = `${schemaMatch[1]}Schema`;
      if (schema["nullable"] === true) {
        result = `z.union([${result}, z.null()])`;
      }
      return result;
    }
    // Handle #/components/messages/Name - extract payload
    const messageMatch = ref.match(/#\/components\/messages\/(.+)/);
    if (messageMatch?.[1]) {
      return `${messageMatch[1]}PayloadSchema`;
    }
    return "z.unknown()";
  }

  let result = "z.unknown()";

  if (Array.isArray(schema["oneOf"])) {
    result = convertUnionToZod(schema["oneOf"] as AnySchema[], convertSchemaToZodString);
  } else if (Array.isArray(schema["allOf"])) {
    result = convertIntersectionToZod(schema["allOf"] as AnySchema[], convertSchemaToZodString);
  } else {
    switch (schema["type"]) {
      case "string":
        result = convertStringToZod(schema);
        break;
      case "number":
      case "integer":
        result = convertNumberToZod(schema);
        break;
      case "boolean":
        result = "z.boolean()";
        break;
      case "array":
        result = convertArrayToZod(schema, convertSchemaToZodString);
        break;
      case "object":
        result = convertObjectToZod(schema, convertSchemaToZodString);
        break;
      default:
        if (schema["properties"]) {
          result = convertObjectToZod(schema, convertSchemaToZodString);
        }
        break;
    }
  }

  if (schema["nullable"] === true) {
    result = `z.union([${result}, z.null()])`;
  }

  return result;
}

