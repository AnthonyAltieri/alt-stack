// Client
export { createWarpStreamClient } from "./client.js";
export type { WarpStreamClientOptions } from "./client.js";

// Re-export core types
export type { KafkaClient, TopicsMap, SendOptions } from "@alt-stack/kafka-client-core";
export {
  KafkaClientError,
  ValidationError,
  SendError,
  ConnectionError,
} from "@alt-stack/kafka-client-core";
