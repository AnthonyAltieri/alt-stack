import { describe, expect, test, vi } from "vitest";

vi.mock("@alt-stack/server-express", () => {
  return {
    createServer: vi.fn(() => ({ __alt: true })),
    createDocsRouter: vi.fn(() => ({ __docs: true })),
  };
});

describe("registerAltStack()", () => {
  test("mounts Alt Stack app and injects ctx.nest", async () => {
    const { registerAltStack } = await import("./register.js");
    const { createServer } = await import("@alt-stack/server-express");

    const expressUse = vi.fn();
    const diGet = vi.fn(() => ({ svc: true }));

    const app = {
      getHttpAdapter: () => ({
        getInstance: () => ({ use: expressUse }),
      }),
      get: diGet,
    };

    registerAltStack(app as any, { api: {} as any }, {
      mountPath: "/api",
      createContext: () => ({ extra: 123 }),
    });

    expect(createServer).toHaveBeenCalledTimes(1);
    expect(expressUse).toHaveBeenCalledWith("/api", { __alt: true });

    const [, serverOptions] = (createServer as any).mock.calls[0] as [unknown, any];
    const ctx = await serverOptions.createContext({} as any, {} as any);

    expect(ctx.extra).toBe(123);
    expect(ctx.nest).toBeDefined();
    expect(typeof ctx.nest.get).toBe("function");
    expect(typeof ctx.nest.resolve).toBe("function");

    ctx.nest.get("Token");
    expect(diGet).toHaveBeenCalled();
  });

  test("can mount docs router", async () => {
    const { registerAltStack } = await import("./register.js");
    const { createDocsRouter } = await import("@alt-stack/server-express");

    const expressUse = vi.fn();
    const app = {
      getHttpAdapter: () => ({
        getInstance: () => ({ use: expressUse }),
      }),
      get: vi.fn(() => ({})),
    };

    registerAltStack(app as any, { api: {} as any }, {
      mountPath: "/api",
      docs: { enableDocs: false, openapiPath: "openapi.json", path: "/docs" },
    });

    expect(createDocsRouter).toHaveBeenCalledTimes(1);
    expect(expressUse).toHaveBeenCalledWith("/api/docs", { __docs: true });
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

