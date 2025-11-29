import { describe, it, expect } from "vitest";
import { KafkaError, ValidationError, ProcessingError } from "./errors.js";

describe("errors", () => {
  describe("KafkaError", () => {
    it("should create error with code and message", () => {
      const error = new KafkaError("TEST_ERROR", "Test message");
      expect(error.code).toBe("TEST_ERROR");
      expect(error.message).toBe("Test message");
      expect(error.name).toBe("KafkaError");
    });

    it("should include details in toJSON", () => {
      const error = new KafkaError("TEST_ERROR", "Test message", { field: "value" });
      const json = error.toJSON();
      expect(json).toEqual({
        error: {
          code: "TEST_ERROR",
          message: "Test message",
          details: { field: "value" },
        },
      });
    });

    it("should not include details when undefined", () => {
      const error = new KafkaError("TEST_ERROR", "Test message");
      const json = error.toJSON();
      expect(json.error.details).toBeUndefined();
    });
  });

  describe("ValidationError", () => {
    it("should create validation error", () => {
      const error = new ValidationError("Validation failed", { field: "id" });
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.message).toBe("Validation failed");
      expect(error.name).toBe("ValidationError");
      expect(error.details).toEqual({ field: "id" });
    });
  });

  describe("ProcessingError", () => {
    it("should create processing error", () => {
      const error = new ProcessingError("Processing failed", { step: "transform" });
      expect(error.code).toBe("PROCESSING_ERROR");
      expect(error.message).toBe("Processing failed");
      expect(error.name).toBe("ProcessingError");
      expect(error.details).toEqual({ step: "transform" });
    });
  });
});

