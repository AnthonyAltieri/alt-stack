import type { AnySchema } from "./types";

/**
 * Convert an OpenAPI `oneOf` or `anyOf` composition to a Zod schema string.
 * A single member is returned as itself, since `z.union` needs at least two options.
 */
export function convertOpenAPIUnionToZod(
  schema: { oneOf?: AnySchema[]; anyOf?: AnySchema[] },
  convertSchema: (schema: AnySchema) => string,
): string {
  const members = schema.oneOf ?? schema.anyOf ?? [];
  const items = members.map((item) => convertSchema(item));
  if (items.length === 0) return "z.unknown()";
  if (items.length === 1) return items[0] as string;
  return `z.union([${items.join(", ")}])`;
}
