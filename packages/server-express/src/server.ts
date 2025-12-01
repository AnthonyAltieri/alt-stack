import express from "express";
import type { Express, Request, Response, NextFunction } from "express";
import type { z } from "zod";
import type { ZodError } from "zod";
import type { TypedContext, InputConfig, TelemetryOption } from "@alt-stack/server-core";
import type { Procedure } from "@alt-stack/server-core";
import type { Router } from "@alt-stack/server-core";
import {
  validateInput,
  ServerError,
  ValidationError,
  middlewareMarker,
  resolveTelemetryConfig,
  shouldIgnoreRoute,
  initTelemetry,
  createRequestSpan,
  endSpanWithError,
  setSpanOk,
} from "@alt-stack/server-core";
import type { MiddlewareResult } from "@alt-stack/server-core";

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

export function createServer<TCustomContext extends object = Record<string, never>>(
  config: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
  options?: {
    createContext?: (req: Request, res: Response) => Promise<TCustomContext> | TCustomContext;
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
    TCustomContext
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

      try {
        const params = req.params as Record<string, unknown>;
        const query = req.query as Record<string, unknown>;
        const body = req.body ?? {};

        const inputConfig = procedure.config.input;
        const validatedInput = await validateInput(inputConfig, params, query, body);

        const errorFn = (error: unknown): never => {
          if (!procedure.config.errors) {
            throw new ServerError(500, "INTERNAL_SERVER_ERROR", "Error occurred");
          }

          let statusCode = 500;
          let errorCode = "ERROR";
          let message = "Error occurred";

          for (const [code, schema] of Object.entries(procedure.config.errors)) {
            const result = (schema as z.ZodTypeAny).safeParse(error);
            if (result.success) {
              statusCode = Number(code);
              const errorResponse = result.data;
              if (
                typeof errorResponse === "object" &&
                errorResponse !== null &&
                "error" in errorResponse &&
                errorResponse.error &&
                typeof errorResponse.error === "object"
              ) {
                const errorPayload = errorResponse.error as Record<string, unknown>;
                if (typeof errorPayload.code === "string") {
                  errorCode = errorPayload.code;
                }
                if (typeof errorPayload.message === "string") {
                  message = errorPayload.message;
                }
              }
              throw new ServerError(statusCode, errorCode, message, errorResponse);
            }
          }

          throw new ServerError(500, "INTERNAL_SERVER_ERROR", "Error occurred", error);
        };

        const customContext = options?.createContext
          ? await options.createContext(req, res)
          : ({} as TCustomContext);

        type ProcedureContext = TypedContext<
          InputConfig,
          Record<number, z.ZodTypeAny> | undefined,
          TCustomContext
        >;

        const ctx: ProcedureContext = {
          ...customContext,
          express: { req, res },
          input: validatedInput,
          error: errorFn,
          span,
        } as ProcedureContext;

        let currentCtx: ProcedureContext = ctx;
        let middlewareIndex = 0;

        const runMiddleware = async (): Promise<ProcedureContext | globalThis.Response> => {
          if (middlewareIndex >= procedure.middleware.length) {
            return currentCtx;
          }

          const middleware = procedure.middleware[middlewareIndex++];
          if (!middleware) {
            return currentCtx;
          }

          const result = await middleware({
            ctx: currentCtx,
            next: async (opts?: {
              ctx?: Partial<ProcedureContext>;
            }): Promise<MiddlewareResult<Partial<ProcedureContext>>> => {
              if (opts?.ctx) {
                currentCtx = { ...currentCtx, ...opts.ctx } as ProcedureContext;
              }
              const nextResult = await runMiddleware();
              return {
                marker: middlewareMarker,
                ok: true as const,
                data: nextResult,
              };
            },
          });

          if (result instanceof globalThis.Response) {
            return result;
          }

          if (result && typeof result === "object" && "marker" in result && "ok" in result) {
            const data = (result as any).data;
            if (data instanceof globalThis.Response) {
              return data;
            }
            currentCtx = data as ProcedureContext;
            return currentCtx;
          }

          currentCtx = result as ProcedureContext;
          return currentCtx;
        };

        const middlewareResult = await runMiddleware();
        if (middlewareResult instanceof globalThis.Response) {
          // Response was already handled by middleware
          span?.setAttribute("http.response.status_code", middlewareResult.status);
          setSpanOk(span);
          span?.end();
          return;
        }
        currentCtx = middlewareResult as ProcedureContext;

        const response = await procedure.handler(currentCtx);

        // If handler returns a Response directly, we need to handle it
        if (response instanceof globalThis.Response) {
          // Express doesn't use Web Response objects, so we extract data
          span?.setAttribute("http.response.status_code", response.status);
          setSpanOk(span);
          span?.end();
          const contentType = response.headers.get("content-type");
          if (contentType?.includes("text/html")) {
            res.setHeader("Content-Type", "text/html");
            res.send(await response.text());
          } else {
            res.json(await response.json());
          }
          return;
        }

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
        if (error instanceof ValidationError) {
          span?.setAttribute("http.response.status_code", 400);
          span?.end();
          if (
            options?.defaultErrorHandlers &&
            error.details &&
            typeof error.details === "object" &&
            "errors" in error.details &&
            Array.isArray(error.details.errors)
          ) {
            const errors = error.details.errors as Array<
              [ZodError, "body" | "param" | "query", unknown]
            >;
            const [_schema, instance] = options.defaultErrorHandlers.default400Error(errors);
            res.status(400).json({ error: instance });
            return;
          }

          res.status(400).json({
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
              details: error.details
                ? Array.isArray(error.details)
                  ? error.details
                  : [String(error.details)]
                : [],
            },
          });
          return;
        }

        if (error instanceof ServerError) {
          span?.setAttribute("http.response.status_code", error.statusCode);
          span?.end();
          res.status(error.statusCode).json(error.toJSON());
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
