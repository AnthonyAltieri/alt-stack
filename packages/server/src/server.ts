import type { Context, Hono } from "hono";
import { Hono as HonoClass } from "hono";
import type { z } from "zod";
import type { TypedContext, InputConfig, BaseContext } from "./types.js";
import type { Procedure } from "./procedure.js";
import type { Router } from "./router.js";
import { validateInput } from "./validation.js";
import { ServerError } from "./errors.js";

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
  return `${normalizedPrefix}${cleanPath}`;
}

export function createServer<
  TCustomContext extends Record<string, unknown> = Record<string, never>,
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
          for (const [code, schema] of Object.entries(
            procedure.config.errors,
          )) {
            const result = (schema as z.ZodTypeAny).safeParse(error);
            if (result.success) {
              statusCode = Number(code);
              const errorResponse = result.data;
              throw new ServerError(
                statusCode,
                "ERROR",
                typeof errorResponse === "object" &&
                errorResponse !== null &&
                "error" in errorResponse &&
                typeof errorResponse.error === "object" &&
                errorResponse.error !== null &&
                "message" in errorResponse.error &&
                typeof errorResponse.error.message === "string"
                  ? errorResponse.error.message
                  : "Error occurred",
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
            next: async (opts?: { ctx: Partial<ProcedureContext> }) => {
              // Merge context updates if provided (tRPC pattern)
              if (opts?.ctx) {
                currentCtx = { ...currentCtx, ...opts.ctx } as ProcedureContext;
              }
              const nextResult = await runMiddleware();
              if (nextResult instanceof Response) {
                return nextResult;
              }
              currentCtx = nextResult as ProcedureContext;
              return currentCtx;
            },
          });
          if (result instanceof Response) {
            return result;
          }
          currentCtx = result as ProcedureContext;
          return currentCtx;
        };

        const middlewareResult = await runMiddleware();
        if (middlewareResult instanceof Response) {
          return middlewareResult;
        }
        currentCtx = middlewareResult as ProcedureContext;

        const response = await procedure.handler(currentCtx);

        if (procedure.config.output) {
          const validated = procedure.config.output.parse(response);
          return c.json(validated);
        }

        return c.json(response);
      } catch (error) {
        if (error instanceof ServerError) {
          return c.json(error.toJSON(), error.statusCode as any);
        }
        return c.json(
          {
            error: {
              code: "INTERNAL_SERVER_ERROR",
              message: "Internal server error",
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
