import SwaggerParser from "@apidevtools/swagger-parser";
import * as OpenApiGenerator from "@effect/openapi-generator/OpenApiGenerator";
import { Data, Effect, Predicate } from "effect";
import type { OpenAPISpec } from "effect/unstable/httpapi/OpenApi";

export class OpenApiGenerationError extends Data.TaggedError("OpenApiGenerationError")<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

/** Generate a native Effect v4 `Api` contract from a self-contained OpenAPI 3 document. */
export const openApiToEffectTsCode = ({ document }: {
  readonly document: unknown;
}): Effect.Effect<string, OpenApiGenerationError> => Effect.gen(function* () {
  if (!Predicate.isObject(document) || Array.isArray(document) || typeof document.openapi !== "string" ||
    !/^3\.(0|1)\.\d+$/.test(document.openapi)) {
    return yield* Effect.fail(new OpenApiGenerationError({
      message: "Expected an OpenAPI 3.0 or 3.1 document object",
    }));
  }

  const validated = yield* Effect.tryPromise({
    try: async () => {
      const original = structuredClone(document);
      // The validator dereferences its input. Validate a separate copy so the
      // emitter retains named component references and the caller is never mutated.
      await SwaggerParser.validate(structuredClone(original) as SwaggerParser["api"], {
        resolve: { external: false },
      });
      // Upstream's input type models its own OpenAPI 3.1 output (with required
      // tags/security/components), although its emitter accepts OpenAPI 3.0 too.
      return original as unknown as OpenAPISpec;
    },
    catch: (cause) => new OpenApiGenerationError({
      message: `Invalid OpenAPI document: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    }),
  });

  const generator = yield* OpenApiGenerator.make;
  const warnings: OpenApiGenerator.OpenApiGeneratorWarning[] = [];
  const source = yield* generator.generate(validated, {
    name: "Api",
    format: "httpapi",
    onWarning: (warning) => warnings.push(warning),
  }).pipe(
    // Upstream throws for unsupported schema constructs. Contain that behavior
    // at the emitter boundary without changing interruption semantics.
    Effect.catchDefect((cause) => Effect.fail(new OpenApiGenerationError({
      message: `OpenAPI generation failed: ${cause instanceof Error ? cause.message : String(cause)}`,
      cause,
    }))),
  );
  if (warnings.length > 0) {
    return yield* Effect.fail(new OpenApiGenerationError({
      message: warnings.map((warning) =>
        `[${warning.code}] ${warning.method?.toUpperCase() ?? ""} ${warning.path ?? ""}: ${warning.message}`
      ).join("\n"),
    }));
  }
  return `// Generated from OpenAPI. Do not edit.\n${source}\n`;
});
