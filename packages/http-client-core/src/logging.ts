import createDebug from "debug";
import type { ApiClientLoggingOptions, DebugLogger, LogLevel, LogMeta } from "./types.js";

type InternalLogger = (level: LogLevel, message: string, meta?: LogMeta) => void;
type DebugLoggers = Partial<Record<LogLevel, (...args: unknown[]) => void>>;

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

function createDebugLoggers(debug: DebugLogger | undefined): DebugLoggers | undefined {
  if (!debug) return undefined;

  const debuggerInstance = typeof debug === "string" ? createDebug(debug) : debug;

  return {
    error: debuggerInstance.extend("error"),
    warn: debuggerInstance.extend("warn"),
    info: debuggerInstance.extend("info"),
    debug: debuggerInstance.extend("debug"),
  };
}

function invokeDebug(
  debugLoggers: DebugLoggers | undefined,
  level: LogLevel,
  message: string,
  meta?: LogMeta,
): void {
  const debuggerInstance = debugLoggers?.[level];
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
  const debugLoggers = createDebugLoggers(options.debug);

  return (level, message, meta) => {
    invokeLogger(options.logger, level, message, meta);
    invokeDebug(debugLoggers, level, message, meta);
  };
}
