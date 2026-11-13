export type AnySchema = Record<string, any>;

export type OpenAPIObjectSchema = {
  type: "object";
  properties?: Record<string, AnySchema>;
  required?: string[];
  additionalProperties?: boolean | AnySchema;
  maxProperties?: number;
  minProperties?: number;
};

/**
 * How to generate an object schema that has properties but omits `additionalProperties`.
 * `"loose"` follows JSON Schema and keeps extra keys; `"strip"` drops them, as Zod's
 * `z.object()` does, and leaves the index signature out of the generated type.
 */
export type UnspecifiedAdditionalProperties = "loose" | "strip";

export type ConversionOptions = {
  unspecifiedAdditionalProperties?: UnspecifiedAdditionalProperties | undefined;
};
