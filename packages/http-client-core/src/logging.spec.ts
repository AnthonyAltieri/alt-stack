import { beforeEach, describe, expect, it, vi } from "vitest";

const debugMocks = vi.hoisted(() => {
  const createDebugger = () => {
    const debuggerInstance = vi.fn() as ReturnType<typeof vi.fn> & {
      extend: ReturnType<typeof vi.fn>;
    };
    debuggerInstance.extend = vi.fn(() => debuggerInstance);
    return debuggerInstance;
  };

  const levels = {
    error: createDebugger(),
    warn: createDebugger(),
    info: createDebugger(),
    debug: createDebugger(),
  };

  const root = createDebugger();
  root.extend = vi.fn((namespace: string) => levels[namespace as keyof typeof levels]);

  return {
    createDebug: vi.fn(() => root),
    root,
    levels,
  };
});

vi.mock("debug", () => ({
  default: debugMocks.createDebug,
}));

describe("createInternalLogger", () => {
  beforeEach(() => {
    vi.resetModules();
    debugMocks.createDebug.mockClear();
    debugMocks.root.mockClear();
    debugMocks.root.extend.mockClear();
    for (const level of Object.values(debugMocks.levels)) {
      level.mockClear();
      level.extend.mockClear();
    }
  });

  it("uses the static debug namespace", async () => {
    const { createInternalLogger, HTTP_CLIENT_DEBUG_NAMESPACE } = await import("./logging.js");
    const log = createInternalLogger({});

    log("error", "HTTP validation failed", { endpoint: "/users/{id}" });

    expect(debugMocks.createDebug).toHaveBeenCalledWith(HTTP_CLIENT_DEBUG_NAMESPACE);
    expect(debugMocks.root.extend).toHaveBeenCalledWith("error");
    expect(debugMocks.levels.error).toHaveBeenCalledWith(
      "%s %O",
      "HTTP validation failed",
      expect.objectContaining({ endpoint: "/users/{id}" }),
    );
  });

  it("uses logger and static debug together", async () => {
    const { createInternalLogger } = await import("./logging.js");
    const logger = { error: vi.fn() };
    const log = createInternalLogger({ logger });

    log("error", "HTTP validation failed", { endpoint: "/users/{id}" });

    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(debugMocks.levels.error).toHaveBeenCalledTimes(1);
  });
});
