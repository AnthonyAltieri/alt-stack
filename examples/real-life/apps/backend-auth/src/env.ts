import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z
      .string()
      .default("3001")
      .transform((value) => Number(value))
      .describe("Port number for the auth API"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development")
      .describe("Node environment"),
  },
  runtimeEnv: process.env,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
