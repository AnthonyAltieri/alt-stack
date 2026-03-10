import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z
      .string()
      .default("3000")
      .transform((val) => Number(val))
      .describe("Port number for the server"),
    CLIENT_URL: z
      .string()
      .url()
      .default("http://localhost:3000")
      .describe("Client URL for CORS"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development")
      .describe("Node environment"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});

