import type { AnySchema } from "./types/types";

const reservedNames = new Set(
  ("await break case catch class const continue debugger default delete do else enum export extends false finally for function if implements import in instanceof interface let new null package private protected public return static super switch this throw true try typeof var void while with yield type namespace declare abstract as asserts any boolean never number object string symbol unknown undefined z Request Response").split(" "),
);

export function getBrandName(schema: AnySchema): string | undefined {
  if (!("x-altstack-brand" in schema)) return undefined;
  const name: unknown = schema["x-altstack-brand"];
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) || reservedNames.has(name)) {
    throw new Error(`Invalid x-altstack-brand ${JSON.stringify(name)}: expected a non-reserved identifier`);
  }
  return name;
}

export function brandBaseSchema(schema: AnySchema): AnySchema {
  const { "x-altstack-brand": _brand, nullable: _nullable, ...base } = schema;
  return base;
}

/** Visit schema positions only: example/default payloads are not schemas. */
export function visitSchemas(schema: AnySchema, visit: (schema: AnySchema) => void): void {
  if (!schema || typeof schema !== "object") return;
  visit(schema);
  for (const child of Object.values(schema["properties"] ?? {})) {
    visitSchemas(child as AnySchema, visit);
  }
  for (const key of ["items", "additionalProperties"]) {
    if (typeof schema[key] === "object" && schema[key] !== null) visitSchemas(schema[key], visit);
  }
  for (const key of ["oneOf", "anyOf", "allOf"]) {
    if (Array.isArray(schema[key])) {
      for (const child of schema[key]) visitSchemas(child, visit);
    }
  }
}

export function collectBrands({
  schemas, roots, toType,
}: {
  schemas: Record<string, AnySchema>;
  roots: AnySchema[];
  toType: (schema: AnySchema) => string;
}): Map<string, string> {
  const brands = new Map<string, string>();
  const baseTypes = new Map<string, string>();
  for (const root of roots) {
    visitSchemas(root, (schema) => {
      const name = getBrandName(schema);
      if (!name) return;
      let base = brandBaseSchema(schema);
      const seen = new Set<string>();
      while (typeof base["$ref"] === "string") {
        const target = decodeURIComponent(base["$ref"].replace("#/components/schemas/", ""));
        if (seen.has(target) || !schemas[target]) break;
        seen.add(target);
        const targetSchema = schemas[target]!;
        base = getBrandName(targetSchema) === name ? brandBaseSchema(targetSchema) : targetSchema;
      }
      const type = toType(base);
      const baseType = `${type}:${base["format"] ?? ""}`;
      if (baseTypes.has(name) && baseTypes.get(name) !== baseType) {
        throw new Error(`Conflicting base types for x-altstack-brand ${JSON.stringify(name)}`);
      }
      if (schemas[name] && getBrandName(schemas[name]!) !== name) {
        throw new Error(`x-altstack-brand ${JSON.stringify(name)} conflicts with component ${name}`);
      }
      baseTypes.set(name, baseType);
      brands.set(name, type);
    });
  }
  return brands;
}
