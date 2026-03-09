/**
 * Convert an OpenAPI v3 boolean schema to a Zod schema string
 */
export function convertOpenAPIBooleanToZod(_: { type: "boolean" }): string {
  return "z.boolean()";
}
