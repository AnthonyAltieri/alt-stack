import type { z } from "zod";

/**
 * Extract _tag literal value(s) from a Zod schema.
 * Handles z.object with _tag: z.literal(), z.union of objects, etc.
 *
 * This function accesses Zod internals to extract literal values.
 * Tests exist to catch breakage if Zod changes its internal structure.
 */
export function extractTagsFromSchema(schema: z.ZodTypeAny): string[] {
  // Handle z.object with _tag field
  if (schema && typeof schema === "object" && "shape" in schema) {
    const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
    if (shape && "_tag" in shape) {
      const tagSchema = shape._tag;
      // z.literal in Zod v4 has a `values` Set
      if (tagSchema && "values" in tagSchema && tagSchema.values instanceof Set) {
        return [...tagSchema.values] as string[];
      }
      // Fallback for older Zod versions or different literal representations
      if (tagSchema && "_def" in tagSchema) {
        const def = (tagSchema as any)._def;
        if (def?.value !== undefined) {
          return [def.value as string];
        }
        if (def?.values !== undefined) {
          return def.values as string[];
        }
      }
    }
  }
  return [];
}

/**
 * Find HTTP status code for an error by matching its _tag against declared error schemas.
 * Error schemas are Zod schemas with _tag: z.literal() fields.
 */
export function findHttpStatusForError(
  tag: string,
  errorSchemas: Record<number, z.ZodTypeAny> | undefined,
): number {
  if (!errorSchemas) return 500;
  for (const [status, schema] of Object.entries(errorSchemas)) {
    const tags = extractTagsFromSchema(schema as z.ZodTypeAny);
    if (tags.includes(tag)) {
      return Number(status);
    }
  }
  return 500;
}
