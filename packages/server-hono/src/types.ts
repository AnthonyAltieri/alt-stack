import type { Context } from "hono";
import type { BaseContext } from "@alt-stack/server-core";

type MaybePromise<T> = T | Promise<T>;

/**
 * Hono-specific base context that includes the Hono Context object.
 * Extends the framework-agnostic BaseContext from server-core.
 */
export interface HonoBaseContext extends BaseContext {
  hono: Context;
}

/**
 * Framework-neutral request details exposed to createServer request middleware
 * and external route handlers.
 */
export interface RequestMiddlewareContext {
  request: Request;
  url: URL;
  method: string;
  path: string;
}

export type RequestMiddlewareNext = () => Promise<Response>;

export type RequestMiddleware = (
  context: RequestMiddlewareContext,
  next: RequestMiddlewareNext,
) => MaybePromise<Response>;

export type ExternalRouteHandler = (
  context: RequestMiddlewareContext,
) => MaybePromise<Response>;

export interface ExternalRoute {
  path: string;
  methods: readonly string[];
  handler: ExternalRouteHandler;
}
