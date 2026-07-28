import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiClient } from "./client.js";
import { ValidationError } from "./errors.js";
import type { ExecuteRequest, ExecuteResponse } from "./types.js";

const isoDate = z.codec(z.iso.datetime({ offset: true }), z.date(), {
  decode: (value) => new Date(value),
  encode: (value) => value.toISOString(),
});

const invalidWireDate = z.codec(z.string().startsWith("wire:"), z.date(), {
  decode: () => new Date("2026-07-28T00:00:00.000Z"),
  encode: () => "invalid",
});

function createExecutor() {
  const execute = vi.fn(
    async (_request: ExecuteRequest): Promise<ExecuteResponse<null>> => ({
      status: 200,
      statusText: "OK",
      data: null,
      raw: null,
    }),
  );
  return { execute };
}

describe("ApiClient request encoding", () => {
  it("parses and encodes params, query, and body symmetrically", async () => {
    const Request = {
      "/events/{at}": {
        POST: {
          params: z.object({ at: isoDate }),
          query: z.object({ since: isoDate }),
          body: z.object({ occursAt: isoDate }),
        },
      },
    } as const;
    const executor = createExecutor();
    const client = new ApiClient({
      baseUrl: "https://api.example.com",
      Request,
      Response: {},
      executor,
    });

    await client.post("/events/{at}", {
      params: { at: "2026-07-28T02:00:00+02:00" },
      query: { since: "2026-07-28T03:00:00+02:00" },
      body: { occursAt: "2026-07-28T04:00:00+02:00" },
    });

    expect(executor.execute).toHaveBeenCalledWith({
      method: "POST",
      url: "https://api.example.com/events/2026-07-28T00:00:00.000Z?since=2026-07-28T01%3A00%3A00.000Z",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ occursAt: "2026-07-28T02:00:00.000Z" }),
      timeout: undefined,
    });
  });

  it("serializes parsed defaults, transforms, and stripped objects", async () => {
    const Request = {
      "/events": {
        POST: {
          body: z.object({
            name: z.string().trim(),
            active: z.boolean().default(true),
          }),
        },
      },
    } as const;
    const executor = createExecutor();
    const client = new ApiClient({
      baseUrl: "https://api.example.com",
      Request,
      Response: {},
      executor,
    });
    const body = { name: "  Ada  ", ignored: true };

    await client.post("/events", { body });

    expect(executor.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        body: JSON.stringify({ name: "Ada", active: true }),
      }),
    );
  });

  it("preserves ValidationError metadata and observer-only callbacks", async () => {
    const Request = {
      "/events": {
        POST: {
          body: z.object({ occursAt: isoDate }),
        },
      },
    } as const;
    const executor = createExecutor();
    const onValidationError = vi.fn(() => {
      throw new Error("observer failure");
    });
    const client = new ApiClient({
      baseUrl: "https://api.example.com",
      Request,
      Response: {},
      executor,
      onValidationError,
    });
    const body = { occursAt: "not-an-iso-date" };

    const error: unknown = await client.post("/events", { body }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({
      endpoint: "/events",
      method: "POST",
      message: "Request body validation failed",
    });
    expect(onValidationError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "request",
        location: "body",
        endpoint: "/events",
        method: "POST",
        data: body,
      }),
    );
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("preserves validation handling when encoded output violates the schema", async () => {
    const Request = {
      "/events": {
        POST: {
          body: z.object({ occursAt: invalidWireDate }),
        },
      },
    } as const;
    const executor = createExecutor();
    const onValidationError = vi.fn();
    const client = new ApiClient({
      baseUrl: "https://api.example.com",
      Request,
      Response: {},
      executor,
      onValidationError,
    });
    const body = { occursAt: "wire:2026-07-28" };

    const error: unknown = await client.post("/events", { body }).catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({
      endpoint: "/events",
      method: "POST",
      message: "Request body validation failed",
    });
    expect(onValidationError).toHaveBeenCalledTimes(1);
    expect(onValidationError).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "request",
        location: "body",
        endpoint: "/events",
        method: "POST",
        data: body,
        zodError: expect.any(z.ZodError),
      }),
    );
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
