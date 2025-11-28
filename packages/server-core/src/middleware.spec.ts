import { describe, it, expectTypeOf } from "vitest";
import type { Overwrite, MiddlewareResult } from "./middleware.js";

describe("Middleware Types", () => {
  describe("Overwrite", () => {
    it("should overwrite properties in target type", () => {
      type Original = { a: number; b: string; c: boolean };
      type Override = { b: number; c: number };
      type Result = Overwrite<Original, Override>;

      // Use a variable to satisfy vitest's expectTypeOf
      const _result: Result = { a: 1, b: 2, c: 3 };
      expectTypeOf(_result).toMatchTypeOf<{ a: number; b: number; c: number }>();
    });

    it("should add new properties from override", () => {
      type Original = { a: number };
      type Override = { b: string; c: boolean };
      type Result = Overwrite<Original, Override>;

      const _result: Result = { a: 1, b: "x", c: true };
      expectTypeOf(_result).toMatchTypeOf<{ a: number; b: string; c: boolean }>();
    });

    it("should narrow nullable types", () => {
      type Original = { user: { id: string } | null };
      type Override = { user: { id: string } };
      type Result = Overwrite<Original, Override>;

      const _result: Result = { user: { id: "1" } };
      expectTypeOf(_result).toMatchTypeOf<{ user: { id: string } }>();
    });

    it("should handle empty override", () => {
      type Original = { a: number; b: string };
      // Empty object type
      type Override = object;
      type Result = Overwrite<Original, Override>;

      // With an empty object override, the original type is preserved
      const _result = { a: 1, b: "x" } as Result;
      expectTypeOf(_result).toMatchTypeOf<{ a: number; b: string }>();
    });

    it("should return original type when override is not an object", () => {
      type Original = { a: number };
      type Override = string;
      type Result = Overwrite<Original, Override>;

      const _result: Result = { a: 1 };
      expectTypeOf(_result).toMatchTypeOf<{ a: number }>();
    });
  });

  describe("MiddlewareResult", () => {
    it("should have marker, ok, and data properties", () => {
      type Result = MiddlewareResult<{ user: string }>;

      expectTypeOf<Result>().toHaveProperty("marker");
      expectTypeOf<Result>().toHaveProperty("ok");
      expectTypeOf<Result>().toHaveProperty("data");
    });
  });
});
