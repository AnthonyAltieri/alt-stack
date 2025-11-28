import type { z } from "zod";
import type {
  InputConfig,
  WorkerProcedure,
  ReadyWorkerProcedure,
  PendingWorkerProcedure,
} from "./types/index.js";
import { BaseWorkerProcedureBuilder } from "./procedure-builder.js";

export class WorkerRouter<TCustomContext extends object = Record<string, never>> {
  private procedures: WorkerProcedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] = [];

  constructor(
    config?: Record<string, WorkerRouter<TCustomContext> | WorkerRouter<TCustomContext>[]>,
  ) {
    if (config) {
      for (const [key, value] of Object.entries(config)) {
        const routers = Array.isArray(value) ? value : [value];
        for (const router of routers) {
          this.merge(key, router);
        }
      }
    }
  }

  /**
   * Register a ready procedure with a job name.
   */
  registerProcedure<TJobName extends string, TInput extends InputConfig>(
    jobName: TJobName,
    readyProcedure: ReadyWorkerProcedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    >,
  ): this {
    const procedure: WorkerProcedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    > = {
      jobName,
      type: readyProcedure.type,
      cron: readyProcedure.cron,
      queue: readyProcedure.queue,
      config: readyProcedure.config,
      handler: readyProcedure.handler,
      middleware: readyProcedure.middleware,
    };
    this.procedures.push(
      procedure as unknown as WorkerProcedure<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<string, z.ZodTypeAny> | undefined,
        TCustomContext
      >,
    );
    return this;
  }

  /**
   * Register a pending procedure with a job name and type.
   */
  registerPendingProcedure<TJobName extends string, TInput extends InputConfig>(
    jobName: TJobName,
    type: "task" | "cron" | "queue",
    pendingProcedure: PendingWorkerProcedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    >,
    options?: { cron?: string; queue?: string },
  ): this {
    const procedure: WorkerProcedure<
      TInput,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    > = {
      jobName,
      type,
      cron: options?.cron ? { pattern: options.cron } : undefined,
      queue: options?.queue,
      config: pendingProcedure.config,
      handler: pendingProcedure.handler,
      middleware: pendingProcedure.middleware,
    };
    this.procedures.push(
      procedure as unknown as WorkerProcedure<
        InputConfig,
        z.ZodTypeAny | undefined,
        Record<string, z.ZodTypeAny> | undefined,
        TCustomContext
      >,
    );
    return this;
  }

  /**
   * Register a fully configured procedure.
   */
  register(
    procedure: WorkerProcedure<
      InputConfig,
      z.ZodTypeAny | undefined,
      Record<string, z.ZodTypeAny> | undefined,
      TCustomContext
    >,
  ): this {
    this.procedures.push(procedure);
    return this;
  }

  /**
   * Merge another router with an optional prefix.
   */
  merge(prefix: string, router: WorkerRouter<TCustomContext>): this {
    const mergedProcedures = router.procedures.map((proc) => ({
      ...proc,
      jobName: prefix ? `${prefix}.${proc.jobName}` : proc.jobName,
    }));
    this.procedures.push(...mergedProcedures);
    return this;
  }

  /**
   * Get all registered procedures.
   */
  getProcedures(): WorkerProcedure<
    InputConfig,
    z.ZodTypeAny | undefined,
    Record<string, z.ZodTypeAny> | undefined,
    TCustomContext
  >[] {
    return this.procedures;
  }

  /**
   * Get a procedure builder bound to this router.
   */
  get procedure(): BaseWorkerProcedureBuilder<
    { payload?: never },
    undefined,
    undefined,
    TCustomContext,
    this
  > {
    return new BaseWorkerProcedureBuilder<
      { payload?: never },
      undefined,
      undefined,
      TCustomContext,
      this
    >(undefined, undefined, this);
  }
}

// Type helper for router config values
type RouterConfigValue<TCustomContext extends object, TJobName extends string> =
  | ReadyWorkerProcedure<any, any, any, any>
  | WorkerRouter<TCustomContext>;

/**
 * Create a worker router with tRPC-style configuration.
 *
 * @example
 * ```typescript
 * const emailRouter = workerRouter<AppContext>({
 *   "send-welcome": procedure
 *     .input({ payload: z.object({ userId: z.string() }) })
 *     .task(async ({ input, ctx }) => {
 *       // send email
 *     }),
 *
 *   "daily-digest": procedure
 *     .cron("0 9 * * *", async ({ ctx }) => {
 *       // daily job
 *     }),
 * });
 * ```
 */
export function workerRouter<
  TCustomContext extends object = Record<string, never>,
  TConfig extends {
    [K in string]: RouterConfigValue<TCustomContext, K>;
  } = {
    [K in string]: RouterConfigValue<TCustomContext, K>;
  },
>(config: TConfig): WorkerRouter<TCustomContext> {
  const routerInstance = new WorkerRouter<TCustomContext>();

  for (const [key, value] of Object.entries(config)) {
    if (value instanceof WorkerRouter) {
      routerInstance.merge(key, value);
    } else {
      routerInstance.registerProcedure(
        key,
        value as ReadyWorkerProcedure<
          InputConfig,
          z.ZodTypeAny | undefined,
          Record<string, z.ZodTypeAny> | undefined,
          TCustomContext
        >,
      );
    }
  }

  return routerInstance;
}

/**
 * Create an empty worker router.
 */
export function createWorkerRouter<
  TCustomContext extends object = Record<string, never>,
>(
  config?: Record<string, WorkerRouter<TCustomContext> | WorkerRouter<TCustomContext>[]>,
): WorkerRouter<TCustomContext> {
  return new WorkerRouter<TCustomContext>(config);
}

/**
 * Merge multiple routers into one.
 */
export function mergeWorkerRouters<
  TCustomContext extends object = Record<string, never>,
>(...routers: WorkerRouter<TCustomContext>[]): WorkerRouter<TCustomContext> {
  const mergedRouter = new WorkerRouter<TCustomContext>();
  for (const router of routers) {
    const routerProcedures = router.getProcedures();
    for (const procedure of routerProcedures) {
      mergedRouter.register(procedure);
    }
  }
  return mergedRouter;
}
