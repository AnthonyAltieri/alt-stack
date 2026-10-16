import { describe, expect, it } from "vitest";
import { z } from "zod";
import { convertSchemaToZodString } from "./to-zod";
import { schemaToTypeString } from "./interface-generator";
import type { AnySchema } from "./types/types";

function schemaFrom(schema: AnySchema): z.ZodType {
  return new Function("z", `return ${convertSchemaToZodString(schema)}`)(z);
}

describe("OpenAPI fidelity", () => {
  it("restricts an empty schema to JSON values", () => {
    const schema = schemaFrom({});
    expect(schemaToTypeString({})).toBe("z.core.util.JSONType");
    for (const value of [null, 1, "value", true, [null, { key: false }], {}]) {
      expect(schema.parse(value)).toEqual(value);
    }
    for (const value of [undefined, { key: undefined }, () => 1, 1n, new Date(0), NaN]) {
      expect(schema.safeParse(value).success).toBe(false);
    }
  });

  it("accepts RFC 3339 timestamp offsets", () => {
    const schema = schemaFrom({ type: "string", format: "date-time" });
    for (const value of ["2025-01-02T03:04:05Z", "2025-01-02T03:04:05+00:00", "2025-01-02T03:04:05-05:30"]) {
      expect(schema.parse(value)).toBe(value);
    }
    expect(schema.safeParse("2025-01-02T03:04:05").success).toBe(false);
  });

  it("enforces numeric exclusive bounds alongside inclusive bounds", () => {
    for (const type of ["number", "integer"]) {
      const schema = schemaFrom({ type, minimum: -1, maximum: 11, exclusiveMinimum: 0, exclusiveMaximum: 10 });
      expect(schema.parse(5)).toBe(5);
      for (const value of [0, 10, -1, 11]) expect(schema.safeParse(value).success).toBe(false);
    }
  });

  it("preserves open-object extra keys and rejects strict-object extra keys", () => {
    const base = { type: "object", properties: { name: { type: "string" } }, required: ["name"] };
    const value = { name: "Ada", extra: { enabled: true } };
    for (const schema of [base, { ...base, additionalProperties: true }]) {
      expect(schemaFrom(schema).parse(value)).toEqual(value);
      expect(schemaToTypeString(schema)).toContain("[key: string]: unknown");
    }
    expect(schemaFrom({ ...base, additionalProperties: false }).safeParse(value).success).toBe(false);
    const typed = schemaFrom({ ...base, additionalProperties: { type: "number" } });
    expect(typed.parse({ name: "Ada", score: 5 })).toEqual({ name: "Ada", score: 5 });
    expect(typed.safeParse({ name: "Ada", score: "invalid" }).success).toBe(false);
  });
});
