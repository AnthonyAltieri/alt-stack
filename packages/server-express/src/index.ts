// Re-export everything from server-core
export * from "@alt-stack/server-core";

// Export Express-specific functionality
export { createServer } from "./server.js";
export { createDocsRouter } from "./docs.js";
export type { CreateDocsRouterOptions } from "./docs.js";
export type { ExpressBaseContext } from "./types.js";

