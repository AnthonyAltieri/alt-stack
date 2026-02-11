import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { schemaToTypeString, schemaToInputTypeString, generateInterface } from "./interface-generator";
import { openApiToZodTsCode } from "./to-typescript";
import {
  registerZodSchemaToOpenApiSchema,
  clearZodSchemaToOpenApiSchemaRegistry,
} from "./registry";

beforeEach(() => {
  clearZodSchemaToOpenApiSchemaRegistry();
});

afterEach(() => {
  clearZodSchemaToOpenApiSchemaRegistry();
});

describe("schemaToTypeString", () => {
  describe("primitive types", () => {
    it("should convert string type", () => {
      expect(schemaToTypeString({ type: "string" })).toBe("string");
    });

    it("should convert number type", () => {
      expect(schemaToTypeString({ type: "number" })).toBe("number");
    });

    it("should convert integer type", () => {
      expect(schemaToTypeString({ type: "integer" })).toBe("number");
    });

    it("should convert boolean type", () => {
      expect(schemaToTypeString({ type: "boolean" })).toBe("boolean");
    });

    it("should convert null type", () => {
      expect(schemaToTypeString({ type: "null" })).toBe("null");
    });

    it("should return unknown for unknown schema", () => {
      expect(schemaToTypeString({})).toBe("unknown");
    });

    it("should return unknown for null input", () => {
      expect(schemaToTypeString(null as any)).toBe("unknown");
    });
  });

  describe("string enums", () => {
    it("should convert string enum", () => {
      const result = schemaToTypeString({
        type: "string",
        enum: ["A", "B", "C"],
      });
      expect(result).toBe('"A" | "B" | "C"');
    });

    it("should convert single value enum", () => {
      const result = schemaToTypeString({
        type: "string",
        enum: ["ONLY"],
      });
      expect(result).toBe('"ONLY"');
    });
  });

  describe("registered schemas", () => {
    it("should use output alias for registered string format", () => {
      const uuidSchema = z.string().uuid();
      registerZodSchemaToOpenApiSchema(uuidSchema, {
        schemaExportedVariableName: "uuidSchema",
        type: "string",
        format: "uuid",
      });

      const result = schemaToTypeString({ type: "string", format: "uuid" });
      expect(result).toBe("UuidSchemaOutput");
    });

    it("should use output alias for registered number type", () => {
      const numberSchema = z.number();
      registerZodSchemaToOpenApiSchema(numberSchema, {
        schemaExportedVariableName: "numberSchema",
        type: "number",
      });

      const result = schemaToTypeString({ type: "number" });
      expect(result).toBe("NumberSchemaOutput");
    });
  });

  describe("numeric enums", () => {
    it("should convert number enum", () => {
      const result = schemaToTypeString({
        type: "number",
        enum: [1, 2, 3],
      });
      expect(result).toBe("1 | 2 | 3");
    });

    it("should convert integer enum", () => {
      const result = schemaToTypeString({
        type: "integer",
        enum: [100, 200],
      });
      expect(result).toBe("100 | 200");
    });
  });

  describe("arrays", () => {
    it("should convert array of strings", () => {
      const result = schemaToTypeString({
        type: "array",
        items: { type: "string" },
      });
      expect(result).toBe("Array<string>");
    });

    it("should convert array of numbers", () => {
      const result = schemaToTypeString({
        type: "array",
        items: { type: "number" },
      });
      expect(result).toBe("Array<number>");
    });

    it("should convert array of objects", () => {
      const result = schemaToTypeString({
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
      });
      expect(result).toBe("Array<{ id: string }>");
    });

    it("should convert array without items", () => {
      const result = schemaToTypeString({ type: "array" });
      expect(result).toBe("unknown[]");
    });

    it("should convert nested arrays", () => {
      const result = schemaToTypeString({
        type: "array",
        items: {
          type: "array",
          items: { type: "string" },
        },
      });
      expect(result).toBe("Array<Array<string>>");
    });
  });

  describe("objects", () => {
    it("should convert object with required properties", () => {
      const result = schemaToTypeString({
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
        required: ["id", "name"],
      });
      expect(result).toBe("{ id: string; name: string }");
    });

    it("should convert object with optional properties", () => {
      const result = schemaToTypeString({
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
        required: ["id"],
      });
      expect(result).toBe("{ id: string; name?: string }");
    });

    it("should convert object without required array", () => {
      const result = schemaToTypeString({
        type: "object",
        properties: {
          id: { type: "string" },
        },
      });
      expect(result).toBe("{ id?: string }");
    });

    it("should convert empty object", () => {
      const result = schemaToTypeString({ type: "object" });
      expect(result).toBe("Record<string, unknown>");
    });

    it("should handle additionalProperties true", () => {
      const result = schemaToTypeString({
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: true,
      });
      expect(result).toBe("{ id: string; [key: string]: unknown }");
    });

    it("should handle additionalProperties with type", () => {
      const result = schemaToTypeString({
        type: "object",
        additionalProperties: { type: "number" },
      });
      expect(result).toBe("{ [key: string]: number }");
    });

    it("should quote property names with special characters", () => {
      const result = schemaToTypeString({
        type: "object",
        properties: {
          "Content-Type": { type: "string" },
        },
        required: ["Content-Type"],
      });
      expect(result).toBe("{ 'Content-Type': string }");
    });
  });

  describe("$ref", () => {
    it("should convert $ref to type name", () => {
      const result = schemaToTypeString({
        $ref: "#/components/schemas/User",
      });
      expect(result).toBe("User");
    });

    it("should handle $ref with nullable", () => {
      const result = schemaToTypeString({
        $ref: "#/components/schemas/User",
        nullable: true,
      });
      expect(result).toBe("(User | null)");
    });

    it("should decode URI-encoded $ref", () => {
      const result = schemaToTypeString({
        $ref: "#/components/schemas/My%20Type",
      });
      expect(result).toBe("My Type");
    });

    it("should return unknown for invalid $ref", () => {
      const result = schemaToTypeString({
        $ref: "invalid",
      });
      expect(result).toBe("unknown");
    });
  });

  describe("nullable", () => {
    it("should handle nullable string", () => {
      const result = schemaToTypeString({
        type: "string",
        nullable: true,
      });
      expect(result).toBe("(string | null)");
    });

    it("should handle nullable number", () => {
      const result = schemaToTypeString({
        type: "number",
        nullable: true,
      });
      expect(result).toBe("(number | null)");
    });

    it("should handle nullable array", () => {
      const result = schemaToTypeString({
        type: "array",
        items: { type: "string" },
        nullable: true,
      });
      expect(result).toBe("(Array<string> | null)");
    });

    it("should not add nullable when false", () => {
      const result = schemaToTypeString({
        type: "string",
        nullable: false,
      });
      expect(result).toBe("string");
    });
  });

  describe("oneOf (union)", () => {
    it("should convert oneOf to union type", () => {
      const result = schemaToTypeString({
        oneOf: [{ type: "string" }, { type: "number" }],
      });
      expect(result).toBe("(string | number)");
    });

    it("should handle single oneOf", () => {
      const result = schemaToTypeString({
        oneOf: [{ type: "string" }],
      });
      expect(result).toBe("string");
    });

    it("should handle oneOf with $ref", () => {
      const result = schemaToTypeString({
        oneOf: [
          { $ref: "#/components/schemas/User" },
          { $ref: "#/components/schemas/Admin" },
        ],
      });
      expect(result).toBe("(User | Admin)");
    });
  });

  describe("anyOf (union)", () => {
    it("should convert anyOf to union type", () => {
      const result = schemaToTypeString({
        anyOf: [{ type: "string" }, { type: "number" }],
      });
      expect(result).toBe("(string | number)");
    });
  });

  describe("allOf (intersection)", () => {
    it("should convert allOf to intersection type", () => {
      const result = schemaToTypeString({
        allOf: [
          { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
          { type: "object", properties: { b: { type: "number" } }, required: ["b"] },
        ],
      });
      expect(result).toBe("({ a: string } & { b: number })");
    });

    it("should handle single allOf", () => {
      const result = schemaToTypeString({
        allOf: [{ type: "object", properties: { a: { type: "string" } }, required: ["a"] }],
      });
      expect(result).toBe("{ a: string }");
    });

    it("should handle allOf with $ref", () => {
      const result = schemaToTypeString({
        allOf: [
          { $ref: "#/components/schemas/Base" },
          { type: "object", properties: { extra: { type: "string" } }, required: ["extra"] },
        ],
      });
      expect(result).toBe("(Base & { extra: string })");
    });
  });
});

describe("schemaToInputTypeString", () => {
  describe("primitive types", () => {
    it("should convert string type", () => {
      expect(schemaToInputTypeString({ type: "string" })).toBe("string");
    });

    it("should convert number type", () => {
      expect(schemaToInputTypeString({ type: "number" })).toBe("number");
    });

    it("should convert boolean type", () => {
      expect(schemaToInputTypeString({ type: "boolean" })).toBe("boolean");
    });
  });

  describe("registered schemas", () => {
    it("should use input alias for registered string format", () => {
      const uuidSchema = z.string().uuid();
      registerZodSchemaToOpenApiSchema(uuidSchema, {
        schemaExportedVariableName: "uuidSchema",
        type: "string",
        format: "uuid",
      });

      const result = schemaToInputTypeString({ type: "string", format: "uuid" });
      expect(result).toBe("UuidSchemaInput");
    });

    it("should use input alias for registered number type", () => {
      const numberSchema = z.number();
      registerZodSchemaToOpenApiSchema(numberSchema, {
        schemaExportedVariableName: "numberSchema",
        type: "number",
      });

      const result = schemaToInputTypeString({ type: "number" });
      expect(result).toBe("NumberSchemaInput");
    });

    it("should track input schema names in options", () => {
      const uuidSchema = z.string().uuid();
      registerZodSchemaToOpenApiSchema(uuidSchema, {
        schemaExportedVariableName: "uuidSchema",
        type: "string",
        format: "uuid",
      });

      const inputSchemaNames = new Set<string>();
      schemaToInputTypeString({ type: "string", format: "uuid" }, { inputSchemaNames });
      expect(inputSchemaNames.has("uuidSchema")).toBe(true);
    });
  });

  describe("arrays", () => {
    it("should convert array of strings", () => {
      const result = schemaToInputTypeString({
        type: "array",
        items: { type: "string" },
      });
      expect(result).toBe("Array<string>");
    });
  });

  describe("objects", () => {
    it("should convert object with required properties", () => {
      const result = schemaToInputTypeString({
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
        },
        required: ["id", "name"],
      });
      expect(result).toBe("{ id: string; name: string }");
    });
  });
});

describe("generateInterface", () => {
  it("should generate interface for object schema", () => {
    const result = generateInterface("User", {
      type: "object",
      properties: {
        id: { type: "string" },
        name: { type: "string" },
      },
      required: ["id", "name"],
    });
    expect(result).toBe(`export interface User {
  id: string;
  name: string;
}`);
  });

  it("should generate interface with optional properties", () => {
    const result = generateInterface("User", {
      type: "object",
      properties: {
        id: { type: "string" },
        email: { type: "string" },
      },
      required: ["id"],
    });
    expect(result).toBe(`export interface User {
  id: string;
  email?: string;
}`);
  });

  it("should generate type alias for non-object schema", () => {
    const result = generateInterface("Status", {
      type: "string",
      enum: ["active", "inactive"],
    });
    expect(result).toBe('export type Status = "active" | "inactive";');
  });

  it("should generate type alias for array schema", () => {
    const result = generateInterface("UserIds", {
      type: "array",
      items: { type: "string" },
    });
    expect(result).toBe("export type UserIds = Array<string>;");
  });
});

describe("openApiToZodTsCode - optimized .d.ts output", () => {
  it("should generate _AssertEqual helper type", () => {
    const spec = {
      components: {
        schemas: {
          User: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
        },
      },
    };

    const code = openApiToZodTsCode(spec);
    expect(code).toContain("type _AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : never) : never;");
  });

  it("should generate interface instead of z.infer", () => {
    const spec = {
      components: {
        schemas: {
          User: {
            type: "object",
            properties: { id: { type: "string" }, name: { type: "string" } },
            required: ["id", "name"],
          },
        },
      },
    };

    const code = openApiToZodTsCode(spec);

    // Should have interface declaration
    expect(code).toContain("export interface User {");
    expect(code).toContain("id: string;");
    expect(code).toContain("name: string;");

    // Should NOT have z.infer type alias
    expect(code).not.toContain("export type User = z.infer<");
  });

  it("should emit output alias once for registered schemas", () => {
    const uuidSchema = z.string().uuid();
    registerZodSchemaToOpenApiSchema(uuidSchema, {
      schemaExportedVariableName: "uuidSchema",
      type: "string",
      format: "uuid",
    });

    const spec = {
      components: {
        schemas: {
          User: {
            type: "object",
            properties: {
              id: { type: "string", format: "uuid" },
            },
            required: ["id"],
          },
        },
      },
    };

    const code = openApiToZodTsCode(spec, [
      'import { uuidSchema } from "./custom-schemas";',
    ]);

    expect(code).toContain(
      "type UuidSchemaOutput = z.output<typeof uuidSchema>;",
    );
    expect(code).toContain("id: UuidSchemaOutput;");
    expect(
      code.match(/type UuidSchemaOutput = z\.output<typeof uuidSchema>;/g)?.length ?? 0,
    ).toBe(1);
  });

  it("should generate schema without explicit type annotation", () => {
    const spec = {
      components: {
        schemas: {
          User: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
        },
      },
    };

    const code = openApiToZodTsCode(spec);
    expect(code).toContain("export const UserSchema = z.object({");
    expect(code).not.toContain("z.ZodType<User>");
  });

  it("should generate type assertions", () => {
    const spec = {
      components: {
        schemas: {
          User: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
        },
      },
    };

    const code = openApiToZodTsCode(spec);
    expect(code).toContain("type _AssertUser = _AssertEqual<User, z.infer<typeof UserSchema>>;");
  });

  it("should handle all OpenAPI types in interfaces", () => {
    const spec = {
      components: {
        schemas: {
          ComplexType: {
            type: "object",
            properties: {
              stringProp: { type: "string" },
              numberProp: { type: "number" },
              integerProp: { type: "integer" },
              booleanProp: { type: "boolean" },
              arrayProp: { type: "array", items: { type: "string" } },
              enumProp: { type: "string", enum: ["A", "B"] },
              nullableProp: { type: "string", nullable: true },
            },
            required: ["stringProp"],
          },
        },
      },
    };

    const code = openApiToZodTsCode(spec);
    expect(code).toContain("export interface ComplexType {");
    expect(code).toContain("stringProp: string;");
    expect(code).toContain("numberProp?: number;");
    expect(code).toContain("integerProp?: number;");
    expect(code).toContain("booleanProp?: boolean;");
    expect(code).toContain('arrayProp?: Array<string>;');
    expect(code).toContain('enumProp?: "A" | "B";');
    expect(code).toContain("nullableProp?: (string | null);");
  });

  it("should handle $ref in interfaces", () => {
    const spec = {
      components: {
        schemas: {
          Address: {
            type: "object",
            properties: { city: { type: "string" } },
            required: ["city"],
          },
          User: {
            type: "object",
            properties: {
              address: { $ref: "#/components/schemas/Address" },
            },
            required: ["address"],
          },
        },
      },
    };

    const code = openApiToZodTsCode(spec);
    expect(code).toContain("address: Address;");
  });

  it("should emit input alias for registered schemas used in route inputs", () => {
    const uuidSchema = z.string().uuid();
    registerZodSchemaToOpenApiSchema(uuidSchema, {
      schemaExportedVariableName: "uuidSchema",
      type: "string",
      format: "uuid",
    });

    const spec = {
      openapi: "3.0.0",
      paths: {
        "/users/{id}": {
          get: {
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: {
              "200": {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { name: { type: "string" } } },
                  },
                },
              },
            },
          },
        },
      },
    };

    const code = openApiToZodTsCode(spec, [
      'import { uuidSchema } from "./custom-schemas";',
    ], { includeRoutes: true });

    expect(code).toContain(
      "type UuidSchemaInput = z.input<typeof uuidSchema>;",
    );
    // Input alias should only be emitted once
    expect(
      code.match(/type UuidSchemaInput = z\.input<typeof uuidSchema>;/g)?.length ?? 0,
    ).toBe(1);
  });

  it("should emit input alias for registered schemas used in request body", () => {
    const uuidSchema = z.string().uuid();
    registerZodSchemaToOpenApiSchema(uuidSchema, {
      schemaExportedVariableName: "uuidSchema",
      type: "string",
      format: "uuid",
    });

    const spec = {
      openapi: "3.0.0",
      paths: {
        "/users": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      id: { type: "string", format: "uuid" },
                      name: { type: "string" },
                    },
                    required: ["id", "name"],
                  },
                },
              },
            },
            responses: {
              "201": {
                content: {
                  "application/json": {
                    schema: { type: "object", properties: { success: { type: "boolean" } } },
                  },
                },
              },
            },
          },
        },
      },
    };

    const code = openApiToZodTsCode(spec, [
      'import { uuidSchema } from "./custom-schemas";',
    ], { includeRoutes: true });

    expect(code).toContain(
      "type UuidSchemaInput = z.input<typeof uuidSchema>;",
    );
  });
});

describe(".d.ts output verification", () => {
  it("should generate output format that will produce optimized .d.ts", () => {
    const spec = {
      components: {
        schemas: {
          User: {
            type: "object",
            properties: {
              id: { type: "string" },
              name: { type: "string" },
              age: { type: "integer" },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["id", "name"],
          },
          Product: {
            type: "object",
            properties: {
              sku: { type: "string" },
              price: { type: "number" },
            },
            required: ["sku", "price"],
          },
        },
      },
    };

    const code = openApiToZodTsCode(spec);

    // Verify the generated .ts code has the right format for optimized .d.ts output:

    // 1. Should have interface declarations (will appear directly in .d.ts)
    expect(code).toContain("export interface User {");
    expect(code).toContain("export interface Product {");

    // 2. Should have schemas without explicit type annotations (TypeScript infers the type)
    expect(code).toContain("export const UserSchema = z.object({");
    expect(code).toContain("export const ProductSchema = z.object({");

    // 3. Should NOT have z.infer type aliases (would require resolution in .d.ts)
    expect(code).not.toContain("export type User = z.infer<");
    expect(code).not.toContain("export type Product = z.infer<");

    // 4. Should have type assertions
    expect(code).toContain("type _AssertEqual<T, U>");
    expect(code).toContain("type _AssertUser = _AssertEqual<User, z.infer<typeof UserSchema>>");
    expect(code).toContain("type _AssertProduct = _AssertEqual<Product, z.infer<typeof ProductSchema>>");
  });

  it("should produce valid TypeScript syntax for all schema types", () => {
    const spec = {
      components: {
        schemas: {
          // Test various complex types
          StringEnum: {
            type: "string",
            enum: ["A", "B", "C"],
          },
          NullableType: {
            type: "string",
            nullable: true,
          },
          UnionType: {
            oneOf: [{ type: "string" }, { type: "number" }],
          },
          ArrayType: {
            type: "array",
            items: { type: "string" },
          },
          NestedObject: {
            type: "object",
            properties: {
              nested: {
                type: "object",
                properties: {
                  deep: { type: "string" },
                },
                required: ["deep"],
              },
            },
            required: ["nested"],
          },
        },
      },
    };

    const code = openApiToZodTsCode(spec);

    // All types should generate valid TypeScript
    expect(code).toContain('export type StringEnum = "A" | "B" | "C"');
    expect(code).toContain("export type NullableType = (string | null)");
    expect(code).toContain("export type UnionType = (string | number)");
    expect(code).toContain("export type ArrayType = Array<string>");
    expect(code).toContain("export interface NestedObject {");
  });
});
