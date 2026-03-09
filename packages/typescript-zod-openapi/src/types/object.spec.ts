import { describe, it, expect } from "vitest";
import { convertOpenAPIObjectToZod } from "./object";
import type { AnySchema } from "./types";

describe("convertOpenAPIObjectToZod", () => {
  const mockConvertSchema = (schema: AnySchema): string => {
    if (schema.type === "string") return "z.string()";
    if (schema.type === "number") return "z.number()";
    if (schema.type === "boolean") return "z.boolean()";
    return "z.unknown()";
  };

  describe("empty object", () => {
    it("should convert empty object without additionalProperties", () => {
      const result = convertOpenAPIObjectToZod(
        { type: "object", properties: {} },
        mockConvertSchema,
      );
      expect(result).toBe("z.record(z.string(), z.unknown())");
    });

    it("should convert empty object with additionalProperties false", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.object({}).strict()");
    });

    it("should convert object without properties", () => {
      const result = convertOpenAPIObjectToZod(
        { type: "object" },
        mockConvertSchema,
      );
      expect(result).toBe("z.record(z.string(), z.unknown())");
    });
  });

  describe("object with required properties", () => {
    it("should convert object with single required property", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name"],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.object({ name: z.string() })");
    });

    it("should convert object with multiple required properties", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name", "age"],
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.object({ name: z.string(), age: z.number() })",
      );
    });

    it("should convert object with all properties required", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            a: { type: "string" },
            b: { type: "number" },
            c: { type: "boolean" },
          },
          required: ["a", "b", "c"],
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.object({ a: z.string(), b: z.number(), c: z.boolean() })",
      );
    });
  });

  describe("object with optional properties", () => {
    it("should convert object with single optional property", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.object({ name: z.string().optional() })");
    });

    it("should convert object with multiple optional properties", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.object({ name: z.string().optional(), age: z.number().optional() })",
      );
    });
  });

  describe("object with mixed required and optional properties", () => {
    it("should mark only specified properties as required", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
            email: { type: "string" },
          },
          required: ["name"],
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.object({ name: z.string(), age: z.number().optional(), email: z.string().optional() })",
      );
    });

    it("should handle multiple required and optional properties", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            id: { type: "number" },
            name: { type: "string" },
            email: { type: "string" },
            age: { type: "number" },
          },
          required: ["id", "name"],
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.object({ id: z.number(), name: z.string(), email: z.string().optional(), age: z.number().optional() })",
      );
    });
  });

  describe("object with additionalProperties", () => {
    it("should convert object with additionalProperties false", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          additionalProperties: false,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.object({ name: z.string().optional() }).strict()");
    });

    it("should convert object with additionalProperties false and required properties", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            name: { type: "string" },
            age: { type: "number" },
          },
          required: ["name"],
          additionalProperties: false,
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.object({ name: z.string(), age: z.number().optional() }).strict()",
      );
    });

    it("should not add strict when additionalProperties is not false", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          additionalProperties: true,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.object({ name: z.string().optional() })");
    });
  });

  describe("property ordering", () => {
    it("should preserve property order", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            a: { type: "string" },
            b: { type: "number" },
            c: { type: "boolean" },
          },
          required: ["b"],
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.object({ a: z.string().optional(), b: z.number(), c: z.boolean().optional() })",
      );
    });
  });

  describe("hyphenated property names", () => {
    it("should quote hyphenated property names", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            "first-name": { type: "string" },
            "last-name": { type: "string" },
            age: { type: "number" },
          },
          required: ["first-name"],
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.object({ 'first-name': z.string(), 'last-name': z.string().optional(), age: z.number().optional() })",
      );
    });

    it("should quote property names with special characters", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            "x-custom-header": { type: "string" },
            "$special": { type: "string" },
            "_private": { type: "string" },
          },
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.object({ 'x-custom-header': z.string().optional(), $special: z.string().optional(), _private: z.string().optional() })",
      );
    });
  });

  describe("edge cases", () => {
    it("should handle properties with unknown schema types", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            unknown: { type: "unknown-type" },
          },
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.object({ unknown: z.unknown().optional() })");
    });

    it("should handle null property schemas", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            nullProp: null,
          },
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.object({ nullProp: z.unknown().optional() })");
    });

    it("should handle properties not in required array", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["other"],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.object({ name: z.string().optional() })");
    });

    it("should handle empty required array", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: [],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.object({ name: z.string().optional() })");
    });

    it("should handle required array with duplicate values", () => {
      const result = convertOpenAPIObjectToZod(
        {
          type: "object",
          properties: {
            name: { type: "string" },
          },
          required: ["name", "name"],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.object({ name: z.string() })");
    });
  });
});

