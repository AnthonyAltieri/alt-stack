import type { Context } from "hono";
import type { BaseContext } from "@alt-stack/server-core";

/**
 * Hono-specific base context that includes the Hono Context object.
 * Extends the framework-agnostic BaseContext from server-core.
 */
export interface HonoBaseContext extends BaseContext {
  hono: Context;
}

