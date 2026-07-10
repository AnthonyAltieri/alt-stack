import type { z } from "zod";
import type {
  InputConfig,
  ExtractPathParams,
  Procedure,
  ReadyProcedure,
  PendingProcedure,
  TypedContext,
} from "./types/index.js";
import type { HttpMethod } from "./types/procedure.js";
import { BaseProcedureBuilder } from "./procedure-builder.js";

function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === "/") {
    end -= 1;
  }
  return value.slice(0, end);
}

function normalizePrefix(prefix: string): string {
  // Remove trailing slashes, ensure leading slash
  const normalized = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return trimTrailingSlashes(normalized);
}

function normalizePath(path: string): string {
  // Ensure path starts with /
  return path.startsWith("/") ? path : `/${path}`;
}

function canonicalizePath(path: string): string {
  const normalizedPath = normalizePath(path);
  const withoutTrailingSlash =
    normalizedPath === "/" ? normalizedPath : trimTrailingSlashes(normalizedPath);
  return withoutTrailingSlash.replace(/\{[^}]+\}/g, "{param}");
}

function getRouteSignature(method: string, path: string): string {
  return `${method.toUpperCase()} ${canonicalizePath(path)}`;
}

export class Router<
  TCustomContext extends object = Record<string, never>,
  TRouteSignatures extends string = string,
> {
  /** Type-only metadata used to detect conflicts when combining declarative routers. */
  declare readonly _routeSignatures: TRouteSignatures;

  private procedures: Procedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<number, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] = [];

  constructor(
    config?: Record<string, Router<TCustomContext>>,
  ) {
    if (config) {
      for (const [key, value] of Object.entries(config)) {
        const prefix = normalizePrefix(key);
        this.merge(prefix, value);
      }
    }
  }

  // Helper method to register a ReadyProcedure with a path
  registerProcedure<
    TPath extends string,
    TInput extends InputConfig,
    TProcedureContext extends TCustomContext,
  >(
    path: TPath,
    readyProcedure: ReadyProcedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<number, z.ZodTypeAny> | undefined,
      TProcedureContext
    >,
  ): this {
    // Keep paths in OpenAPI format ({param}) - adapters will convert as needed
    const normalizedPath = normalizePath(path);
    const procedure: Procedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<number, z.ZodTypeAny> | undefined,
      TCustomContext
    > = {
      method: readyProcedure.method,
      path: normalizedPath,
      config: readyProcedure.config,
      handler: (ctx) => {
        // Convert from TypedContext to tRPC-style opts
        return readyProcedure.handler({
          input: ctx.input,
          ctx: ctx as TypedContext<
            TInput,
            Record<number, z.ZodTypeAny> | undefined,
            TProcedureContext
          >,
        });
      },
      middleware: readyProcedure.middleware,
    };
    this.procedures.push(
      procedure as unknown as Procedure<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<number, z.ZodTypeAny> | undefined,
        TCustomContext
      >,
    );
    return this;
  }

  // Helper method to register a PendingProcedure with a path and inferred HTTP method
  registerPendingProcedure<
    TPath extends string,
    TInput extends InputConfig,
    TProcedureContext extends TCustomContext,
  >(
    path: TPath,
    method: string,
    pendingProcedure: PendingProcedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<number, z.ZodTypeAny> | undefined,
      TProcedureContext
    >,
  ): this {
    // Keep paths in OpenAPI format ({param}) - adapters will convert as needed
    const normalizedPath = normalizePath(path);
    const procedure: Procedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<number, z.ZodTypeAny> | undefined,
      TCustomContext
    > = {
      method: method.toUpperCase(),
      path: normalizedPath,
      config: pendingProcedure.config,
      handler: (ctx) => {
        // Convert from TypedContext to tRPC-style opts
        return pendingProcedure.handler({
          input: ctx.input,
          ctx: ctx as TypedContext<
            TInput,
            Record<number, z.ZodTypeAny> | undefined,
            TProcedureContext
          >,
        });
      },
      middleware: pendingProcedure.middleware,
    };
    this.procedures.push(
      procedure as unknown as Procedure<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<number, z.ZodTypeAny> | undefined,
        TCustomContext
      >,
    );
    return this;
  }

  register<TProcedureContext extends TCustomContext>(
    procedure: Procedure<
      InputConfig,
      z.ZodTypeAny | undefined,
      Record<number, z.ZodTypeAny> | undefined,
      TProcedureContext
    >,
  ): this {
    this.procedures.push(
      procedure as Procedure<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<number, z.ZodTypeAny> | undefined,
        TCustomContext
      >,
    );
    return this;
  }

  merge(prefix: string, router: Router<TCustomContext>): this {
    const normalizedPrefix = normalizePrefix(prefix);
    const mergedProcedures = router.procedures.map((proc) => ({
      ...proc,
      path: `${normalizedPrefix}${proc.path}`,
    }));
    this.procedures.push(...mergedProcedures);
    return this;
  }

  getProcedures(): Procedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<number, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] {
    return this.procedures;
  }

  get procedure(): BaseProcedureBuilder<
    { params?: never; query?: never; body?: never },
    undefined,
    undefined,
    TCustomContext,
    this
  > {
    return new BaseProcedureBuilder<
      { params?: never; query?: never; body?: never },
      undefined,
      undefined,
      TCustomContext,
      this
    >(undefined, undefined, this);
  }
}

// Type helper for methods object keys - maps lowercase method names to HTTP methods
type MethodKey = "get" | "post" | "put" | "patch" | "delete";

export type RouteSignature = `${HttpMethod} ${string}`;

type EnsureLeadingSlash<TPath extends string> = TPath extends `/${string}`
  ? TPath
  : `/${TPath}`;

type TrimTrailingSlashes<TPath extends string> = TPath extends "/"
  ? TPath
  : TPath extends `${infer TWithoutSlash}/`
    ? TrimTrailingSlashes<TWithoutSlash>
    : TPath;

type CanonicalizePathParams<TPath extends string> =
  TPath extends `${infer TBefore}{${string}}${infer TRest}`
    ? `${TBefore}{param}${CanonicalizePathParams<TRest>}`
    : TPath;

type CanonicalPath<TPath extends string> = string extends TPath
  ? string
  : CanonicalizePathParams<TrimTrailingSlashes<EnsureLeadingSlash<TPath>>>;

type JoinPaths<TPrefix extends string, TPath extends string> =
  CanonicalPath<TPrefix> extends infer TCanonicalPrefix extends string
    ? CanonicalPath<TPath> extends infer TCanonicalPath extends string
      ? string extends TCanonicalPrefix | TCanonicalPath
        ? string
        : TCanonicalPrefix extends "/"
          ? TCanonicalPath
          : TCanonicalPath extends "/"
            ? TCanonicalPrefix
            : `${TCanonicalPrefix}${TCanonicalPath}`
      : never
    : never;

type PrefixRouteSignatures<
  TRouteSignatures extends string,
  TPrefix extends string,
> = string extends TRouteSignatures
  ? string
  : TRouteSignatures extends `${infer TMethod extends HttpMethod} ${infer TPath}`
    ? `${TMethod} ${JoinPaths<TPrefix, TPath>}`
    : never;

type RouteSignaturesForConfigValue<TPath extends string, TValue> =
  TValue extends Router<any, infer TNestedRouteSignatures>
    ? PrefixRouteSignatures<TNestedRouteSignatures, TPath>
    : TValue extends ReadyProcedure<any, any, any, any, infer TMethod>
      ? `${TMethod} ${CanonicalPath<TPath>}`
      : TValue extends RouteMethods
        ? {
            [TMethod in keyof TValue & MethodKey]: `${Uppercase<TMethod> & HttpMethod} ${CanonicalPath<TPath>}`;
          }[keyof TValue & MethodKey]
        : never;

export type RouteSignaturesForConfig<
  TConfig extends Record<string, unknown>,
> = string extends keyof TConfig
  ? string
  : {
      [TPath in keyof TConfig & string]: RouteSignaturesForConfigValue<
        TPath,
        TConfig[TPath]
      >;
    }[keyof TConfig & string];

export type AnyRouter = Router<any, any>;

export type RouterContext<TRouter extends AnyRouter> =
  TRouter extends Router<infer TCustomContext, any>
    ? TCustomContext
    : never;

export type RouterRouteSignatures<TRouter extends AnyRouter> =
  TRouter extends Router<any, infer TRouteSignatures>
    ? TRouteSignatures
    : never;

type OverlappingRouteSignatures<
  TLeft extends string,
  TRight extends string,
> = Extract<TLeft, TRight> | Extract<TRight, TLeft>;

type ConflictingRouteSignatures<
  TRouters extends readonly AnyRouter[],
  TSeenRouteSignatures extends string = never,
> = TRouters extends readonly [
  infer THead extends AnyRouter,
  ...infer TTail extends readonly AnyRouter[],
]
  ?
      | OverlappingRouteSignatures<
          RouterRouteSignatures<THead>,
          TSeenRouteSignatures
        >
      | ConflictingRouteSignatures<
          TTail,
          TSeenRouteSignatures | RouterRouteSignatures<THead>
        >
  : never;

type UntrackedRouterError = {
  readonly "combineRouters requires routers created by router()": never;
};

type RouteConflictError<TRouteSignatures extends string> = {
  readonly "Conflicting route signatures": TRouteSignatures;
};

type IncompatibleRouterContexts<
  TFirstContext extends object,
  TRouters extends readonly AnyRouter[],
> = TRouters extends readonly [
  infer THead extends AnyRouter,
  ...infer TTail extends readonly AnyRouter[],
]
  ? TFirstContext extends RouterContext<THead>
    ? IncompatibleRouterContexts<TFirstContext, TTail>
    : RouterContext<THead> | IncompatibleRouterContexts<TFirstContext, TTail>
  : never;

type RouterContextMismatchError<TIncompatibleContexts extends object> = {
  readonly "Router context mismatch": TIncompatibleContexts;
};

export type ValidateRouterCombination<
  TRouters extends readonly [AnyRouter, ...AnyRouter[]],
> = [IncompatibleRouterContexts<RouterContext<TRouters[0]>, TRouters>] extends [never]
  ? string extends RouterRouteSignatures<TRouters[number]>
    ? UntrackedRouterError
    : [ConflictingRouteSignatures<TRouters>] extends [never]
      ? unknown
      : RouteConflictError<ConflictingRouteSignatures<TRouters>>
  : RouterContextMismatchError<
      IncompatibleRouterContexts<RouterContext<TRouters[0]>, TRouters>
    >;

/**
 * Helper function to define a route with compile-time validation.
 * Use this to get call-site errors when params schema is missing.
 *
 * @example
 * ```typescript
 * // ✅ Valid - has params schema
 * const userRoute = route<"/users/{id}", AppContext>(
 *   "/users/{id}",
 *   {
 *     get: procedure
 *       .input({ params: z.object({ id: z.string() }) })
 *       .output(z.object({ id: z.string() }))
 *       .handler(({ input }) => ok({ id: input.params.id })),
 *   }
 * );
 *
 * // ❌ Error - missing params schema for {id}
 * const badRoute = route<"/users/{id}", AppContext>(
 *   "/users/{id}",
 *   {
 *     get: procedure  // Error: Type 'PendingProcedure<...>' is not assignable
 *       .output(z.object({ id: z.string() }))
 *       .handler(() => ok({ id: "test" })),
 *   }
 * );
 * ```
 */
export function route<
  TPath extends string,
  TCustomContext extends object = Record<string, never>,
  const TMethods extends RouteMethods = RouteMethods,
>(
  path: TPath,
  methods: TMethods & ValidateMethodsForPath<TPath, TMethods, TCustomContext>,
): {
  path: TPath;
  methods: TMethods & ValidateMethodsForPath<TPath, TMethods, TCustomContext>;
} {
  return { path, methods };
}

/**
 * Create a router from route definitions created with route().
 *
 * @example
 * ```typescript
 * const appRouter = routerFromRoutes<AppContext>(
 *   route("/users/{id}", { get: ... }),
 *   route("/users", { get: ..., post: ... }),
 * );
 * ```
 */
export function routerFromRoutes<TCustomContext extends object = Record<string, never>>(
  ...routes: { path: string; methods: RouteMethods }[]
): Router<TCustomContext> {
  const config: Record<string, RouteMethods> = {};
  for (const { path, methods } of routes) {
    config[path] = methods;
  }
  return buildRouter<TCustomContext>(config);
}

/**
 * Type helper for methods object structure (no validation here, just shape).
 */
export type RouteMethods = {
  [K in MethodKey]?: PendingProcedure<any, any, any, any>;
};

/**
 * Type helper to extract valid router config values (structure only, no validation).
 */
export type RouterConfigValue<TCustomContext extends object> =
  | ReadyProcedure<any, any, any, any>
  | RouteMethods
  | Router<TCustomContext>;

/**
 * Validates each key-value pair in a router config object.
 * For each key K (path), validates that procedures have required params.
 *
 * Key insight: We must use `infer TInput` to extract the actual input type
 * from the procedure, then check if TInput has params. Direct structural
 * checks like `extends { config: { input: { params: object } } }` don't work
 * because they check the outer structure rather than the inferred generic.
 *
 * Note: This validation works at the type level. Due to TypeScript limitations
 * with generic inference, call-site errors may not appear. Use type-level
 * assertions (as shown in router.spec.ts) to verify validation behavior.
 */
export type ValidateRouterConfig<T, TCustomContext extends object> = {
  [K in keyof T]: K extends string
    ? T[K] extends Router<TCustomContext>
      ? T[K]
      : T[K] extends ReadyProcedure<infer TInput, any, any, infer TProcedureContext>
        ? TProcedureContext extends TCustomContext
          ? ExtractPathParams<K> extends never
            ? T[K]  // No path params needed
            : TInput extends { params: z.ZodTypeAny }
              ? T[K]  // Has required params
              : never  // Missing params - type error
          : never
        : T[K] extends RouteMethods
          ? ValidateMethodsForPath<K, T[K], TCustomContext>
          : T[K]
    : T[K];
};

/**
 * Validates each method in a RouteMethods object against path requirements.
 */
type ValidateMethodsForPath<
  TPath extends string,
  T extends RouteMethods,
  TCustomContext extends object,
> = {
  [M in keyof T]: T[M] extends PendingProcedure<infer TInput, any, any, infer TProcedureContext>
    ? TProcedureContext extends TCustomContext
      ? ExtractPathParams<TPath> extends never
        ? T[M]  // No path params needed
        : TInput extends { params: z.ZodTypeAny }
          ? T[M]  // Has required params
          : never  // Missing params - type error
      : never
    : T[M];
};

// Helper to check if a value is a methods object
function isMethodsObject(value: unknown): value is Record<string, any> {
  if (typeof value !== "object" || value === null || value instanceof Router) {
    return false;
  }
  // Check if it has method-like keys (get, post, put, patch, delete)
  const keys = Object.keys(value);
  const methodKeys: MethodKey[] = ["get", "post", "put", "patch", "delete"];
  return keys.some((k) => methodKeys.includes(k as MethodKey));
}

/**
 * Internal function that builds a router from config without type validation.
 * Used by both router() and init().router to avoid duplicating logic.
 * @internal
 */
export function buildRouter<TCustomContext extends object>(
  config: Record<string, unknown>,
): Router<TCustomContext> {
  const routerInstance = new Router<TCustomContext>();

  for (const [key, value] of Object.entries(config)) {
    if (value instanceof Router) {
      // Nested router - merge it
      routerInstance.merge(normalizePrefix(key), value);
    } else if (isMethodsObject(value)) {
      // Methods object - register each method with inferred HTTP method
      for (const [methodKey, pendingProcedure] of Object.entries(value)) {
        if (pendingProcedure && typeof pendingProcedure === "object" && "handler" in pendingProcedure && "config" in pendingProcedure) {
          routerInstance.registerPendingProcedure(
            key as string,
            methodKey,
            pendingProcedure as PendingProcedure<
              InputConfig,
              z.ZodTypeAny | undefined,
              Record<number, z.ZodTypeAny> | undefined,
              TCustomContext
            >,
          );
        }
      }
    } else {
      // ReadyProcedure - register it with the path key
      routerInstance.registerProcedure(
        key as string,
        value as ReadyProcedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<number, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      );
    }
  }

  return routerInstance;
}

// New tRPC-style router function
export function router<
  TCustomContext extends object = Record<string, never>,
  const TConfig extends Record<string, unknown> = Record<string, unknown>,
>(
  config: TConfig & ValidateRouterConfig<TConfig, TCustomContext>,
): Router<TCustomContext, RouteSignaturesForConfig<TConfig>> {
  return buildRouter<TCustomContext>(config) as Router<
    TCustomContext,
    RouteSignaturesForConfig<TConfig>
  >;
}

export function createRouter<
  TCustomContext extends object = Record<string, never>,
>(
  config?: Record<string, Router<TCustomContext>>,
): Router<TCustomContext> {
  return new Router<TCustomContext>(config);
}

export function combineRouters<
  const TRouters extends readonly [
    AnyRouter,
    ...AnyRouter[],
  ],
>(
  ...routers: TRouters & ValidateRouterCombination<TRouters>
): Router<
  RouterContext<TRouters[0]>,
  RouterRouteSignatures<TRouters[number]>
> {
  if (routers.length === 0) {
    throw new Error("combineRouters requires at least one router");
  }

  const mergedRouter = new Router<RouterContext<TRouters[0]>>();
  const seenRouteSignatures = new Set<string>();

  for (const router of routers) {
    const routerProcedures = router.getProcedures();
    for (const procedure of routerProcedures) {
      const routeSignature = getRouteSignature(procedure.method, procedure.path);
      if (seenRouteSignatures.has(routeSignature)) {
        throw new Error(`Route conflict: ${routeSignature}`);
      }

      seenRouteSignatures.add(routeSignature);
      mergedRouter.register(procedure);
    }
  }

  return mergedRouter as Router<
    RouterContext<TRouters[0]>,
    RouterRouteSignatures<TRouters[number]>
  >;
}
