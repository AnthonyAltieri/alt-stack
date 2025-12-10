import { describe, it, expect } from "vitest";
import { z } from "zod";
import { extractTagsFromSchema, findHttpStatusForError } from "./extract-tags.js";

describe("extractTagsFromSchema", () => {
  describe("Zod v4 literal extraction", () => {
    it("should extract single tag from z.literal", () => {
      const schema = z.object({
        _tag: z.literal("NotFoundError"),
      });
      const tags = extractTagsFromSchema(schema);
      expect(tags).toEqual(["NotFoundError"]);
    });

    it("should extract tag from schema with additional properties", () => {
      const schema = z.object({
        _tag: z.literal("ValidationError"),
        field: z.string(),
        message: z.string(),
      });
      const tags = extractTagsFromSchema(schema);
      expect(tags).toEqual(["ValidationError"]);
    });
  });

  describe("edge cases", () => {
    it("should return empty array for non-object schemas", () => {
      const schema = z.string();
      const tags = extractTagsFromSchema(schema);
      expect(tags).toEqual([]);
    });

    it("should return empty array for array schemas", () => {
      const schema = z.array(z.string());
      const tags = extractTagsFromSchema(schema);
      expect(tags).toEqual([]);
    });

    it("should return empty array for objects without _tag field", () => {
      const schema = z.object({
        name: z.string(),
        value: z.number(),
      });
      const tags = extractTagsFromSchema(schema);
      expect(tags).toEqual([]);
    });

    it("should return empty array for null input", () => {
      const tags = extractTagsFromSchema(null as any);
      expect(tags).toEqual([]);
    });

    it("should return empty array for undefined input", () => {
      const tags = extractTagsFromSchema(undefined as any);
      expect(tags).toEqual([]);
    });

    it("should return empty array when _tag is not a literal", () => {
      const schema = z.object({
        _tag: z.string(), // Not a literal, just a string type
      });
      const tags = extractTagsFromSchema(schema);
      expect(tags).toEqual([]);
    });
  });
});

describe("findHttpStatusForError", () => {
  const NotFoundErrorSchema = z.object({
    _tag: z.literal("NotFoundError"),
    resourceId: z.string(),
  });

  const UnauthorizedErrorSchema = z.object({
    _tag: z.literal("UnauthorizedError"),
    message: z.string(),
  });

  const ForbiddenErrorSchema = z.object({
    _tag: z.literal("ForbiddenError"),
    message: z.string(),
  });

  it("should return correct status code for matching error tag", () => {
    const errorSchemas = {
      404: NotFoundErrorSchema,
      401: UnauthorizedErrorSchema,
      403: ForbiddenErrorSchema,
    };

    expect(findHttpStatusForError("NotFoundError", errorSchemas)).toBe(404);
    expect(findHttpStatusForError("UnauthorizedError", errorSchemas)).toBe(401);
    expect(findHttpStatusForError("ForbiddenError", errorSchemas)).toBe(403);
  });

  it("should return 500 for unmatched error tag", () => {
    const errorSchemas = {
      404: NotFoundErrorSchema,
    };

    expect(findHttpStatusForError("SomeOtherError", errorSchemas)).toBe(500);
  });

  it("should return 500 when errorSchemas is undefined", () => {
    expect(findHttpStatusForError("NotFoundError", undefined)).toBe(500);
  });

  it("should return 500 when errorSchemas is empty", () => {
    expect(findHttpStatusForError("NotFoundError", {})).toBe(500);
  });
});
