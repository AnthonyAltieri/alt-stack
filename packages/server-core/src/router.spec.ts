import { describe, it, expect } from "vitest";
import { z } from "zod";
import { Router, router, createRouter, mergeRouters } from "./router.js";
import { ok } from "@alt-stack/result";

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
});
