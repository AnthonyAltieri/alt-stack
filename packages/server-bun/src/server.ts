import type { z } from "zod";
import type { ZodError } from "zod";
import type {
  TypedContext,
  InputConfig,
  TelemetryOption,
} from "@alt-stack/server-core";
import type { Procedure } from "@alt-stack/server-core";
import type { Router } from "@alt-stack/server-core";
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
  isErr,
  ok as resultOk,
  err as resultErr,
  findHttpStatusForError,
} from "@alt-stack/server-core";
import type {
  MiddlewareResult,
  MiddlewareResultSuccess,
} from "@alt-stack/server-core";
import { BunRouter } from "./router.ts";
import type { BunServer } from "./types.ts";

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

/**
 * Serialize a ResultError for JSON response.
 * Extracts error properties beyond the base Error fields.
 */
function serializeError(error: Error & { _tag: string }): object {
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

/**
 * Create a JSON response
 */
function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function createServer<
  TCustomContext extends object = Record<string, never>,
>(
  config: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
  options?: {
    createContext?: (
      req: Request,
      server: BunServer,
    ) => Promise<TCustomContext> | TCustomContext;
    defaultErrorHandlers?: {
      default400Error: (
        errors: Array<
          [error: ZodError, variant: "body" | "param" | "query", value: unknown]
        >,
      ) => [z.ZodObject<any>, z.infer<z.ZodObject<any>>];
      default500Error: (
        error: unknown,
      ) => [z.ZodObject<any>, z.infer<z.ZodObject<any>>];
      default400ErrorSchema?: z.ZodObject<any>;
      default500ErrorSchema?: z.ZodObject<any>;
    };
    telemetry?: TelemetryOption;
    port?: number;
    hostname?: string;
  },
): BunServer {
  const bunRouter = new BunRouter();
  const telemetryConfig = resolveTelemetryConfig(options?.telemetry);

  // Initialize telemetry if enabled
  if (telemetryConfig.enabled) {
    initTelemetry();
  }

  // Collect all procedures from all routers
  const procedures: Procedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<number, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] = [];

  for (const [prefix, routerOrRouters] of Object.entries(config)) {
    const routers = Array.isArray(routerOrRouters)
      ? routerOrRouters
      : [routerOrRouters];

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

  // Register all procedures with the router
  for (const procedure of procedures) {
    bunRouter.register(
      procedure.method,
      procedure.path,
      async (req, params, server) => {
        // Create telemetry span if enabled
        const url = new URL(req.url);
        const shouldTrace =
          telemetryConfig.enabled &&
          !shouldIgnoreRoute(procedure.path, telemetryConfig);
        const span = shouldTrace
          ? createRequestSpan(
              procedure.method,
              procedure.path,
              url.pathname,
              telemetryConfig,
            )
          : undefined;

        try {
          // Extract query parameters
          const query: Record<string, unknown> = {};
          for (const [key, value] of url.searchParams) {
            query[key] = value;
          }

          // Parse body (JSON only)
          const body = await req.json().catch(() => ({}));

          const inputConfig = procedure.config.input;
          const validatedInput = await validateInput(
            inputConfig,
            params,
            query,
            body,
          );

          const customContext = options?.createContext
            ? await options.createContext(req, server)
            : ({} as TCustomContext);

          type ProcedureContext = TypedContext<
            InputConfig,
            Record<number, z.ZodTypeAny> | undefined,
            TCustomContext
          >;

          const ctx: ProcedureContext = {
            ...customContext,
            bun: { req, server },
            input: validatedInput,
            span,
          } as ProcedureContext;

          let currentCtx: ProcedureContext = ctx;
          let middlewareIndex = 0;

          // Get the flags for which middleware return Result types
          const middlewareWithErrorsFlags = (procedure as any)
            .middlewareWithErrorsFlags as boolean[] | undefined;

          type MiddlewareRunResult =
            | { ok: true; ctx: ProcedureContext }
            | { ok: false; error: Error & { _tag: string } }
            | { ok: true; response: Response };

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
            const isResultMiddleware =
              middlewareWithErrorsFlags?.[currentIndex] ?? false;

            if (isResultMiddleware) {
              // Result-based middleware - provide next() that returns Result
              const nextFn = async (opts?: {
                ctx?: Partial<ProcedureContext>;
              }) => {
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
                    currentCtx = {
                      ...currentCtx,
                      ...value.ctx,
                    } as ProcedureContext;
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
                next: async (
                  opts?: { ctx?: Partial<ProcedureContext> },
                ): Promise<MiddlewareResult<Partial<ProcedureContext>>> => {
                  // Merge context updates if provided
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

            // Handle both legacy middleware (returns context/Response) and new middleware (returns MiddlewareResult)
            if (result instanceof Response) {
              return { ok: true, response: result };
            }

            // Check if middleware returned a Result type (err() call)
            if (result && typeof result === "object" && "_tag" in result) {
              const resultWithTag = result as {
                _tag: string;
                error?: unknown;
                value?: unknown;
              };
              if (resultWithTag._tag === "Err") {
                const error = resultWithTag.error as Error & { _tag: string };
                return { ok: false, error };
              }

              if (resultWithTag._tag === "Ok") {
                const value = resultWithTag.value as MiddlewareResultSuccess<any>;
                if (value && value.marker === middlewareMarker) {
                  currentCtx = {
                    ...currentCtx,
                    ...value.ctx,
                  } as ProcedureContext;
                }
                return { ok: true, ctx: currentCtx };
              }
            }

            // Check if it's a MiddlewareResult wrapper
            if (
              result &&
              typeof result === "object" &&
              "marker" in result &&
              "ok" in result
            ) {
              const data = (result as any).data;
              if (data instanceof Response) {
                return { ok: true, response: data };
              }
              currentCtx = data as ProcedureContext;
              return { ok: true, ctx: currentCtx };
            }

            // Legacy middleware - direct context return
            currentCtx = result as ProcedureContext;
            return { ok: true, ctx: currentCtx };
          };

          const middlewareResult = await runMiddleware();

          // Handle middleware errors (from Result-based middleware)
          if (!middlewareResult.ok) {
            const error = middlewareResult.error as Error & { _tag: string };
            const statusCode = findHttpStatusForError(
              error._tag,
              procedure.config.errors as any,
            );
            const errorData = serializeError(error);

            span?.setAttribute("http.response.status_code", statusCode);
            span?.end();
            return jsonResponse(errorData, statusCode);
          }

          // Handle Response objects from middleware
          if ("response" in middlewareResult) {
            span?.setAttribute(
              "http.response.status_code",
              middlewareResult.response.status,
            );
            setSpanOk(span);
            span?.end();
            return middlewareResult.response;
          }

          currentCtx = middlewareResult.ctx;

          const result = await procedure.handler(currentCtx);

          // Handle Result type - check if it's Ok or Err
          if (isErr(result)) {
            const error = result.error;
            const statusCode = findHttpStatusForError(
              error._tag,
              procedure.config.errors as any,
            );
            const errorData = serializeError(error);

            span?.setAttribute("http.response.status_code", statusCode);
            span?.end();
            return jsonResponse(errorData, statusCode);
          }

          // It's an Ok result
          const response = result.value;

          // If handler returns a Response directly, return it as-is
          if (response instanceof Response) {
            span?.setAttribute("http.response.status_code", response.status);
            setSpanOk(span);
            span?.end();
            return response;
          }

          if (procedure.config.output) {
            const validated = procedure.config.output.parse(response);
            span?.setAttribute("http.response.status_code", 200);
            setSpanOk(span);
            span?.end();
            return jsonResponse(validated);
          }

          span?.setAttribute("http.response.status_code", 200);
          setSpanOk(span);
          span?.end();
          return jsonResponse(response);
        } catch (error) {
          endSpanWithError(span, error);
          // Check for validation errors (thrown by internal validateInput)
          if (error instanceof Error && error.name === "ValidationError") {
            const validationError = error as Error & { details?: unknown };
            span?.setAttribute("http.response.status_code", 400);
            span?.end();
            // Use default 400 error handler if available
            if (
              options?.defaultErrorHandlers &&
              validationError.details &&
              typeof validationError.details === "object" &&
              "errors" in validationError.details &&
              Array.isArray(
                (validationError.details as { errors?: unknown }).errors,
              )
            ) {
              const errors = (
                validationError.details as { errors: unknown[] }
              ).errors as Array<
                [ZodError, "body" | "param" | "query", unknown]
              >;
              const [_schema, instance] =
                options.defaultErrorHandlers.default400Error(errors);
              return jsonResponse({ error: instance }, 400);
            }
            // Fallback to default validation error format
            return jsonResponse(
              {
                error: {
                  code: "VALIDATION_ERROR",
                  message: validationError.message,
                  details: validationError.details
                    ? Array.isArray(validationError.details)
                      ? validationError.details
                      : [String(validationError.details)]
                    : [],
                },
              },
              400,
            );
          }
          span?.setAttribute("http.response.status_code", 500);
          span?.end();
          // Use default 500 error handler if available
          if (options?.defaultErrorHandlers) {
            const [_schema, instance] =
              options.defaultErrorHandlers.default500Error(error);
            return jsonResponse({ error: instance }, 500);
          }
          // Fallback to default 500 error format
          return jsonResponse(
            {
              error: {
                code: "INTERNAL_SERVER_ERROR",
                message:
                  error instanceof Error
                    ? error.message
                    : "Internal server error",
                details:
                  error instanceof Error && error.stack ? [error.stack] : [],
              },
            },
            500,
          );
        }
      },
    );
  }

  // Create and return Bun server
  const server = Bun.serve({
    port: options?.port ?? 3000,
    hostname: options?.hostname ?? "0.0.0.0",
    fetch: async (req, server) => {
      const response = await bunRouter.handle(req, server);
      if (response) {
        return response;
      }
      return jsonResponse({ error: { code: "NOT_FOUND", message: "Not Found" } }, 404);
    },
  });

  return server;
}
