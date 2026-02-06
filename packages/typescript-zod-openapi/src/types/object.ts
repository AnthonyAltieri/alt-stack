import { AnySchema, OpenAPIObjectSchema } from "./types";

const validIdentifierRegex = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

function quotePropertyName(name: string): string {
  return validIdentifierRegex.test(name) ? name : `'${name}'`;
}

export function convertOpenAPIObjectToZod(
  schema: OpenAPIObjectSchema,
  convertSchema: (schema: AnySchema) => string,
): string {
  const properties = schema.properties || {};
  const propertyNames = Object.keys(properties);

  if (propertyNames.length === 0) {
    if (schema.additionalProperties === false) {
      return "z.object({}).strict()";
    }
    return "z.record(z.string(), z.unknown())";
  }

  const requiredSet = new Set(schema.required || []);

  const entries: string[] = [];
  for (const [propName, propSchema] of Object.entries(properties)) {
    let zodProp = "z.unknown()";

    if (propSchema && typeof propSchema === "object") {
      zodProp = convertSchema(propSchema);
    }

    if (!requiredSet.has(propName)) {
      zodProp += ".optional()";
    }

    entries.push(`${quotePropertyName(propName)}: ${zodProp}`);
  }

  let result = `z.object({ ${entries.join(", ")} })`;

  if (schema.additionalProperties === false) {
    result += ".strict()";
  }

  return result;
}
