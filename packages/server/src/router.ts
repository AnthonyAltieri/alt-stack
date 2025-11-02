import type { z } from "zod";
import type {
  ProcedureConfig,
  BaseContext,
  Middleware,
  InputConfig,
} from "./types.js";
import {
  ProcedureBuilder,
  BaseProcedureBuilder,
  type Procedure,
} from "./procedure.js";

function convertPathToHono(path: string): string {
  return path.replace(/\{([^}]+)\}/g, ":$1");
}

function normalizePrefix(prefix: string): string {
  // Remove trailing slash if present, ensure leading slash
  const normalized = prefix.startsWith("/") ? prefix : `/${prefix}`;
  return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

export class Router<
  TCustomContext extends Record<string, unknown> = Record<string, never>,
> {
  private procedures: Procedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<number, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] = [];
  private middleware: Middleware<BaseContext, BaseContext>[] = [];

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

  use<TContextIn extends BaseContext, TContextOut extends BaseContext>(
    middleware: Middleware<TContextIn, TContextOut>,
  ): this {
    this.middleware.push(
      middleware as unknown as Middleware<BaseContext, BaseContext>,
    );
    return this;
  }

  get<
    TPath extends string,
    TInput extends InputConfig,
    TOutput extends z.ZodTypeAny | undefined,
    TErrors extends Record<number, z.ZodTypeAny> | undefined,
  >(
    path: TPath,
    config: ProcedureConfig<TPath, TInput, TOutput, TErrors>,
  ): ProcedureBuilder<TInput, TOutput, TErrors, TCustomContext, this> {
    return new ProcedureBuilder<TInput, TOutput, TErrors, TCustomContext, this>(
      "GET",
      convertPathToHono(path),
      config,
      this,
    );
  }

  post<
    TPath extends string,
    TInput extends InputConfig,
    TOutput extends z.ZodTypeAny | undefined,
    TErrors extends Record<number, z.ZodTypeAny> | undefined,
  >(
    path: TPath,
    config: ProcedureConfig<TPath, TInput, TOutput, TErrors>,
  ): ProcedureBuilder<TInput, TOutput, TErrors, TCustomContext, this> {
    return new ProcedureBuilder<TInput, TOutput, TErrors, TCustomContext, this>(
      "POST",
      convertPathToHono(path),
      config,
      this,
    );
  }

  put<
    TPath extends string,
    TInput extends InputConfig,
    TOutput extends z.ZodTypeAny | undefined,
    TErrors extends Record<number, z.ZodTypeAny> | undefined,
  >(
    path: TPath,
    config: ProcedureConfig<TPath, TInput, TOutput, TErrors>,
  ): ProcedureBuilder<TInput, TOutput, TErrors, TCustomContext, this> {
    return new ProcedureBuilder<TInput, TOutput, TErrors, TCustomContext, this>(
      "PUT",
      convertPathToHono(path),
      config,
      this,
    );
  }

  patch<
    TPath extends string,
    TInput extends InputConfig,
    TOutput extends z.ZodTypeAny | undefined,
    TErrors extends Record<number, z.ZodTypeAny> | undefined,
  >(
    path: TPath,
    config: ProcedureConfig<TPath, TInput, TOutput, TErrors>,
  ): ProcedureBuilder<TInput, TOutput, TErrors, TCustomContext, this> {
    return new ProcedureBuilder<TInput, TOutput, TErrors, TCustomContext, this>(
      "PATCH",
      convertPathToHono(path),
      config,
      this,
    );
  }

  delete<
    TPath extends string,
    TInput extends InputConfig,
    TOutput extends z.ZodTypeAny | undefined,
    TErrors extends Record<number, z.ZodTypeAny> | undefined,
  >(
    path: TPath,
    config: ProcedureConfig<TPath, TInput, TOutput, TErrors>,
  ): ProcedureBuilder<TInput, TOutput, TErrors, TCustomContext, this> {
    return new ProcedureBuilder<TInput, TOutput, TErrors, TCustomContext, this>(
      "DELETE",
      convertPathToHono(path),
      config,
      this,
    );
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
    this.middleware.push(...router.middleware);
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

  getMiddleware(): Middleware<BaseContext, BaseContext>[] {
    return this.middleware;
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

export function createRouter<
  TCustomContext extends Record<string, unknown> = Record<string, never>,
>(
  config?: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
): Router<TCustomContext> {
  return new Router<TCustomContext>(config);
}

export function mergeRouters<
  TCustomContext extends Record<string, unknown> = Record<string, never>,
>(...routers: Router<TCustomContext>[]): Router<TCustomContext> {
  const mergedRouter = new Router<TCustomContext>();
  for (const router of routers) {
    const routerProcedures = router.getProcedures();
    const routerMiddleware = router.getMiddleware();
    for (const procedure of routerProcedures) {
      mergedRouter.register(procedure);
    }
    for (const middleware of routerMiddleware) {
      mergedRouter.use(middleware);
    }
  }
  return mergedRouter;
}
