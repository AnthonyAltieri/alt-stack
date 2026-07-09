import { describe, it, expectTypeOf } from "vitest";
import type { Context } from "hono";
import type { BaseContext } from "@alt-stack/server-core";
import type {
  ExternalRoute,
  HonoBaseContext,
  RequestMiddleware,
  RequestMiddlewareContext,
} from "./types.js";

describe("Hono Types", () => {
  describe("HonoBaseContext", () => {
    it("should extend BaseContext", () => {
      const ctx: HonoBaseContext = { hono: {} as Context };
      expectTypeOf(ctx).toMatchTypeOf<BaseContext>();
    });

    it("should have hono property with Hono Context type", () => {
      expectTypeOf<HonoBaseContext>().toHaveProperty("hono");
      expectTypeOf<HonoBaseContext["hono"]>().toMatchTypeOf<Context>();
    });

    it("should be assignable to BaseContext", () => {
      const honoCtx: HonoBaseContext = { hono: {} as Context };
      const baseCtx: BaseContext = honoCtx;
      expectTypeOf(baseCtx).toMatchTypeOf<BaseContext>();
    });

    it("should allow custom properties alongside hono", () => {
      interface AppContext extends HonoBaseContext {
        user: { id: string } | null;
        requestId: string;
      }

      const ctx: AppContext = {
        hono: {} as Context,
        user: { id: "123" },
        requestId: "req-456",
      };

      expectTypeOf(ctx).toMatchTypeOf<HonoBaseContext>();
      expectTypeOf(ctx.user).toEqualTypeOf<{ id: string } | null>();
      expectTypeOf(ctx.requestId).toEqualTypeOf<string>();
    });
  });

  describe("request middleware types", () => {
    it("should expose framework-neutral request details", () => {
      const context = {} as RequestMiddlewareContext;

      expectTypeOf(context.request).toEqualTypeOf<Request>();
      expectTypeOf(context.url).toEqualTypeOf<URL>();
      expectTypeOf(context.method).toEqualTypeOf<string>();
      expectTypeOf(context.path).toEqualTypeOf<string>();
    });

    it("should require middleware to return a response", () => {
      const middleware: RequestMiddleware = (_context, next) => next();

      expectTypeOf(middleware).toMatchTypeOf<RequestMiddleware>();

      // @ts-expect-error - request middleware must return a Response.
      const invalidMiddleware: RequestMiddleware = () => undefined;
      expectTypeOf(invalidMiddleware).toMatchTypeOf<RequestMiddleware>();
    });

    it("should type external routes separately from middleware", () => {
      const externalRoute: ExternalRoute = {
        path: "/auth/*",
        methods: ["GET", "POST"],
        handler: ({ request }) => new Response(request.method),
      };

      expectTypeOf(externalRoute).toMatchTypeOf<ExternalRoute>();
    });
  });
});
