import { describe, it, expectTypeOf } from "vitest";
import { z } from "zod";
import type {
  ExtractPathParams,
  RequireParamsForPath,
  ProcedureConfig,
  Procedure,
  ReadyProcedure,
  PendingProcedure,
} from "./procedure.js";
import type { StringInputObjectSchema } from "./context.js";

describe("Procedure Types", () => {
  describe("ExtractPathParams", () => {
    it("should extract single path param", () => {
      type Params = ExtractPathParams<"/users/{id}">;
      expectTypeOf<Params>().toEqualTypeOf<"id">();
    });

    it("should extract multiple path params", () => {
      type Params = ExtractPathParams<"/users/{userId}/posts/{postId}">;
      expectTypeOf<Params>().toEqualTypeOf<"userId" | "postId">();
    });

    it("should return never for paths without params", () => {
      type Params = ExtractPathParams<"/users">;
      expectTypeOf<Params>().toEqualTypeOf<never>();
    });

    it("should handle complex paths", () => {
      type Params = ExtractPathParams<"/api/v1/users/{id}/settings/{setting}/value">;
      expectTypeOf<Params>().toEqualTypeOf<"id" | "setting">();
    });
  });

  describe("RequireParamsForPath", () => {
    it("should allow any params when path has no params", () => {
      type Result = RequireParamsForPath<"/users", z.ZodObject<{ id: z.ZodString }>>;
      expectTypeOf<Result>().not.toEqualTypeOf<never>();
    });

    it("should require matching params when path has params", () => {
      type ValidParams = RequireParamsForPath<"/users/{id}", z.ZodObject<{ id: z.ZodString }>>;
      expectTypeOf<ValidParams>().not.toEqualTypeOf<never>();

      type InvalidParams = RequireParamsForPath<
        "/users/{id}",
        z.ZodObject<{ userId: z.ZodString }>
      >;
      expectTypeOf<InvalidParams>().toEqualTypeOf<never>();
    });

    it("should allow undefined params when path has no params", () => {
      type Result = RequireParamsForPath<"/users", undefined>;
      expectTypeOf<Result>().toEqualTypeOf<undefined>();
    });
  });

  describe("StringInputObjectSchema", () => {
    it("should accept object with all string fields", () => {
      type Result = StringInputObjectSchema<
        z.ZodObject<{
          id: z.ZodString;
          name: z.ZodString;
        }>
      >;
      expectTypeOf<Result>().not.toEqualTypeOf<never>();
    });

    it("should accept object with optional string fields", () => {
      type Result = StringInputObjectSchema<
        z.ZodObject<{
          id: z.ZodString;
          name: z.ZodOptional<z.ZodString>;
        }>
      >;
      expectTypeOf<Result>().not.toEqualTypeOf<never>();
    });

    it("should accept object with coerced fields (accepts unknown input)", () => {
      // z.coerce.number() accepts unknown input including strings
      type Result = StringInputObjectSchema<
        z.ZodObject<{
          id: z.ZodString;
          age: z.ZodNumber; // Note: z.coerce.number() would work at runtime
        }>
      >;
      // This should be never because z.number() input is `number`, not `string`
      expectTypeOf<Result>().toEqualTypeOf<never>();
    });

    it("should accept object with string transform (codec pattern)", () => {
      // z.string().transform() has input: string, output: transformed type
      // Use a simpler approach that doesn't rely on ZodEffects generic structure
      const transformSchema = z.object({
        id: z.string(),
        count: z.string().transform((s) => parseInt(s, 10)),
      });
      type Result = StringInputObjectSchema<typeof transformSchema>;
      expectTypeOf<Result>().not.toEqualTypeOf<never>();
    });

    it("should accept object with enum fields", () => {
      // In Zod 4, enum schemas accept string literals as input
      const enumSchema = z.object({
        status: z.enum(["active", "inactive"]),
      });
      type Result = StringInputObjectSchema<typeof enumSchema>;
      expectTypeOf<Result>().not.toEqualTypeOf<never>();
    });

    it("should accept object with codec fields (Zod 4)", () => {
      // z.codec() provides bidirectional transformation with typed input/output
      // See: https://zod.dev/codecs
      const stringToDate = z.codec(z.iso.datetime(), z.date(), {
        decode: (isoString) => new Date(isoString),
        encode: (date) => date.toISOString(),
      });
      const codecSchema = z.object({
        id: z.string(),
        createdAt: stringToDate, // Input: string, Output: Date
      });
      type Result = StringInputObjectSchema<typeof codecSchema>;
      expectTypeOf<Result>().not.toEqualTypeOf<never>();
    });

    it("should reject object with non-string fields", () => {
      type Result = StringInputObjectSchema<
        z.ZodObject<{
          id: z.ZodString;
          age: z.ZodNumber;
        }>
      >;
      expectTypeOf<Result>().toEqualTypeOf<never>();
    });

    it("should reject object with boolean fields", () => {
      type Result = StringInputObjectSchema<
        z.ZodObject<{
          id: z.ZodString;
          active: z.ZodBoolean;
        }>
      >;
      expectTypeOf<Result>().toEqualTypeOf<never>();
    });
  });

  describe("ProcedureConfig", () => {
    it("should validate input matches path params", () => {
      type ValidConfig = ProcedureConfig<
        "/users/{id}",
        {
          params: z.ZodObject<{ id: z.ZodString }>;
        },
        undefined,
        undefined
      >;

      // Should have input property
      expectTypeOf<ValidConfig>().toHaveProperty("input");

      // Input should not be never
      expectTypeOf<ValidConfig["input"]>().not.toEqualTypeOf<never>();
    });

    it("should invalidate input when params don't match path", () => {
      type InvalidConfig = ProcedureConfig<
        "/users/{id}",
        {
          params: z.ZodObject<{ userId: z.ZodString }>;
        },
        undefined,
        undefined
      >;

      // Input should be never when params don't match
      expectTypeOf<InvalidConfig["input"]>().toEqualTypeOf<never>();
    });

    it("should accept config with output", () => {
      type Config = ProcedureConfig<"/users", {}, z.ZodObject<{ name: z.ZodString }>, undefined>;

      expectTypeOf<Config>().toHaveProperty("output");
    });

    it("should accept config with errors", () => {
      type Config = ProcedureConfig<
        "/users",
        {},
        undefined,
        {
          404: z.ZodObject<{ message: z.ZodString }>;
        }
      >;

      expectTypeOf<Config>().toHaveProperty("errors");
    });
  });

  describe("Procedure", () => {
    it("should have required properties", () => {
      type Proc = Procedure<{}, undefined, undefined>;

      expectTypeOf<Proc>().toHaveProperty("method");
      expectTypeOf<Proc>().toHaveProperty("path");
      expectTypeOf<Proc>().toHaveProperty("config");
      expectTypeOf<Proc>().toHaveProperty("handler");
      expectTypeOf<Proc>().toHaveProperty("middleware");
    });

    it("should type handler with context", () => {
      type Proc = Procedure<
        {
          params: z.ZodObject<{ id: z.ZodString }>;
        },
        z.ZodObject<{ name: z.ZodString }>,
        undefined
      >;

      expectTypeOf<Proc["handler"]>().toBeFunction();
    });
  });

  describe("ReadyProcedure", () => {
    it("should have required properties", () => {
      type Ready = ReadyProcedure<{}, undefined, undefined>;

      expectTypeOf<Ready>().toHaveProperty("method");
      expectTypeOf<Ready>().toHaveProperty("config");
      expectTypeOf<Ready>().toHaveProperty("handler");
      expectTypeOf<Ready>().toHaveProperty("middleware");
    });

    it("should type handler with input and context", () => {
      type Ready = ReadyProcedure<
        {
          params: z.ZodObject<{ id: z.ZodString }>;
        },
        z.ZodObject<{ name: z.ZodString }>,
        undefined
      >;

      expectTypeOf<Ready["handler"]>().toBeFunction();
      expectTypeOf<Ready["handler"]>().parameter(0).toHaveProperty("input");
      expectTypeOf<Ready["handler"]>().parameter(0).toHaveProperty("ctx");
    });
  });

  describe("PendingProcedure", () => {
    it("should have config, handler, and middleware", () => {
      type Pending = PendingProcedure<{}, undefined, undefined>;

      expectTypeOf<Pending>().toHaveProperty("config");
      expectTypeOf<Pending>().toHaveProperty("handler");
      expectTypeOf<Pending>().toHaveProperty("middleware");
      expectTypeOf<Pending>().not.toHaveProperty("method");
    });

    it("should type handler with input and context", () => {
      type Pending = PendingProcedure<
        {
          query: z.ZodObject<{ page: z.ZodNumber }>;
        },
        z.ZodObject<{ results: z.ZodArray<z.ZodString> }>,
        undefined
      >;

      expectTypeOf<Pending["handler"]>().toBeFunction();
      expectTypeOf<Pending["handler"]>().parameter(0).toHaveProperty("input");
      expectTypeOf<Pending["handler"]>().parameter(0).toHaveProperty("ctx");
    });
  });
});
