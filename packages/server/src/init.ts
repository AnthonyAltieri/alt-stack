import { Router, mergeRouters } from "./router.js";
import { BaseProcedureBuilder } from "./procedure.js";

export interface InitResult<TCustomContext extends Record<string, unknown> = Record<string, never>> {
  router: (
    config?: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
  ) => Router<TCustomContext>;
  mergeRouters: (...routers: Router<TCustomContext>[]) => Router<TCustomContext>;
  procedure: BaseProcedureBuilder<
    { params?: never; query?: never; body?: never },
    undefined,
    undefined,
    TCustomContext
  >;
}

export function init<TCustomContext extends Record<string, unknown> = Record<string, never>>(): InitResult<TCustomContext> {
  return {
    router: (
      config?: Record<string, Router<TCustomContext> | Router<TCustomContext>[]>,
    ) => new Router<TCustomContext>(config),
    mergeRouters: (...routers: Router<TCustomContext>[]) => mergeRouters(...routers),
    procedure: new BaseProcedureBuilder<
      { params?: never; query?: never; body?: never },
      undefined,
      undefined,
      TCustomContext
    >(),
  };
}

