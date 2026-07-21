import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createCli, initCli, ok, runCli } from "./index.js";

function writer() {
  return { write: vi.fn() };
}

describe("runCli", () => {
  it("renders successful values only when a formatter is provided", async () => {
    const t = initCli();
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: t.router({ status: t.procedure.command(() => ok({ healthy: true })) }),
      createContext: () => ({}),
    });
    const stdout = writer();
    const stderr = writer();

    const exitCode = await runCli(cli, {
      argv: ["status"],
      stdout,
      stderr,
      formatValue: (value) => JSON.stringify(value),
    });

    expect(exitCode).toBe(0);
    expect(stdout.write).toHaveBeenCalledWith('{"healthy":true}\n');
    expect(stderr.write).not.toHaveBeenCalled();
  });

  it("writes help to stdout and usage failures to stderr", async () => {
    const t = initCli();
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: t.router({
        deploy: t.procedure
          .args({ environment: t.argument(z.enum(["dev", "prod"])) })
          .command(() => ok()),
      }),
      createContext: () => ({}),
    });
    const stdout = writer();
    const stderr = writer();

    await expect(
      runCli(cli, { argv: [], stdout, stderr }),
    ).resolves.toBe(0);
    expect(stdout.write.mock.calls[0]?.[0]).toContain("Usage: acme <command>");

    await expect(
      runCli(cli, {
        argv: ["deploy", "staging"],
        stdout,
        stderr,
      }),
    ).resolves.toBe(2);
    expect(stderr.write.mock.calls[0]?.[0]).toContain("Error: Invalid argument");
    expect(stderr.write.mock.calls[0]?.[0]).toContain("Usage: acme deploy");
  });
});
