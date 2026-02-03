import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import type { z } from "zod";
import type { ZodError } from "zod";
import type { TypedContext, InputConfig, TelemetryOption } from "@alt-stack/server-core";
import type { Procedure } from "@alt-stack/server-core";
import type { Router } from "@alt-stack/server-core";
import type { Result, ResultError } from "@alt-stack/server-core";
import {
  validateInput,
  middlewareMarker,
  middlewareOk,
  resolveTelemetryConfig,
  shouldIgnoreRoute,
  initTelemetry,
  createRequestSpan,
  endSpanWithError,
  setSpanOk,
  withActiveSpan,
  isErr,
  ok as resultOk,
  err as resultErr,
  findHttpStatusForError,
} from "@alt-stack/server-core";
import type { MiddlewareResult, MiddlewareResultSuccess } from "@alt-stack/server-core";

/**
 * Converts OpenAPI-style path params ({param}) to Express-style (:param)
 */
function convertPathToExpress(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

function normalizePrefix(prefix: string): string {
  const normalized = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function normalizePath(prefix: string, path: string): string {
  const normalizedPrefix = normalizePrefix(prefix);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const cleanPath =
    normalizedPath.endsWith("/") && normalizedPath !== "/"
      ? normalizedPath.slice(0, -1)
      : normalizedPath;
  if (cleanPath === "/") {
    return normalizedPrefix;
  }
  return `${normalizedPrefix}${cleanPath}`;
}

function isResult(value: unknown): value is Result<unknown, ResultError> {
  if (!value || typeof value !== "object") return false;
  if (!("_tag" in value)) return false;
  const tag = (value as any)._tag;
  if (tag === "Ok") return "value" in value;
  if (tag === "Err") return "error" in value;
  return false;
}


/**
 * Serialize a ResultError for JSON response.
 * Extracts error properties beyond the base Error fields.
 */
function serializeError(error: Error & { _tag: string }): object {
  // Get all own enumerable properties except standard Error fields
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

import type { ExpressBaseContext } from "./types.js";

export function createServer<TContext extends ExpressBaseContext = ExpressBaseContext>(
  config: Record<string, Router<TContext> | Router<TContext>[]>,
  options?: {
    createContext?: (req: Request, res: Response) => Promise<Omit<TContext, "express" | "span">> | Omit<TContext, "express" | "span">;
    defaultErrorHandlers?: {
      default400Error: (
        errors: Array<[error: ZodError, variant: "body" | "param" | "query", value: unknown]>,
      ) => [z.ZodObject<any>, z.infer<z.ZodObject<any>>];
      default500Error: (error: unknown) => [z.ZodObject<any>, z.infer<z.ZodObject<any>>];
      default400ErrorSchema?: z.ZodObject<any>;
      default500ErrorSchema?: z.ZodObject<any>;
    };
    /** Enable OpenTelemetry tracing */
    telemetry?: TelemetryOption;
  },
): Express {
  const app = express();
  const telemetryConfig = resolveTelemetryConfig(options?.telemetry);

  // Initialize telemetry if enabled
  if (telemetryConfig.enabled) {
    initTelemetry();
  }

  // Parse JSON bodies
  app.use(express.json());

  // Collect all procedures from all routers
  const procedures: Procedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<number, z.ZodTypeAny> | undefined,
    TContext
  >[] = [];

  for (const [prefix, routerOrRouters] of Object.entries(config)) {
    const routers = Array.isArray(routerOrRouters) ? routerOrRouters : [routerOrRouters];

    for (const router of routers) {
      const routerProcedures = router.getProcedures();

      for (const procedure of routerProcedures) {
        procedures.push({
          ...procedure,
          path: normalizePath(prefix, procedure.path),
        });
      }
    }
  }

  // Register all procedures as Express routes
  for (const procedure of procedures) {
    const expressPath = convertPathToExpress(procedure.path);

    const handler = async (req: Request, res: Response, _next: NextFunction) => {
      // Create telemetry span if enabled
      const shouldTrace =
        telemetryConfig.enabled &&
        !shouldIgnoreRoute(procedure.path, telemetryConfig);
      const span = shouldTrace
        ? createRequestSpan(
            procedure.method,
            procedure.path,
            req.path,
            telemetryConfig,
          )
        : undefined;

      // Wrap handler execution in active span context so child spans
      // (e.g., database operations) are automatically parented
      await withActiveSpan(span, async () => {
      try {
        const params = req.params as Record<string, unknown>;
        const query = req.query as Record<string, unknown>;
        const body = req.body ?? {};

        const inputConfig = procedure.config.input;
        const validatedInput = await validateInput(inputConfig, params, query, body);

        const customContext = options?.createContext
          ? await options.createContext(req, res)
          : ({} as Omit<TContext, "express" | "span">);

        type ProcedureContext = TypedContext<
          InputConfig,
          Record<number, z.ZodTypeAny> | undefined,
          TContext
        >;

        const ctx: ProcedureContext = {
          ...customContext,
          express: { req, res },
          input: validatedInput,
          span,
        } as ProcedureContext;

        let currentCtx: ProcedureContext = ctx;
        let middlewareIndex = 0;

        // Get the flags for which middleware return Result types
        const middlewareWithErrorsFlags = (procedure as any).middlewareWithErrorsFlags as
          | boolean[]
          | undefined;

        type MiddlewareRunResult =
          | { ok: true; ctx: ProcedureContext }
          | { ok: false; error: Error & { _tag: string } }
          | { ok: true; response: globalThis.Response };

        const runMiddleware = async (): Promise<MiddlewareRunResult> => {
          if (middlewareIndex >= procedure.middleware.length) {
            return { ok: true, ctx: currentCtx };
          }

          const currentIndex = middlewareIndex;
          const middleware = procedure.middleware[middlewareIndex++];
          if (!middleware) {
            return { ok: true, ctx: currentCtx };
          }

          // Check if this middleware returns Result types
          const isResultMiddleware = middlewareWithErrorsFlags?.[currentIndex] ?? false;

          if (isResultMiddleware) {
            // Result-based middleware - provide next() that returns Result
            const nextFn = async (opts?: { ctx?: Partial<ProcedureContext> }) => {
              if (opts?.ctx) {
                currentCtx = { ...currentCtx, ...opts.ctx } as ProcedureContext;
              }
              const nextResult = await runMiddleware();

              // Propagate errors from downstream middleware
              if (!nextResult.ok) {
                return resultErr(nextResult.error);
              }

              // Handle Response objects
              if ("response" in nextResult) {
                return middlewareOk(currentCtx);
              }

              return middlewareOk(nextResult.ctx);
            };

            const result = await (middleware as any)({
              ctx: currentCtx,
              next: nextFn,
            });

            // Result-based middleware returns Result<MiddlewareResultSuccess, Error>
            if (result && typeof result === "object" && "_tag" in result) {
              if (result._tag === "Err") {
                const error = result.error as Error & { _tag: string };
                return { ok: false, error };
              }

              if (result._tag === "Ok") {
                const value = result.value as MiddlewareResultSuccess<any>;
                if (value && value.marker === middlewareMarker) {
                  currentCtx = { ...currentCtx, ...value.ctx } as ProcedureContext;
                }
                return { ok: true, ctx: currentCtx };
              }
            }

            return { ok: true, ctx: currentCtx };
          }

          // Legacy middleware - throws on error, returns MiddlewareResult
          let result: unknown;
          try {
            result = await middleware({
              ctx: currentCtx,
              next: async (opts?: {
                ctx?: Partial<ProcedureContext>;
              }): Promise<MiddlewareResult<Partial<ProcedureContext>>> => {
                if (opts?.ctx) {
                  currentCtx = { ...currentCtx, ...opts.ctx } as ProcedureContext;
                }
                const nextResult = await runMiddleware();

                // Propagate errors from Result-based middleware
                if (!nextResult.ok) {
                  throw nextResult.error;
                }

                // Handle Response objects
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
          } catch (thrownError) {
            // Check if this is a propagated middleware error with _tag
            if (
              thrownError &&
              thrownError instanceof Error &&
              typeof (thrownError as any)._tag === "string"
            ) {
              return {
                ok: false,
                error: thrownError as Error & { _tag: string },
              };
            }
            // Re-throw other errors to be handled by outer try-catch
            throw thrownError;
          }

          if (result instanceof globalThis.Response) {
            return { ok: true, response: result };
          }

          // Check if middleware returned a Result type (err() call)
          // This allows inline middleware to return err() even without being flagged
          if (result && typeof result === "object" && "_tag" in result) {
            const resultWithTag = result as { _tag: string; error?: unknown; value?: unknown };
            if (resultWithTag._tag === "Err") {
              const error = resultWithTag.error as Error & { _tag: string };
              return { ok: false, error };
            }

            if (resultWithTag._tag === "Ok") {
              const value = resultWithTag.value as MiddlewareResultSuccess<any>;
              if (value && value.marker === middlewareMarker) {
                currentCtx = { ...currentCtx, ...value.ctx } as ProcedureContext;
              }
              return { ok: true, ctx: currentCtx };
            }
          }

          if (result && typeof result === "object" && "marker" in result && "ok" in result) {
            const data = (result as any).data;
            if (data instanceof globalThis.Response) {
              return { ok: true, response: data };
            }
            currentCtx = data as ProcedureContext;
            return { ok: true, ctx: currentCtx };
          }

          currentCtx = result as ProcedureContext;
          return { ok: true, ctx: currentCtx };
        };

        const middlewareResult = await runMiddleware();

        // Handle middleware errors (from Result-based middleware)
        if (!middlewareResult.ok) {
          const error = middlewareResult.error;
          const statusCode = findHttpStatusForError(error._tag, procedure.config.errors as any);
          const errorData = serializeError(error);

          span?.setAttribute("http.response.status_code", statusCode);
          span?.end();
          res.status(statusCode).json(errorData);
          return;
        }

        // Handle Response objects from middleware
        if ("response" in middlewareResult) {
          span?.setAttribute("http.response.status_code", middlewareResult.response.status);
          setSpanOk(span);
          span?.end();
          return;
        }

        currentCtx = middlewareResult.ctx;

        const handlerResult = await procedure.handler(currentCtx);
        const result = isResult(handlerResult) ? handlerResult : resultOk(handlerResult);

        // Handle Result type - check if it's Ok or Err
        if (isErr(result)) {
          // Extract HTTP status code by matching error._tag against declared error tags
          const error = result.error;
          const statusCode = findHttpStatusForError(error._tag, procedure.config.errors as any);
          const errorData = serializeError(error);

          span?.setAttribute("http.response.status_code", statusCode);
          span?.end();
          res.status(statusCode).json(errorData);
          return;
        }

        // It's an Ok result
        const response = result.value;

        if (procedure.config.output) {
          const validated = procedure.config.output.parse(response);
          span?.setAttribute("http.response.status_code", 200);
          setSpanOk(span);
          span?.end();
          res.json(validated);
        } else {
          span?.setAttribute("http.response.status_code", 200);
          setSpanOk(span);
          span?.end();
          res.json(response);
        }
      } catch (error) {
        endSpanWithError(span, error);
        // Check for validation errors (thrown by internal validateInput)
        if (error instanceof Error && error.name === "ValidationError") {
          const validationError = error as Error & { details?: unknown };
          span?.setAttribute("http.response.status_code", 400);
          span?.end();
          if (
            options?.defaultErrorHandlers &&
            validationError.details &&
            typeof validationError.details === "object" &&
            "errors" in validationError.details &&
            Array.isArray((validationError.details as { errors?: unknown }).errors)
          ) {
            const errors = (validationError.details as { errors: unknown[] }).errors as Array<
              [ZodError, "body" | "param" | "query", unknown]
            >;
            const [_schema, instance] = options.defaultErrorHandlers.default400Error(errors);
            res.status(400).json({ error: instance });
            return;
          }

          res.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message: validationError.message,
              details: validationError.details
                ? Array.isArray(validationError.details)
                  ? validationError.details
                  : [String(validationError.details)]
                : [],
            },
          });
          return;
        }

        span?.setAttribute("http.response.status_code", 500);
        span?.end();
        if (options?.defaultErrorHandlers) {
          const [_schema, instance] = options.defaultErrorHandlers.default500Error(error);
          res.status(500).json({ error: instance });
          return;
        }

        res.status(500).json({
          error: {
            code: "INTERNAL_SERVER_ERROR",
            message: error instanceof Error ? error.message : "Internal server error",
            details: error instanceof Error && error.stack ? [error.stack] : [],
          },
        });
      }
      });
    };

    switch (procedure.method) {
      case "GET":
        app.get(expressPath, handler);
        break;
      case "POST":
        app.post(expressPath, handler);
        break;
      case "PUT":
        app.put(expressPath, handler);
        break;
      case "PATCH":
        app.patch(expressPath, handler);
        break;
      case "DELETE":
        app.delete(expressPath, handler);
        break;
    }
  }

  return app;
}
