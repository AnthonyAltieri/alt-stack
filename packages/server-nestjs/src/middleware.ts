import type { NextFunction, Request, Response } from "express";
import type { z } from "zod";
import type {
  AnyMiddlewareBuilderWithErrors,
  MiddlewareBuilder,
  MiddlewareFunction,
  MiddlewareResultSuccess,
  Result,
} from "@alt-stack/server-core";
import {
  err as resultErr,
  findHttpStatusForError,
  isErr,
  middlewareMarker,
  middlewareOk,
} from "@alt-stack/server-core";
import { createNestLocator } from "./nest-locator.js";
import { mergeAltStackRequestContext, readAltStackRequestContext } from "./request-context.js";
import type { NestAppLike } from "./register.js";

export interface CreateNestMiddlewareOptions {
  /**
   * Optional error schemas used to map a tagged error (`error._tag`) to an HTTP status.
   * When a MiddlewareBuilderWithErrors is provided, its internal `_errors` are used automatically.
   */
  errors?: Record<number, z.ZodTypeAny>;

  /**
   * If `true`, `ctx.input` will be populated from `{ params, query, body }`.
   * Defaults to `true`.
   */
  includeInput?: boolean;

  /**
   * How to handle tagged errors returned by Alt Stack middleware.
   * - `reply` (default): send a JSON error response and do not call `next()`
   * - `next`: call `next(error)` and let Nest/Express handle it
   */
  onError?: "reply" | "next";
}

type AnyAltStackMiddleware =
  | MiddlewareFunction<any, any, any>
  | MiddlewareBuilder<any, any>
  | AnyMiddlewareBuilderWithErrors;

type NormalizedMiddleware = {
  middlewares: Array<(opts: any) => Promise<any>>;
  flags: boolean[];
  errors?: Record<number, z.ZodTypeAny>;
};

type MiddlewareRuntimeContext = Record<string, unknown> & {
  nest: ReturnType<typeof createNestLocator>;
  express: {
    req: Request;
    res: Response;
  };
  input: {
    params: Record<string, unknown> | undefined;
    query: Record<string, unknown> | undefined;
    body: unknown;
  };
  span: undefined;
};

function isResultLike(value: unknown): value is Result<unknown, Error & { readonly _tag: string }> {
  if (!value || typeof value !== "object") {
    return false;
  }

  const tag = (value as { _tag?: unknown })._tag;
  return (
    (tag === "Ok" && "value" in value) ||
    (tag === "Err" && "error" in value)
  );
}

function normalizeMiddleware(input: AnyAltStackMiddleware): NormalizedMiddleware {
  if (
    input &&
    typeof input === "object" &&
    "_fn" in input &&
    "_errors" in input
  ) {
    const builder = input as AnyMiddlewareBuilderWithErrors;
    if (!builder._fn) {
      throw new Error(
        "@alt-stack/server-nestjs: MiddlewareBuilderWithErrors is missing a .fn(...) handler.",
      );
    }

    return {
      middlewares: [builder._fn as (opts: any) => Promise<any>],
      flags: [true],
      errors: builder._errors,
    };
  }

  if (input && typeof input === "object" && "_middlewares" in input) {
    const middlewares = (input as MiddlewareBuilder<any, any>)._middlewares as Array<
      (opts: any) => Promise<any>
    >;

    return {
      middlewares,
      flags: middlewares.map(() => false),
    };
  }

  return {
    middlewares: [input as (opts: any) => Promise<any>],
    flags: [false],
  };
}

function serializeTaggedError(error: Error & { _tag: string }): object {
  const props: Record<string, unknown> = {};
  for (const key of Object.keys(error)) {
    if (key !== "name" && key !== "message" && key !== "stack") {
      props[key] = (error as unknown as Record<string, unknown>)[key];
    }
  }

  return {
    error: {
      code: error._tag,
      message: error.message,
      ...props,
    },
  };
}

function isWebResponse(value: unknown): value is globalThis.Response {
  return (
    typeof globalThis.Response !== "undefined" &&
    value instanceof globalThis.Response
  );
}

function hasMiddlewarePayload(
  value: unknown,
): value is { marker: unknown; ok: unknown; data: unknown } {
  return (
    !!value &&
    typeof value === "object" &&
    "marker" in value &&
    "ok" in value &&
    "data" in value
  );
}

async function sendWebResponse(res: Response, webRes: globalThis.Response): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    try {
      res.setHeader(key, value);
    } catch {
      // Ignore invalid headers for Express.
    }
  });

  const buffer = Buffer.from(await webRes.arrayBuffer());
  if (buffer.byteLength === 0) {
    res.end();
    return;
  }
  res.end(buffer);
}

function omitReservedContextKeys(value: Record<string, unknown>): Record<string, unknown> {
  const {
    nest: _nest,
    express: _express,
    input: _input,
    span: _span,
    ...rest
  } = value;
  return rest;
}

export function createNestMiddleware(
  app: NestAppLike,
  middlewareOrBuilder: AnyAltStackMiddleware,
  options?: CreateNestMiddlewareOptions,
): (req: Request, res: Response, next: NextFunction) => void {
  const includeInput = options?.includeInput ?? true;
  const onError = options?.onError ?? "reply";
  const normalized = normalizeMiddleware(middlewareOrBuilder);
  const errorSchemas = normalized.errors ?? options?.errors;

  return (req, res, next) => {
    void (async () => {
      const nest = createNestLocator(app, req);
      const existingBag = readAltStackRequestContext(req) ?? {};
      let ctxOverrides: Record<string, unknown> = omitReservedContextKeys(existingBag);

      const baseCtx: MiddlewareRuntimeContext = {
        nest,
        express: { req, res },
        input: includeInput
          ? {
              params: req.params ?? {},
              query: req.query ?? {},
              body: req.body ?? {},
            }
          : { params: undefined, query: undefined, body: undefined },
        span: undefined,
      };

      const rebuildCtx = (): MiddlewareRuntimeContext =>
        ({ ...ctxOverrides, ...baseCtx }) as MiddlewareRuntimeContext;
      let currentCtx: MiddlewareRuntimeContext = rebuildCtx();

      const applyOverride = (patch: unknown) => {
        if (!patch || typeof patch !== "object") {
          return;
        }
        ctxOverrides = {
          ...ctxOverrides,
          ...omitReservedContextKeys(patch as Record<string, unknown>),
        };
        currentCtx = rebuildCtx();
      };

      let middlewareIndex = 0;

      type MiddlewareRunResult =
        | { ok: true; ctx: MiddlewareRuntimeContext }
        | { ok: true; response: globalThis.Response }
        | { ok: false; error: Error & { _tag: string } };

      const runMiddleware = async (): Promise<MiddlewareRunResult> => {
        if (middlewareIndex >= normalized.middlewares.length) {
          return { ok: true, ctx: currentCtx };
        }

        if (res.headersSent || res.writableEnded) {
          return { ok: true, ctx: currentCtx };
        }

        const currentIndex = middlewareIndex;
        const middleware = normalized.middlewares[middlewareIndex++];
        if (!middleware) {
          return { ok: true, ctx: currentCtx };
        }

        const isResultMiddleware = normalized.flags[currentIndex] ?? false;

        if (isResultMiddleware) {
          const nextFn = async (
            opts?: { ctx?: Record<string, unknown> },
          ): Promise<Result<MiddlewareResultSuccess<any>, any>> => {
            if (opts?.ctx) {
              applyOverride(opts.ctx);
            }

            const nextResult = await runMiddleware();
            if (!nextResult.ok) {
              return resultErr(nextResult.error);
            }

            if ("response" in nextResult) {
              return middlewareOk(currentCtx);
            }

            return middlewareOk(nextResult.ctx);
          };

          const result = await middleware({ ctx: currentCtx, next: nextFn });
          if (!isResultLike(result)) {
            return { ok: true, ctx: currentCtx };
          }

          if (isErr(result)) {
            return { ok: false, error: result.error as Error & { _tag: string } };
          }

          const value = result.value as MiddlewareResultSuccess<any>;
          if (value && value.marker === middlewareMarker) {
            applyOverride(value.ctx);
          }
          return { ok: true, ctx: currentCtx };
        }

        let result: unknown;
        try {
          result = await middleware({
            ctx: currentCtx,
            next: async (opts?: { ctx?: Record<string, unknown> }) => {
              if (opts?.ctx) {
                applyOverride(opts.ctx);
              }

              const nextResult = await runMiddleware();
              if (!nextResult.ok) {
                throw nextResult.error;
              }

              if ("response" in nextResult) {
                return {
                  marker: middlewareMarker,
                  ok: true as const,
                  data: nextResult.response,
                };
              }

              return {
                marker: middlewareMarker,
                ok: true as const,
                data: nextResult.ctx,
              };
            },
          });
        } catch (error) {
          if (
            error instanceof Error &&
            typeof (error as { _tag?: unknown })._tag === "string"
          ) {
            return { ok: false, error: error as Error & { _tag: string } };
          }
          throw error;
        }

        if (isWebResponse(result)) {
          return { ok: true, response: result };
        }

        if (isResultLike(result)) {
          if (isErr(result)) {
            return { ok: false, error: result.error as Error & { _tag: string } };
          }

          const value = result.value as MiddlewareResultSuccess<any>;
          if (value && value.marker === middlewareMarker) {
            applyOverride(value.ctx);
          }
          return { ok: true, ctx: currentCtx };
        }

        if (hasMiddlewarePayload(result)) {
          const data = result.data;
          if (isWebResponse(data)) {
            return { ok: true, response: data };
          }
          if (data && typeof data === "object") {
            currentCtx = data as MiddlewareRuntimeContext;
          }
          return { ok: true, ctx: currentCtx };
        }

        if (result && typeof result === "object") {
          currentCtx = result as MiddlewareRuntimeContext;
        }
        return { ok: true, ctx: currentCtx };
      };

      const middlewareResult = await runMiddleware();
      if (!middlewareResult.ok) {
        if (onError === "next") {
          next(middlewareResult.error);
          return;
        }

        const statusCode = findHttpStatusForError(
          middlewareResult.error._tag,
          errorSchemas,
        );
        res.status(statusCode).json(serializeTaggedError(middlewareResult.error));
        return;
      }

      if ("response" in middlewareResult) {
        await sendWebResponse(res, middlewareResult.response);
        return;
      }

      if (res.headersSent || res.writableEnded) {
        return;
      }

      mergeAltStackRequestContext(req, ctxOverrides);
      next();
    })().catch((error) => {
      next(error);
    });
  };
}
