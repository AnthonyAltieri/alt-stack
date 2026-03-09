import createDebug from "debug";
import type { ApiClientLoggingOptions, LogLevel, LogMeta } from "./types.js";

type InternalLogger = (level: LogLevel, message: string, meta?: LogMeta) => void;
type DebugLoggers = Partial<Record<LogLevel, (...args: unknown[]) => void>>;
export const HTTP_CLIENT_DEBUG_NAMESPACE = "alt-stack:http-client";

function createDebugLoggers(): DebugLoggers {
  const debugLogger = createDebug(HTTP_CLIENT_DEBUG_NAMESPACE);

  return {
    error: debugLogger.extend("error"),
    warn: debugLogger.extend("warn"),
    info: debugLogger.extend("info"),
    debug: debugLogger.extend("debug"),
  };
}

function invokeLogger(
  logger: ApiClientLoggingOptions["logger"],
  level: LogLevel,
  message: string,
  meta?: LogMeta,
): void {
  const handler = logger?.[level];
  if (!handler) return;

  try {
    handler(message, meta);
  } catch {
    // Never allow a user-provided logger to affect control-flow.
  }
}

function invokeDebug(
  debugLoggers: DebugLoggers,
  level: LogLevel,
  message: string,
  meta?: LogMeta,
): void {
  const debuggerInstance = debugLoggers[level];
  if (!debuggerInstance) return;

  try {
    if (meta) {
      debuggerInstance("%s %O", message, meta);
      return;
    }

    debuggerInstance(message);
  } catch {
    // Never allow debug logging to affect control-flow.
  }
}

export function createInternalLogger(options: ApiClientLoggingOptions): InternalLogger {
  const debugLoggers = createDebugLoggers();

  return (level, message, meta) => {
    invokeLogger(options.logger, level, message, meta);
    invokeDebug(debugLoggers, level, message, meta);
  };
}
