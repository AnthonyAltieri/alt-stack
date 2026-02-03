import type { AnySchema } from "./types";

export function convertOpenAPIIntersectionToZod(
  schema: { allOf: AnySchema[] },
  convertSchema: (schema: AnySchema) => string,
): string {
  const items = schema.allOf.map((item) => convertSchema(item));

  if (schema.allOf.length === 0) return "z.unknown()";
  if (schema.allOf.length === 1) return convertSchema(schema.allOf[0]!);

  let result = `z.intersection(${items[0]}, ${items[1]})`;
  for (let i = 2; i < items.length; i++) {
    result = `z.intersection(${result}, ${items[i]})`;
  }
  return result;
}
