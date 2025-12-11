import type { z } from "zod";
import type {
  InputConfig,
  Procedure,
  ReadyProcedure,
  PendingProcedure,
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

export class Router<TCustomContext extends object = Record<string, never>> {
  private procedures: Procedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<number, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] = [];

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
  registerProcedure<TPath extends string, TInput extends InputConfig>(
    path: TPath,
    readyProcedure: ReadyProcedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<number, z.ZodTypeAny> | undefined,
      TCustomContext
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
          ctx,
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
  registerPendingProcedure<TPath extends string, TInput extends InputConfig>(
    path: TPath,
    method: string,
    pendingProcedure: PendingProcedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<number, z.ZodTypeAny> | undefined,
      TCustomContext
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
          ctx,
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

  register(
    procedure: Procedure<
      InputConfig,
      z.ZodTypeAny | undefined,
      Record<number, z.ZodTypeAny> | undefined,
      TCustomContext
    >,
  ): this {
    this.procedures.push(procedure);
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

// Type helper for methods object - validates each method's PendingProcedure matches path requirements
// Use a more flexible type that accepts any PendingProcedure subtype
// Accept procedures with narrowed context types (e.g., AuthenticatedContext extends AppContext)
type RouteMethods<
  TPath extends string,
  TCustomContext extends object,
> = {
  [K in MethodKey]?: PendingProcedure<
    any,
    any,
    any,
    any // Accept any context type - will be validated at runtime
  >;
};

// Type helper to extract ReadyProcedure from a router config value
// Use more flexible types that accept any Procedure subtype
// Accept procedures with narrowed context types (e.g., AuthenticatedContext extends AppContext)
export type RouterConfigValue<
  TCustomContext extends object,
  TPath extends string,
> =
  | ReadyProcedure<
      any,
      any,
      any,
      any // Accept any context type - will be validated at runtime
    >
  | RouteMethods<TPath, TCustomContext>
  | Router<TCustomContext>;

// New tRPC-style router function
export function router<
  TCustomContext extends object = Record<string, never>,
  TConfig extends {
    [K in string]: RouterConfigValue<TCustomContext, K>;
  } = {
    [K in string]: RouterConfigValue<TCustomContext, K>;
  },
>(
  config: TConfig,
): Router<TCustomContext> {
  const routerInstance = new Router<TCustomContext>();

  // Helper to check if a value is a methods object
  const isMethodsObject = (
    value: unknown,
  ): value is Record<string, any> => {
    if (typeof value !== "object" || value === null || value instanceof Router) {
      return false;
    }
    // Check if it has method-like keys (get, post, put, patch, delete)
    const keys = Object.keys(value);
    const methodKeys: MethodKey[] = ["get", "post", "put", "patch", "delete"];
    return keys.some((k) => methodKeys.includes(k as MethodKey));
  };

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

