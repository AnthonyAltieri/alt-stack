import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Effect, Result } from "effect";
import * as ts from "typescript";
import { expect, it } from "vitest";
import document from "./fixtures/todos.json";
import { openApiToEffectTsCode } from "./index.js";

// Compile and execute the actual generated source against the pinned Effect release.
// Keeping these assertions beside the source also checks inference without casts.
const consumer = `
import assert from "node:assert/strict";
import { Effect as TestEffect, Result as TestResult } from "effect";
import { HttpClient as TestHttp, HttpClientResponse as TestResponse } from "effect/unstable/http";
import { HttpApiClient as TestClient } from "effect/unstable/httpapi";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;
type Check<T extends true> = T;

function checkTypes(client: TestClient.ForApi<typeof Api>) {
  const loaded = client.todos.byId({ params: { id: "1" } });
  type Success = Check<Equal<TestEffect.Success<typeof loaded>, {
    readonly id: string;
    readonly title: string;
    readonly completed: boolean;
    readonly description?: string;
  }>>;
  type Failure = Check<Equal<Extract<TestEffect.Error<typeof loaded>, { error: unknown }>, {
    readonly error: { readonly code: "NOT_FOUND"; readonly message: string };
  }>>;
  type Services = Check<Equal<TestEffect.Services<typeof loaded>, never>>;
  // @ts-expect-error Path params are required.
  client.todos.byId({});
  // @ts-expect-error Path params retain their schema types.
  client.todos.byId({ params: { id: 123 } });
  // @ts-expect-error The JSON payload is required.
  client.todos.create({});
  // @ts-expect-error Payload fields retain their schema types.
  client.todos.create({ payload: { title: false } });
  // @ts-expect-error Query fields retain their schema types.
  client.todos.list({ query: { limit: "2" } });
  // @ts-expect-error No undeclared operation exists.
  client.todos.remove({});
}

const todo = { id: "1", title: "Try Effect", completed: false };
const missing = { error: { code: "NOT_FOUND", message: "Missing todo" } };
const requests: Array<{ method: string; url: string; body?: unknown }> = [];
const transport = TestHttp.make((request, url) => {
  requests.push({
    method: request.method,
    url: url.toString(),
    ...(request.body._tag === "Uint8Array"
      ? { body: JSON.parse(new TextDecoder().decode(request.body.body)) }
      : {}),
  });
  const body = url.pathname.endsWith("/missing") ? missing
    : url.pathname.endsWith("/malformed") ? { id: 1 }
    : request.method === "GET" && url.pathname === "/api/todos" ? [todo]
    : todo;
  const status = url.pathname.endsWith("/missing") ? 404
    : request.method === "POST" ? 201 : 200;
  return TestEffect.succeed(TestResponse.fromWeb(request, Response.json(body, { status })));
});

await TestEffect.runPromise(TestEffect.gen(function* () {
  const client = yield* TestClient.make(Api, { baseUrl: "https://example.test" });
  assert.deepEqual(yield* client.todos.list({ query: { limit: 2 } }), [todo]);
  assert.deepEqual(yield* client.todos.byId({ params: { id: "1" } }), todo);
  assert.deepEqual(yield* client.todos.create({ payload: { title: "Try Effect" } }), todo);
  const failure = yield* TestEffect.result(client.todos.byId({ params: { id: "missing" } }));
  assert(TestResult.isFailure(failure));
  assert.deepEqual(failure.failure, missing);
  const malformed = yield* TestEffect.result(client.todos.byId({ params: { id: "malformed" } }));
  assert(TestResult.isFailure(malformed));
  assert.equal("_tag" in malformed.failure && malformed.failure._tag, "SchemaError");
  const before = requests.length;
  const invalid = yield* TestEffect.result(client.todos.create({ payload: { title: "" } }));
  assert(TestResult.isFailure(invalid));
  assert.equal(requests.length, before, "Invalid requests must fail before HTTP execution");
}).pipe(TestEffect.provideService(TestHttp.HttpClient, transport)));

assert.deepEqual(requests.slice(0, 3), [
  { method: "GET", url: "https://example.test/api/todos?limit=2" },
  { method: "GET", url: "https://example.test/api/todos/1" },
  { method: "POST", url: "https://example.test/api/todos", body: { title: "Try Effect" } },
]);
`;

it("generates a native HttpApi with typed requests/errors and working schema boundaries", async () => {
  const original = structuredClone(document);
  const source = await Effect.runPromise(openApiToEffectTsCode({ document }));
  expect(document).toEqual(original);
  expect(source).not.toContain("@alt-stack/");
  const directory = mkdtempSync(fileURLToPath(new URL("../.generated-", import.meta.url)));
  try {
    const filename = join(directory, "api.ts");
    writeFileSync(filename, source + consumer);
    const program = ts.createProgram([filename], {
      strict: true,
      exactOptionalPropertyTypes: true,
      skipLibCheck: true,
      noEmit: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    expect(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: () => process.cwd(),
      getNewLine: () => "\n",
    })).toBe("");
    const javascript = ts.transpileModule(source + consumer, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const executable = join(directory, "api.mjs");
    writeFileSync(executable, javascript);
    execFileSync(process.execPath, [executable], { stdio: "pipe" });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 20_000);

it("reports invalid documents and lossy generation as typed failures", async () => {
  for (const input of [{}, { ...document, paths: "invalid" }]) {
    const invalid = await Effect.runPromise(Effect.result(openApiToEffectTsCode({ document: input })));
    expect(Result.isFailure(invalid) && invalid.failure._tag).toBe("OpenApiGenerationError");
  }

  const lossy = structuredClone(document);
  lossy.paths["/api/todos"].get.parameters.push({
    name: "session", in: "cookie", required: true, schema: { type: "string", minimum: 1 },
  });
  const warning = await Effect.runPromise(Effect.result(openApiToEffectTsCode({ document: lossy })));
  expect(Result.isFailure(warning) && warning.failure.message).toContain("cookie-parameter-dropped");
});
