/**
 * Minimal reproduction of _tag literal extraction issue with Zod 4
 *
 * Issue: When using z.object({ _tag: z.literal("SomeTag"), ... }) with Zod 4,
 * the ExtractTagFromSchema type helper returns `never` instead of the literal type.
 *
 * This causes handlers to fail type checking because the error types cannot be
 * matched against the declared error schemas.
 */
import { describe, it, expectTypeOf, expect } from "vitest";
import { z } from "zod";
import { TaggedError, err, ok, type Result } from "@alt-stack/result";
import type {
  ExtractTagFromSchema,
  ExtractErrorTags,
  HandlerResult,
  HasTagLiteral,
  ValidateErrorConfig,
} from "./types/context.js";

// ============================================================================
// Real-world Error Class (from jobs-service)
// ============================================================================
class InternalServerError extends TaggedError {
  readonly _tag = "InternalServerError" as const;
  readonly _httpCode = 500 as const;

  constructor(message: string = "Internal server error") {
    super(message);
  }
}

// ============================================================================
// Real-world Error Schema (from jobs-service)
// ============================================================================
const InternalServerErrorSchema = z.object({
  _tag: z.literal("InternalServerError"),
  error: z.object({ code: z.literal("INTERNAL_SERVER_ERROR"), message: z.string() }),
});

describe("Tag Extraction Issue - Minimal Reproduction", () => {
  describe("Step 1: Verify z.infer extracts correct type", () => {
    it("should infer object with _tag literal from schema", () => {
      type Inferred = z.infer<typeof InternalServerErrorSchema>;

      // The inferred type should have _tag as a literal, not string
      expectTypeOf<Inferred["_tag"]>().toEqualTypeOf<"InternalServerError">();
    });

    it("should infer literal for simple schema", () => {
      const SimpleSchema = z.object({
        _tag: z.literal("Simple"),
      });
      type Inferred = z.infer<typeof SimpleSchema>;

      expectTypeOf<Inferred["_tag"]>().toEqualTypeOf<"Simple">();
    });
  });

  describe("Step 2: Verify ExtractTagFromSchema works", () => {
    it("should extract _tag literal from simple schema", () => {
      const SimpleSchema = z.object({
        _tag: z.literal("Simple"),
      });

      type ExtractedTag = ExtractTagFromSchema<typeof SimpleSchema>;

      // This is the critical test - does ExtractTagFromSchema return the literal or never?
      expectTypeOf<ExtractedTag>().toEqualTypeOf<"Simple">();
    });

    it("should extract _tag literal from real-world schema", () => {
      type ExtractedTag = ExtractTagFromSchema<typeof InternalServerErrorSchema>;

      // This test reproduces the issue
      expectTypeOf<ExtractedTag>().toEqualTypeOf<"InternalServerError">();
    });
  });

  describe("Step 3: Verify HasTagLiteral validation works", () => {
    it("should return schema type for valid schema", () => {
      type Validated = HasTagLiteral<typeof InternalServerErrorSchema>;

      // Should return the schema type, not never
      expectTypeOf<Validated>().not.toEqualTypeOf<never>();
    });

    it("should return never for schema without _tag", () => {
      const NoTagSchema = z.object({
        message: z.string(),
      });

      type Validated = HasTagLiteral<typeof NoTagSchema>;
      expectTypeOf<Validated>().toEqualTypeOf<never>();
    });

    it("should return never for schema with non-literal _tag", () => {
      const StringTagSchema = z.object({
        _tag: z.string(),
      });

      type Validated = HasTagLiteral<typeof StringTagSchema>;
      expectTypeOf<Validated>().toEqualTypeOf<never>();
    });
  });

  describe("Step 4: Verify ValidateErrorConfig works", () => {
    it("should validate error config with valid schema", () => {
      type Config = {
        500: typeof InternalServerErrorSchema;
      };

      type Validated = ValidateErrorConfig<Config>;

      // Should not be never
      expectTypeOf<Validated[500]>().not.toEqualTypeOf<never>();
    });
  });

  describe("Step 5: Verify ExtractErrorTags works", () => {
    it("should extract tags from error config", () => {
      type Config = {
        500: typeof InternalServerErrorSchema;
      };

      type Tags = ExtractErrorTags<Config>;

      // Should be "InternalServerError", not never
      expectTypeOf<Tags>().toEqualTypeOf<"InternalServerError">();
    });
  });

  describe("Step 6: Full HandlerResult integration", () => {
    it("should allow returning matching error from handler", () => {
      type Config = {
        500: typeof InternalServerErrorSchema;
      };

      type Output = z.ZodObject<{ data: z.ZodString }>;

      // The handler result type
      type HR = HandlerResult<Config, Output>;

      // A function that returns the handler result
      const handler = (): HR => {
        // This should compile - InternalServerError._tag matches "InternalServerError"
        return err(new InternalServerError("Something went wrong"));
      };

      // Just verify the function exists and can be called
      const result = handler();
      expect(result).toBeDefined();
    });

    it("should allow returning ok from handler", () => {
      type Config = {
        500: typeof InternalServerErrorSchema;
      };

      const OutputSchema = z.object({ data: z.string() });
      type HR = HandlerResult<Config, typeof OutputSchema>;

      const handler = (): HR => {
        return ok({ data: "success" });
      };

      const result = handler();
      expect(result).toBeDefined();
    });
  });

  describe("Step 7: Simulating the jobs-service scenario", () => {
    it("should work with service returning Result<T, InternalServerError>", () => {
      // Service function that returns Result
      const service = async (): Promise<Result<{ count: number }, InternalServerError>> => {
        return ok({ count: 42 });
      };

      // Error config like in the router
      type ErrorConfig = {
        500: typeof InternalServerErrorSchema;
      };

      const OutputSchema = z.object({ count: z.number() });

      // Handler that calls service and returns its result
      type HR = HandlerResult<ErrorConfig, typeof OutputSchema>;

      const handler = async (): Promise<HR> => {
        // The service returns Result<T, InternalServerError>
        // The handler expects HandlerResult<ErrorConfig, Output>
        // These should be compatible because InternalServerError._tag = "InternalServerError"
        // matches the extracted tag from ErrorConfig[500]
        return service();
      };

      // Verify handler can be called
      expect(handler).toBeDefined();
    });
  });

describe("Step 8: Testing default error schemas from init.ts", () => {
    it("default schemas should have _tag for HasTagLiteral to pass", async () => {
      // Import the actual default schemas from init
      const initModule = await import("./init.js");

      // Check the schema shapes
      const schema400Shape = initModule.default400ErrorSchema.shape;
      const schema500Shape = initModule.default500ErrorSchema.shape;

      // These SHOULD have _tag fields for the validation to work
      // If this fails, that's the root cause of the jobs-service type errors
      expect(schema400Shape._tag).toBeDefined();
      expect(schema500Shape._tag).toBeDefined();
    });
  });

  describe("Step 9: Default error handlers scenario (like jobs-service)", () => {
    // Default error schemas (like from init())
    const Default400Schema = z.object({
      _tag: z.literal("ValidationError"),
      code: z.literal("VALIDATION_ERROR"),
      message: z.string(),
    });

    const Default500Schema = z.object({
      _tag: z.literal("InternalServerError"),
      code: z.literal("INTERNAL_SERVER_ERROR"),
      message: z.string(),
    });

    // Route-specific error schema (also 500)
    const RouteInternalServerErrorSchema = z.object({
      _tag: z.literal("InternalServerError"),
      error: z.object({ code: z.literal("INTERNAL_SERVER_ERROR"), message: z.string() }),
    });

    it("should extract tags from default + route merged config", () => {
      // When default errors are merged with route errors, 500 becomes a union
      type MergedConfig = {
        400: typeof Default400Schema;
        500: typeof Default500Schema | typeof RouteInternalServerErrorSchema;
      };

      type Tags = ExtractErrorTags<MergedConfig>;

      // Should include both ValidationError and InternalServerError
      expectTypeOf<Tags>().toEqualTypeOf<"ValidationError" | "InternalServerError">();
    });

    it("should work when route overrides default error with same _tag", () => {
      type MergedConfig = {
        400: typeof Default400Schema;
        500: typeof Default500Schema | typeof RouteInternalServerErrorSchema;
      };

      const OutputSchema = z.object({ data: z.string() });
      type HR = HandlerResult<MergedConfig, typeof OutputSchema>;

      // Handler returning InternalServerError should work because _tag matches
      const handler = (): HR => {
        return err(new InternalServerError("error"));
      };

      expect(handler).toBeDefined();
    });

    it("should work with middleware-added errors", () => {
      // protectedProcedure adds 401 error via middleware
      const UnauthorizedErrorSchema = z.object({
        _tag: z.literal("UnauthorizedError"),
        error: z.object({ code: z.literal("UNAUTHORIZED"), message: z.string() }),
      });

      const ForbiddenErrorSchema = z.object({
        _tag: z.literal("ForbiddenError"),
        error: z.object({ code: z.literal("FORBIDDEN"), message: z.string() }),
      });

      // Merged config from: default errors + middleware errors + route errors
      type FullConfig = {
        400: typeof Default400Schema;
        401: typeof UnauthorizedErrorSchema;
        403: typeof ForbiddenErrorSchema;
        500: typeof Default500Schema | typeof RouteInternalServerErrorSchema;
      };

      type Tags = ExtractErrorTags<FullConfig>;

      // Should include all tags
      expectTypeOf<Tags>().toEqualTypeOf<
        "ValidationError" | "UnauthorizedError" | "ForbiddenError" | "InternalServerError"
      >();
    });
  });
});
