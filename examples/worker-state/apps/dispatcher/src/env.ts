import { parseDispatcherEnv } from "@worker-state/shared";

export const env = parseDispatcherEnv(process.env);
