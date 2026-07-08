import { parseWorkerEnv } from "@worker-state/shared";

export const env = parseWorkerEnv(process.env);
