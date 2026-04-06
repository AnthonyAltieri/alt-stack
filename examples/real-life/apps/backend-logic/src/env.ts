import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z
      .string()
      .default("3002")
      .transform((value) => Number(value))
      .describe("Port number for the task API"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development")
      .describe("Node environment"),
    AUTH_SERVICE_URL: z
      .string()
      .url()
      .default("http://localhost:3001")
      .describe("Auth service base URL"),
    WARPSTREAM_URL: z
      .string()
      .default("localhost:9092")
      .describe("WarpStream bootstrap server"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

export const authServiceUrl = env.AUTH_SERVICE_URL.replace(/\/$/, "");
export const warpstreamUrl = env.WARPSTREAM_URL;
