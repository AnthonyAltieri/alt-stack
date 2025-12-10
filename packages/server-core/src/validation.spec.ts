import { describe, it, expect } from "vitest";
import { z } from "zod";
import { parseSchema, mergeInputs, validateInput } from "./validation.js";

describe("Validation", () => {
  describe("parseSchema", () => {
    it("should parse valid data successfully", async () => {
      const schema = z.object({ name: z.string() });
      const result = await parseSchema(schema, { name: "test" });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: "test" });
    });

    it("should return error for invalid data", async () => {
      const schema = z.object({ name: z.string() });
      const result = await parseSchema(schema, { name: 123 });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe("Validation failed");
    });

    it("should handle nested schemas", async () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          age: z.number(),
        }),
      });
      const result = await parseSchema(schema, {
        user: { name: "John", age: 30 },
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ user: { name: "John", age: 30 } });
    });

    it("should handle coercion schemas", async () => {
      const schema = z.object({ count: z.coerce.number() });
      const result = await parseSchema(schema, { count: "42" });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ count: 42 });
    });

    it("should handle optional fields", async () => {
      const schema = z.object({
        name: z.string(),
        email: z.string().optional(),
      });
      const result = await parseSchema(schema, { name: "test" });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ name: "test" });
    });
  });

  describe("mergeInputs", () => {
    it("should merge params, query, and body", () => {
      const result = mergeInputs(
        { id: "123" },
        { page: 1 },
        { title: "Hello" },
      );

      expect(result).toEqual({
        id: "123",
        page: 1,
        title: "Hello",
      });
    });

    it("should handle empty params and query", () => {
      const result = mergeInputs({}, {}, { data: "test" });

      expect(result).toEqual({ data: "test" });
    });

    it("should handle non-object body", () => {
      const result = mergeInputs({ id: "1" }, {}, "raw body");

      expect(result).toEqual({ id: "1", body: "raw body" });
    });

    it("should handle array body", () => {
      const result = mergeInputs({}, {}, [1, 2, 3]);

      expect(result).toEqual({ body: [1, 2, 3] });
    });

    it("should handle null body", () => {
      const result = mergeInputs({ id: "1" }, { q: "search" }, null);

      expect(result).toEqual({ id: "1", q: "search", body: null });
    });
  });

  describe("validateInput", () => {
    it("should validate params successfully", async () => {
      const config = {
        params: z.object({ id: z.string().uuid() }),
      };
      const result = await validateInput(
        config,
        { id: "550e8400-e29b-41d4-a716-446655440000" },
        {},
        undefined,
      );

      expect(result.params).toEqual({
        id: "550e8400-e29b-41d4-a716-446655440000",
      });
      expect(result.query).toBeUndefined();
      expect(result.body).toBeUndefined();
    });

    it("should validate query successfully", async () => {
      const config = {
        query: z.object({ page: z.coerce.number(), limit: z.coerce.number() }),
      };
      const result = await validateInput(config, {}, { page: "1", limit: "10" }, undefined);

      expect(result.params).toBeUndefined();
      expect(result.query).toEqual({ page: 1, limit: 10 });
      expect(result.body).toBeUndefined();
    });

    it("should validate body successfully", async () => {
      const config = {
        body: z.object({ title: z.string(), completed: z.boolean() }),
      };
      const result = await validateInput(
        config,
        {},
        {},
        { title: "Test", completed: false },
      );

      expect(result.params).toBeUndefined();
      expect(result.query).toBeUndefined();
      expect(result.body).toEqual({ title: "Test", completed: false });
    });

    it("should validate all inputs together", async () => {
      const config = {
        params: z.object({ id: z.string() }),
        query: z.object({ include: z.string().optional() }),
        body: z.object({ name: z.string() }),
      };
      const result = await validateInput(
        config,
        { id: "123" },
        { include: "relations" },
        { name: "Updated" },
      );

      expect(result.params).toEqual({ id: "123" });
      expect(result.query).toEqual({ include: "relations" });
      expect(result.body).toEqual({ name: "Updated" });
    });

    it("should throw error for invalid params", async () => {
      const config = {
        params: z.object({ id: z.string().uuid() }),
      };

      await expect(
        validateInput(config, { id: "not-a-uuid" }, {}, undefined),
      ).rejects.toThrow("Validation failed");
    });

    it("should throw error for invalid query", async () => {
      const config = {
        query: z.object({ page: z.coerce.number().min(1) }),
      };

      await expect(
        validateInput(config, {}, { page: "0" }, undefined),
      ).rejects.toThrow("Validation failed");
    });

    it("should throw error for invalid body", async () => {
      const config = {
        body: z.object({ email: z.string().email() }),
      };

      await expect(
        validateInput(config, {}, {}, { email: "not-an-email" }),
      ).rejects.toThrow("Validation failed");
    });

    it("should accumulate multiple validation errors", async () => {
      const config = {
        params: z.object({ id: z.string().uuid() }),
        query: z.object({ page: z.coerce.number().min(1) }),
        body: z.object({ email: z.string().email() }),
      };

      try {
        await validateInput(
          config,
          { id: "invalid" },
          { page: "-1" },
          { email: "invalid" },
        );
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).name).toBe("ValidationError");
        const details = (error as any).details as { errors?: unknown[] } | undefined;
        expect(details?.errors).toHaveLength(3);
      }
    });

    it("should return undefined for missing optional configs", async () => {
      const config = {};
      const result = await validateInput(config, { id: "123" }, { q: "test" }, { data: "body" });

      expect(result.params).toBeUndefined();
      expect(result.query).toBeUndefined();
      expect(result.body).toBeUndefined();
    });
  });
});

