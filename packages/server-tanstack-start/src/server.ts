import type { z } from "zod";
import type { ZodError } from "zod";
import { createFileRoute } from "@tanstack/react-router";
import type { FileRoutesByPath } from "@tanstack/react-router";
import {
  Router as BaseRouter,
  createRouter as baseCreateRouter,
  err as resultErr,
  findHttpStatusForError,
  generateOpenAPISpec,
  isErr,
  mergeRouters as baseMergeRouters,
  middlewareMarker,
  middlewareOk,
  router as baseRouter,
  setSpanOk,
  validateInput,
} from "@alt-stack/server-core";
import type {
  InputConfig,
  MiddlewareResult,
  MiddlewareResultSuccess,
  PendingProcedure,
  Procedure,
  GenerateOpenAPISpecOptions,
  OpenAPISpec,
  RouterConfigValue,
  TypedContext,
} from "@alt-stack/server-core";
import { tanStackPathToOpenApiPath } from "./path.js";
import type {
  TanStackBaseContext,
  TanStackHttpMethod,
  TanStackRouteParams,
  TanStackServerRoute,
  TanStackServerRouteHandler,
  TanStackServerRouteHandlerArgs,
} from "./types.js";
import type { ExtractTanStackPathParams } from "./path.js";

type ErrorConfig = Record<number, z.ZodTypeAny>;
type AnyProcedure<TContext extends object> = Procedure<
  InputConfig,
  z.ZodTypeAny | undefined,
  ErrorConfig | undefined,
  TContext
>;

export type TanStackRouteMethods = {
  [K in TanStackHttpMethod]?: PendingProcedure<any, any, any, any>;
};

export type AltStackFileRouteOptions<
  TPath extends string,
  TMethods extends TanStackRouteMethods,
  TContext extends TanStackBaseContext<TParams, TRouteContext>,
  TParams extends TanStackRouteParams,
  TRouteContext,
> = {
  server: {
    handlers: TMethods & ValidateMethodsForTanStackPath<TPath, TMethods>;
  } & CreateTanStackRouteHandlersOptions<TContext, TParams, TRouteContext> &
    Record<string, unknown>;
} & Record<string, unknown>;

export interface DefinedTanStackServerRoute<
  TPath extends string,
  TParams extends TanStackRouteParams = TanStackRouteParams,
  TRouteContext = unknown,
  TContext extends TanStackBaseContext<any, any> = TanStackBaseContext,
> {
  path: TPath;
  server: TanStackServerRoute<TParams, TRouteContext>;
  router: BaseRouter<TContext>;
}

export interface AltStackFileRouteMetadata<
  TPath extends string,
  TParams extends TanStackRouteParams = TanStackRouteParams,
  TRouteContext = unknown,
  TContext extends TanStackBaseContext<any, any> = TanStackBaseContext,
> {
  altStack: DefinedTanStackServerRoute<TPath, TParams, TRouteContext, TContext>;
}

export type AltStackFileRoute<
  TRoute,
  TPath extends string,
  TParams extends TanStackRouteParams = TanStackRouteParams,
  TRouteContext = unknown,
  TContext extends TanStackBaseContext<any, any> = TanStackBaseContext,
> = TRoute & AltStackFileRouteMetadata<TPath, TParams, TRouteContext, TContext>;

type ValidateMethodsForTanStackPath<
  TPath extends string,
  TMethods extends TanStackRouteMethods,
> = {
  [M in keyof TMethods]: TMethods[M] extends {
    config: { input: infer TInput };
  }
    ? ExtractTanStackPathParams<TPath> extends never
      ? TMethods[M]
      : TInput extends { params: z.ZodTypeAny }
        ? ExtractTanStackPathParams<TPath> extends keyof z.infer<TInput["params"]>
          ? TMethods[M]
          : never
        : never
    : TMethods[M];
};

export interface CreateTanStackRouteHandlersOptions<
  TContext extends TanStackBaseContext<any, any> = TanStackBaseContext,
  TParams extends TanStackRouteParams = TContext extends TanStackBaseContext<
    infer TInferredParams,
    any
  >
    ? TInferredParams
    : TanStackRouteParams,
  TRouteContext = TContext extends TanStackBaseContext<any, infer TInferredRouteContext>
    ? TInferredRouteContext
    : unknown,
> {
  createContext?: (
    args: TanStackServerRouteHandlerArgs<TParams, TRouteContext>,
  ) =>
    | Promise<Omit<TContext, "tanstack" | "span">>
    | Omit<TContext, "tanstack" | "span">;
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
}

type RouterOrConfig<TContext extends object> =
  | BaseRouter<TContext>
  | Record<string, BaseRouter<TContext> | BaseRouter<TContext>[]>;

function createRouterFromMethods<
  TPath extends string,
  const TMethods extends TanStackRouteMethods,
  TContext extends TanStackBaseContext<any, any>,
>(
  path: TPath,
  methods: TMethods & ValidateMethodsForTanStackPath<TPath, TMethods>,
): BaseRouter<TContext> {
  const router = baseCreateRouter<TContext>();
  const openApiPath = tanStackPathToOpenApiPath(path);

  for (const [method, procedure] of Object.entries(methods)) {
    if (!procedure) {
      continue;
    }

    router.registerPendingProcedure(
      openApiPath,
      method,
      procedure as PendingProcedure<
        InputConfig,
        z.ZodTypeAny | undefined,
        ErrorConfig | undefined,
        TContext
      >,
    );
  }

  return router;
}

function normalizePrefix(prefix: string): string {
  const normalized = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return normalized.endsWith("/") && normalized !== "/"
    ? normalized.slice(0, -1)
    : normalized;
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
  if (normalizedPrefix === "/") {
    return cleanPath;
  }
  return `${normalizedPrefix}${cleanPath}`;
}

function collectProcedures<TContext extends object>(
  routerOrConfig: RouterOrConfig<TContext>,
): AnyProcedure<TContext>[] {
  if (routerOrConfig instanceof BaseRouter) {
    return [...routerOrConfig.getProcedures()] as AnyProcedure<TContext>[];
  }

  const procedures: AnyProcedure<TContext>[] = [];
  for (const [prefix, routerOrRouters] of Object.entries(routerOrConfig)) {
    const routers = Array.isArray(routerOrRouters)
      ? routerOrRouters
      : [routerOrRouters];

    for (const router of routers) {
      for (const procedure of router.getProcedures()) {
        procedures.push({
          ...procedure,
          path: normalizePath(prefix, procedure.path),
        } as AnyProcedure<TContext>);
      }
    }
  }
  return procedures;
}

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

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function methodNotAllowedResponse(allowedMethods: TanStackHttpMethod[]): Response {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: {
      allow: allowedMethods.join(", "),
    },
  });
}

function toQueryObject(url: string): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  for (const [key, value] of new URL(url).searchParams.entries()) {
    const existing = query[key];
    if (Array.isArray(existing)) {
      existing.push(value);
    } else if (existing !== undefined) {
      query[key] = [existing, value];
    } else {
      query[key] = value;
    }
  }
  return query;
}

async function readBody(request: Request, procedure: AnyProcedure<any>): Promise<unknown> {
  if (!procedure.config.input.body) {
    return {};
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return request.json().catch(() => ({}));
  }

  return request.text().catch(() => "");
}

async function executeProcedure<
  TContext extends TanStackBaseContext<TParams, TRouteContext>,
  TParams extends TanStackRouteParams,
  TRouteContext,
>(
  procedure: AnyProcedure<TContext>,
  args: TanStackServerRouteHandlerArgs<TParams, TRouteContext>,
  options?: CreateTanStackRouteHandlersOptions<TContext, TParams, TRouteContext>,
): Promise<Response> {
  try {
    const params = args.params as Record<string, unknown>;
    const query = toQueryObject(args.request.url);
    const body = await readBody(args.request, procedure);

    const validatedInput = await validateInput(
      procedure.config.input,
      params,
      query,
      body,
    );

    const customContext = options?.createContext
      ? await options.createContext(args)
      : ({} as Omit<TContext, "tanstack" | "span">);

    type ProcedureContext = TypedContext<
      InputConfig,
      ErrorConfig | undefined,
      TContext
    >;

    const ctx: ProcedureContext = {
      ...customContext,
      tanstack: {
        request: args.request,
        params: args.params,
        context: args.context,
      },
      input: validatedInput,
    } as ProcedureContext;

    let currentCtx: ProcedureContext = ctx;
    let middlewareIndex = 0;
    const middlewareWithErrorsFlags = (procedure as any).middlewareWithErrorsFlags as
      | boolean[]
      | undefined;

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

      const isResultMiddleware =
        middlewareWithErrorsFlags?.[currentIndex] ?? false;

      if (isResultMiddleware) {
        const nextFn = async (opts?: { ctx?: Partial<ProcedureContext> }) => {
          if (opts?.ctx) {
            currentCtx = { ...currentCtx, ...opts.ctx } as ProcedureContext;
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

        const result = await (middleware as any)({
          ctx: currentCtx,
          next: nextFn,
        });

        if (result && typeof result === "object" && "_tag" in result) {
          if (result._tag === "Err") {
            return {
              ok: false,
              error: result.error as Error & { _tag: string },
            };
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

      let result: unknown;
      try {
        result = await middleware({
          ctx: currentCtx,
          next: async (
            opts?: { ctx?: Partial<ProcedureContext> },
          ): Promise<MiddlewareResult<Partial<ProcedureContext>>> => {
            if (opts?.ctx) {
              currentCtx = { ...currentCtx, ...opts.ctx } as ProcedureContext;
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
      } catch (thrownError) {
        if (
          thrownError instanceof Error &&
          typeof (thrownError as any)._tag === "string"
        ) {
          return {
            ok: false,
            error: thrownError as Error & { _tag: string },
          };
        }
        throw thrownError;
      }

      if (result instanceof Response) {
        return { ok: true, response: result };
      }

      if (result && typeof result === "object" && "_tag" in result) {
        const resultWithTag = result as {
          _tag: string;
          error?: unknown;
          value?: unknown;
        };
        if (resultWithTag._tag === "Err") {
          return {
            ok: false,
            error: resultWithTag.error as Error & { _tag: string },
          };
        }

        if (resultWithTag._tag === "Ok") {
          const value = resultWithTag.value as MiddlewareResultSuccess<any>;
          if (value && value.marker === middlewareMarker) {
            currentCtx = { ...currentCtx, ...value.ctx } as ProcedureContext;
          }
          return { ok: true, ctx: currentCtx };
        }
      }

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

      currentCtx = result as ProcedureContext;
      return { ok: true, ctx: currentCtx };
    };

    const middlewareResult = await runMiddleware();
    if (!middlewareResult.ok) {
      const error = middlewareResult.error;
      const statusCode = findHttpStatusForError(
        error._tag,
        procedure.config.errors,
      );
      return jsonResponse(serializeError(error), statusCode);
    }

    if ("response" in middlewareResult) {
      setSpanOk(currentCtx.span);
      return middlewareResult.response;
    }

    currentCtx = middlewareResult.ctx;
    const result = await procedure.handler(currentCtx);

    if (isErr(result)) {
      const error = result.error;
      const statusCode = findHttpStatusForError(
        error._tag,
        procedure.config.errors,
      );
      return jsonResponse(serializeError(error), statusCode);
    }

    const response = result.value;
    if (response instanceof Response) {
      setSpanOk(currentCtx.span);
      return response;
    }

    if (procedure.config.output) {
      const validated = await procedure.config.output.parseAsync(response);
      setSpanOk(currentCtx.span);
      return jsonResponse(validated);
    }

    setSpanOk(currentCtx.span);
    return jsonResponse(response);
  } catch (error) {
    if (error instanceof Error && error.name === "ValidationError") {
      const validationError = error as Error & { details?: unknown };
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
        const [_schema, instance] =
          options.defaultErrorHandlers.default400Error(errors);
        return jsonResponse({ error: instance }, 400);
      }

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

    if (options?.defaultErrorHandlers) {
      const [_schema, instance] =
        options.defaultErrorHandlers.default500Error(error);
      return jsonResponse({ error: instance }, 500);
    }

    return jsonResponse(
      {
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Internal server error",
          details: error instanceof Error && error.stack ? [error.stack] : [],
        },
      },
      500,
    );
  }
}

export function createRouteHandlers<
  TContext extends TanStackBaseContext<any, any> = TanStackBaseContext,
  TParams extends TanStackRouteParams = TContext extends TanStackBaseContext<
    infer TInferredParams,
    any
  >
    ? TInferredParams
    : TanStackRouteParams,
  TRouteContext = TContext extends TanStackBaseContext<any, infer TInferredRouteContext>
    ? TInferredRouteContext
    : unknown,
>(
  routerOrConfig: RouterOrConfig<TContext>,
  options?: CreateTanStackRouteHandlersOptions<TContext, TParams, TRouteContext>,
): TanStackServerRoute<TParams, TRouteContext> {
  const handlers: Partial<
    Record<TanStackHttpMethod, TanStackServerRouteHandler<TParams, TRouteContext>>
  > = {};

  for (const procedure of collectProcedures(routerOrConfig)) {
    const method = procedure.method.toUpperCase() as TanStackHttpMethod;
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method)) {
      continue;
    }
    if (handlers[method]) {
      throw new Error(
        `Duplicate ${method} handler while creating TanStack server route handlers`,
      );
    }

    handlers[method] = (args) =>
      executeProcedure(
        procedure as AnyProcedure<TContext>,
        args,
        options,
      );
  }

  return { handlers };
}

export function createRequestHandler<
  TContext extends TanStackBaseContext<any, any> = TanStackBaseContext,
  TParams extends TanStackRouteParams = TContext extends TanStackBaseContext<
    infer TInferredParams,
    any
  >
    ? TInferredParams
    : TanStackRouteParams,
  TRouteContext = TContext extends TanStackBaseContext<any, infer TInferredRouteContext>
    ? TInferredRouteContext
    : unknown,
>(
  routerOrConfig: RouterOrConfig<TContext>,
  options?: CreateTanStackRouteHandlersOptions<TContext, TParams, TRouteContext>,
): TanStackServerRouteHandler<TParams, TRouteContext> {
  const serverRoute = createRouteHandlers(routerOrConfig, options);
  const allowedMethods = Object.keys(serverRoute.handlers) as TanStackHttpMethod[];

  return (args) => {
    const method = args.request.method.toUpperCase() as TanStackHttpMethod;
    const handler = serverRoute.handlers[method];
    if (!handler) {
      return methodNotAllowedResponse(allowedMethods);
    }
    return handler(args);
  };
}

export function createServerRoute<
  TPath extends string,
  const TMethods extends TanStackRouteMethods,
  TContext extends TanStackBaseContext<any, any> = TanStackBaseContext<
    Record<ExtractTanStackPathParams<TPath>, string | undefined>,
    unknown
  >,
  TParams extends TanStackRouteParams = TContext extends TanStackBaseContext<
    infer TInferredParams,
    any
  >
    ? TInferredParams
    : Record<ExtractTanStackPathParams<TPath>, string | undefined>,
  TRouteContext = TContext extends TanStackBaseContext<any, infer TInferredRouteContext>
    ? TInferredRouteContext
    : unknown,
>(
  path: TPath,
  methods: TMethods & ValidateMethodsForTanStackPath<TPath, TMethods>,
  options?: CreateTanStackRouteHandlersOptions<TContext, TParams, TRouteContext>,
): TanStackServerRoute<TParams, TRouteContext> {
  const router = createRouterFromMethods<TPath, TMethods, TContext>(path, methods);
  return createRouteHandlers<TContext, TParams, TRouteContext>(router, options);
}

export function defineServerRoute<
  TPath extends string,
  const TMethods extends TanStackRouteMethods,
  TContext extends TanStackBaseContext<any, any> = TanStackBaseContext<
    Record<ExtractTanStackPathParams<TPath>, string | undefined>,
    unknown
  >,
  TParams extends TanStackRouteParams = TContext extends TanStackBaseContext<
    infer TInferredParams,
    any
  >
    ? TInferredParams
    : Record<ExtractTanStackPathParams<TPath>, string | undefined>,
  TRouteContext = TContext extends TanStackBaseContext<any, infer TInferredRouteContext>
    ? TInferredRouteContext
    : unknown,
>(
  path: TPath,
  methods: TMethods & ValidateMethodsForTanStackPath<TPath, TMethods>,
  options?: CreateTanStackRouteHandlersOptions<TContext, TParams, TRouteContext>,
): DefinedTanStackServerRoute<TPath, TParams, TRouteContext, TContext> {
  const router = createRouterFromMethods<TPath, TMethods, TContext>(path, methods);

  return {
    path,
    server: createRouteHandlers<TContext, TParams, TRouteContext>(router, options),
    router,
  };
}

export function createAltStackFileRoute<
  TFilePath extends keyof FileRoutesByPath & string,
>(
  path: TFilePath,
): <
  const TMethods extends TanStackRouteMethods,
  TContext extends TanStackBaseContext<any, any> = TanStackBaseContext<
    Record<ExtractTanStackPathParams<TFilePath>, string | undefined>,
    unknown
  >,
  TParams extends TanStackRouteParams = TContext extends TanStackBaseContext<
    infer TInferredParams,
    any
  >
    ? TInferredParams
    : Record<ExtractTanStackPathParams<TFilePath>, string | undefined>,
  TRouteContext = TContext extends TanStackBaseContext<any, infer TInferredRouteContext>
    ? TInferredRouteContext
    : unknown,
>(
  options: AltStackFileRouteOptions<
    TFilePath,
    TMethods,
    TContext,
    TParams,
    TRouteContext
  >,
) => AltStackFileRoute<
  ReturnType<ReturnType<typeof createFileRoute<TFilePath>>>,
  TFilePath,
  TParams,
  TRouteContext,
  TContext
> {
  return <
    const TMethods extends TanStackRouteMethods,
    TContext extends TanStackBaseContext<any, any> = TanStackBaseContext<
      Record<ExtractTanStackPathParams<TFilePath>, string | undefined>,
      unknown
    >,
    TParams extends TanStackRouteParams = TContext extends TanStackBaseContext<
      infer TInferredParams,
      any
    >
      ? TInferredParams
      : Record<ExtractTanStackPathParams<TFilePath>, string | undefined>,
    TRouteContext = TContext extends TanStackBaseContext<
      any,
      infer TInferredRouteContext
    >
      ? TInferredRouteContext
      : unknown,
  >(
    options: AltStackFileRouteOptions<
      TFilePath,
      TMethods,
      TContext,
      TParams,
      TRouteContext
    >,
  ) => {
    const {
      server: {
        handlers,
        createContext,
        defaultErrorHandlers,
        ...serverOptions
      },
      ...routeOptions
    } = options;
    const route = defineServerRoute<
      TFilePath,
      TMethods,
      TContext,
      TParams,
      TRouteContext
    >(
      path,
      handlers,
      {
        ...(createContext && { createContext }),
        ...(defaultErrorHandlers && { defaultErrorHandlers }),
      },
    );
    const tanStackRoute = (createFileRoute(path) as any)({
      ...routeOptions,
      server: {
        ...serverOptions,
        handlers: route.server.handlers,
      },
    });

    return Object.assign(tanStackRoute, { altStack: route });
  };
}

type OpenAPISpecRouteSource =
  | DefinedTanStackServerRoute<string, any, any, any>
  | AltStackFileRouteMetadata<string, any, any, any>;

function getOpenAPIRouter(route: OpenAPISpecRouteSource): BaseRouter<any> {
  if ("router" in route) {
    return route.router;
  }
  return route.altStack.router;
}

export function generateOpenAPISpecFromServerRoutes<
  const TRoutes extends readonly OpenAPISpecRouteSource[],
>(
  routes: TRoutes,
  options?: GenerateOpenAPISpecOptions,
): OpenAPISpec {
  return generateOpenAPISpec(
    {
      "/": routes.map((route) => getOpenAPIRouter(route)),
    },
    options,
  );
}

export class Router<
  TCustomContext extends TanStackBaseContext = TanStackBaseContext,
> extends BaseRouter<TCustomContext> {}

export function router<
  TCustomContext extends TanStackBaseContext = TanStackBaseContext,
>(
  config: Parameters<typeof baseRouter<TCustomContext>>[0],
): Router<TCustomContext> {
  return baseRouter<TCustomContext>(config) as Router<TCustomContext>;
}

export function createRouter<
  TCustomContext extends TanStackBaseContext = TanStackBaseContext,
>(
  config?: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
): Router<TCustomContext> {
  return baseCreateRouter<TCustomContext>(config) as Router<TCustomContext>;
}

export function mergeRouters<
  TCustomContext extends TanStackBaseContext = TanStackBaseContext,
>(...routers: Router<TCustomContext>[]): Router<TCustomContext> {
  return baseMergeRouters<TCustomContext>(...routers) as Router<TCustomContext>;
}

export type { RouterConfigValue };
