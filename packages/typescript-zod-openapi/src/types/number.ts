/**
 * Convert an OpenAPI v3 number/integer schema to a Zod schema string
 */
export function convertOpenAPINumberToZod(schema: {
  type: "number" | "integer";
  enum?: number[];
  minimum?: number;
  maximum?: number;
}): string {
  // A numeric enum is a union of literals, mirroring the `1 | 2` the interface emitter renders.
  if (schema.enum && schema.enum.length > 0) {
    const literals = schema.enum.map((value) => `z.literal(${value})`);
    return literals.length === 1 ? (literals[0] as string) : `z.union([${literals.join(", ")}])`;
  }
  let result = "z.number()";
  if (schema.type === "integer") {
    result += ".int()";
  }
  if (typeof schema.minimum === "number") {
    result += `.min(${schema.minimum})`;
  }
  if (typeof schema.maximum === "number") {
    result += `.max(${schema.maximum})`;
  }
  return result;
}
