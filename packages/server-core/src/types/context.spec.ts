import { describe, it, expectTypeOf } from "vitest";
import { z } from "zod";
import type {
  InferInput,
  TypedContext,
  ErrorUnion,
  InferErrorSchemas,
  BaseContext,
  StringInputObjectSchema,
} from "./context.js";

describe("Context Types", () => {
  describe("BaseContext", () => {
    it("should be an empty interface that can be extended", () => {
      // BaseContext is empty - adapters extend it
      const ctx: BaseContext = {};
      expectTypeOf(ctx).toMatchTypeOf<{}>();
    });

    it("should allow extension with framework-specific properties", () => {
      interface HonoContext extends BaseContext {
        hono: { req: unknown; res: unknown };
      }

      interface ExpressContext extends BaseContext {
        express: { req: unknown; res: unknown };
      }

      const honoCtx: HonoContext = { hono: { req: {}, res: {} } };
      const expressCtx: ExpressContext = { express: { req: {}, res: {} } };

      expectTypeOf(honoCtx).toMatchTypeOf<BaseContext>();
      expectTypeOf(expressCtx).toMatchTypeOf<BaseContext>();
    });
  });

  describe("InferInput", () => {
    it("should infer structured object when no input config provided", () => {
      type EmptyInput = InferInput<{}>;
      expectTypeOf<EmptyInput>().toEqualTypeOf<{
        params: undefined;
        query: undefined;
        body: undefined;
      }>();
    });

    it("should infer params from input config", () => {
      type Input = InferInput<{
        params: z.ZodObject<{ id: z.ZodString }>;
      }>;
      expectTypeOf<Input["params"]>().toMatchTypeOf<{ id: string }>();
      expectTypeOf<Input["query"]>().toEqualTypeOf<undefined>();
      expectTypeOf<Input["body"]>().toEqualTypeOf<undefined>();
    });

    it("should infer query from input config", () => {
      type Input = InferInput<{
        query: z.ZodObject<{ page: z.ZodNumber }>;
      }>;
      expectTypeOf<Input["params"]>().toEqualTypeOf<undefined>();
      expectTypeOf<Input["query"]>().toMatchTypeOf<{ page: number }>();
      expectTypeOf<Input["body"]>().toEqualTypeOf<undefined>();
    });

    it("should infer body from input config", () => {
      type Input = InferInput<{
        body: z.ZodObject<{ title: z.ZodString }>;
      }>;
      expectTypeOf<Input["params"]>().toEqualTypeOf<undefined>();
      expectTypeOf<Input["query"]>().toEqualTypeOf<undefined>();
      expectTypeOf<Input["body"]>().toMatchTypeOf<{ title: string }>();
    });

    it("should have separate params, query, and body properties", () => {
      type Input = InferInput<{
        params: z.ZodObject<{ id: z.ZodString }>;
        query: z.ZodObject<{ page: z.ZodNumber }>;
        body: z.ZodObject<{ title: z.ZodString }>;
      }>;
      expectTypeOf<Input>().toMatchTypeOf<{
        params: { id: string };
        query: { page: number };
        body: { title: string };
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
        user: { id: string; email: string };
        input: { params: undefined; query: undefined; body: undefined };
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
        params: { id: string };
        query: { page: number };
        body: undefined;
      }>();
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
        user: { id: string } | null;
        session: string;
        input: { params: { id: string }; query: undefined; body: undefined };
      }>();
    });
  });

  describe("StringInputObjectSchema", () => {
    it("should accept z.string() schemas", () => {
      const schema = z.object({ id: z.string() });
      type Result = StringInputObjectSchema<typeof schema>;
      expectTypeOf<Result>().toEqualTypeOf<typeof schema>();
    });

    it("should accept z.coerce.number() schemas for query params", () => {
      const schema = z.object({ page: z.coerce.number() });
      type Result = StringInputObjectSchema<typeof schema>;
      expectTypeOf<Result>().toEqualTypeOf<typeof schema>();
    });

    it("should accept z.enum() schemas", () => {
      const schema = z.object({ status: z.enum(["active", "inactive"]) });
      type Result = StringInputObjectSchema<typeof schema>;
      expectTypeOf<Result>().toEqualTypeOf<typeof schema>();
    });

    it("should accept optional string schemas", () => {
      const schema = z.object({ name: z.string().optional() });
      type Result = StringInputObjectSchema<typeof schema>;
      expectTypeOf<Result>().toEqualTypeOf<typeof schema>();
    });
  });
});

