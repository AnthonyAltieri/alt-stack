import { describe, it, expect } from "vitest";
import { convertOpenAPINumberToZod } from "./number";

describe("convertOpenAPINumberToZod", () => {
  describe("number type", () => {
    it("should convert a basic number schema", () => {
      const result = convertOpenAPINumberToZod({ type: "number" });
      expect(result).toBe("z.number()");
    });

    it("should convert number with minimum constraint", () => {
      const result = convertOpenAPINumberToZod({
        type: "number",
        minimum: 0,
      });
      expect(result).toBe("z.number().min(0)");
    });

    it("should convert number with maximum constraint", () => {
      const result = convertOpenAPINumberToZod({
        type: "number",
        maximum: 100,
      });
      expect(result).toBe("z.number().max(100)");
    });

    it("should convert number with both minimum and maximum constraints", () => {
      const result = convertOpenAPINumberToZod({
        type: "number",
        minimum: 0,
        maximum: 100,
      });
      expect(result).toBe("z.number().min(0).max(100)");
    });

    it("should handle negative minimum", () => {
      const result = convertOpenAPINumberToZod({
        type: "number",
        minimum: -10,
      });
      expect(result).toBe("z.number().min(-10)");
    });

    it("should handle negative maximum", () => {
      const result = convertOpenAPINumberToZod({
        type: "number",
        maximum: -5,
      });
      expect(result).toBe("z.number().max(-5)");
    });

    it("should handle decimal minimum and maximum", () => {
      const result = convertOpenAPINumberToZod({
        type: "number",
        minimum: 0.5,
        maximum: 99.99,
      });
      expect(result).toBe("z.number().min(0.5).max(99.99)");
    });

    it("should not apply constraints when undefined", () => {
      const result = convertOpenAPINumberToZod({
        type: "number",
        minimum: undefined,
        maximum: undefined,
      });
      expect(result).toBe("z.number()");
    });
  });

  describe("integer type", () => {
    it("should convert a basic integer schema", () => {
      const result = convertOpenAPINumberToZod({ type: "integer" });
      expect(result).toBe("z.number().int()");
    });

    it("should convert integer with minimum constraint", () => {
      const result = convertOpenAPINumberToZod({
        type: "integer",
        minimum: 1,
      });
      expect(result).toBe("z.number().int().min(1)");
    });

    it("should convert integer with maximum constraint", () => {
      const result = convertOpenAPINumberToZod({
        type: "integer",
        maximum: 10,
      });
      expect(result).toBe("z.number().int().max(10)");
    });

    it("should convert integer with both minimum and maximum constraints", () => {
      const result = convertOpenAPINumberToZod({
        type: "integer",
        minimum: 1,
        maximum: 10,
      });
      expect(result).toBe("z.number().int().min(1).max(10)");
    });

    it("should handle zero as minimum", () => {
      const result = convertOpenAPINumberToZod({
        type: "integer",
        minimum: 0,
      });
      expect(result).toBe("z.number().int().min(0)");
    });

    it("should handle zero as maximum", () => {
      const result = convertOpenAPINumberToZod({
        type: "integer",
        maximum: 0,
      });
      expect(result).toBe("z.number().int().max(0)");
    });

    it("should maintain order: int(), min(), max()", () => {
      const result = convertOpenAPINumberToZod({
        type: "integer",
        maximum: 100,
        minimum: 0,
      });
      expect(result).toBe("z.number().int().min(0).max(100)");
    });
  });
});
