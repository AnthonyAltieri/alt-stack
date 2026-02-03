import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import * as ts from "typescript";
import { openApiToZodTsCode } from "./to-typescript";
import type { AnySchema } from "./types/types";

function loadMasterOpenApiSpec(): AnySchema {
  const specUrl = new URL("../../openapi-test-spec/openapi.json", import.meta.url);
  return JSON.parse(readFileSync(specUrl, "utf8")) as AnySchema;
}

function stripExamples(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.map(stripExamples);
  }

  const obj = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(obj)) {
    if (key === "x-altstack-examples") continue;
    result[key] = stripExamples(child);
  }
  return result;
}

type GeneratedModule = Record<string, unknown> & {
  Request?: Record<string, unknown>;
  Response?: Record<string, unknown>;
};

async function loadGeneratedModule(tsCode: string): Promise<{
  module: GeneratedModule;
  tmpDir: string;
}> {
  const tmpDir = mkdtempSync(
    fileURLToPath(new URL("../.vitest-generated-", import.meta.url)),
  );

  const jsCode = ts.transpileModule(tsCode, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;

  const entryPath = `${tmpDir}/generated.mjs`;
  writeFileSync(entryPath, jsCode, "utf8");

  // Cache-bust so local dev reruns always import the latest generated file
  const module = (await import(
    `${pathToFileURL(entryPath).href}?t=${Date.now()}`
  )) as GeneratedModule;

  return { module, tmpDir };
}

type OpenApiMeta = { format?: string; pattern?: string };

function getOpenApiMeta(schema: z.ZodTypeAny): OpenApiMeta | undefined {
  const meta = schema.meta();
  const openapi = (meta as { openapi?: unknown } | undefined)?.openapi;
  if (!openapi || typeof openapi !== "object") return undefined;

  const result: OpenApiMeta = {};
  const openapiObj = openapi as Record<string, unknown>;
  if (typeof openapiObj["format"] === "string") {
    result.format = openapiObj["format"];
  }
  if (typeof openapiObj["pattern"] === "string") {
    result.pattern = openapiObj["pattern"];
  }

  return Object.keys(result).length > 0 ? result : undefined;
}

function unwrapOptionalNullable(schema: z.ZodTypeAny): {
  schema: z.ZodTypeAny;
  optional: boolean;
  nullable: boolean;
  meta?: OpenApiMeta;
} {
  let current = schema;
  let optional = false;
  let nullable = false;
  let meta: OpenApiMeta | undefined = getOpenApiMeta(current);

  while (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
    if (!meta) meta = getOpenApiMeta(current);
    if (current instanceof z.ZodOptional) {
      optional = true;
      current = current._def.innerType as z.ZodTypeAny;
      continue;
    }
    if (current instanceof z.ZodNullable) {
      nullable = true;
      current = current._def.innerType as z.ZodTypeAny;
    }
  }

  if (!meta) meta = getOpenApiMeta(current);

  return { schema: current, optional, nullable, meta };
}

function getCheckDef(check: unknown): unknown {
  if (!check || typeof check !== "object") return undefined;
  return (
    (check as any)._zod?.def ??
    (check as any).def
  );
}

function zodToOpenApiSchema(
  zodSchema: z.ZodTypeAny,
  ctx: {
    schemaToComponentName: Map<z.ZodTypeAny, string>;
    componentNameToSchema: Map<string, z.ZodTypeAny>;
  },
  options?: { selfComponentName?: string },
): AnySchema {
  const unwrapped = unwrapOptionalNullable(zodSchema);
  const schema = unwrapped.schema;

  const refName = ctx.schemaToComponentName.get(schema);
  if (refName && refName !== options?.selfComponentName) {
    const ref: AnySchema = { $ref: `#/components/schemas/${refName}` };
    if (unwrapped.nullable) ref.nullable = true;
    return ref;
  }

  let result: AnySchema;

  if (schema instanceof z.ZodEnum) {
    result = { type: "string", enum: schema.options };
  } else if (schema instanceof z.ZodString) {
    const meta = unwrapped.meta;
    const checks = (schema._def as any).checks as unknown[] | undefined;

    const openapi: AnySchema = { type: "string" };

    let minLength: number | undefined;
    let maxLength: number | undefined;
    let inferredFormat: string | undefined;
    const regexChecks: RegExp[] = [];

    for (const check of checks ?? []) {
      const def = getCheckDef(check) as any;
      if (!def || typeof def !== "object") continue;

      if (def.check === "min_length" && typeof def.minimum === "number") {
        minLength = def.minimum;
      } else if (def.check === "max_length" && typeof def.maximum === "number") {
        maxLength = def.maximum;
      } else if (def.check === "string_format") {
        if (typeof def.format === "string" && def.format !== "regex") {
          inferredFormat = def.format;
        }
        if (def.format === "regex" && def.pattern instanceof RegExp) {
          regexChecks.push(def.pattern);
        }
      }
    }

    if (typeof meta?.format === "string") {
      openapi.format = meta.format;
    } else if (typeof inferredFormat === "string") {
      openapi.format = inferredFormat;
    }

    if (typeof minLength === "number") openapi.minLength = minLength;
    if (typeof maxLength === "number") openapi.maxLength = maxLength;

    if (typeof meta?.pattern === "string") {
      openapi.pattern = meta.pattern;
    } else if (!openapi.format && regexChecks.length === 1) {
      openapi.pattern = regexChecks[0]!.source;
    }

    result = openapi;
  } else if (schema instanceof z.ZodNumber) {
    const checks = (schema._def as any).checks as unknown[] | undefined;
    let minimum: number | undefined;
    let maximum: number | undefined;
    let isInt = false;

    for (const check of checks ?? []) {
      const def = getCheckDef(check) as any;
      if (!def || typeof def !== "object") continue;

      if (def.check === "greater_than" && typeof def.value === "number") {
        if (def.inclusive === true) minimum = def.value;
      } else if (def.check === "less_than" && typeof def.value === "number") {
        if (def.inclusive === true) maximum = def.value;
      } else if (def.check === "number_format") {
        // `.int()` currently yields a "safeint" format in Zod v4
        if (def.format === "safeint" || def.format === "int") {
          isInt = true;
        }
      }
      if ((check as any).isInt === true) {
        isInt = true;
      }
    }

    result = { type: isInt ? "integer" : "number" };
    if (typeof minimum === "number") result.minimum = minimum;
    if (typeof maximum === "number") result.maximum = maximum;
  } else if (schema instanceof z.ZodBoolean) {
    result = { type: "boolean" };
  } else if (schema instanceof z.ZodArray) {
    const element = (schema._def as any).element as z.ZodTypeAny;
    const checks = (schema._def as any).checks as unknown[] | undefined;

    let minItems: number | undefined;
    let maxItems: number | undefined;

    for (const check of checks ?? []) {
      const def = getCheckDef(check) as any;
      if (!def || typeof def !== "object") continue;

      if (def.check === "min_length" && typeof def.minimum === "number") {
        minItems = def.minimum;
      } else if (def.check === "max_length" && typeof def.maximum === "number") {
        maxItems = def.maximum;
      }
    }

    result = {
      type: "array",
      items: zodToOpenApiSchema(element, ctx),
      ...(typeof minItems === "number" ? { minItems } : {}),
      ...(typeof maxItems === "number" ? { maxItems } : {}),
    };
  } else if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;

    const properties: Record<string, AnySchema> = {};
    const required: string[] = [];

    for (const [key, valueSchema] of Object.entries(shape)) {
      const u = unwrapOptionalNullable(valueSchema);
      if (!u.optional) required.push(key);
      properties[key] = zodToOpenApiSchema(
        u.schema,
        ctx,
        options,
      );
      if (u.nullable) {
        properties[key] = { ...properties[key], nullable: true };
      }
    }

    const isStrict =
      (schema as any)._def?.catchall instanceof z.ZodNever;

    result = {
      type: "object",
      ...(Object.keys(properties).length > 0 ? { properties } : {}),
      ...(required.length > 0 ? { required } : {}),
      ...(isStrict ? { additionalProperties: false } : {}),
    };
  } else if (schema instanceof z.ZodRecord) {
    const valueType = (schema._def as any).valueType as z.ZodTypeAny;
    if (valueType instanceof z.ZodUnknown) {
      result = { type: "object" };
    } else {
      result = {
        type: "object",
        additionalProperties: zodToOpenApiSchema(valueType, ctx),
      };
    }
  } else if (schema instanceof z.ZodUnion) {
    const unionOptions = (schema._def as any).options as z.ZodTypeAny[];
    const oneOf = unionOptions.map((opt) => zodToOpenApiSchema(opt, ctx, options));

    const discriminatorCandidates: string[] = [];
    for (const opt of unionOptions) {
      const optSchema = unwrapOptionalNullable(opt).schema;
      const optComponentName = ctx.schemaToComponentName.get(optSchema);
      const resolvedOptSchema = optComponentName
        ? ctx.componentNameToSchema.get(optComponentName)
        : optSchema;
      if (!(resolvedOptSchema instanceof z.ZodObject)) {
        discriminatorCandidates.length = 0;
        break;
      }

      const shape = resolvedOptSchema.shape as Record<string, z.ZodTypeAny>;
      const literals = Object.entries(shape)
        .map(([key, prop]) => ({ key, prop: unwrapOptionalNullable(prop) }))
        .filter(({ prop }) => !prop.optional)
        .filter(({ prop }) => prop.schema instanceof z.ZodEnum)
        .filter(({ prop }) => (prop.schema as z.ZodEnum<[string, ...string[]]>).options.length === 1)
        .map(({ key }) => key);

      if (discriminatorCandidates.length === 0) {
        discriminatorCandidates.push(...literals);
      } else {
        for (let i = discriminatorCandidates.length - 1; i >= 0; i--) {
          if (!literals.includes(discriminatorCandidates[i]!)) {
            discriminatorCandidates.splice(i, 1);
          }
        }
      }
    }

    const discriminatorKey =
      discriminatorCandidates.length === 1 ? discriminatorCandidates[0] : undefined;

    if (discriminatorKey) {
      const mapping: Record<string, string> = {};
      let allRefs = true;

      for (const opt of unionOptions) {
        const optSchema = unwrapOptionalNullable(opt).schema;
        const optName = ctx.schemaToComponentName.get(optSchema);
        if (!optName) {
          allRefs = false;
          break;
        }

        const resolvedOptSchema = ctx.componentNameToSchema.get(optName);
        if (!(resolvedOptSchema instanceof z.ZodObject)) {
          allRefs = false;
          break;
        }

        const shape = resolvedOptSchema.shape as Record<string, z.ZodTypeAny>;
        const prop = unwrapOptionalNullable(shape[discriminatorKey]!);
        if (!(prop.schema instanceof z.ZodEnum)) {
          allRefs = false;
          break;
        }
        const value = (prop.schema as z.ZodEnum<[string, ...string[]]>).options[0]!;
        mapping[value] = `#/components/schemas/${optName}`;
      }

      result = allRefs
        ? { oneOf, discriminator: { propertyName: discriminatorKey, mapping } }
        : { oneOf };
    } else {
      result = { oneOf };
    }
  } else if (schema instanceof z.ZodIntersection) {
    const parts: z.ZodTypeAny[] = [];
    const stack: z.ZodTypeAny[] = [schema];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current instanceof z.ZodIntersection) {
        stack.push((current._def as any).right as z.ZodTypeAny);
        stack.push((current._def as any).left as z.ZodTypeAny);
      } else {
        parts.push(current);
      }
    }

    result = {
      allOf: parts.map((p) => zodToOpenApiSchema(p, ctx, options)),
    };
  } else {
    throw new Error(`Unsupported Zod schema in roundtrip: ${schema._def?.type ?? schema.type}`);
  }

  if (unwrapped.nullable) {
    result = { ...result, nullable: true };
  }

  return result;
}

describe("master OpenAPI fixture", () => {
  let openapi: AnySchema;
  let openapiNoExamples: AnySchema;
  let tsCode: string;
  let generated: GeneratedModule;
  let tmpDir: string;

  beforeAll(async () => {
    openapi = loadMasterOpenApiSpec();
    openapiNoExamples = stripExamples(openapi) as AnySchema;

    tsCode = openApiToZodTsCode(openapi, undefined, { includeRoutes: true });
    const loaded = await loadGeneratedModule(tsCode);
    generated = loaded.module;
    tmpDir = loaded.tmpDir;
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("snapshots full generated TypeScript output", () => {
    expect(tsCode).toMatchSnapshot();
  });

  it("executes generated code and validates fixture examples", () => {
    const schemas = (openapi.components?.schemas ?? {}) as Record<
      string,
      AnySchema
    >;

    for (const [name, schema] of Object.entries(schemas)) {
      const zodSchema = generated[`${name}Schema`] as z.ZodTypeAny | undefined;
      expect(zodSchema).toBeTruthy();

      const examples = schema["x-altstack-examples"] as
        | { valid?: unknown[]; invalid?: unknown[] }
        | undefined;

      if (examples?.valid) {
        for (const [index, value] of examples.valid.entries()) {
          const result = zodSchema!.safeParse(value);
          if (!result.success) {
            throw new Error(
              [
                `Expected example to be valid but it failed validation`,
                `schema: ${name}`,
                `exampleIndex: ${index}`,
                `value: ${JSON.stringify(value)}`,
                `issues: ${JSON.stringify(result.error.issues)}`,
              ].join("\n"),
            );
          }
        }
      }

      if (examples?.invalid) {
        for (const [index, value] of examples.invalid.entries()) {
          const result = zodSchema!.safeParse(value);
          if (result.success) {
            throw new Error(
              [
                `Expected example to be invalid but it validated successfully`,
                `schema: ${name}`,
                `exampleIndex: ${index}`,
                `value: ${JSON.stringify(value)}`,
              ].join("\n"),
            );
          }
        }
      }
    }
  });

  it("regenerates an exact OpenAPI replica (minus examples)", () => {
    const expected = openapiNoExamples;
    const actual = structuredClone(expected) as AnySchema;

    const schemaToComponentName = new Map<z.ZodTypeAny, string>();
    const componentNameToSchema = new Map<string, z.ZodTypeAny>();

    const componentSchemas = (expected.components?.schemas ?? {}) as Record<
      string,
      AnySchema
    >;
    for (const name of Object.keys(componentSchemas)) {
      const zodSchema = generated[`${name}Schema`] as z.ZodTypeAny | undefined;
      expect(zodSchema).toBeTruthy();
      componentNameToSchema.set(name, zodSchema!);
      schemaToComponentName.set(zodSchema!, name);
    }

    // Regenerate all component schemas
    for (const name of Object.keys(componentSchemas)) {
      (actual.components!.schemas as Record<string, AnySchema>)[name] =
        zodToOpenApiSchema(componentNameToSchema.get(name)!, {
          schemaToComponentName,
          componentNameToSchema,
        }, { selfComponentName: name });
    }

    // Regenerate all inline/path schemas (params/query/headers/body/responses)
    const requestByPath = (generated.Request ?? {}) as any;
    const responseByPath = (generated.Response ?? {}) as any;

    for (const [path, pathItem] of Object.entries(
      (actual.paths ?? {}) as Record<string, AnySchema>,
    )) {
      for (const [method, operation] of Object.entries(pathItem)) {
        if (!operation || typeof operation !== "object") continue;
        if (!["get", "post", "put", "patch", "delete", "head", "options"].includes(method)) {
          continue;
        }

        const op = operation as AnySchema;
        const methodUpper = method.toUpperCase();
        const request = requestByPath?.[path]?.[methodUpper];
        const response = responseByPath?.[path]?.[methodUpper];

        if (Array.isArray(op["parameters"])) {
          for (const param of op["parameters"]) {
            if (!param || typeof param !== "object") continue;
            const paramObj = param as AnySchema;
            const location = paramObj["in"];
            const paramName = String(paramObj["name"] ?? "");

            const containerName =
              location === "path"
                ? "params"
                : location === "query"
                  ? "query"
                  : location === "header"
                    ? "headers"
                    : undefined;

            if (!containerName) continue;
            const container = request?.[containerName] as z.ZodTypeAny | undefined;
            if (!(container instanceof z.ZodObject)) continue;

            const shape = container.shape as Record<string, z.ZodTypeAny>;
            const prop = shape[paramName];
            if (!prop) continue;

            const u = unwrapOptionalNullable(prop);
            paramObj["schema"] = zodToOpenApiSchema(u.schema, {
              schemaToComponentName,
              componentNameToSchema,
            });
            if (u.nullable) {
              paramObj["schema"] = { ...paramObj["schema"], nullable: true };
            }
          }
        }

        if (op["requestBody"]) {
          const bodySchema = request?.["body"] as z.ZodTypeAny | undefined;
          const rb = op["requestBody"] as AnySchema;
          const json = rb?.["content"]?.["application/json"] as AnySchema | undefined;
          if (bodySchema && json && typeof json === "object") {
            json["schema"] = zodToOpenApiSchema(bodySchema, {
              schemaToComponentName,
              componentNameToSchema,
            });
          }
        }

        if (op["responses"] && typeof op["responses"] === "object") {
          for (const [statusCode, resp] of Object.entries(op["responses"])) {
            if (!resp || typeof resp !== "object") continue;
            const respObj = resp as AnySchema;
            const json = respObj?.["content"]?.["application/json"] as AnySchema | undefined;
            const respSchema = response?.[statusCode] as z.ZodTypeAny | undefined;
            if (respSchema && json && typeof json === "object") {
              json["schema"] = zodToOpenApiSchema(respSchema, {
                schemaToComponentName,
                componentNameToSchema,
              });
            }
          }
        }
      }
    }

    expect(actual).toEqual(expected);
  });
});
