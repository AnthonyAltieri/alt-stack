/**
 * Convert an OpenAPI v3 number/integer schema to a Zod schema string
 */
export function convertOpenAPINumberToZod(schema: {
  type: "number" | "integer";
  minimum?: number;
  maximum?: number;
}): string {
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
