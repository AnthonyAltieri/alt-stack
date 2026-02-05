import { describe, expect, test, vi } from "vitest";
import { z } from "zod";
import { TaggedError, err, createMiddlewareWithErrors } from "@alt-stack/server-core";
import { createNestMiddleware } from "./middleware.js";
import { readAltStackRequestContext } from "./request-context.js";

function createResStub() {
  const res: any = {
    headersSent: false,
    writableEnded: false,
    statusCode: undefined as number | undefined,
    status: vi.fn((code: number) => {
      res.statusCode = code;
      return res;
    }),
    json: vi.fn((_body: unknown) => {
      res.headersSent = true;
      res.writableEnded = true;
      return res;
    }),
    setHeader: vi.fn(),
    end: vi.fn((_data?: unknown) => {
      res.headersSent = true;
      res.writableEnded = true;
      return res;
    }),
  };
  return res;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("createNestMiddleware()", () => {
  test("persists ctx overrides onto req and calls next()", async () => {
    const diGet = vi.fn(() => ({ svc: true }));
    const app = { get: diGet } as any;

    const mw = createNestMiddleware(app, async ({ ctx, next }: any) => {
      ctx.nest.get("Token");
      return next({ ctx: { userId: "u1" } });
    });

    const req: any = { params: { id: "1" }, query: {}, body: {} };
    const res = createResStub();
    const next = vi.fn();

    mw(req, res as any, next as any);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(diGet).toHaveBeenCalledTimes(1);
    expect(readAltStackRequestContext(req)).toMatchObject({ userId: "u1" });
  });

  test("maps tagged errors to HTTP status using MiddlewareBuilderWithErrors schemas", async () => {
    class UnauthorizedError extends TaggedError {
      readonly _tag = "UnauthorizedError" as const;
      constructor(message = "Unauthorized") {
        super(message);
      }
    }

    const middlewareWithErrors = createMiddlewareWithErrors<any>()
      .errors({
        401: z.object({ _tag: z.literal("UnauthorizedError") }),
      })
      .fn(async () => {
        return err(new UnauthorizedError());
      });

    const app = { get: vi.fn(() => ({})) } as any;
    const mw = createNestMiddleware(app, middlewareWithErrors);

    const req: any = { params: {}, query: {}, body: {} };
    const res = createResStub();
    const next = vi.fn();

    mw(req, res as any, next as any);
    await flush();

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { _tag: "UnauthorizedError", code: "UnauthorizedError", message: "Unauthorized" },
    });
  });
});
