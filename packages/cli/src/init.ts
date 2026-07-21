import {
  argument,
  flag,
  option,
  variadicArgument,
} from "./descriptors.js";
import { CliProcedureBuilder } from "./procedure.js";
import {
  combineRouters,
  router,
  type CliRouter,
  type CliRouterConfig,
  type CommandPathsForConfig,
  type RouterCommandPaths,
  type RouterMetadata,
  type RouterRootKeys,
  type RootKeysForConfig,
  type ValidateRouterCombination,
} from "./router.js";

type ContextRouter<TContext extends object> = CliRouter<TContext, string, string>;

export interface InitCliResult<TContext extends object> {
  router<const TConfig extends CliRouterConfig<TContext>>(
    config: TConfig,
    metadata?: RouterMetadata,
  ): CliRouter<
    TContext,
    CommandPathsForConfig<TConfig>,
    RootKeysForConfig<TConfig>
  >;
  combineRouters<
    const TRouters extends readonly [
      ContextRouter<TContext>,
      ...ContextRouter<TContext>[],
    ],
  >(
    ...routers: TRouters & ValidateRouterCombination<TRouters>
  ): CliRouter<
    TContext,
    RouterCommandPaths<TRouters[number]>,
    RouterRootKeys<TRouters[number]>
  >;
  procedure: CliProcedureBuilder<TContext>;
  argument: typeof argument;
  variadicArgument: typeof variadicArgument;
  option: typeof option;
  flag: typeof flag;
}

export function initCli<
  TContext extends object = Record<never, never>,
>(): InitCliResult<TContext> {
  return {
    router: router as InitCliResult<TContext>["router"],
    combineRouters: combineRouters as unknown as InitCliResult<TContext>["combineRouters"],
    procedure: new CliProcedureBuilder<TContext>(),
    argument,
    variadicArgument,
    option,
    flag,
  };
}
