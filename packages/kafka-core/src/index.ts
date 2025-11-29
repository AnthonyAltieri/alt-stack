// Main export file

// Router exports
export {
  createKafkaRouter,
  mergeKafkaRouters,
  kafkaRouter,
  KafkaRouter,
} from "./router.js";

// Consumer exports
export { createConsumer } from "./consumer.js";
export type { CreateConsumerOptions } from "./consumer.js";

// Producer exports
export { createProducer } from "./producer.js";
export type { CreateProducerOptions, TypedProducer, SendOptions } from "./producer.js";

// AsyncAPI exports
export { generateAsyncAPISpec } from "./asyncapi.js";
export type {
  AsyncAPISpec,
  AsyncAPIChannel,
  AsyncAPIOperation,
  AsyncAPIMessage,
  GenerateAsyncAPISpecOptions,
  ExtractTopics,
  ExtractMessageType,
} from "./asyncapi.js";

// Error exports
export * from "./errors.js";

// Middleware exports
export { createMiddleware } from "./middleware.js";
export type {
  MiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareResult,
  Overwrite,
} from "./middleware.js";

// Init exports
export { init, publicProcedure } from "./init.js";
export type { InitResult } from "./init.js";

// Type exports
export type * from "./types.js";

// Procedure exports
export { BaseKafkaProcedureBuilder } from "./procedure.js";
