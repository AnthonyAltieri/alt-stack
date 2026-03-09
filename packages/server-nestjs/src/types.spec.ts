import { describe, expectTypeOf, it } from "vitest";
import type { Request, Response } from "express";
import type { BaseContext } from "@alt-stack/server-core";
import type { ExpressBaseContext } from "@alt-stack/server-express";
import { init, type NestBaseContext, type NestServiceLocator } from "./index.js";

describe("Nest Types", () => {
  it("extends the shared base context with express and nest helpers", () => {
    const ctx: NestBaseContext = {
      express: { req: {} as Request, res: {} as Response },
      nest: {
        get: (() => ({})) as NestServiceLocator["get"],
        resolve: (async () => ({})) as NestServiceLocator["resolve"],
      },
    };

    expectTypeOf(ctx).toMatchTypeOf<BaseContext>();
    expectTypeOf(ctx).toMatchTypeOf<ExpressBaseContext>();
    expectTypeOf<NestBaseContext>().toHaveProperty("nest");
    expectTypeOf<NestBaseContext["nest"]>().toHaveProperty("get");
    expectTypeOf<NestBaseContext["nest"]>().toHaveProperty("resolve");
  });

  it("keeps ctx.nest available when custom context is merged in", () => {
    const factory = init<{ user: { id: string } | null }>();

    factory.procedure.get(({ ctx }) => {
      expectTypeOf(ctx).toMatchTypeOf<NestBaseContext>();
      expectTypeOf(ctx.nest).toMatchTypeOf<NestServiceLocator>();
      expectTypeOf(ctx.user).toEqualTypeOf<{ id: string } | null>();
      return { _tag: "Ok", value: { ok: true as const } };
    });
  });
});
