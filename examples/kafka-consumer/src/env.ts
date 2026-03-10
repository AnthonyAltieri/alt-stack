import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    KAFKA_BROKERS: z
      .string()
      .default("localhost:9092")
      .describe("Comma-separated list of Kafka broker addresses"),
    KAFKA_CLIENT_ID: z
      .string()
      .default("example-consumer")
      .describe("Kafka client ID"),
    KAFKA_GROUP_ID: z
      .string()
      .default("example-group")
      .describe("Kafka consumer group ID"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
