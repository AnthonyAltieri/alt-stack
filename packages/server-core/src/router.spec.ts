import { describe, it, expect, expectTypeOf } from "vitest";
import { z } from "zod";
import { Router, router, createRouter, mergeRouters, route, routerFromRoutes } from "./router.js";
import { ok } from "@alt-stack/result";
import type {
  ExtractPathParams,
  ValidateInputForPath,
  InputConfigForPath,
} from "./types/index.js";

describe("Router", () => {
  describe("Router class", () => {
    it("should create an empty router", () => {
      const r = new Router();
      expect(r.getProcedures()).toEqual([]);
    });

    it("should merge nested routers from config", () => {
      const baseRouter = new Router();
      const childRouter = router({
        "/item": baseRouter.procedure
          .output(z.object({ id: z.string() }))
          .get(() => ok({ id: "1" })),
      });

      const parentRouter = new Router({
        "/api": childRouter,
      });

      const procedures = parentRouter.getProcedures();
      expect(procedures).toHaveLength(1);
      expect(procedures[0]?.path).toBe("/api/item");
    });

    it("should merge multiple routers for same prefix", () => {
      const baseRouter = new Router();
      const router1 = router({
        "/a": baseRouter.procedure.output(z.object({ a: z.string() })).get(() => ok({ a: "1" })),
      });

      const router2 = router({
        "/b": baseRouter.procedure.output(z.object({ b: z.string() })).get(() => ok({ b: "2" })),
      });

      const parentRouter = new Router({
        "/api": [router1, router2],
      });

      const procedures = parentRouter.getProcedures();
      expect(procedures).toHaveLength(2);
      expect(procedures.map((p) => p.path).sort()).toEqual(["/api/a", "/api/b"]);
    });
  });

  describe("router function", () => {
    it("should create router from config object", () => {
      const r = router({});
      expect(r).toBeInstanceOf(Router);
    });

    it("should register ReadyProcedure from config", () => {
      interface AppContext {
        user: { id: string } | null;
      }
      const baseRouter = new Router<AppContext>();

      const r = router<AppContext>({
        "/hello": baseRouter.procedure
          .output(z.object({ message: z.string() }))
          .get(() => ok({ message: "Hello" })),
      });

      expect(r.getProcedures()).toHaveLength(1);
      expect(r.getProcedures()[0]?.path).toBe("/hello");
      expect(r.getProcedures()[0]?.method).toBe("GET");
    });

    it("should register methods object from config", () => {
      interface AppContext {
        user: { id: string } | null;
      }
      const baseRouter = new Router<AppContext>();

      const r = router<AppContext>({
        "/items/{id}": {
          get: baseRouter.procedure
            .input({ params: z.object({ id: z.string() }) })
            .output(z.object({ id: z.string() }))
            .handler(({ input }) => ok({ id: input.params.id })),
          delete: baseRouter.procedure
            .input({ params: z.object({ id: z.string() }) })
            .output(z.object({ success: z.boolean() }))
            .handler(() => ok({ success: true })),
        },
      });

      expect(r.getProcedures()).toHaveLength(2);
      const methods = r.getProcedures().map((p) => p.method).sort();
      expect(methods).toEqual(["DELETE", "GET"]);
    });

    it("should merge nested Router from config", () => {
      const baseRouter = new Router();
      const childRouter = router({
        "/nested": baseRouter.procedure.output(z.object({ nested: z.boolean() })).get(() => ok({ nested: true })),
      });

      const r = router({
        "/prefix": childRouter,
      });

      expect(r.getProcedures()).toHaveLength(1);
      expect(r.getProcedures()[0]?.path).toBe("/prefix/nested");
    });
  });

  describe("createRouter function", () => {
    it("should create empty router without config", () => {
      const r = createRouter();
      expect(r.getProcedures()).toEqual([]);
    });

    it("should create router with nested routers config", () => {
      const baseRouter = new Router();
      const child = router({
        "/value": baseRouter.procedure.output(z.object({ value: z.number() })).get(() => ok({ value: 42 })),
      });

      const r = createRouter({
        "/api": child,
      });

      expect(r.getProcedures()).toHaveLength(1);
      expect(r.getProcedures()[0]?.path).toBe("/api/value");
    });
  });

  describe("mergeRouters function", () => {
    it("should merge multiple routers", () => {
      const baseRouter = new Router();
      const router1 = router({
        "/r1": baseRouter.procedure.output(z.object({ from: z.literal("router1") })).get(() => ok({ from: "router1" as const })),
      });

      const router2 = router({
        "/r2": baseRouter.procedure.output(z.object({ from: z.literal("router2") })).get(() => ok({ from: "router2" as const })),
      });

      const merged = mergeRouters(router1, router2);

      expect(merged.getProcedures()).toHaveLength(2);
    });
  });

  describe("path normalization", () => {
    it("should handle paths without leading slash", () => {
      const baseRouter = new Router();
      const r = router({
        "no-slash": baseRouter.procedure.output(z.object({ ok: z.boolean() })).get(() => ok({ ok: true })),
      });

      expect(r.getProcedures()[0]?.path).toBe("/no-slash");
    });

    it("should handle prefix without leading slash", () => {
      const baseRouter = new Router();
      const child = router({
        "/route": baseRouter.procedure.output(z.object({ ok: z.boolean() })).get(() => ok({ ok: true })),
      });

      const parent = new Router({
        api: child,
      });

      expect(parent.getProcedures()[0]?.path).toBe("/api/route");
    });

    it("should handle prefix with trailing slash", () => {
      const baseRouter = new Router();
      const child = router({
        "/route": baseRouter.procedure.output(z.object({ ok: z.boolean() })).get(() => ok({ ok: true })),
      });

      const parent = new Router({
        "/api/": child,
      });

      expect(parent.getProcedures()[0]?.path).toBe("/api/route");
    });
  });

  describe("Path parameter type validation", () => {
    it("should accept procedures with matching params schema for path with params", () => {
      interface AppContext {
        user: { id: string } | null;
      }
      const baseRouter = new Router<AppContext>();

      // This should compile without error - params schema has 'id' key
      const r = router<AppContext>({
        "/users/{id}": {
          get: baseRouter.procedure
            .input({ params: z.object({ id: z.string() }) })
            .output(z.object({ id: z.string() }))
            .handler(({ input }) => ok({ id: input.params.id })),
        },
      });

      expect(r.getProcedures()).toHaveLength(1);
    });

    it("should accept procedures for paths without params", () => {
      interface AppContext {
        user: { id: string } | null;
      }
      const baseRouter = new Router<AppContext>();

      // Paths without params don't require params schema
      const r = router<AppContext>({
        "/users": {
          get: baseRouter.procedure
            .output(z.object({ users: z.array(z.string()) }))
            .handler(() => ok({ users: [] })),
        },
      });

      expect(r.getProcedures()).toHaveLength(1);
    });

    it("should accept ReadyProcedure with matching params schema", () => {
      interface AppContext {
        user: { id: string } | null;
      }
      const baseRouter = new Router<AppContext>();

      // ReadyProcedure (from .get()) with proper params
      const r = router<AppContext>({
        "/users/{id}": baseRouter.procedure
          .input({ params: z.object({ id: z.string() }) })
          .output(z.object({ id: z.string() }))
          .get(({ input }) => ok({ id: input.params.id })),
      });

      expect(r.getProcedures()).toHaveLength(1);
    });

    it("should handle multiple path params", () => {
      interface AppContext {
        user: { id: string } | null;
      }
      const baseRouter = new Router<AppContext>();

      // Multiple path params require all keys in params schema
      const r = router<AppContext>({
        "/users/{userId}/posts/{postId}": {
          get: baseRouter.procedure
            .input({
              params: z.object({
                userId: z.string(),
                postId: z.string(),
              }),
            })
            .output(z.object({ userId: z.string(), postId: z.string() }))
            .handler(({ input }) =>
              ok({ userId: input.params.userId, postId: input.params.postId }),
            ),
        },
      });

      expect(r.getProcedures()).toHaveLength(1);
    });

    describe("Type-level validation (compile-time checks)", () => {
      it("should have ExtractPathParams extract params correctly", () => {
        type NoParams = ExtractPathParams<"/users">;
        type SingleParam = ExtractPathParams<"/users/{id}">;
        type MultipleParams = ExtractPathParams<"/users/{userId}/posts/{postId}">;

        expectTypeOf<NoParams>().toEqualTypeOf<never>();
        expectTypeOf<SingleParam>().toEqualTypeOf<"id">();
        expectTypeOf<MultipleParams>().toEqualTypeOf<"userId" | "postId">();
      });

      it("should have InputConfigForPath require params for parameterized paths", () => {
        type NoParamsInput = InputConfigForPath<"/users">;
        type WithParamsInput = InputConfigForPath<"/users/{id}">;

        // For paths without params, any InputConfig is valid
        expectTypeOf<{}>().toMatchTypeOf<NoParamsInput>();
        expectTypeOf<{ body: z.ZodString }>().toMatchTypeOf<NoParamsInput>();

        // For paths with params, params schema is required
        expectTypeOf<WithParamsInput>().toHaveProperty("params");
      });

      it("should enforce params schema contains path param keys", () => {
        // Valid: params schema has all path param keys
        type ValidInput = { params: z.ZodObject<{ id: z.ZodString }> };
        type ValidResult = ValidateInputForPath<"/users/{id}", ValidInput>;
        expectTypeOf<ValidResult>().toEqualTypeOf<ValidInput>();

        // Invalid: missing params entirely
        type MissingParams = {};
        type MissingResult = ValidateInputForPath<"/users/{id}", MissingParams>;
        expectTypeOf<MissingResult>().toEqualTypeOf<never>();

        // Invalid: params schema missing required key
        type WrongParams = { params: z.ZodObject<{ other: z.ZodString }> };
        type WrongResult = ValidateInputForPath<"/users/{id}", WrongParams>;
        expectTypeOf<WrongResult>().toEqualTypeOf<never>();

        // Valid: no path params means any input is fine
        type AnyInput = { body: z.ZodString };
        type NoParamsResult = ValidateInputForPath<"/users", AnyInput>;
        expectTypeOf<NoParamsResult>().toEqualTypeOf<AnyInput>();
      });

      /**
       * Note: Due to TypeScript limitations with generic inference, validation
       * errors don't appear at call sites. Instead, we verify validation works
       * at the type level by checking ValidateRouterConfig output directly.
       */
      it("should validate procedures have required params at type level", () => {
        interface AppContext {
          user: { id: string } | null;
        }

        // Helper to check if a type is never
        type IsNever<T> = [T] extends [never] ? true : false;

        // Good config - procedure has params
        type GoodConfig = {
          "/users/{id}": {
            get: ReturnType<
              ReturnType<
                ReturnType<Router<AppContext>["procedure"]["input"]>["output"]
              >["handler"]
            >;
          };
        };

        // Bad config - procedure lacks params for path with {id}
        type BadConfig = {
          "/users/{id}": {
            get: ReturnType<
              ReturnType<Router<AppContext>["procedure"]["output"]>["handler"]
            >;
          };
        };

        // Import the validation type
        type ValidatedBad = import("./router.js").ValidateRouterConfig<BadConfig, AppContext>;

        // The get property should be never after validation
        type GetType = ValidatedBad["/users/{id}"]["get"];
        expectTypeOf<IsNever<GetType>>().toEqualTypeOf<true>();
      });

      it("should pass through valid procedures", () => {
        interface AppContext {
          user: { id: string } | null;
        }

        const baseRouter = new Router<AppContext>();

        // This is valid - has params for path with {id}
        const r = router<AppContext>({
          "/users/{id}": {
            get: baseRouter.procedure
              .input({ params: z.object({ id: z.string() }) })
              .output(z.object({ id: z.string() }))
              .handler(({ input }) => ok({ id: input.params.id })),
          },
        });

        expect(r.getProcedures()).toHaveLength(1);
      });
    });
  });

  describe("route() helper for call-site validation", () => {
    it("should create a route definition with path and methods", () => {
      interface AppContext {
        user: { id: string } | null;
      }
      const baseRouter = new Router<AppContext>();

      const userRoute = route<"/users/{id}", AppContext>(
        "/users/{id}",
        {
          get: baseRouter.procedure
            .input({ params: z.object({ id: z.string() }) })
            .output(z.object({ id: z.string() }))
            .handler(({ input }) => ok({ id: input.params.id })),
        },
      );

      expect(userRoute.path).toBe("/users/{id}");
      expect(userRoute.methods.get).toBeDefined();
    });

    it("should work with paths without params", () => {
      interface AppContext {
        user: { id: string } | null;
      }
      const baseRouter = new Router<AppContext>();

      const usersRoute = route<"/users", AppContext>(
        "/users",
        {
          get: baseRouter.procedure
            .output(z.object({ users: z.array(z.string()) }))
            .handler(() => ok({ users: [] })),
        },
      );

      expect(usersRoute.path).toBe("/users");
    });

    /**
     * Type-level test: Verify that route() produces call-site errors
     * when params schema is missing for parameterized paths.
     */
    it("should produce type error when params schema is missing", () => {
      interface AppContext {
        user: { id: string } | null;
      }
      const baseRouter = new Router<AppContext>();

      const _badRoute = route<"/users/{id}", AppContext>(
        "/users/{id}",
        {
          // @ts-expect-error - Missing params schema for {id}
          get: baseRouter.procedure
            .output(z.object({ id: z.string() }))
            .handler(() => ok({ id: "test" })),
        },
      );
    });
  });

  describe("routerFromRoutes()", () => {
    it("should create router from route definitions", () => {
      interface AppContext {
        user: { id: string } | null;
      }
      const baseRouter = new Router<AppContext>();

      const appRouter = routerFromRoutes<AppContext>(
        route<"/users/{id}", AppContext>(
          "/users/{id}",
          {
            get: baseRouter.procedure
              .input({ params: z.object({ id: z.string() }) })
              .output(z.object({ id: z.string() }))
              .handler(({ input }) => ok({ id: input.params.id })),
          },
        ),
        route<"/users", AppContext>(
          "/users",
          {
            get: baseRouter.procedure
              .output(z.object({ users: z.array(z.string()) }))
              .handler(() => ok({ users: [] })),
          },
        ),
      );

      expect(appRouter.getProcedures()).toHaveLength(2);
      expect(appRouter.getProcedures().map(p => p.path).sort()).toEqual(["/users", "/users/{id}"]);
    });
  });
});
