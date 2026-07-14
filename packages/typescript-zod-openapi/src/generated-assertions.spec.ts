import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as ts from "typescript";
import { openApiToZodTsCode } from "./to-typescript";

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

describe("generated schema/type assertions", () => {
  it("compiles top-level and nested optional outputs with exact optional property types", () => {
    const code = openApiToZodTsCode(optionalPropertyFixture);

    expect(code).toContain("topLevel?: string | undefined;");
    expect(code).toContain("nested: { inner?: number | undefined };");
    expect(formatDiagnostics(compileGeneratedCode(code))).toBe("");
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
