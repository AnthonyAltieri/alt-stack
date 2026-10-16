import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
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
