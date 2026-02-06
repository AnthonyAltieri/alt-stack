import { describe, it, expect } from "vitest";
import {
  extractSchemaDependencies,
  topologicalSortSchemas,
} from "./dependencies";
import type { AnySchema } from "./types/types";

describe("extractSchemaDependencies", () => {
  describe("basic $ref extraction", () => {
    it("should extract single $ref dependency", () => {
      const schema: AnySchema = {
        $ref: "#/components/schemas/User",
      };

      const result = extractSchemaDependencies(schema);
      expect(result).toEqual(["User"]);
    });

    it("should extract multiple $ref dependencies", () => {
      const schema: AnySchema = {
        type: "object",
        properties: {
          user: { $ref: "#/components/schemas/User" },
          profile: { $ref: "#/components/schemas/Profile" },
        },
      };

      const result = extractSchemaDependencies(schema);
      expect(result.sort()).toEqual(["Profile", "User"]);
    });

    it("should handle $ref with URL encoding", () => {
      const schema: AnySchema = {
        $ref: "#/components/schemas/User%20Profile",
      };

      const result = extractSchemaDependencies(schema);
      expect(result).toEqual(["User Profile"]);
    });
  });

  describe("nested schema dependencies", () => {
    it("should extract dependencies from nested objects", () => {
      const schema: AnySchema = {
        type: "object",
        properties: {
          user: {
            type: "object",
            properties: {
              profile: { $ref: "#/components/schemas/Profile" },
            },
          },
        },
      };

      const result = extractSchemaDependencies(schema);
      expect(result).toEqual(["Profile"]);
    });

    it("should extract dependencies from arrays", () => {
      const schema: AnySchema = {
        type: "array",
        items: {
          $ref: "#/components/schemas/User",
        },
      };

      const result = extractSchemaDependencies(schema);
      expect(result).toEqual(["User"]);
    });

    it("should extract dependencies from nested arrays", () => {
      const schema: AnySchema = {
        type: "array",
        items: {
          type: "array",
          items: {
            $ref: "#/components/schemas/User",
          },
        },
      };

      const result = extractSchemaDependencies(schema);
      expect(result).toEqual(["User"]);
    });
  });

  describe("oneOf dependencies", () => {
    it("should extract dependencies from oneOf", () => {
      const schema: AnySchema = {
        oneOf: [
          { $ref: "#/components/schemas/User" },
          { $ref: "#/components/schemas/Admin" },
        ],
      };

      const result = extractSchemaDependencies(schema);
      expect(result.sort()).toEqual(["Admin", "User"]);
    });

    it("should extract nested dependencies from oneOf", () => {
      const schema: AnySchema = {
        oneOf: [
          {
            type: "object",
            properties: {
              user: { $ref: "#/components/schemas/User" },
            },
          },
        ],
      };

      const result = extractSchemaDependencies(schema);
      expect(result).toEqual(["User"]);
    });
  });

  describe("allOf dependencies", () => {
    it("should extract dependencies from allOf", () => {
      const schema: AnySchema = {
        allOf: [
          { $ref: "#/components/schemas/Base" },
          { $ref: "#/components/schemas/Extended" },
        ],
      };

      const result = extractSchemaDependencies(schema);
      expect(result.sort()).toEqual(["Base", "Extended"]);
    });
  });

  describe("complex nested structures", () => {
    it("should extract all dependencies from complex schema", () => {
      const schema: AnySchema = {
        type: "object",
        properties: {
          users: {
            type: "array",
            items: { $ref: "#/components/schemas/User" },
          },
          metadata: {
            type: "object",
            properties: {
              creator: { $ref: "#/components/schemas/User" },
              updater: { $ref: "#/components/schemas/User" },
            },
          },
        },
      };

      const result = extractSchemaDependencies(schema);
      expect(result).toEqual(["User"]);
    });

    it("should handle duplicate dependencies", () => {
      const schema: AnySchema = {
        type: "object",
        properties: {
          user1: { $ref: "#/components/schemas/User" },
          user2: { $ref: "#/components/schemas/User" },
        },
      };

      const result = extractSchemaDependencies(schema);
      expect(result).toEqual(["User"]);
    });
  });

  describe("edge cases", () => {
    it("should handle invalid $ref format", () => {
      const schema: AnySchema = {
        $ref: "invalid-ref",
      };

      const result = extractSchemaDependencies(schema);
      expect(result).toEqual([]);
    });

    it("should handle null schema", () => {
      const result = extractSchemaDependencies(null);
      expect(result).toEqual([]);
    });

    it("should handle schema without $ref", () => {
      const schema: AnySchema = {
        type: "string",
      };

      const result = extractSchemaDependencies(schema);
      expect(result).toEqual([]);
    });

    it("should handle circular references without infinite loop", () => {
      const user: AnySchema = {
        type: "object",
        properties: {
          friend: { $ref: "#/components/schemas/User" },
        },
      };

      const result = extractSchemaDependencies(user);
      expect(result).toEqual(["User"]);
    });
  });
});

describe("topologicalSortSchemas", () => {
  describe("simple dependency ordering", () => {
    it("should sort schemas with single dependency", () => {
      const schemas: Record<string, AnySchema> = {
        User: {
          type: "object",
          properties: {
            profile: { $ref: "#/components/schemas/Profile" },
          },
        },
        Profile: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      };

      const result = topologicalSortSchemas(schemas);
      expect(result.indexOf("Profile")).toBeLessThan(result.indexOf("User"));
    });

    it("should sort schemas with multiple dependencies", () => {
      const schemas: Record<string, AnySchema> = {
        User: {
          type: "object",
          properties: {
            profile: { $ref: "#/components/schemas/Profile" },
            settings: { $ref: "#/components/schemas/Settings" },
          },
        },
        Profile: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
        Settings: {
          type: "object",
          properties: {
            theme: { type: "string" },
          },
        },
      };

      const result = topologicalSortSchemas(schemas);
      expect(result.indexOf("Profile")).toBeLessThan(result.indexOf("User"));
      expect(result.indexOf("Settings")).toBeLessThan(result.indexOf("User"));
    });

    it("should sort schemas with transitive dependencies", () => {
      const schemas: Record<string, AnySchema> = {
        A: {
          type: "object",
          properties: {
            b: { $ref: "#/components/schemas/B" },
          },
        },
        B: {
          type: "object",
          properties: {
            c: { $ref: "#/components/schemas/C" },
          },
        },
        C: {
          type: "object",
          properties: {
            value: { type: "string" },
          },
        },
      };

      const result = topologicalSortSchemas(schemas);
      expect(result.indexOf("C")).toBeLessThan(result.indexOf("B"));
      expect(result.indexOf("B")).toBeLessThan(result.indexOf("A"));
    });
  });

  describe("independent schemas", () => {
    it("should handle schemas without dependencies", () => {
      const schemas: Record<string, AnySchema> = {
        User: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
        Product: {
          type: "object",
          properties: {
            id: { type: "number" },
          },
        },
      };

      const result = topologicalSortSchemas(schemas);
      expect(result).toContain("User");
      expect(result).toContain("Product");
      expect(result.length).toBe(2);
    });

    it("should handle empty schemas object", () => {
      const schemas: Record<string, AnySchema> = {};
      const result = topologicalSortSchemas(schemas);
      expect(result).toEqual([]);
    });
  });

  describe("circular dependencies", () => {
    it("should handle circular dependencies gracefully", () => {
      const schemas: Record<string, AnySchema> = {
        A: {
          type: "object",
          properties: {
            b: { $ref: "#/components/schemas/B" },
          },
        },
        B: {
          type: "object",
          properties: {
            a: { $ref: "#/components/schemas/A" },
          },
        },
      };

      const result = topologicalSortSchemas(schemas);
      expect(result).toContain("A");
      expect(result).toContain("B");
      expect(result.length).toBe(2);
    });

    it("should handle three-way circular dependency", () => {
      const schemas: Record<string, AnySchema> = {
        A: {
          type: "object",
          properties: {
            b: { $ref: "#/components/schemas/B" },
          },
        },
        B: {
          type: "object",
          properties: {
            c: { $ref: "#/components/schemas/C" },
          },
        },
        C: {
          type: "object",
          properties: {
            a: { $ref: "#/components/schemas/A" },
          },
        },
      };

      const result = topologicalSortSchemas(schemas);
      expect(result).toContain("A");
      expect(result).toContain("B");
      expect(result).toContain("C");
      expect(result.length).toBe(3);
    });
  });

  describe("external dependencies", () => {
    it("should ignore dependencies that are not in schemas", () => {
      const schemas: Record<string, AnySchema> = {
        User: {
          type: "object",
          properties: {
            external: { $ref: "#/components/schemas/External" },
            local: { $ref: "#/components/schemas/Profile" },
          },
        },
        Profile: {
          type: "object",
          properties: {
            name: { type: "string" },
          },
        },
      };

      const result = topologicalSortSchemas(schemas);
      expect(result.indexOf("Profile")).toBeLessThan(result.indexOf("User"));
      expect(result).not.toContain("External");
    });
  });

  describe("complex scenarios", () => {
    it("should handle mixed dependency structure", () => {
      const schemas: Record<string, AnySchema> = {
        User: {
          type: "object",
          properties: {
            profile: { $ref: "#/components/schemas/Profile" },
          },
        },
        Profile: {
          type: "object",
          properties: {
            avatar: { $ref: "#/components/schemas/Image" },
          },
        },
        Image: {
          type: "object",
          properties: {
            url: { type: "string" },
          },
        },
        Product: {
          type: "object",
          properties: {
            id: { type: "number" },
          },
        },
      };

      const result = topologicalSortSchemas(schemas);
      expect(result.indexOf("Image")).toBeLessThan(result.indexOf("Profile"));
      expect(result.indexOf("Profile")).toBeLessThan(result.indexOf("User"));
      expect(result).toContain("Product");
      expect(result.length).toBe(4);
    });

    it("should preserve all schema names", () => {
      const schemas: Record<string, AnySchema> = {
        A: { type: "string" },
        B: { type: "number" },
        C: { type: "boolean" },
      };

      const result = topologicalSortSchemas(schemas);
      expect(result.sort()).toEqual(["A", "B", "C"]);
    });
  });
});

