import { describe, expect, test, vi } from "vitest";

vi.mock("@alt-stack/server-express", () => {
  return {
    createServer: vi.fn(() => ({ __alt: true })),
    createDocsRouter: vi.fn(() => ({ __docs: true })),
  };
});

describe("registerAltStack()", () => {
  test("mounts Alt Stack app with Nest global prefix and request-scoped locator", async () => {
    const { registerAltStack } = await import("./register.js");
    const { createServer } = await import("@alt-stack/server-express");
    const { mergeAltStackRequestContext } = await import("./request-context.js");

    const expressUse = vi.fn();
    const diGet = vi.fn(() => ({ svc: true }));
    const diResolve = vi.fn(async (_token: unknown, contextId?: unknown) => ({ contextId }));
    const registerRequestByContextId = vi.fn();

    const app = {
      getHttpAdapter: () => ({
        getInstance: () => ({ use: expressUse }),
      }),
      get: diGet,
      resolve: diResolve,
      registerRequestByContextId,
      config: {
        getGlobalPrefix: () => "v1",
      },
    };

    registerAltStack(app as any, { api: {} as any }, {
      mountPath: "/api",
      createContext: () => ({ extra: 123 }),
    });

    expect(createServer).toHaveBeenCalledTimes(1);
    expect(expressUse).toHaveBeenCalledWith("/v1/api", { __alt: true });

    const [, serverOptions] = (createServer as any).mock.calls[0] as [unknown, any];
    const req = {} as any;
    mergeAltStackRequestContext(req, { fromMiddleware: true });
    const ctx = await serverOptions.createContext(req, {} as any);

    expect(ctx.extra).toBe(123);
    expect(ctx.fromMiddleware).toBe(true);
    expect(typeof ctx.nest.get).toBe("function");
    expect(typeof ctx.nest.resolve).toBe("function");

    ctx.nest.get("Token");
    await ctx.nest.resolve("Token");
    await ctx.nest.resolve("Token");

    expect(diGet).toHaveBeenCalledTimes(1);
    expect(registerRequestByContextId).toHaveBeenCalledTimes(1);
    expect(diResolve).toHaveBeenCalledTimes(2);
    expect(diResolve.mock.calls[0]?.[1]).toBe(diResolve.mock.calls[1]?.[1]);
  });

  test("does not double-prefix routes or docs when mountPath already includes the global prefix", async () => {
    const { registerAltStack } = await import("./register.js");
    const { createDocsRouter } = await import("@alt-stack/server-express");

    const expressUse = vi.fn();
    const app = {
      getHttpAdapter: () => ({
        getInstance: () => ({ use: expressUse }),
      }),
      get: vi.fn(() => ({})),
      config: {
        getGlobalPrefix: () => "v1",
      },
    };

    registerAltStack(app as any, { api: {} as any }, {
      mountPath: "/v1/api",
      docs: { enableDocs: false, openapiPath: "openapi.json", path: "/docs" },
    });

    expect(createDocsRouter).toHaveBeenCalledTimes(1);
    expect(expressUse).toHaveBeenNthCalledWith(1, "/v1/api", { __alt: true });
    expect(expressUse).toHaveBeenNthCalledWith(2, "/v1/api/docs", { __docs: true });
  });

  test("can ignore Nest global prefix when requested", async () => {
    const { registerAltStack } = await import("./register.js");

    const expressUse = vi.fn();
    const app = {
      getHttpAdapter: () => ({
        getInstance: () => ({ use: expressUse }),
      }),
      get: vi.fn(() => ({})),
      config: {
        getGlobalPrefix: () => "v1",
      },
    };

    registerAltStack(app as any, { api: {} as any }, {
      mountPath: "/api",
      respectGlobalPrefix: false,
    });

    expect(expressUse).toHaveBeenCalledWith("/api", { __alt: true });
  });

  test("throws if the underlying platform is not Express", async () => {
    const { registerAltStack } = await import("./register.js");

    const app = {
      getHttpAdapter: () => ({
        getInstance: () => ({}),
      }),
      get: vi.fn(() => ({})),
    };

    expect(() =>
      registerAltStack(app as any, { api: {} as any }, { mountPath: "/api" }),
    ).toThrow(/platform-express/i);
  });
});
