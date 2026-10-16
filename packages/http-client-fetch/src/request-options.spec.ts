import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApiClient, FetchExecutor, UnexpectedApiClientError } from "./index.js";

const schemas = { Request: { "/health": { GET: {} } }, Response: {} } as const;
const baseUrl = "https://api.example.test";

const entrypoints = [
  {
    name: "client",
    createRequest(fetch?: typeof globalThis.fetch) {
      const client = createApiClient({ baseUrl, ...schemas, fetch });
      return () => client.get("/health", {});
    },
  },
  {
    name: "executor",
    createRequest(fetch?: typeof globalThis.fetch) {
      const executor = new FetchExecutor({ fetch });
      return () => executor.execute({ method: "GET", url: `${baseUrl}/health`, headers: {} });
    },
  },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(async () => {
    throw new Error("Unexpected global fetch");
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetch selection", () => {
  it.each(entrypoints)("uses injected fetch without a receiver through $name", async ({ createRequest }) => {
    const globalFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", globalFetch);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("ok"));

    await createRequest(fetch)();

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(`${baseUrl}/health`, expect.objectContaining({ method: "GET" }));
    expect(fetch.mock.contexts).toEqual([undefined]);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it.each(entrypoints)("resolves the global fetch at execution time through $name", async ({ createRequest }) => {
    const initialFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", initialFetch);
    const request = createRequest();
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetch);

    await request();

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.contexts).toEqual([undefined]);
    expect(initialFetch).not.toHaveBeenCalled();
  });
});

describe("client header providers", () => {
  it.each([false, true])("merges provider headers before request headers (async: %s)", async (isAsync) => {
    const clientHeaders = {
      Authorization: "Bearer client-token",
      "X-Request-Id": "client-id",
      "X-Count": 2,
      "X-Null": null,
      "X-Undefined": undefined,
    };
    const headers = vi.fn(() => isAsync ? Promise.resolve(clientHeaders) : clientHeaders);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("ok"));
    const client = createApiClient({ baseUrl, ...schemas, headers, fetch });
    expect(headers).not.toHaveBeenCalled();

    await client.get("/health", {
      headers: { "X-Request-Id": "request-id", "X-Count": null, "X-Omitted": undefined },
    });

    expect(headers).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith(`${baseUrl}/health`, expect.objectContaining({
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer client-token",
        "X-Request-Id": "request-id",
        "X-Count": "2",
      },
    }));
    expect(clientHeaders["X-Request-Id"]).toBe("client-id");
  });

  it.each(["network", "response"] as const)("refreshes headers and uses injected fetch on a %s retry", async (failure) => {
    vi.useFakeTimers();
    const globalFetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", globalFetch);
    const tokens = ["first-token", "second-token"];
    const headers = vi.fn(async () => ({ Authorization: `Bearer ${tokens.shift()}` }));
    const fetch = vi.fn<typeof globalThis.fetch>();
    if (failure === "network") {
      fetch.mockRejectedValueOnce(new Error("Connection failed"));
    } else {
      fetch.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    }
    fetch.mockResolvedValueOnce(new Response("ok"));
    const client = createApiClient({ baseUrl, ...schemas, headers, fetch });
    const request = client.get("/health", {
      retries: 1,
      headers: { "X-Request-Id": "request-id" },
      shouldRetry: ({ error, response }) => error !== undefined || response?.status === 503,
    }).catch((error: unknown) => error);

    await vi.runAllTimersAsync();
    const result = await request;

    expect(result).toMatchObject({ success: true });
    expect(headers).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(([, init]) => init?.headers)).toEqual([
      { "Content-Type": "application/json", Authorization: "Bearer first-token", "X-Request-Id": "request-id" },
      { "Content-Type": "application/json", Authorization: "Bearer second-token", "X-Request-Id": "request-id" },
    ]);
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it.each([false, true])("sanitizes provider failures before errors and logs (async: %s)", async (isAsync) => {
    const secret = "Bearer private-token";
    const headers = () => {
      if (isAsync) return Promise.reject(new Error(secret));
      throw new Error(secret);
    };
    const fetch = vi.fn<typeof globalThis.fetch>();
    const errorLog = vi.fn();
    const client = createApiClient({ baseUrl, ...schemas, headers, fetch, logger: { error: errorLog } });

    const error: unknown = await client.get("/health", {}).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(UnexpectedApiClientError);
    expect(error).toMatchObject({ message: "Header provider failed", endpoint: "/health", method: "GET", cause: undefined });
    expect(String(error)).not.toContain(secret);
    expect(JSON.stringify(error)).not.toContain(secret);
    expect(errorLog).toHaveBeenCalledOnce();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(secret);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("surfaces a provider failure after a response-based retry", async () => {
    vi.useFakeTimers();
    const secret = "Bearer private-token";
    const headers = vi.fn(async (): Promise<Record<string, unknown>> => {
      throw new Error(secret);
    }).mockResolvedValueOnce({ Authorization: secret });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response("unavailable", { status: 503 }));
    const errorLog = vi.fn();
    const warnLog = vi.fn();
    const client = createApiClient({
      baseUrl,
      ...schemas,
      headers,
      fetch,
      logger: { error: errorLog, warn: warnLog },
    });
    const request = client.get("/health", {
      retries: 1,
      shouldRetry: ({ response }) => response?.status === 503,
    }).catch((error: unknown) => error);

    await vi.runAllTimersAsync();
    const error = await request;

    expect(error).toBeInstanceOf(UnexpectedApiClientError);
    expect(error).toMatchObject({ message: "Header provider failed", cause: undefined });
    expect(headers).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledOnce();
    expect(errorLog).toHaveBeenCalledOnce();
    expect(JSON.stringify([...errorLog.mock.calls, ...warnLog.mock.calls])).not.toContain(secret);
  });
});
