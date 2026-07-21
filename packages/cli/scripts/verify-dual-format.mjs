import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { z } from "zod";

const require = createRequire(import.meta.url);
const esm = await import("../dist/index.mjs");
const cjs = require("../dist/index.js");

const cjsFactory = cjs.initCli();
const schemaError = new cjs.CliUsageError(
  "unknown-command",
  "application schema failure",
  ["forged"],
);
const cjsRouter = cjsFactory.router({
  status: cjsFactory.procedure.command(() => cjs.ok("cjs")),
  inspect: cjsFactory.procedure
    .args({
      value: cjsFactory.argument(
        z.string().transform(() => {
          throw schemaError;
        }),
      ),
    })
    .command(() => cjs.ok()),
});

const esmFactory = esm.initCli();
assert.doesNotThrow(() =>
  esmFactory.router({ status: cjsRouter.getChildren().status }),
);

const application = esm.createCli({
  name: "dual-format-check",
  version: "1",
  router: cjsRouter,
  createContext: () => ({}),
});
assert.deepEqual(await application.execute(["status"]), {
  type: "executed",
  exitCode: 0,
  commandPath: "status",
  value: "cjs",
});
const schemaOutcome = await application.execute(["inspect", "value"]);
assert.equal(schemaOutcome.type, "command-error");
assert.equal(schemaOutcome.error, schemaError);

console.log("CJS/ESM interoperability check passed.");
