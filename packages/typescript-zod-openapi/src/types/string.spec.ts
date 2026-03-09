import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { convertOpenAPIStringToZod } from "./string";
import {
  registerZodSchemaToOpenApiSchema,
  clearZodSchemaToOpenApiSchemaRegistry,
} from "../registry";

describe("convertOpenAPIStringToZod", () => {
  beforeEach(() => {
    clearZodSchemaToOpenApiSchemaRegistry();
  });

  afterEach(() => {
    clearZodSchemaToOpenApiSchemaRegistry();
  });

  describe("basic string conversion", () => {
    it("should convert a basic string schema with no constraints", () => {
      const result = convertOpenAPIStringToZod({ type: "string" });
      expect(result).toBe("z.string()");
    });
  });

  describe("enum handling", () => {
    it("should convert string enum with single value", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        enum: ["value1"],
      });
      expect(result).toBe("z.enum(['value1'])");
    });

    it("should convert string enum with multiple values", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        enum: ["red", "green", "blue"],
      });
      expect(result).toBe("z.enum(['red', 'green', 'blue'])");
    });

    it("should prioritize enum over other constraints", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        enum: ["value1", "value2"],
        minLength: 5,
        maxLength: 10,
        pattern: ".*",
        format: "email",
      });
      expect(result).toBe("z.enum(['value1', 'value2'])");
    });

    it("should handle enum with special characters", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        enum: ["hello world", "test@example.com"],
      });
      expect(result).toBe("z.enum(['hello world', 'test@example.com'])");
    });
  });

  describe("format handling - built-in formats", () => {
    it("should convert email format", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "email",
      });
      expect(result).toBe(
        `z.string().email().meta(${JSON.stringify({ openapi: { format: "email" } })})`,
      );
    });

    it("should convert url format", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "url",
      });
      expect(result).toBe(
        `z.string().url().meta(${JSON.stringify({ openapi: { format: "url" } })})`,
      );
    });

    it("should convert uri format to url", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "uri",
      });
      expect(result).toBe(
        `z.string().url().meta(${JSON.stringify({ openapi: { format: "uri" } })})`,
      );
    });

    it("should convert uuid format", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "uuid",
      });
      expect(result).toBe(
        `z.string().uuid().meta(${JSON.stringify({ openapi: { format: "uuid" } })})`,
      );
    });

    it("should convert color-hex format", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "color-hex",
      });
      expect(result).toBe(
        `z.string().regex(/^[a-fA-F0-9]{6}$/).meta(${JSON.stringify({ openapi: { format: "color-hex" } })})`,
      );
    });

    it("should ignore unknown format", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "unsupported-format",
      });
      expect(result).toBe(
        `z.string().meta(${JSON.stringify({ openapi: { format: "unsupported-format" } })})`,
      );
    });
  });

  describe("format handling - custom registered schemas", () => {
    it("should use custom registered schema for format", () => {
      const customSchema = z.string().min(10);
      registerZodSchemaToOpenApiSchema(customSchema, {
        schemaExportedVariableName: "customEmailSchema",
        type: "string",
        format: "email",
      });

      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "email",
      });
      expect(result).toBe("customEmailSchema");
    });

    it("should ignore other constraints when using custom registered schema", () => {
      const customSchema = z.string().min(10);
      registerZodSchemaToOpenApiSchema(customSchema, {
        schemaExportedVariableName: "customUuidSchema",
        type: "string",
        format: "uuid",
      });

      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "uuid",
        minLength: 5,
        maxLength: 50,
        pattern: ".*",
      });
      expect(result).toBe("customUuidSchema");
    });

    it("should use custom registered schema with multiple formats", () => {
      const customSchema = z.string();
      registerZodSchemaToOpenApiSchema(customSchema, {
        schemaExportedVariableName: "customDateSchema",
        type: "string",
        formats: ["date", "iso-date"],
      });

      const result1 = convertOpenAPIStringToZod({
        type: "string",
        format: "date",
      });
      expect(result1).toBe("customDateSchema");

      const result2 = convertOpenAPIStringToZod({
        type: "string",
        format: "iso-date",
      });
      expect(result2).toBe("customDateSchema");
    });
  });

  describe("length constraints", () => {
    it("should apply minLength constraint", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        minLength: 5,
      });
      expect(result).toBe("z.string().min(5)");
    });

    it("should apply maxLength constraint", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        maxLength: 10,
      });
      expect(result).toBe("z.string().max(10)");
    });

    it("should apply both minLength and maxLength constraints", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        minLength: 5,
        maxLength: 10,
      });
      expect(result).toBe("z.string().min(5).max(10)");
    });

    it("should handle minLength of 0", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        minLength: 0,
      });
      expect(result).toBe("z.string().min(0)");
    });

    it("should not apply minLength when undefined", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        minLength: undefined,
      });
      expect(result).toBe("z.string()");
    });
  });

  describe("pattern constraints", () => {
    it("should apply pattern constraint", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        pattern: "^[A-Z]+$",
      });
      expect(result).toBe(
        `z.string().regex(/^[A-Z]+$/).meta(${JSON.stringify({ openapi: { pattern: "^[A-Z]+$" } })})`,
      );
    });

    it("should handle complex regex pattern", () => {
      const pattern =
        "^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$";
      const result = convertOpenAPIStringToZod({
        type: "string",
        pattern,
      });
      expect(result).toBe(
        `z.string().regex(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/).meta(${JSON.stringify({ openapi: { pattern } })})`,
      );
    });

    it("should not apply pattern when undefined", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        pattern: undefined,
      });
      expect(result).toBe("z.string()");
    });
  });

  describe("combined constraints", () => {
    it("should combine format and length constraints", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "email",
        minLength: 5,
        maxLength: 100,
      });
      expect(result).toBe(
        `z.string().email().min(5).max(100).meta(${JSON.stringify({ openapi: { format: "email" } })})`,
      );
    });

    it("should combine format and pattern constraints", () => {
      const pattern = "^[a-f0-9-]+$";
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "uuid",
        pattern,
      });
      expect(result).toBe(
        `z.string().uuid().regex(/^[a-f0-9-]+$/).meta(${JSON.stringify({ openapi: { format: "uuid", pattern } })})`,
      );
    });

    it("should combine all constraints", () => {
      const pattern = ".*@example\\.com$";
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "email",
        minLength: 10,
        maxLength: 50,
        pattern,
      });
      expect(result).toBe(
        `z.string().email().min(10).max(50).regex(/.*@example\\.com$/).meta(${JSON.stringify({ openapi: { format: "email", pattern } })})`,
      );
    });

    it("should combine length and pattern without format", () => {
      const pattern = "^[a-z]+$";
      const result = convertOpenAPIStringToZod({
        type: "string",
        minLength: 3,
        maxLength: 20,
        pattern,
      });
      expect(result).toBe(
        `z.string().min(3).max(20).regex(/^[a-z]+$/).meta(${JSON.stringify({ openapi: { pattern } })})`,
      );
    });
  });

  describe("edge cases", () => {
    it("should handle empty enum array", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        enum: [],
      });
      expect(result).toBe("z.enum([])");
    });

    it("should handle format with empty string", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        // @ts-expect-error - testing with empty format
        format: "",
      });
      expect(result).toBe("z.string()");
    });

    it("should handle pattern with empty string", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        pattern: "",
      });
      expect(result).toBe(
        `z.string().regex(//).meta(${JSON.stringify({ openapi: { pattern: "" } })})`,
      );
    });

    it("should maintain order: format, minLength, maxLength, pattern", () => {
      const pattern = "^test$";
      const result = convertOpenAPIStringToZod({
        type: "string",
        pattern,
        maxLength: 20,
        minLength: 5,
        format: "url",
      });
      expect(result).toBe(
        `z.string().url().min(5).max(20).regex(/^test$/).meta(${JSON.stringify({ openapi: { format: "url", pattern } })})`,
      );
    });

    it("should handle only maxLength without minLength", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "email",
        maxLength: 100,
      });
      expect(result).toBe(
        `z.string().email().max(100).meta(${JSON.stringify({ openapi: { format: "email" } })})`,
      );
    });

    it("should handle only pattern without other constraints", () => {
      const pattern = "\\d{3}-\\d{4}";
      const result = convertOpenAPIStringToZod({
        type: "string",
        pattern,
      });
      expect(result).toBe(
        `z.string().regex(/\\d{3}-\\d{4}/).meta(${JSON.stringify({ openapi: { pattern } })})`,
      );
    });
  });

  describe("format with supported but not built-in modifiers", () => {
    it("should handle date format without built-in modifier", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "date",
      });
      expect(result).toBe(
        `z.string().date().meta(${JSON.stringify({ openapi: { format: "date" } })})`,
      );
    });

    it("should handle date-time format without built-in modifier", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "date-time",
      });
      expect(result).toBe(
        `z.string().datetime().meta(${JSON.stringify({ openapi: { format: "date-time" } })})`,
      );
    });

    it("should handle objectid format without built-in modifier", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "objectid",
      });
      expect(result).toBe(
        `z.string().meta(${JSON.stringify({ openapi: { format: "objectid" } })})`,
      );
    });

    it("should apply constraints to supported formats without built-in modifiers", () => {
      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "date",
        minLength: 10,
        maxLength: 10,
      });
      expect(result).toBe(
        `z.string().date().min(10).max(10).meta(${JSON.stringify({ openapi: { format: "date" } })})`,
      );
    });
  });

  describe("integration with registry", () => {
    it("should clear registry between tests", () => {
      const customSchema1 = z.string().min(5);
      registerZodSchemaToOpenApiSchema(customSchema1, {
        schemaExportedVariableName: "schema1",
        type: "string",
        format: "email",
      });

      clearZodSchemaToOpenApiSchemaRegistry();

      const result = convertOpenAPIStringToZod({
        type: "string",
        format: "email",
      });
      // Should use built-in email format, not custom schema
      expect(result).toBe(
        `z.string().email().meta(${JSON.stringify({ openapi: { format: "email" } })})`,
      );
    });

    it("should handle multiple schemas registered for different formats", () => {
      const emailSchema = z.string().email();
      const uuidSchema = z.string().uuid();

      registerZodSchemaToOpenApiSchema(emailSchema, {
        schemaExportedVariableName: "customEmailSchema",
        type: "string",
        format: "email",
      });

      registerZodSchemaToOpenApiSchema(uuidSchema, {
        schemaExportedVariableName: "customUuidSchema",
        type: "string",
        format: "uuid",
      });

      const emailResult = convertOpenAPIStringToZod({
        type: "string",
        format: "email",
      });
      expect(emailResult).toBe("customEmailSchema");

      const uuidResult = convertOpenAPIStringToZod({
        type: "string",
        format: "uuid",
      });
      expect(uuidResult).toBe("customUuidSchema");

      // Unregistered format should use built-in
      const urlResult = convertOpenAPIStringToZod({
        type: "string",
        format: "url",
      });
      expect(urlResult).toBe(
        `z.string().url().meta(${JSON.stringify({ openapi: { format: "url" } })})`,
      );
    });
  });
});
