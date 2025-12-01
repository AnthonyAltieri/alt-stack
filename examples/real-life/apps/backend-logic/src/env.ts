import { createEnv } from "@t3-oss/env-core";
import { Resource } from "sst";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.coerce.number().default(3002),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});

// SST linked resources (available when deployed, with fallbacks for local dev)
const rawAuthUrl = (Resource as any).AuthApi?.url ?? "http://localhost:3001";
export const authServiceUrl = rawAuthUrl.replace(/\/$/, ""); // Remove trailing slash
export const warpstreamUrl = (Resource as any).WarpStreamUrl?.value ?? "localhost:9092";
