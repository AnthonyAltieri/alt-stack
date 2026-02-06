export type AnySchema = Record<string, any>;

export type OpenAPIObjectSchema = {
  type: "object";
  properties?: Record<string, AnySchema>;
  required?: string[];
  additionalProperties?: boolean | AnySchema;
  maxProperties?: number;
  minProperties?: number;
};
