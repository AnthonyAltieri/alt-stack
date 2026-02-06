import type { AnySchema } from "./types";

export function convertOpenAPIUnionToZod(
  schema: { oneOf: AnySchema[] },
  convertSchema: (schema: AnySchema) => string,
): string {
  const items = schema.oneOf.map((item) => convertSchema(item));
  return `z.union([${items.join(", ")}])`;
}

