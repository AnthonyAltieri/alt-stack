import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import {
  registerZodSchemaToOpenApiSchema,
  getSchemaExportedVariableNameForStringFormat,
  clearZodSchemaToOpenApiSchemaRegistry,
  schemaRegistry,
} from "./registry";

describe("ZodSchemaRegistry", () => {
  beforeEach(() => {
    clearZodSchemaToOpenApiSchemaRegistry();
  });

  describe("registerZodSchemaToOpenApiSchema", () => {
    describe("string format registration", () => {
      it("should register schema with single string format", () => {
        const schema = z.string().email();
        registerZodSchemaToOpenApiSchema(schema, {
          schemaExportedVariableName: "emailSchema",
          type: "string",
          format: "email",
        });

        const result = getSchemaExportedVariableNameForStringFormat("email");
        expect(result).toBe("emailSchema");
      });

      it("should register schema with multiple string formats", () => {
        const schema = z.string();
        registerZodSchemaToOpenApiSchema(schema, {
          schemaExportedVariableName: "dateSchema",
          type: "string",
          formats: ["date", "iso-date"],
        });

        expect(getSchemaExportedVariableNameForStringFormat("date")).toBe(
          "dateSchema",
        );
        expect(getSchemaExportedVariableNameForStringFormat("iso-date")).toBe(
          "dateSchema",
        );
      });

      it("should throw error when registering duplicate format", () => {
        const schema1 = z.string().email();
        const schema2 = z.string().email();

        registerZodSchemaToOpenApiSchema(schema1, {
          schemaExportedVariableName: "emailSchema1",
          type: "string",
          format: "email",
        });

        expect(() => {
          registerZodSchemaToOpenApiSchema(schema2, {
            schemaExportedVariableName: "emailSchema2",
            type: "string",
            format: "email",
          });
        }).toThrow("duplicate Zod OpenAPI registration");
      });

      it("should allow same schema to be registered multiple times", () => {
        const schema = z.string().email();
        registerZodSchemaToOpenApiSchema(schema, {
          schemaExportedVariableName: "emailSchema",
          type: "string",
          format: "email",
        });

        expect(() => {
          registerZodSchemaToOpenApiSchema(schema, {
            schemaExportedVariableName: "emailSchema",
            type: "string",
            format: "email",
          });
        }).not.toThrow();
      });
    });

    describe("primitive type registration", () => {
      it("should register number schema", () => {
        const schema = z.number();
        registerZodSchemaToOpenApiSchema(schema, {
          schemaExportedVariableName: "numberSchema",
          type: "number",
        });

        expect(schemaRegistry.isRegistered(schema)).toBe(true);
      });

      it("should register integer schema", () => {
        const schema = z.number().int();
        registerZodSchemaToOpenApiSchema(schema, {
          schemaExportedVariableName: "integerSchema",
          type: "integer",
        });

        expect(schemaRegistry.isRegistered(schema)).toBe(true);
      });

      it("should register boolean schema", () => {
        const schema = z.boolean();
        registerZodSchemaToOpenApiSchema(schema, {
          schemaExportedVariableName: "booleanSchema",
          type: "boolean",
        });

        expect(schemaRegistry.isRegistered(schema)).toBe(true);
      });
    });

    describe("multiple registrations", () => {
      it("should register multiple schemas with different formats", () => {
        const emailSchema = z.string().email();
        const uuidSchema = z.string().uuid();
        const dateSchema = z.string();

        registerZodSchemaToOpenApiSchema(emailSchema, {
          schemaExportedVariableName: "emailSchema",
          type: "string",
          format: "email",
        });

        registerZodSchemaToOpenApiSchema(uuidSchema, {
          schemaExportedVariableName: "uuidSchema",
          type: "string",
          format: "uuid",
        });

        registerZodSchemaToOpenApiSchema(dateSchema, {
          schemaExportedVariableName: "dateSchema",
          type: "string",
          formats: ["date", "date-time"],
        });

        expect(getSchemaExportedVariableNameForStringFormat("email")).toBe(
          "emailSchema",
        );
        expect(getSchemaExportedVariableNameForStringFormat("uuid")).toBe(
          "uuidSchema",
        );
        expect(getSchemaExportedVariableNameForStringFormat("date")).toBe(
          "dateSchema",
        );
        expect(getSchemaExportedVariableNameForStringFormat("date-time")).toBe(
          "dateSchema",
        );
      });
    });
  });

  describe("getSchemaExportedVariableNameForStringFormat", () => {
    it("should return undefined for unregistered format", () => {
      const result = getSchemaExportedVariableNameForStringFormat("email");
      expect(result).toBeUndefined();
    });

    it("should return variable name for registered single format", () => {
      const schema = z.string().email();
      registerZodSchemaToOpenApiSchema(schema, {
        schemaExportedVariableName: "customEmail",
        type: "string",
        format: "email",
      });

      const result = getSchemaExportedVariableNameForStringFormat("email");
      expect(result).toBe("customEmail");
    });

    it("should return variable name for registered format in formats array", () => {
      const schema = z.string();
      registerZodSchemaToOpenApiSchema(schema, {
        schemaExportedVariableName: "customDate",
        type: "string",
        formats: ["date", "iso-date"],
      });

      expect(getSchemaExportedVariableNameForStringFormat("date")).toBe(
        "customDate",
      );
      expect(getSchemaExportedVariableNameForStringFormat("iso-date")).toBe(
        "customDate",
      );
    });

    it("should not return variable name for unregistered format in same schema", () => {
      const schema = z.string();
      registerZodSchemaToOpenApiSchema(schema, {
        schemaExportedVariableName: "customDate",
        type: "string",
        formats: ["date"],
      });

      const result = getSchemaExportedVariableNameForStringFormat("email");
      expect(result).toBeUndefined();
    });
  });

  describe("schemaRegistry methods", () => {
    describe("getOpenApiSchema", () => {
      it("should return registration for registered schema", () => {
        const schema = z.string().email();
        const registration = {
          schemaExportedVariableName: "emailSchema",
          type: "string" as const,
          format: "email" as const,
        };

        registerZodSchemaToOpenApiSchema(schema, registration);
        const result = schemaRegistry.getOpenApiSchema(schema);

        expect(result).toEqual(registration);
      });

      it("should return undefined for unregistered schema", () => {
        const schema = z.string();
        const result = schemaRegistry.getOpenApiSchema(schema);
        expect(result).toBeUndefined();
      });
    });

    describe("isRegistered", () => {
      it("should return true for registered schema", () => {
        const schema = z.string().email();
        registerZodSchemaToOpenApiSchema(schema, {
          schemaExportedVariableName: "emailSchema",
          type: "string",
          format: "email",
        });

        expect(schemaRegistry.isRegistered(schema)).toBe(true);
      });

      it("should return false for unregistered schema", () => {
        const schema = z.string();
        expect(schemaRegistry.isRegistered(schema)).toBe(false);
      });
    });

    describe("clear", () => {
      it("should clear all registered schemas", () => {
        const schema = z.string().email();
        registerZodSchemaToOpenApiSchema(schema, {
          schemaExportedVariableName: "emailSchema",
          type: "string",
          format: "email",
        });

        expect(schemaRegistry.isRegistered(schema)).toBe(true);

        clearZodSchemaToOpenApiSchemaRegistry();

        expect(schemaRegistry.isRegistered(schema)).toBe(false);
        expect(
          getSchemaExportedVariableNameForStringFormat("email"),
        ).toBeUndefined();
      });
    });
  });

  describe("edge cases", () => {
    it("should handle registration with description", () => {
      const schema = z.string().email();
      registerZodSchemaToOpenApiSchema(schema, {
        schemaExportedVariableName: "emailSchema",
        type: "string",
        format: "email",
        description: "Custom email schema",
      });

      const result = schemaRegistry.getOpenApiSchema(schema);
      expect(result?.description).toBe("Custom email schema");
    });

    it("should handle all supported string formats", () => {
      const formats = [
        "color-hex",
        "date",
        "date-time",
        "email",
        "iso-date",
        "iso-date-time",
        "objectid",
        "uri",
        "url",
        "uuid",
      ];

      for (const format of formats) {
        const schema = z.string();
        registerZodSchemaToOpenApiSchema(schema, {
          schemaExportedVariableName: `${format}Schema`,
          type: "string",
          format: format as any,
        });

        const result = getSchemaExportedVariableNameForStringFormat(
          format as any,
        );
        expect(result).toBe(`${format}Schema`);

        clearZodSchemaToOpenApiSchemaRegistry();
      }
    });
  });
});
