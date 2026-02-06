import { describe, it, expect } from "vitest";
import { convertOpenAPIUnionToZod } from "./union";
import type { AnySchema } from "./types";

describe("convertOpenAPIUnionToZod", () => {
  const mockConvertSchema = (schema: AnySchema): string => {
    if (schema.type === "string") return "z.string()";
    if (schema.type === "number") return "z.number()";
    if (schema.type === "boolean") return "z.boolean()";
    return "z.unknown()";
  };

  describe("union with two types", () => {
    it("should convert union of string and number", () => {
      const result = convertOpenAPIUnionToZod(
        {
          oneOf: [{ type: "string" }, { type: "number" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.union([z.string(), z.number()])");
    });

    it("should convert union of string and boolean", () => {
      const result = convertOpenAPIUnionToZod(
        {
          oneOf: [{ type: "string" }, { type: "boolean" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.union([z.string(), z.boolean()])");
    });

    it("should convert union of number and boolean", () => {
      const result = convertOpenAPIUnionToZod(
        {
          oneOf: [{ type: "number" }, { type: "boolean" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.union([z.number(), z.boolean()])");
    });
  });

  describe("union with multiple types", () => {
    it("should convert union of three types", () => {
      const result = convertOpenAPIUnionToZod(
        {
          oneOf: [
            { type: "string" },
            { type: "number" },
            { type: "boolean" },
          ],
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.union([z.string(), z.number(), z.boolean()])",
      );
    });

    it("should convert union of multiple same types", () => {
      const result = convertOpenAPIUnionToZod(
        {
          oneOf: [{ type: "string" }, { type: "string" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.union([z.string(), z.string()])");
    });
  });

  describe("union with single type", () => {
    it("should convert union with single type", () => {
      const result = convertOpenAPIUnionToZod(
        {
          oneOf: [{ type: "string" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.union([z.string()])");
    });
  });

  describe("union with unknown types", () => {
    it("should convert union containing unknown types", () => {
      const result = convertOpenAPIUnionToZod(
        {
          oneOf: [{ type: "string" }, { type: "unknown-type" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.union([z.string(), z.unknown()])");
    });

    it("should convert union of all unknown types", () => {
      const result = convertOpenAPIUnionToZod(
        {
          oneOf: [{ type: "unknown1" }, { type: "unknown2" }],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.union([z.unknown(), z.unknown()])");
    });
  });

  describe("edge cases", () => {
    it("should handle empty oneOf array", () => {
      const result = convertOpenAPIUnionToZod(
        {
          oneOf: [],
        },
        mockConvertSchema,
      );
      expect(result).toBe("z.union([])");
    });

    it("should preserve order of union members", () => {
      const result = convertOpenAPIUnionToZod(
        {
          oneOf: [
            { type: "boolean" },
            { type: "number" },
            { type: "string" },
          ],
        },
        mockConvertSchema,
      );
      expect(result).toBe(
        "z.union([z.boolean(), z.number(), z.string()])",
      );
    });
  });
});

