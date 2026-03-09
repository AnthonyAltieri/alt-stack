import type { AnySchema } from "./types";

export function convertOpenAPIArrayToZod(
  schema: {
    type: "array";
    items?: any;
    minItems?: number;
    maxItems?: number;
  },
  convertSchema: (schema: AnySchema) => string,
): string {
  const item = schema.items;

  let itemZodString = "z.unknown()";
  if (item && typeof item === "object") {
    itemZodString = convertSchema(item);
  }

  let result = `z.array(${itemZodString})`;

  if (typeof schema.minItems === "number") {
    result += `.min(${schema.minItems})`;
  }
  if (typeof schema.maxItems === "number") {
    result += `.max(${schema.maxItems})`;
  }

  return result;
}
