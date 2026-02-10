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
  isResult,
  middlewareMarker,
  middlewareOk,
} from "@alt-stack/server-core";
import type { NestAppLike } from "./register.js";
import type { NestServiceLocator } from "./types.js";
import { mergeAltStackRequestContext, readAltStackRequestContext } from "./request-context.js";

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
   * How to handle errors thrown/returned by Alt Stack middleware.
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

function createNestLocator(app: NestAppLike): NestServiceLocator {
  const get = <T,>(token: unknown): T => {
    try {
      return app.get<T>(token, { strict: false });
    } catch {
      return app.get<T>(token);
    }
  };

  const resolve = async <T,>(token: unknown): Promise<T> => {
    if (typeof app.resolve === "function") {
      try {
        return await app.resolve<T>(token, undefined, { strict: false });
      } catch {
        return await app.resolve<T>(token);
      }
    }
    return get<T>(token);
  };

  return { get, resolve };
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
    return { middlewares: [builder._fn as any], flags: [true], errors: builder._errors as any };
  }

  if (input && typeof input === "object" && "_middlewares" in input) {
    const middlewares = (input as MiddlewareBuilder<any, any>)._middlewares as Array<(opts: any) => Promise<any>>;
    return { middlewares, flags: middlewares.map(() => false) };
  }

  return { middlewares: [input as any], flags: [false] };
}

function serializeTaggedError(error: Error & { _tag: string }): object {
  const props: Record<string, unknown> = {};
  for (const key of Object.keys(error)) {
    if (key !== "name" && key !== "message" && key !== "stack") {
      props[key] = (error as any)[key];
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

async function sendWebResponse(res: Response, webRes: globalThis.Response): Promise<void> {
  res.status(webRes.status);
  webRes.headers.forEach((value, key) => {
    try {
      res.setHeader(key, value);
    } catch {
      // Ignore invalid headers for Express
    }
  });

  const buf = Buffer.from(await webRes.arrayBuffer());
  if (buf.byteLength === 0) {
    res.end();
    return;
  }
  res.end(buf);
}

function omitReservedContextKeys(value: Record<string, unknown>): Record<string, unknown> {
  const { nest: _nest, express: _express, input: _input, span: _span, ...rest } = value as any;
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
      const nest = createNestLocator(app);

      const existingBag = readAltStackRequestContext(req) ?? {};
      let ctxOverrides: Record<string, unknown> = omitReservedContextKeys(existingBag);

      const baseCtx = {
        nest,
        express: { req, res },
        input: includeInput
          ? {
              params: (req as any).params ?? {},
              query: (req as any).query ?? {},
              body: (req as any).body ?? {},
            }
          : { params: undefined, query: undefined, body: undefined },
        span: undefined,
      } as const;

      const rebuildCtx = () => ({ ...ctxOverrides, ...baseCtx });
      let currentCtx = rebuildCtx();

      const applyOverride = (patch: unknown) => {
        if (!patch || typeof patch !== "object") return;
        ctxOverrides = { ...ctxOverrides, ...omitReservedContextKeys(patch as Record<string, unknown>) };
        currentCtx = rebuildCtx();
      };

      let middlewareIndex = 0;

      type MiddlewareRunResult =
        | { ok: true; ctx: Record<string, unknown> }
        | { ok: false; error: Error & { _tag: string } }
        | { ok: true; response: globalThis.Response };

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
          const nextFn = async (opts?: { ctx?: Record<string, unknown> }): Promise<Result<MiddlewareResultSuccess<any>, any>> => {
            if (opts?.ctx) applyOverride(opts.ctx);
            const nextResult = await runMiddleware();
            if (!nextResult.ok) return resultErr(nextResult.error);
            if ("response" in nextResult) return middlewareOk(currentCtx);
            return middlewareOk(nextResult.ctx);
          };

          const result = await middleware({ ctx: currentCtx, next: nextFn });

          if (isResult(result)) {
            if (isErr(result)) {
              return { ok: false, error: result.error as Error & { _tag: string } };
            }

            const value = (result as any).value as MiddlewareResultSuccess<any>;
            if (value && value.marker === middlewareMarker) {
              applyOverride(value.ctx);
            }
            return { ok: true, ctx: currentCtx };
          }

          return { ok: true, ctx: currentCtx };
        }

        // Legacy middleware (throws on error, returns MiddlewareResult)
        let result: unknown;
        try {
          result = await middleware({
            ctx: currentCtx,
            next: async (opts?: { ctx?: Record<string, unknown> }) => {
              if (opts?.ctx) applyOverride(opts.ctx);
              const nextResult = await runMiddleware();
              if (!nextResult.ok) throw nextResult.error;
              if ("response" in nextResult) {
                return { marker: middlewareMarker, ok: true as const, data: nextResult.response };
              }
              return { marker: middlewareMarker, ok: true as const, data: nextResult.ctx };
            },
          });
        } catch (thrownError) {
          if (
            thrownError &&
            thrownError instanceof Error &&
            typeof (thrownError as any)._tag === "string"
          ) {
            return { ok: false, error: thrownError as Error & { _tag: string } };
          }
          throw thrownError;
        }

        if (isWebResponse(result)) {
          return { ok: true, response: result };
        }

        // Allow inline middleware to return Result types even without being flagged
        if (isResult(result)) {
          if (isErr(result)) {
            return { ok: false, error: result.error as Error & { _tag: string } };
          }

          const value = (result as any).value as MiddlewareResultSuccess<any>;
          if (value && value.marker === middlewareMarker) {
            applyOverride(value.ctx);
          }
          return { ok: true, ctx: currentCtx };
        }

        if (
          result &&
          typeof result === "object" &&
          "marker" in result &&
          "ok" in result
        ) {
          const data = (result as any).data as unknown;
          if (isWebResponse(data)) {
            return { ok: true, response: data };
          }
          if (data && typeof data === "object") {
            applyOverride(data as Record<string, unknown>);
          }
          return { ok: true, ctx: currentCtx };
        }

        if (result && typeof result === "object") {
          applyOverride(result as Record<string, unknown>);
        }

        return { ok: true, ctx: currentCtx };
      };

      const middlewareResult = await runMiddleware();

      // Persist ctx overrides for the downstream Alt Stack handlers
      if (Object.keys(ctxOverrides).length > 0) {
        mergeAltStackRequestContext(req, ctxOverrides);
      }

      if (!middlewareResult.ok) {
        if (onError === "next") {
          next(middlewareResult.error);
          return;
        }

        const statusCode = findHttpStatusForError(
          middlewareResult.error._tag,
          errorSchemas as any,
        );
        if (!res.headersSent && !res.writableEnded) {
          res.status(statusCode).json(serializeTaggedError(middlewareResult.error));
        }
        return;
      }

      if ("response" in middlewareResult) {
        if (!res.headersSent && !res.writableEnded) {
          await sendWebResponse(res, middlewareResult.response);
        }
        return;
      }

      if (res.headersSent || res.writableEnded) return;
      next();
    })().catch((error) => {
      if (onError === "next") {
        next(error as any);
        return;
      }

      if (res.headersSent || res.writableEnded) return;
      res.status(500).json({
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Internal server error",
          details: error instanceof Error && error.stack ? [error.stack] : [],
        },
      });
    });
  };
}
