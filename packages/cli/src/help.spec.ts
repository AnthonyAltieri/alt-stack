import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createCli, initCli, ok } from "./index.js";

describe("CLI help", () => {
  it("renders stable command-local usage and descriptor metadata", async () => {
    const t = initCli();
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: t.router({
        users: t.router({
          create: t.procedure
            .description("Create a user")
            .args({
              name: t.argument(z.string(), {
                description: "Display name",
              }),
              files: t.variadicArgument(z.string(), {
                description: "Files to attach",
                metavar: "file",
              }),
            })
            .options({
              role: t.option(z.string().default("member"), {
                description: "Initial role",
                metavar: "role",
                short: "r",
              }),
              notify: t.flag({
                description: "Send a welcome message",
                short: "n",
              }),
            })
            .command(() => ok()),
        }),
      }),
      createContext: () => ({}),
    });

    const outcome = await cli.execute(["users", "create", "--help"]);

    expect(outcome).toEqual({
      type: "help",
      exitCode: 0,
      commandPath: ["users", "create"],
      text: [
        "Usage: acme users create <name> [file...] [options]",
        "",
        "Create a user",
        "",
        "Arguments:",
        "  name  Display name",
        "  file  Files to attach",
        "",
        "Options:",
        "  -r, --role <role>  Initial role",
        "  -n, --notify       Send a welcome message",
        "  -h, --help         Show help",
      ].join("\n"),
    });
  });

  it("uses the nearest group help for an unknown nested command", async () => {
    const t = initCli();
    const cli = createCli({
      name: "acme",
      version: "1.0.0",
      router: t.router({
        users: t.router({ list: t.procedure.command(() => ok()) }),
      }),
      createContext: () => ({}),
    });

    const outcome = await cli.execute(["users", "missing"]);

    expect(outcome).toMatchObject({
      type: "usage-error",
      error: { code: "unknown-command", commandPath: ["users"] },
    });
    expect(outcome.type === "usage-error" && outcome.help).toContain(
      "Usage: acme users <command>",
    );
  });
});
