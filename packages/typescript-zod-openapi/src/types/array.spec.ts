import { describe, it, expect } from "vitest";
import { convertOpenAPIArrayToZod } from "./array";
import type { AnySchema } from "./types";

describe("convertOpenAPIArrayToZod", () => {
  const mockConvertSchema = (schema: AnySchema): string => {
    if (schema.type === "string") return "z.string()";
    if (schema.type === "number") return "z.number()";
    if (schema.type === "boolean") return "z.boolean()";
    return "z.unknown()";
  };

  describe("array without items", () => {
    it("should convert array schema without items definition", () => {
      const result = convertOpenAPIArrayToZod(
        { type: "array" },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.unknown())");
    });

    it("should convert array without items but with constraints", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          minItems: 1,
          maxItems: 10,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.unknown()).min(1).max(10)");
    });
  });

  describe("array with items", () => {
    it("should convert array with string items", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "string" },
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.string())");
    });

    it("should convert array with number items", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "number" },
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.number())");
    });

    it("should convert array with boolean items", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "boolean" },
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.boolean())");
    });

    it("should convert array with unknown items when items type is unrecognized", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "unknown-type" },
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.unknown())");
    });
  });

  describe("array with minItems constraint", () => {
    it("should apply minItems constraint", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "string" },
          minItems: 1,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.string()).min(1)");
    });

    it("should handle minItems of 0", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "string" },
          minItems: 0,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.string()).min(0)");
    });

    it("should handle large minItems value", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "number" },
          minItems: 100,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.number()).min(100)");
    });
  });

  describe("array with maxItems constraint", () => {
    it("should apply maxItems constraint", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "string" },
          maxItems: 10,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.string()).max(10)");
    });

    it("should handle maxItems of 0", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "string" },
          maxItems: 0,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.string()).max(0)");
    });

    it("should handle large maxItems value", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "number" },
          maxItems: 1000,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.number()).max(1000)");
    });
  });

  describe("array with both minItems and maxItems", () => {
    it("should apply both minItems and maxItems constraints", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "string" },
          minItems: 1,
          maxItems: 10,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.string()).min(1).max(10)");
    });

    it("should maintain order: array, min, max", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "number" },
          maxItems: 100,
          minItems: 5,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.number()).min(5).max(100)");
    });
  });

  describe("edge cases", () => {
    it("should handle items as null", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: null,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.unknown())");
    });

    it("should handle items as primitive value", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: "invalid",
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.unknown())");
    });

    it("should not apply constraints when undefined", () => {
      const result = convertOpenAPIArrayToZod(
        {
          type: "array",
          items: { type: "string" },
          minItems: undefined,
          maxItems: undefined,
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.array(z.string())");
    });
  });
});

