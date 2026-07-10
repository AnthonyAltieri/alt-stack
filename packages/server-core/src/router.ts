import type { z } from "zod";
import type {
  InputConfig,
  ExtractPathParams,
  Procedure,
  ReadyProcedure,
  PendingProcedure,
  TypedContext,
} from "./types/index.js";
import { BaseProcedureBuilder } from "./procedure-builder.js";

function normalizePrefix(prefix: string): string {
  // Remove trailing slash if present, ensure leading slash
  const normalized = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

function normalizePath(path: string): string {
  // Ensure path starts with /
  return path.startsWith("/") ? path : `/${path}`;
}

/**
 * Minimal structural shape of an alt-stack stream endpoint, as produced by
 * `stream(...)` in `@alt-stack/durable-streams-server`. The router detects
 * these by the `_tag` discriminant — no runtime dependency on the durable-
 * streams package is required.
 */
export interface StreamEndpointLike {
  readonly _tag: "StreamEndpoint";
  handle(req: unknown): Promise<unknown>;
}

export interface MountedStreamEndpoint {
  readonly path: string;
  readonly endpoint: StreamEndpointLike;
}

function isStreamEndpoint(value: unknown): value is StreamEndpointLike {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { _tag?: unknown })._tag === "StreamEndpoint" &&
    typeof (value as { handle?: unknown }).handle === "function"
  );
}

export class Router<TCustomContext extends object = Record<string, never>> {
  private procedures: Procedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<number, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] = [];

  private streamEndpoints: MountedStreamEndpoint[] = [];

  constructor(
    config?: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
  ) {
    if (config) {
      for (const [key, value] of Object.entries(config)) {
        const prefix = normalizePrefix(key);
        const routers = Array.isArray(value) ? value : [value];
        for (const router of routers) {
          this.merge(prefix, router);
        }
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

  registerStreamEndpoint(path: string, endpoint: StreamEndpointLike): this {
    this.streamEndpoints.push({ path: normalizePath(path), endpoint });
    return this;
  }

  merge(prefix: string, router: Router<TCustomContext>): this {
    const normalizedPrefix = normalizePrefix(prefix);
    const mergedProcedures = router.procedures.map((proc) => ({
      ...proc,
      path: `${normalizedPrefix}${proc.path}`,
    }));
    this.procedures.push(...mergedProcedures);
    const mergedStreams = router.streamEndpoints.map((s) => ({
      ...s,
      path: `${normalizedPrefix}${s.path}`,
    }));
    this.streamEndpoints.push(...mergedStreams);
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

  /** Returns stream endpoints registered on this router. Adapters consume this. */
  getStreamEndpoints(): readonly MountedStreamEndpoint[] {
    return this.streamEndpoints;
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
  | Router<TCustomContext>
  | StreamEndpointLike;

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
      : T[K] extends StreamEndpointLike
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
    } else if (isStreamEndpoint(value)) {
      routerInstance.registerStreamEndpoint(key, value);
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
): Router<TCustomContext> {
  return buildRouter<TCustomContext>(config);
}

export function createRouter<
  TCustomContext extends object = Record<string, never>,
>(
  config?: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
): Router<TCustomContext> {
  return new Router<TCustomContext>(config);
}

export function mergeRouters<
  TCustomContext extends object = Record<string, never>,
>(...routers: Router<TCustomContext>[]): Router<TCustomContext> {
  const mergedRouter = new Router<TCustomContext>();
  for (const router of routers) {
    const routerProcedures = router.getProcedures();
    for (const procedure of routerProcedures) {
      mergedRouter.register(procedure);
    }
  }
  return mergedRouter;
}
