import { describe, it, expect } from "vitest";
import { validateMessage, parseSchema } from "./validation.js";
import { ValidationError } from "./errors.js";
import { z } from "zod";

describe("validation", () => {
  describe("parseSchema", () => {
    it("should parse valid data", async () => {
      const schema = z.object({ id: z.string(), count: z.number() });
      const result = await parseSchema(schema, { id: "123", count: 42 });
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "123", count: 42 });
    });

    it("should fail on invalid data", async () => {
      const schema = z.object({ id: z.string(), count: z.number() });
      const result = await parseSchema(schema, { id: "123", count: "not-a-number" });
      expect(result.success).toBe(false);
      expect(result.error?.message).toBe("Validation failed");
    });
  });

  describe("validateMessage", () => {
    it("should parse JSON message", async () => {
      const config = {
        message: z.object({ id: z.string(), value: z.number() }),
      };
      const messageValue = Buffer.from(JSON.stringify({ id: "test", value: 42 }));
      const result = await validateMessage(config, messageValue);
      expect(result).toEqual({ id: "test", value: 42 });
    });

    it("should parse string message", async () => {
      const config = {
        message: z.string(),
      };
      const messageValue = Buffer.from("hello world");
      const result = await validateMessage(config, messageValue);
      expect(result).toBe("hello world");
    });

    it("should handle null message value", async () => {
      const config = {
        message: z.null(),
      };
      const result = await validateMessage(config, null);
      expect(result).toBeNull();
    });

    it("should return empty object when no message schema", async () => {
      const config = {};
      const messageValue = Buffer.from(JSON.stringify({ id: "test" }));
      const result = await validateMessage(config, messageValue);
      expect(result).toEqual({});
    });

    it("should throw ValidationError on invalid JSON", async () => {
      const config = {
        message: z.object({ id: z.string() }),
      };
      const messageValue = Buffer.from("invalid json {");
      await expect(validateMessage(config, messageValue)).rejects.toThrow(
        ValidationError,
      );
    });

    it("should throw ValidationError on schema validation failure", async () => {
      const config = {
        message: z.object({ id: z.string(), count: z.number() }),
      };
      const messageValue = Buffer.from(JSON.stringify({ id: "test", count: "not-a-number" }));
      await expect(validateMessage(config, messageValue)).rejects.toThrow(
        ValidationError,
      );
    });
  });
});

