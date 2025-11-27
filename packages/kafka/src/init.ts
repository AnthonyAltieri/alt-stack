import { KafkaRouter, mergeKafkaRouters } from "./router.js";
import { BaseKafkaProcedureBuilder } from "./procedure.js";

export interface InitResult<TCustomContext extends object = Record<string, never>> {
  router: (
    config?: Record<string, KafkaRouter<TCustomContext> | KafkaRouter<TCustomContext>[]>,
  ) => KafkaRouter<TCustomContext>;
  mergeRouters: (...routers: KafkaRouter<TCustomContext>[]) => KafkaRouter<TCustomContext>;
  procedure: BaseKafkaProcedureBuilder<
    { message?: never },
    undefined,
    undefined,
    TCustomContext,
    unknown
  >;
}

/**
 * Export publicProcedure directly for use without init()
 */
export const publicProcedure = new BaseKafkaProcedureBuilder<
  { message?: never },
  undefined,
  undefined,
  Record<string, never>,
  unknown
>();

/**
 * Initialize the Kafka procedure factory with custom context type.
 * Returns router, mergeRouters, and procedure utilities.
 *
 * @example
 * ```typescript
 * interface AppContext {
 *   logger: Logger;
 * }
 *
 * const { router, mergeRouters, procedure } = init<AppContext>();
 *
 * const publicProc = procedure;
 * const protectedProc = procedure
 *   .errors({ UNAUTHORIZED: z.object({ message: z.string() }) })
 *   .use(authMiddleware);
 * ```
 */
export function init<
  TCustomContext extends object = Record<string, never>,
>(): InitResult<TCustomContext> {
  return {
    router: (
      config?: Record<string, KafkaRouter<TCustomContext> | KafkaRouter<TCustomContext>[]>,
    ) => new KafkaRouter<TCustomContext>(config),
    mergeRouters: (...routers: KafkaRouter<TCustomContext>[]) =>
      mergeKafkaRouters(...routers),
    procedure: new BaseKafkaProcedureBuilder<
      { message?: never },
      undefined,
      undefined,
      TCustomContext,
      unknown
    >(),
  };
}

