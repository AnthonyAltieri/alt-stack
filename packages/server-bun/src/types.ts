import type { BaseContext } from "@alt-stack/server-core";
import type { Server } from "bun";

/**
 * Bun Server type without WebSocket support.
 */
export type BunServer = Server<undefined>;

/**
 * Bun-specific base context that includes the native Request and Server objects.
 * Extends the framework-agnostic BaseContext from server-core.
 */
export interface BunBaseContext extends BaseContext {
  bun: {
    req: Request;
    server: BunServer;
  };
}
