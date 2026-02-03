import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { openApiToZodTsCode } from "./to-typescript";
import { convertSchemaToZodString } from "./to-zod";
import { topologicalSortSchemas } from "./dependencies";
import type { AnySchema } from "./types/types";

function loadMasterOpenApiSpec(): AnySchema {
  const specUrl = new URL("../../openapi-test-spec/openapi.json", import.meta.url);
  return JSON.parse(readFileSync(specUrl, "utf8")) as AnySchema;
}

function evaluateZodExpression(
  expression: string,
  env: Record<string, unknown>,
): z.ZodTypeAny {
  const paramNames = Object.keys(env);
  const paramValues = Object.values(env);
  // eslint-disable-next-line no-new-func
  const fn = new Function(...paramNames, `return (${expression});`) as (
    ...args: unknown[]
  ) => z.ZodTypeAny;
  return fn(...paramValues);
}

describe("master OpenAPI fixture", () => {
  it("generates TypeScript code (components + routes) without throwing", () => {
    const openapi = loadMasterOpenApiSpec();
    const result = openApiToZodTsCode(openapi, undefined, {
      includeRoutes: true,
    });

    expect(result).toContain("This file was automatically generated");
    expect(result).toContain("export const UserSchema");
    expect(result).toContain("export const Request = {");
    expect(result).toContain("export const Response = {");
    expect(result).toContain("export const GetUsersIdParams");
    expect(result).toContain("export const GetUsersId200Response");
    expect(result).toContain("export const PostUsersBody");
    expect(result).toContain("export const PostUsers201Response");
  });

  it("converts component schemas to Zod and validates fixture examples", () => {
    const openapi = loadMasterOpenApiSpec();
    const schemas = (openapi.components?.schemas ?? {}) as Record<
      string,
      AnySchema
    >;

    const sortedNames = topologicalSortSchemas(schemas);
    const env: Record<string, unknown> = { z };

    for (const name of sortedNames) {
      const schema = schemas[name];
      expect(schema).toBeTruthy();

      const zodExpression = convertSchemaToZodString(schema);
      expect(zodExpression).not.toBe("z.unknown()");

      const zodSchema = evaluateZodExpression(zodExpression, env);
      env[`${name}Schema`] = zodSchema;

      const examples = schema["x-altstack-examples"] as
        | { valid?: unknown[]; invalid?: unknown[] }
        | undefined;

      if (examples?.valid) {
        for (const [index, value] of examples.valid.entries()) {
          const result = zodSchema.safeParse(value);
          if (!result.success) {
            throw new Error(
              [
                `Expected example to be valid but it failed validation`,
                `schema: ${name}`,
                `exampleIndex: ${index}`,
                `zod: ${zodExpression}`,
                `value: ${JSON.stringify(value)}`,
                `issues: ${JSON.stringify(result.error.issues)}`,
              ].join("\n"),
            );
          }
        }
      }

      if (examples?.invalid) {
        for (const [index, value] of examples.invalid.entries()) {
          const result = zodSchema.safeParse(value);
          if (result.success) {
            throw new Error(
              [
                `Expected example to be invalid but it validated successfully`,
                `schema: ${name}`,
                `exampleIndex: ${index}`,
                `zod: ${zodExpression}`,
                `value: ${JSON.stringify(value)}`,
              ].join("\n"),
            );
          }
        }
      }
    }
  });

  it("roundtrips converted Zod schemas back to OpenAPI JSON Schema", () => {
    const openapi = loadMasterOpenApiSpec();
    const schemas = (openapi.components?.schemas ?? {}) as Record<
      string,
      AnySchema
    >;

    const sortedNames = topologicalSortSchemas(schemas);
    const env: Record<string, unknown> = { z };

    for (const name of sortedNames) {
      const schema = schemas[name];
      const zodExpression = convertSchemaToZodString(schema);
      const zodSchema = evaluateZodExpression(zodExpression, env);
      env[`${name}Schema`] = zodSchema;

      expect(() =>
        z.toJSONSchema(zodSchema, { target: "openapi-3.0" })
      ).not.toThrow();
    }
  });
});
