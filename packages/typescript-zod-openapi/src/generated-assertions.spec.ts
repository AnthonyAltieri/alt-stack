import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { createApiClient as createFetchClient } from "../../http-client-fetch/src/index.js";
import { createApiClient as createKyClient } from "../../http-client-ky/src/index.js";
import type { ApiRequestSchema, ApiResponseSchema, Logger } from "../../http-client-core/src/types.js";
import { describe, expect, it, vi } from "vitest";
import * as ts from "typescript";
import { openApiToZodTsCode } from "./to-typescript";
import { generateInterface } from "./interface-generator";

const strictCompilerOptions: ts.CompilerOptions = {
  exactOptionalPropertyTypes: true,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
};

function compileGeneratedCode(code: string): readonly ts.Diagnostic[] {
  const sourcePath = fileURLToPath(
    new URL("./.generated-assertion-fixture.ts", import.meta.url),
  );
  const host = ts.createCompilerHost(strictCompilerOptions);
  const getSourceFile = host.getSourceFile.bind(host);

  host.getSourceFile = (
    fileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
  ) =>
    fileName === sourcePath
      ? ts.createSourceFile(fileName, code, languageVersion, true)
      : getSourceFile(
          fileName,
          languageVersion,
          onError,
          shouldCreateNewSourceFile,
        );

  const program = ts.createProgram(
    [sourcePath],
    strictCompilerOptions,
    host,
  );
  return ts.getPreEmitDiagnostics(program);
}

function formatDiagnostics(diagnostics: readonly ts.Diagnostic[]): string {
  return diagnostics
    .map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(
        diagnostic.messageText,
        "\n",
      );
      if (!diagnostic.file || diagnostic.start === undefined) {
        return `TS${diagnostic.code}: ${message}`;
      }

      const position = diagnostic.file.getLineAndCharacterOfPosition(
        diagnostic.start,
      );
      return `${diagnostic.file.fileName}:${position.line + 1}:${position.character + 1} TS${diagnostic.code}: ${message}`;
    })
    .join("\n");
}

const optionalPropertyFixture = {
  components: {
    schemas: {
      OptionalProperties: {
        type: "object",
        properties: {
          topLevel: { type: "string" },
          nested: {
            type: "object",
            properties: {
              inner: { type: "number" },
            },
          },
        },
        required: ["nested"],
        additionalProperties: false,
      },
    },
  },
};

const typedRecordFixture = {
  components: {
    schemas: {
      StringOrStringArrayRecord: {
        type: "object",
        properties: {},
        additionalProperties: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
      },
    },
  },
};

const openApi31Fixture = {
  components: {
    schemas: {
      Envelope: {
        oneOf: [
          { $ref: "#/components/schemas/Plaintext" },
          { $ref: "#/components/schemas/Encrypted" },
        ],
        discriminator: { propertyName: "mode" },
      },
      Plaintext: {
        type: "object",
        properties: {
          mode: { type: "string", const: "plaintext" },
          v: { type: "integer", const: 1 },
          note: { anyOf: [{ type: "string" }, { type: "null" }] },
          retries: { anyOf: [{ type: "integer" }, { type: "null" }] },
        },
        required: ["mode", "v", "note"],
        additionalProperties: false,
      },
      Encrypted: {
        type: "object",
        properties: {
          mode: { type: "string", const: "kms" },
          v: { type: "integer", const: 1 },
          ct: { type: "string" },
        },
        required: ["mode", "v", "ct"],
        additionalProperties: false,
      },
    },
  },
};

describe("generated schema/type assertions", () => {
  it("shares brands across components, parameters, optional nullable fields, arrays and anyOf", () => {
    const id = { type: "string", format: "uuid", "x-altstack-brand": "UserId" };
    const code = openApiToZodTsCode({
      components: { schemas: {
        UserId: id,
        User: { type: "object", properties: {
          id: { $ref: "#/components/schemas/UserId" },
          optional: { ...id, nullable: true },
          ids: { type: "array", items: id },
          choice: { anyOf: [id, { type: "null" }] },
        }, required: ["id", "ids", "choice"], additionalProperties: false },
      } },
      paths: { "/users/{id}": { get: {
        parameters: [{ name: "id", in: "path", required: true, schema: id }],
        responses: { "200": { content: { "application/json": { schema: { $ref: "#/components/schemas/User" } } } } },
      } } },
    }, undefined, { includeRoutes: true });
    expect(code.match(/export type UserId =/g)).toHaveLength(1);
    expect(code).toContain('.brand<"UserId">()');
    const orderId = generateInterface("OrderId", { type: "string", "x-altstack-brand": "OrderId" });
    const consumer = `
${orderId}
const userId = UserIdSchema.parse("f47ac10b-58cc-4372-a567-0e02b2c3d479");
const params = Request["/users/{id}"].GET.params.parse({id: userId});
type _BrandedParam = _AssertTrue<_AssertEqual<typeof params.id, UserId>>;
type _BrandedResponse = _AssertTrue<_AssertEqual<z.output<typeof Response["/users/{id}"]["GET"]["200"]>["id"], UserId>>;
// @ts-expect-error Plain strings cannot replace parsed branded identifiers.
const plain: UserId = "unparsed";
`;
    expect(formatDiagnostics(compileGeneratedCode(code + consumer))).toBe("");
  });

  it.each(["bad-name", "class", "", 123, null])("rejects invalid brand %j", (brand) => {
    expect(() => openApiToZodTsCode({ components: { schemas: { Value: { type: "string", "x-altstack-brand": brand } } } })).toThrow(/Invalid x-altstack-brand/);
  });

  it("rejects conflicting brand bases and component names", () => {
    expect(() => openApiToZodTsCode({ components: { schemas: {
      First: { type: "string", "x-altstack-brand": "UserId" },
      Second: { type: "integer", "x-altstack-brand": "UserId" },
    } } })).toThrow(/Conflicting base types.*UserId/);
    expect(() => openApiToZodTsCode({ components: { schemas: {
      UserId: { type: "integer" }, First: { type: "string", "x-altstack-brand": "UserId" },
    } } })).toThrow(/conflicts with component UserId/);
  });

  it("compiles OpenAPI 3.1 nullable anyOf members and const discriminators", () => {
    const code = openApiToZodTsCode(openApi31Fixture);

    expect(code).toContain('mode: "plaintext";');
    expect(code).toContain("note: (string | null);");
    expect(code).toContain('mode: z.literal("plaintext")');
    expect(code).toContain("note: z.union([z.string(), z.null()])");
    expect(formatDiagnostics(compileGeneratedCode(code))).toBe("");
  });

  it("compiles top-level and nested optional outputs with exact optional property types", () => {
    const code = openApiToZodTsCode(optionalPropertyFixture);

    expect(code).toContain("topLevel?: string | undefined;");
    expect(code).toContain("nested: { inner?: number | undefined; [key: string]: unknown };");
    expect(formatDiagnostics(compileGeneratedCode(code))).toBe("");
  });

  it("compiles schema-valued propertyless records", () => {
    const code = openApiToZodTsCode(typedRecordFixture);

    expect(code).toContain(`export interface StringOrStringArrayRecord {
  [key: string]: (string | Array<string>);
}`);
    expect(code).toContain(
      "export const StringOrStringArrayRecordSchema = z.record(z.string(), z.union([z.string(), z.array(z.string())]));",
    );
    expect(code).toContain(
      "type _AssertStringOrStringArrayRecord = _AssertTrue<_AssertEqual<StringOrStringArrayRecord, z.output<typeof StringOrStringArrayRecordSchema>>>;",
    );
    expect(formatDiagnostics(compileGeneratedCode(code))).toBe("");
    const mixed = openApiToZodTsCode({ components: { schemas: {
      MixedRecord: { type: "object", properties: { name: { type: "string" } },
        required: ["name"], additionalProperties: { type: "number" } },
    } } });
    expect(formatDiagnostics(compileGeneratedCode(mixed))).toBe("");
  });

  it("rejects a generated interface that differs from its Zod output", () => {
    const code = openApiToZodTsCode(optionalPropertyFixture);
    const mismatchedCode = code.replace(
      "topLevel?: string | undefined;",
      "topLevel?: number | undefined;",
    );

    expect(mismatchedCode).not.toBe(code);
    const diagnostics = compileGeneratedCode(mismatchedCode);

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe(2344);
    expect(formatDiagnostics(diagnostics)).toContain(
      "Type 'false' does not satisfy the constraint 'true'",
    );
  });

  it("compiles the master OpenAPI fixture in strict exact-optional mode", () => {
    const specUrl = new URL(
      "../../openapi-test-spec/openapi.json",
      import.meta.url,
    );
    const openapi = JSON.parse(readFileSync(specUrl, "utf8")) as Record<
      string,
      unknown
    >;
    const code = openApiToZodTsCode(openapi, undefined, {
      includeRoutes: true,
    });

    expect(formatDiagnostics(compileGeneratedCode(code))).toBe("");
  });
});

const adapters = ["fetch", "ky"] as const;

function createClient<TRequest extends ApiRequestSchema, TResponse extends ApiResponseSchema>(
  adapter: typeof adapters[number],
  fetch: typeof globalThis.fetch,
  schemas: { Request: TRequest; Response: TResponse },
  logger: Logger = {},
) {
  const options = { baseUrl: "https://api.example.test", ...schemas, logger };
  return adapter === "fetch"
    ? createFetchClient({ ...options, fetch })
    : createKyClient({ ...options, kyOptions: { fetch, retry: 0 } });
}

it("generates and executes content-free success responses as undefined", async () => {
  const fixture = { paths: { "/v1/sessions/{id}/logout": { delete: {
    parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
    responses: {
      "204": { description: "No Content" },
      "422": { description: "Invalid session", content: { "application/json": { schema: { type: "string" } } } },
    },
  } } } };
  const code = openApiToZodTsCode(fixture, undefined, { includeRoutes: true });
  expect(formatDiagnostics(compileGeneratedCode(code + `
import type { ApiResponse } from "../../http-client-core/src/types.js";
declare const result: ApiResponse<typeof Response, "/v1/sessions/{id}/logout", "DELETE">;
if (result.success) {
  const body: undefined = result.body;
  const code: "204" = result.code;
}
`))).toBe("");
  const javascript = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports: { Request?: ApiRequestSchema; Response?: ApiResponseSchema } = {};
  new Function("require", "exports", javascript)(createRequire(import.meta.url), exports);
  if (!exports.Request || !exports.Response) throw new Error("Missing generated maps");
  const schemas = { Request: exports.Request, Response: exports.Response };
  for (const adapter of adapters) {
    for (const response of [
      new globalThis.Response(null, { status: 204 }),
      new globalThis.Response(null, { status: 204, headers: { "content-type": "application/json" } }),
      new globalThis.Response(null, { status: 204, headers: { "content-length": "0" } }),
    ]) {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => response);
      const result = await createClient(adapter, fetch, schemas).delete("/v1/sessions/{id}/logout", { params: { id: "s_1" } });
      expect(result).toMatchObject({ success: true, code: "204", body: undefined, raw: response });
      expect(fetch).toHaveBeenCalledOnce();
    }
  }
});

it("rejects an undeclared 201 on a 200-only route", async () => {
  for (const adapter of adapters) {
    const response = new globalThis.Response('{"id":"u_1"}', { status: 201, headers: { "content-type": "application/json" } });
    const fetch = vi.fn<typeof globalThis.fetch>(async () => response);
    const result = await createClient(adapter, fetch, {
      Request: { "/v1/users": { GET: {} } },
      Response: { "/v1/users": { GET: { "200": z.object({ id: z.string() }) } } },
    }).get("/v1/users", {});
    expect(result).toMatchObject({ success: false, code: 201, raw: response,
      error: { name: "UnexpectedApiClientError", code: 201 } });
    expect(fetch).toHaveBeenCalledOnce();
  }
});

it("keeps transport secrets out of errors and structured and debug logs", async () => {
  const debug: { enable(value: string): void; disable(): string } = createRequire(
    new URL("../../http-client-core/package.json", import.meta.url),
  )("debug");
  const previous = debug.disable();
  debug.enable("alt-stack:http-client:*");
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const secret = "SENTINEL_TRANSPORT_SECRET";
  try {
    for (const adapter of adapters) {
      for (const name of [`Transport${secret}`, "AbortError", "TimeoutError"]) {
        const transportError = Object.assign(new Error(`https://api.example.test/?token=${secret}`), {
          name, code: secret, detail: secret,
          toJSON: () => ({ message: secret }),
        });
        const fetch = vi.fn<typeof globalThis.fetch>(async () => { throw transportError; });
        const log = vi.fn();
        const client = createClient(adapter, fetch, {
          Request: { "/v1/users": { GET: { query: z.object({ token: z.string() }) } } },
          Response: { "/v1/users": { GET: { "200": z.string() } } },
        }, { error: log, warn: log, info: log, debug: log });
        stderr.mockClear();
        const error: unknown = await client.get("/v1/users", { query: { token: secret } }).catch((error: unknown) => error);
        expect(error).toBeInstanceOf(Error);
        if (!(error instanceof Error)) throw new Error("Expected a transport error");
        expect(error.message).toBe(name === "AbortError" || (adapter === "ky" && name === "TimeoutError")
          ? "Request timeout after 0ms"
          : "Network request failed");
        expect(error).toMatchObject({ cause: undefined, endpoint: undefined });
        for (const rendered of [error.message, String(error), JSON.stringify(error), JSON.stringify(log.mock.calls), JSON.stringify(stderr.mock.calls)]) {
          expect(rendered).not.toContain(secret);
        }
        expect(log).toHaveBeenCalled();
        expect(stderr).toHaveBeenCalled();
      }
    }
  } finally {
    stderr.mockRestore();
    debug.enable(previous);
  }
});
