// Client
export { createTriggerClient } from "./client.js";
export type { TriggerClientOptions } from "./client.js";

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

