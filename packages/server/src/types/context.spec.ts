import { describe, it, expectTypeOf } from "vitest";
import { z } from "zod";
import type {
  InferInput,
  TypedContext,
  ErrorUnion,
  InferErrorSchemas,
  BaseContext,
} from "./context.js";
import type { Context } from "hono";

describe("Context Types", () => {
  describe("InferInput", () => {
    it("should infer empty object when no input config provided", () => {
      type EmptyInput = InferInput<{}>;
      expectTypeOf<EmptyInput>().toEqualTypeOf<{}>();
    });

    it("should infer params from input config", () => {
      type Input = InferInput<{
        params: z.ZodObject<{ id: z.ZodString }>;
      }>;
      expectTypeOf<Input>().toMatchTypeOf<{ id: string }>();
    });

    it("should infer query from input config", () => {
      type Input = InferInput<{
        query: z.ZodObject<{ page: z.ZodNumber }>;
      }>;
      expectTypeOf<Input>().toMatchTypeOf<{ page: number }>();
    });

    it("should infer body from input config", () => {
      type Input = InferInput<{
        body: z.ZodObject<{ title: z.ZodString }>;
      }>;
      expectTypeOf<Input>().toMatchTypeOf<{ title: string }>();
    });

    it("should merge params, query, and body", () => {
      type Input = InferInput<{
        params: z.ZodObject<{ id: z.ZodString }>;
        query: z.ZodObject<{ page: z.ZodNumber }>;
        body: z.ZodObject<{ title: z.ZodString }>;
      }>;
      expectTypeOf<Input>().toMatchTypeOf<{
        id: string;
        page: number;
        title: string;
      }>();
    });
  });

  describe("ErrorUnion", () => {
    it("should extract union of all error types", () => {
      type Errors = {
        404: z.ZodObject<{ code: z.ZodLiteral<"NOT_FOUND"> }>;
        500: z.ZodObject<{ code: z.ZodLiteral<"INTERNAL_ERROR"> }>;
      };
      type Union = ErrorUnion<Errors>;

      expectTypeOf<Union>().toMatchTypeOf<
        { code: "NOT_FOUND" } | { code: "INTERNAL_ERROR" }
      >();
    });

    it("should work with single error type", () => {
      type Errors = {
        404: z.ZodObject<{ message: z.ZodString }>;
      };
      type Union = ErrorUnion<Errors>;

      expectTypeOf<Union>().toEqualTypeOf<{ message: string }>();
    });
  });

  describe("InferErrorSchemas", () => {
    it("should infer schema for each status code", () => {
      type Errors = {
        404: z.ZodObject<{ code: z.ZodLiteral<"NOT_FOUND"> }>;
        500: z.ZodObject<{ code: z.ZodLiteral<"INTERNAL_ERROR"> }>;
      };
      type Inferred = InferErrorSchemas<Errors>;

      expectTypeOf<Inferred[404]>().toEqualTypeOf<{ code: "NOT_FOUND" }>();
      expectTypeOf<Inferred[500]>().toEqualTypeOf<{ code: "INTERNAL_ERROR" }>();
    });
  });

  describe("TypedContext", () => {
    it("should merge BaseContext with custom context", () => {
      interface CustomContext {
        user: { id: string; email: string };
      }

      type Ctx = TypedContext<{}, undefined, CustomContext>;

      expectTypeOf<Ctx>().toMatchTypeOf<{
        hono: Context;
        user: { id: string; email: string };
        input: {};
      }>();
    });

    it("should include input from InputConfig", () => {
      type Ctx = TypedContext<
        {
          params: z.ZodObject<{ id: z.ZodString }>;
          query: z.ZodObject<{ page: z.ZodNumber }>;
        },
        undefined
      >;

      expectTypeOf<Ctx["input"]>().toMatchTypeOf<{
        id: string;
        page: number;
      }>();
    });

    it("should include error function when errors defined", () => {
      type Ctx = TypedContext<
        {},
        {
          404: z.ZodObject<{ code: z.ZodLiteral<"NOT_FOUND"> }>;
        }
      >;

      expectTypeOf<Ctx["error"]>().toBeFunction();
      expectTypeOf<Ctx["error"]>().parameters.toEqualTypeOf<
        [{ code: "NOT_FOUND" }]
      >();
    });

    it("should not include error function when errors undefined", () => {
      type Ctx = TypedContext<{}, undefined>;

      expectTypeOf<Ctx["error"]>().toEqualTypeOf<never>();
    });

    it("should merge all context types correctly", () => {
      interface CustomContext {
        user: { id: string } | null;
        session: string;
      }

      type Ctx = TypedContext<
        {
          params: z.ZodObject<{ id: z.ZodString }>;
        },
        {
          404: z.ZodObject<{ message: z.ZodString }>;
        },
        CustomContext
      >;

      expectTypeOf<Ctx>().toMatchTypeOf<{
        hono: Context;
        user: { id: string } | null;
        session: string;
        input: { id: string };
        error: (error: { message: string }) => never;
      }>();
    });
  });

  describe("BaseContext", () => {
    it("should have hono property", () => {
      expectTypeOf<BaseContext>().toHaveProperty("hono");
      expectTypeOf<BaseContext["hono"]>().toMatchTypeOf<Context>();
    });
  });
});
