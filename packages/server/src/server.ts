import type { Context, Hono } from "hono";
import { Hono as HonoClass } from "hono";
import type { z } from "zod";
import type { ZodError } from "zod";
import type { TypedContext, InputConfig, BaseContext } from "./types/index.js";
import type { Procedure } from "./types/procedure.js";
import type { Router } from "./router.js";
import { validateInput } from "./validation.js";
import { ServerError, ValidationError } from "./errors.js";
import { middlewareMarker } from "./middleware.js";
import type { MiddlewareResult } from "./middleware.js";

function normalizePrefix(prefix: string): string {
  // Remove trailing slash if present, ensure leading slash
  const normalized = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function normalizePath(prefix: string, path: string): string {
  const normalizedPrefix = normalizePrefix(prefix);
  // Ensure path starts with / and remove trailing slash (unless it's just "/")
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const cleanPath =
    normalizedPath.endsWith("/") && normalizedPath !== "/"
      ? normalizedPath.slice(0, -1)
      : normalizedPath;
  // Combine prefix and path - cleanPath already starts with /, so this works correctly
  // Special case: if cleanPath is "/", just return the prefix (no trailing slash)
  if (cleanPath === "/") {
    return normalizedPrefix;
  }
  return `${normalizedPrefix}${cleanPath}`;
}

export function createServer<
  TCustomContext extends object = Record<string, never>,
>(
  config: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
  options?: {
    createContext?: (c: Context) => Promise<TCustomContext> | TCustomContext;
    middleware?: {
      [path: string]: {
        methods: string[];
        handler: (c: Context) => Promise<Response> | Response;
      };
    };
    docs?: {
      path?: string;
      openapiPath?: string;
    };
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
  },
): Hono {
  const app = new HonoClass();

  // Apply middleware handlers before framework routes
  if (options?.middleware) {
    for (const [path, routeConfig] of Object.entries(options.middleware)) {
      if (path === "*") {
        // Apply as global middleware using app.use
        // The handler can be a Hono middleware function (accepts next) or regular handler
        // Check if handler is middleware-style by checking if it accepts 2 parameters
        const handler = routeConfig.handler;
        if (handler.length === 2) {
          // Middleware function (c, next) - use directly
          app.use("*", handler as any);
        } else {
          // Regular handler (c) - wrap it to work with app.use
          app.use("*", async (c, next) => {
            const result = await handler(c);
            if (result instanceof Response) {
              return result;
            }
            await next();
          });
        }
      } else {
        // Apply as route handler using app.on
        app.on(routeConfig.methods, path, routeConfig.handler);
      }
    }
  }

  // Collect all procedures and middleware from all routers
  const allProcedures: Procedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<number, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] = [];
  const allMiddleware: Array<
    (opts: {
      ctx: BaseContext & TCustomContext;
      next: () => Promise<(BaseContext & TCustomContext) | Response>;
    }) => Promise<(BaseContext & TCustomContext) | Response>
  > = [];

  for (const [prefix, routerOrRouters] of Object.entries(config)) {
    const routers = Array.isArray(routerOrRouters)
      ? routerOrRouters
      : [routerOrRouters];

    for (const router of routers) {
      const routerProcedures = router.getProcedures();
      const routerMiddleware = router.getMiddleware();

      // Add procedures with prefixed paths
      for (const procedure of routerProcedures) {
        allProcedures.push({
          ...procedure,
          path: normalizePath(prefix, procedure.path),
        });
      }

      // Add middleware (cast to the expected type since we'll provide TCustomContext)
      allMiddleware.push(...(routerMiddleware as typeof allMiddleware));
    }
  }

  const routerMiddleware = allMiddleware;
  const procedures = allProcedures;

  for (const middleware of routerMiddleware) {
    app.use("*", async (c, next) => {
      const customContext = options?.createContext
        ? await options.createContext(c)
        : ({} as TCustomContext);
      let baseCtx = { hono: c, ...customContext } as BaseContext &
        TCustomContext;
      const result = await middleware({
        ctx: baseCtx,
        next: async (opts?: { ctx: Partial<BaseContext & TCustomContext> }) => {
          // Merge context updates if provided (tRPC pattern)
          if (opts?.ctx) {
            baseCtx = { ...baseCtx, ...opts.ctx } as BaseContext &
              TCustomContext;
          }
          await next();
          return baseCtx;
        },
      });
      if (result instanceof Response) {
        return result;
      }
    });
  }

  for (const procedure of procedures) {
    const handler = async (c: Context) => {
      try {
        const params = c.req.param();
        const queryRaw = c.req.query();
        const query: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(queryRaw)) {
          query[key] = value;
        }
        const body = await c.req.json().catch(() => ({}));

        const inputConfig = procedure.config.input;
        const validatedInput = await validateInput(
          inputConfig,
          params,
          query,
          body,
        );

        const errorFn = (error: unknown): never => {
          if (!procedure.config.errors) {
            throw new ServerError(
              500,
              "INTERNAL_SERVER_ERROR",
              "Error occurred",
            );
          }

          let statusCode = 500;
          let errorCode = "ERROR";
          let message = "Error occurred";
          for (const [code, schema] of Object.entries(
            procedure.config.errors,
          )) {
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
                const errorPayload = errorResponse.error as Record<
                  string,
                  unknown
                >;
                if (typeof errorPayload.code === "string") {
                  errorCode = errorPayload.code;
                }
                if (typeof errorPayload.message === "string") {
                  message = errorPayload.message;
                }
              }
              throw new ServerError(
                statusCode,
                errorCode,
                message,
                errorResponse,
              );
            }
          }

          throw new ServerError(
            500,
            "INTERNAL_SERVER_ERROR",
            "Error occurred",
            error,
          );
        };

        const customContext = options?.createContext
          ? await options.createContext(c)
          : ({} as TCustomContext);
        type ProcedureContext = TypedContext<
          InputConfig,
          Record<number, z.ZodTypeAny> | undefined,
          TCustomContext
        >;

        const ctx: ProcedureContext = {
          ...customContext,
          hono: c,
          input: validatedInput,
          error: errorFn,
        } as ProcedureContext;

        let currentCtx: ProcedureContext = ctx;
        let middlewareIndex = 0;

        const runMiddleware = async (): Promise<
          ProcedureContext | Response
        > => {
          if (middlewareIndex >= procedure.middleware.length) {
            return currentCtx;
          }
          const middleware = procedure.middleware[middlewareIndex++];
          if (!middleware) {
            return currentCtx;
          }
          const result = await middleware({
            ctx: currentCtx,
            next: async (
              opts?: { ctx?: Partial<ProcedureContext> },
            ): Promise<MiddlewareResult<Partial<ProcedureContext>>> => {
              // Merge context updates if provided
              if (opts?.ctx) {
                currentCtx = { ...currentCtx, ...opts.ctx } as ProcedureContext;
              }
              const nextResult = await runMiddleware();
              // Return MiddlewareResult wrapper for type safety
              return {
                marker: middlewareMarker,
                ok: true as const,
                data: nextResult,
              };
            },
          });

          // Handle both legacy middleware (returns context/Response) and new middleware (returns MiddlewareResult)
          if (result instanceof Response) {
            return result;
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
              return data;
            }
            currentCtx = data as ProcedureContext;
            return currentCtx;
          }

          // Legacy middleware - direct context return
          currentCtx = result as ProcedureContext;
          return currentCtx;
        };

        const middlewareResult = await runMiddleware();
        if (middlewareResult instanceof Response) {
          return middlewareResult;
        }
        currentCtx = middlewareResult as ProcedureContext;

        const response = await procedure.handler(currentCtx);

        // If handler returns a Response directly (e.g., HTML), return it as-is
        if (response instanceof Response) {
          return response;
        }

        if (procedure.config.output) {
          const validated = procedure.config.output.parse(response);
          return c.json(validated);
        }

        return c.json(response);
      } catch (error) {
        if (error instanceof ValidationError) {
          // Use default 400 error handler if available
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
            const [_schema, instance] =
              options.defaultErrorHandlers.default400Error(errors);
            return c.json({ error: instance }, 400);
          }
          // Fallback to default validation error format
          return c.json(
            {
              error: {
                code: "VALIDATION_ERROR",
                message: error.message,
                details: error.details
                  ? Array.isArray(error.details)
                    ? error.details
                    : [String(error.details)]
                  : [],
              },
            },
            400,
          );
        }
        if (error instanceof ServerError) {
          return c.json(error.toJSON(), error.statusCode as any);
        }
        // Use default 500 error handler if available
        if (options?.defaultErrorHandlers) {
          const [_schema, instance] =
            options.defaultErrorHandlers.default500Error(error);
          return c.json({ error: instance }, 500);
        }
        // Fallback to default 500 error format
        return c.json(
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
    };

    switch (procedure.method) {
      case "GET":
        app.get(procedure.path, handler);
        break;
      case "POST":
        app.post(procedure.path, handler);
        break;
      case "PUT":
        app.put(procedure.path, handler);
        break;
      case "PATCH":
        app.patch(procedure.path, handler);
        break;
      case "DELETE":
        app.delete(procedure.path, handler);
        break;
    }
  }

  return app;
}
