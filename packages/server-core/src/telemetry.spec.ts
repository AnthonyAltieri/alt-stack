import { describe, it, expect } from "vitest";
import {
  resolveTelemetryConfig,
  shouldIgnoreRoute,
} from "./telemetry.js";

describe("telemetry", () => {
  describe("resolveTelemetryConfig", () => {
    it("should return disabled config for undefined", () => {
      const config = resolveTelemetryConfig(undefined);
      expect(config).toEqual({
        enabled: false,
        serviceName: "altstack-server",
        ignoreRoutes: [],
      });
    });

    it("should return disabled config for false", () => {
      const config = resolveTelemetryConfig(false);
      expect(config).toEqual({
        enabled: false,
        serviceName: "altstack-server",
        ignoreRoutes: [],
      });
    });

    it("should return enabled config with defaults for true", () => {
      const config = resolveTelemetryConfig(true);
      expect(config).toEqual({
        enabled: true,
        serviceName: "altstack-server",
        ignoreRoutes: [],
      });
    });

    it("should use custom serviceName from config object", () => {
      const config = resolveTelemetryConfig({
        enabled: true,
        serviceName: "my-api",
      });
      expect(config).toEqual({
        enabled: true,
        serviceName: "my-api",
        ignoreRoutes: [],
      });
    });

    it("should use custom ignoreRoutes from config object", () => {
      const config = resolveTelemetryConfig({
        enabled: true,
        ignoreRoutes: ["/health", "/metrics"],
      });
      expect(config).toEqual({
        enabled: true,
        serviceName: "altstack-server",
        ignoreRoutes: ["/health", "/metrics"],
      });
    });

    it("should handle disabled config object", () => {
      const config = resolveTelemetryConfig({
        enabled: false,
        serviceName: "my-api",
      });
      expect(config).toEqual({
        enabled: false,
        serviceName: "my-api",
        ignoreRoutes: [],
      });
    });
  });

  describe("shouldIgnoreRoute", () => {
    const config = {
      enabled: true,
      serviceName: "test",
      ignoreRoutes: ["/health", "/metrics", "/internal/status"],
    };

    it("should return true for exact match", () => {
      expect(shouldIgnoreRoute("/health", config)).toBe(true);
      expect(shouldIgnoreRoute("/metrics", config)).toBe(true);
    });

    it("should return true for sub-paths", () => {
      expect(shouldIgnoreRoute("/health/ready", config)).toBe(true);
      expect(shouldIgnoreRoute("/metrics/prometheus", config)).toBe(true);
      expect(shouldIgnoreRoute("/internal/status/db", config)).toBe(true);
    });

    it("should return false for non-matching routes", () => {
      expect(shouldIgnoreRoute("/api/users", config)).toBe(false);
      expect(shouldIgnoreRoute("/todos", config)).toBe(false);
    });

    it("should return false for partial prefix matches", () => {
      // /healthy should not match /health
      expect(shouldIgnoreRoute("/healthy", config)).toBe(false);
      expect(shouldIgnoreRoute("/metrics-export", config)).toBe(false);
    });

    it("should return false when ignoreRoutes is empty", () => {
      const emptyConfig = { enabled: true, serviceName: "test", ignoreRoutes: [] };
      expect(shouldIgnoreRoute("/health", emptyConfig)).toBe(false);
    });
  });
});

