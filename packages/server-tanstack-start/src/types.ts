import type { BaseContext } from "@alt-stack/server-core";

export type TanStackRouteParams = Record<string, string | undefined>;

export interface TanStackServerRouteHandlerArgs<
  TParams extends TanStackRouteParams = TanStackRouteParams,
  TRouteContext = unknown,
> {
  request: Request;
  params: TParams;
  context: TRouteContext;
}

export type TanStackServerRouteHandler<
  TParams extends TanStackRouteParams = TanStackRouteParams,
  TRouteContext = unknown,
> = (
  args: TanStackServerRouteHandlerArgs<TParams, TRouteContext>,
) => Response | Promise<Response>;

export type TanStackHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type TanStackServerRoute<
  TParams extends TanStackRouteParams = TanStackRouteParams,
  TRouteContext = unknown,
> = {
  handlers: Partial<
    Record<TanStackHttpMethod, TanStackServerRouteHandler<TParams, TRouteContext>>
  >;
};

/**
 * TanStack Start-specific base context that includes the native server-route
 * handler inputs from `createFileRoute(... )({ server: { handlers } })`.
 */
export interface TanStackBaseContext<
  TParams extends TanStackRouteParams = TanStackRouteParams,
  TRouteContext = unknown,
> extends BaseContext {
  tanstack: {
    request: Request;
    params: TParams;
    context: TRouteContext;
  };
}
