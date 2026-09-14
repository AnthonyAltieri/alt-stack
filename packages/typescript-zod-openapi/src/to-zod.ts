import { convertOpenAPIBooleanToZod } from "./types/boolean";
import { convertOpenAPINumberToZod } from "./types/number";
import { convertOpenAPIStringToZod } from "./types/string";
import { convertOpenAPIArrayToZod } from "./types/array";
import { convertOpenAPIObjectToZod } from "./types/object";
import { convertOpenAPIUnionToZod } from "./types/union";
import { convertOpenAPIIntersectionToZod } from "./types/intersection";
import type { AnySchema } from "./types/types";

export function convertSchemaToZodString(schema: AnySchema): string {
  if (!schema || typeof schema !== "object") return "z.unknown()";

  const isNullable = schema["nullable"] === true;

  if (schema["$ref"] && typeof schema["$ref"] === "string") {
    const match = (schema["$ref"] as string).match(
      /#\/components\/schemas\/(.+)/,
    );
    let result: string = "z.unknown()";
    if (match && match[1]) {
      result = `${match[1]}Schema`;
    }
    return isNullable ? `${result}.nullable()` : result;
  }

  // A fixed value (OpenAPI 3.1 `const`) is a literal; the interface emitter renders the same value.
  if ("const" in schema) {
    const literal = schema["const"] === null ? "z.null()" : `z.literal(${JSON.stringify(schema["const"])})`;
    return isNullable && schema["const"] !== null ? `${literal}.nullable()` : literal;
  }

  let result: string = "z.unknown()";

  if ("oneOf" in schema && Array.isArray(schema["oneOf"])) {
    result = convertOpenAPIUnionToZod(
      schema as { oneOf: AnySchema[] },
      convertSchemaToZodString,
    );
  } else if ("anyOf" in schema && Array.isArray(schema["anyOf"])) {
    result = convertOpenAPIUnionToZod(
      schema as { anyOf: AnySchema[] },
      convertSchemaToZodString,
    );
  } else if ("allOf" in schema && Array.isArray(schema["allOf"])) {
    result = convertOpenAPIIntersectionToZod(
      schema as { allOf: AnySchema[] },
      convertSchemaToZodString,
    );
  } else {
    switch (schema["type"]) {
      case "string":
        result = convertOpenAPIStringToZod({
          enum: schema["enum"],
          format: schema["format"],
          maxLength: schema["maxLength"],
          minLength: schema["minLength"],
          pattern: schema["pattern"],
          type: "string",
        });
        break;
      case "number":
        result = convertOpenAPINumberToZod({
          enum: schema["enum"],
          maximum: schema["maximum"],
          minimum: schema["minimum"],
          type: "number",
        });
        break;
      case "integer":
        result = convertOpenAPINumberToZod({
          enum: schema["enum"],
          maximum: schema["maximum"],
          minimum: schema["minimum"],
          type: "integer",
        });
        break;
      case "boolean":
        result = convertOpenAPIBooleanToZod({ type: "boolean" });
        break;
      case "null":
        result = "z.null()";
        break;
      case "array":
        result = convertOpenAPIArrayToZod(
          {
            items: schema["items"],
            maxItems: schema["maxItems"],
            minItems: schema["minItems"],
            type: "array",
          },
          convertSchemaToZodString,
        );
        break;
      case "object":
        result = convertOpenAPIObjectToZod(
          {
            additionalProperties: schema["additionalProperties"],
            properties: schema["properties"],
            required: schema["required"],
            type: "object",
          },
          convertSchemaToZodString,
        );
        break;
      default:
        if (schema["properties"]) {
          result = convertOpenAPIObjectToZod(
            {
              additionalProperties: schema["additionalProperties"],
              properties: schema["properties"],
              required: schema["required"],
              type: "object",
            },
            convertSchemaToZodString,
          );
        } else {
          result = "z.unknown()";
        }
        break;
    }
  }

  return isNullable ? `${result}.nullable()` : result;
}
