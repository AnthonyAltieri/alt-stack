import { WorkerRouter, mergeWorkerRouters, workerRouter } from "./router.js";
import { BaseWorkerProcedureBuilder } from "./procedure-builder.js";
import type { ReadyWorkerProcedure, InputConfig } from "./types/index.js";
import type { z } from "zod";

export interface InitOptions<TCustomContext extends object = Record<string, never>> {
  // Future extension point for default error handlers, etc.
}

// Type for router config that accepts both procedures and nested routers
type RouterConfig<TCustomContext extends object> = {
  [key: string]:
    | ReadyWorkerProcedure<any, any, any, any>
    | WorkerRouter<TCustomContext>;
};

export interface InitResult<TCustomContext extends object = Record<string, never>> {
  router: <TConfig extends RouterConfig<TCustomContext>>(
    config: TConfig,
  ) => WorkerRouter<TCustomContext>;
  mergeRouters: (...routers: WorkerRouter<TCustomContext>[]) => WorkerRouter<TCustomContext>;
  procedure: BaseWorkerProcedureBuilder<
    { payload?: never },
    undefined,
    undefined,
    TCustomContext,
    unknown
  >;
}

/**
 * Export a standalone public procedure for simple use cases.
 */
export const publicProcedure = new BaseWorkerProcedureBuilder<
  { payload?: never },
  undefined,
  undefined,
  Record<string, never>,
  unknown
>();

/**
 * Initialize the workers framework with a custom context type.
 *
 * @example
 * ```typescript
 * interface AppContext {
 *   db: Database;
 *   logger: Logger;
 * }
 *
 * const { router, procedure } = init<AppContext>();
 *
 * const myRouter = router({
 *   "my-job": procedure
 *     .input({ payload: z.object({ id: z.string() }) })
 *     .task(async ({ input, ctx }) => {
 *       ctx.logger.info(`Processing ${input.id}`);
 *     }),
 * });
 * ```
 */
export function init<TCustomContext extends object = Record<string, never>>(
  _options?: InitOptions<TCustomContext>,
): InitResult<TCustomContext> {
  return {
    router: <TConfig extends RouterConfig<TCustomContext>>(config: TConfig) =>
      workerRouter<TCustomContext, TConfig>(config),
    mergeRouters: (...routers: WorkerRouter<TCustomContext>[]) =>
      mergeWorkerRouters(...routers),
    procedure: new BaseWorkerProcedureBuilder<
      { payload?: never },
      undefined,
      undefined,
      TCustomContext,
      unknown
    >(),
  };
}
