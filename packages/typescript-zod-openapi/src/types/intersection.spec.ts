import { describe, it, expect } from "vitest";
import { convertOpenAPIIntersectionToZod } from "./intersection";
import type { AnySchema } from "./types";

describe("convertOpenAPIIntersectionToZod", () => {
  const mockConvertSchema = (schema: AnySchema): string => {
    if (schema.type === "string") return "z.string()";
    if (schema.type === "number") return "z.number()";
    if (schema.type === "boolean") return "z.boolean()";
    return "z.unknown()";
  };

  describe("intersection with two types", () => {
    it("should convert intersection of string and number", () => {
      const result = convertOpenAPIIntersectionToZod(
        {
          allOf: [{ type: "string" }, { type: "number" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.intersection(z.string(), z.number())");
    });

    it("should convert intersection of string and boolean", () => {
      const result = convertOpenAPIIntersectionToZod(
        {
          allOf: [{ type: "string" }, { type: "boolean" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.intersection(z.string(), z.boolean())");
    });
  });

  describe("intersection with multiple types", () => {
    it("should convert intersection of three types", () => {
      const result = convertOpenAPIIntersectionToZod(
        {
          allOf: [{ type: "string" }, { type: "number" }, { type: "boolean" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.intersection(z.intersection(z.string(), z.number()), z.boolean())",
      );
    });

    it("should convert intersection of multiple same types", () => {
      const result = convertOpenAPIIntersectionToZod(
        {
          allOf: [{ type: "string" }, { type: "string" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.intersection(z.string(), z.string())");
    });
  });

  describe("intersection with single type", () => {
    it("should return single schema without intersection wrapper", () => {
      const result = convertOpenAPIIntersectionToZod(
        {
          allOf: [{ type: "string" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.string()");
    });
  });

  describe("empty intersection", () => {
    it("should return z.unknown() for empty allOf array", () => {
      const result = convertOpenAPIIntersectionToZod(
        {
          allOf: [],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.unknown()");
    });
  });

  describe("intersection with unknown types", () => {
    it("should convert intersection containing unknown types", () => {
      const result = convertOpenAPIIntersectionToZod(
        {
          allOf: [{ type: "string" }, { type: "unknown-type" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.intersection(z.string(), z.unknown())");
    });
  });

  describe("edge cases", () => {
    it("should preserve order of intersection members", () => {
      const result = convertOpenAPIIntersectionToZod(
        {
          allOf: [{ type: "boolean" }, { type: "number" }, { type: "string" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.intersection(z.intersection(z.boolean(), z.number()), z.string())",
      );
    });
  });
});
