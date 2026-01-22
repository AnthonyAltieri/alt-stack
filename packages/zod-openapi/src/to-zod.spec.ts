import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { convertSchemaToZodString } from "./to-zod";
import { openApiToZodTsCode } from "./to-typescript";
import { clearZodSchemaToOpenApiSchemaRegistry } from "./registry";

describe("convertSchemaToZodString", () => {
  beforeEach(() => {
    clearZodSchemaToOpenApiSchemaRegistry();
  });

  afterEach(() => {
    clearZodSchemaToOpenApiSchemaRegistry();
  });

  describe("basic types", () => {
    it("should convert string schema", () => {
      const result = convertSchemaToZodString({ type: "string" });
      expect(result).toBe("z.string()");
    });

    it("should convert number schema", () => {
      const result = convertSchemaToZodString({ type: "number" });
      expect(result).toBe("z.number()");
    });

    it("should convert integer schema", () => {
      const result = convertSchemaToZodString({ type: "integer" });
      expect(result).toBe("z.number().int()");
    });

    it("should convert boolean schema", () => {
      const result = convertSchemaToZodString({ type: "boolean" });
      expect(result).toBe("z.boolean()");
    });
  });

  describe("complex types", () => {
    it("should convert array schema", () => {
      const result = convertSchemaToZodString({
        type: "array",
        items: { type: "string" },
      });
      expect(result).toBe("z.array(z.string())");
    });

    it("should convert object schema", () => {
      const result = convertSchemaToZodString({
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      });
      expect(result).toBe("z.object({ name: z.string() })");
    });

    it("should convert union schema", () => {
      const result = convertSchemaToZodString({
        oneOf: [{ type: "string" }, { type: "number" }],
      });
      expect(result).toBe("z.union([z.string(), z.number()])");
    });

    it("should convert intersection schema", () => {
      const result = convertSchemaToZodString({
        allOf: [{ type: "string" }, { type: "number" }],
      });
      expect(result).toBe("z.intersection(z.string(), z.number())");
    });
  });

  describe("$ref handling", () => {
    it("should convert $ref to schema variable name", () => {
      const result = convertSchemaToZodString({
        $ref: "#/components/schemas/User",
      });
      expect(result).toBe("UserSchema");
    });

    it("should handle $ref with nullable", () => {
      const result = convertSchemaToZodString({
        $ref: "#/components/schemas/User",
        nullable: true,
      });
      expect(result).toBe("z.union([UserSchema, z.null()])");
    });

    it("should handle invalid $ref format", () => {
      const result = convertSchemaToZodString({
        $ref: "invalid-ref",
      });
      expect(result).toBe("z.unknown()");
    });

    it("should handle $ref without match", () => {
      const result = convertSchemaToZodString({
        $ref: "#/invalid/path",
      });
      expect(result).toBe("z.unknown()");
    });
  });

  describe("nullable handling", () => {
    it("should add nullable modifier to string", () => {
      const result = convertSchemaToZodString({
        type: "string",
        nullable: true,
      });
      expect(result).toBe("z.union([z.string(), z.null()])");
    });

    it("should add nullable modifier to number", () => {
      const result = convertSchemaToZodString({
        type: "number",
        nullable: true,
      });
      expect(result).toBe("z.union([z.number(), z.null()])");
    });

    it("should add nullable modifier to array", () => {
      const result = convertSchemaToZodString({
        type: "array",
        items: { type: "string" },
        nullable: true,
      });
      expect(result).toBe("z.union([z.array(z.string()), z.null()])");
    });

    it("should not add nullable when false", () => {
      const result = convertSchemaToZodString({
        type: "string",
        nullable: false,
      });
      expect(result).toBe("z.string()");
    });

    it("should add nullable modifier to union", () => {
      const result = convertSchemaToZodString({
        oneOf: [{ type: "string" }, { type: "number" }],
        nullable: true,
      });
      expect(result).toBe("z.union([z.union([z.string(), z.number()]), z.null()])");
    });

    it("should add nullable modifier to intersection", () => {
      const result = convertSchemaToZodString({
        allOf: [{ type: "string" }, { type: "number" }],
        nullable: true,
      });
      expect(result).toBe("z.union([z.intersection(z.string(), z.number()), z.null()])");
    });

    it("should add nullable modifier to object", () => {
      const result = convertSchemaToZodString({
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
        nullable: true,
      });
      expect(result).toBe("z.union([z.object({ name: z.string() }), z.null()])");
    });
  });

  describe("nested schemas", () => {
    it("should handle nested arrays", () => {
      const result = convertSchemaToZodString({
        type: "array",
        items: {
          type: "array",
          items: { type: "string" },
        },
      });
      expect(result).toBe("z.array(z.array(z.string()))");
    });

    it("should handle nested objects", () => {
      const result = convertSchemaToZodString({
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              name: { type: "string" },
            },
            required: ["name"],
          },
        },
        required: ["user"],
      });
      expect(result).toBe(
        "z.object({ user: z.object({ name: z.string() }) })",
      );
    });

    it("should handle array of objects", () => {
      const result = convertSchemaToZodString({
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        },
      });
      expect(result).toBe("z.array(z.object({ name: z.string() }))");
    });
  });

  describe("edge cases", () => {
    it("should handle null schema", () => {
      const result = convertSchemaToZodString(null);
      expect(result).toBe("z.unknown()");
    });

    it("should handle undefined schema", () => {
      const result = convertSchemaToZodString(undefined);
      expect(result).toBe("z.unknown()");
    });

    it("should handle non-object schema", () => {
      const result = convertSchemaToZodString("not-an-object");
      expect(result).toBe("z.unknown()");
    });

    it("should handle object without type but with properties", () => {
      const result = convertSchemaToZodString({
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      });
      expect(result).toBe("z.object({ name: z.string() })");
    });

    it("should handle unknown type", () => {
      const result = convertSchemaToZodString({
        type: "unknown-type",
      });
      expect(result).toBe("z.unknown()");
    });
  });

  describe("priority handling", () => {
    it("should prioritize oneOf over type", () => {
      const result = convertSchemaToZodString({
        type: "string",
        oneOf: [{ type: "number" }],
      });
      expect(result).toBe("z.union([z.number()])");
    });

    it("should prioritize allOf over type", () => {
      const result = convertSchemaToZodString({
        type: "string",
        allOf: [{ type: "number" }],
      });
      expect(result).toBe("z.number()");
    });
  });
});

describe("openApiToZodTsCode", () => {
  beforeEach(() => {
    clearZodSchemaToOpenApiSchemaRegistry();
  });

  afterEach(() => {
    clearZodSchemaToOpenApiSchemaRegistry();
  });

  describe("basic OpenAPI conversion", () => {
    it("should convert simple OpenAPI document with one schema", () => {
      const openapi = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
              required: ["name"],
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi);
      expect(result).toContain("import { z } from 'zod';");
      // New format: interface + schema without explicit type annotation
      expect(result).toContain("export interface User {");
      expect(result).toContain("export const UserSchema = z.object({ name: z.string() })");
      // Type assertion for compile-time verification
      expect(result).toContain("type _AssertUser = _AssertEqual<User, z.infer<typeof UserSchema>>;");
    });

    it("should convert OpenAPI document with multiple schemas", () => {
      const openapi = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
              required: ["name"],
            },
            Product: {
              type: "object",
              properties: {
                id: { type: "number" },
              },
              required: ["id"],
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi);
      // New format: interface + schema without explicit type annotation
      expect(result).toContain("export interface User {");
      expect(result).toContain("export interface Product {");
      expect(result).toContain("export const UserSchema = z.object({ name: z.string() })");
      expect(result).toContain("export const ProductSchema = z.object({ id: z.number() })");
    });

    it("should include file header comment", () => {
      const openapi = {
        components: {
          schemas: {
            User: { type: "string" },
          },
        },
      };

      const result = openApiToZodTsCode(openapi);
      expect(result).toContain("This file was automatically generated");
      expect(result).toContain("Do not manually edit this file");
    });

    it("should include required imports", () => {
      const openapi = {
        components: {
          schemas: {
            User: { type: "string" },
          },
        },
      };

      const customImports = [
        "import { ObjectId } from 'bson';",
        "import { DateTime } from 'luxon';",
      ];
      
      const result = openApiToZodTsCode(openapi, customImports);
      expect(result).toContain("import { z } from 'zod';");
      expect(result).toContain("import { ObjectId } from 'bson';");
      expect(result).toContain("import { DateTime } from 'luxon';");
    });
  });

  describe("schema dependencies", () => {
    it("should sort schemas based on dependencies", () => {
      const openapi = {
        components: {
          schemas: {
            User: {
              type: "object",
              properties: {
                profile: { $ref: "#/components/schemas/Profile" },
              },
            },
            Profile: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
              required: ["name"],
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi);
      const profileIndex = result.indexOf("ProfileSchema");
      const userIndex = result.indexOf("UserSchema");

      expect(profileIndex).toBeLessThan(userIndex);
    });

    it("should handle circular dependencies gracefully", () => {
      const openapi = {
        components: {
          schemas: {
            A: {
              type: "object",
              properties: {
                b: { $ref: "#/components/schemas/B" },
              },
            },
            B: {
              type: "object",
              properties: {
                a: { $ref: "#/components/schemas/A" },
              },
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi);
      expect(result).toContain("ASchema");
      expect(result).toContain("BSchema");
    });
  });

  describe("edge cases", () => {
    it("should handle OpenAPI document without components", () => {
      const openapi = {};
      const result = openApiToZodTsCode(openapi);
      expect(result).toContain("import { z } from 'zod';");
      expect(result).not.toContain("export const");
    });

    it("should handle OpenAPI document without schemas", () => {
      const openapi = {
        components: {},
      };
      const result = openApiToZodTsCode(openapi);
      expect(result).toContain("import { z } from 'zod';");
      expect(result).not.toContain("export const");
    });

    it("should handle empty schemas object", () => {
      const openapi = {
        components: {
          schemas: {},
        },
      };
      const result = openApiToZodTsCode(openapi);
      expect(result).toContain("import { z } from 'zod';");
      expect(result).not.toContain("export const");
    });

    it("should handle schema with all types", () => {
      const openapi = {
        components: {
          schemas: {
            StringSchema: { type: "string" },
            NumberSchema: { type: "number" },
            IntegerSchema: { type: "integer" },
            BooleanSchema: { type: "boolean" },
            ArraySchema: {
              type: "array",
              items: { type: "string" },
            },
            ObjectSchema: {
              type: "object",
              properties: {
                name: { type: "string" },
              },
            },
            UnionSchema: {
              oneOf: [{ type: "string" }, { type: "number" }],
            },
            IntersectionSchema: {
              allOf: [{ type: "string" }, { type: "number" }],
            },
          },
        },
      };

      const result = openApiToZodTsCode(openapi);
      expect(result).toContain("StringSchema");
      expect(result).toContain("NumberSchema");
      expect(result).toContain("IntegerSchema");
      expect(result).toContain("BooleanSchema");
      expect(result).toContain("ArraySchema");
      expect(result).toContain("ObjectSchema");
      expect(result).toContain("UnionSchema");
      expect(result).toContain("IntersectionSchema");
    });
  });
});

