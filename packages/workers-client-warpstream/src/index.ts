// Client
export { createWarpStreamClient } from "./client.js";
export type { WarpStreamClientOptions } from "./client.js";

// Re-export core types
export type {
  WorkerClient,
  JobsMap,
  TriggerOptions,
  TriggerResult,
} from "@alt-stack/workers-client-core";
export {
  WorkerClientError,
  ValidationError,
  TriggerError,
  ConnectionError,
} from "@alt-stack/workers-client-core";

