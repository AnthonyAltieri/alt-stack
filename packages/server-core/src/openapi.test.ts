import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ok } from "@alt-stack/result";
import { generateOpenAPISpec } from "./openapi.js";
import { Router, router } from "./router.js";

describe("generateOpenAPISpec", () => {
  describe("operationId generation", () => {
    it("should generate valid TypeScript identifiers for hyphenated paths", () => {
      const baseRouter = new Router();

      const testRouter = router({
        "/v1/metrics/by-job-type": baseRouter.procedure
          .output(z.object({ data: z.string() }))
          .get(() => ok({ data: "test" })),
        "/v1/metrics/by-region": baseRouter.procedure
          .output(z.object({ data: z.string() }))
          .get(() => ok({ data: "test" })),
        "/v1/metrics/job-types-by-service": baseRouter.procedure
          .output(z.object({ data: z.string() }))
          .get(() => ok({ data: "test" })),
      });

      const spec = generateOpenAPISpec(
        { api: testRouter },
        { title: "Test API", version: "1.0.0" }
      );

      // Verify paths exist
      expect(spec.paths["/api/v1/metrics/by-job-type"]).toBeDefined();
      expect(spec.paths["/api/v1/metrics/by-region"]).toBeDefined();
      expect(spec.paths["/api/v1/metrics/job-types-by-service"]).toBeDefined();

      // Verify operationIds are valid TypeScript identifiers (no hyphens)
      const byJobTypeOp = spec.paths["/api/v1/metrics/by-job-type"]?.get;
      const byRegionOp = spec.paths["/api/v1/metrics/by-region"]?.get;
      const jobTypesByServiceOp =
        spec.paths["/api/v1/metrics/job-types-by-service"]?.get;

      expect(byJobTypeOp?.operationId).toBe("getApiV1MetricsByJobType");
      expect(byRegionOp?.operationId).toBe("getApiV1MetricsByRegion");
      expect(jobTypesByServiceOp?.operationId).toBe(
        "getApiV1MetricsJobTypesByService"
      );

      // Verify no hyphens in any operationId
      for (const [_path, pathItem] of Object.entries(spec.paths)) {
        for (const method of [
          "get",
          "post",
          "put",
          "patch",
          "delete",
        ] as const) {
          const operation = pathItem[method];
          if (operation?.operationId) {
            expect(operation.operationId).not.toMatch(/-/);
          }
        }
      }
    });

    it("should generate valid TypeScript identifiers for underscored paths", () => {
      const baseRouter = new Router();

      const testRouter = router({
        "/v1/metrics/by_job_type": baseRouter.procedure
          .output(z.object({ data: z.string() }))
          .get(() => ok({ data: "test" })),
      });

      const spec = generateOpenAPISpec(
        { api: testRouter },
        { title: "Test API", version: "1.0.0" }
      );

      const operation = spec.paths["/api/v1/metrics/by_job_type"]?.get;
      expect(operation?.operationId).toBe("getApiV1MetricsByJobType");
      expect(operation?.operationId).not.toMatch(/_/);
    });

    it("should handle path parameters with hyphens in surrounding segments", () => {
      const baseRouter = new Router();

      const testRouter = router({
        "/v1/job-types/{jobTypeId}/sub-resources": baseRouter.procedure
          .input({ params: z.object({ jobTypeId: z.string() }) })
          .output(z.object({ data: z.string() }))
          .get(() => ok({ data: "test" })),
      });

      const spec = generateOpenAPISpec(
        { api: testRouter },
        { title: "Test API", version: "1.0.0" }
      );

      const operation =
        spec.paths["/api/v1/job-types/{jobTypeId}/sub-resources"]?.get;
      expect(operation?.operationId).toBe(
        "getApiV1JobTypesJobTypeIdSubResources"
      );
      expect(operation?.operationId).not.toMatch(/-/);
    });

    it("should preserve simple paths without modification beyond capitalization", () => {
      const baseRouter = new Router();

      const testRouter = router({
        "/v1/users": baseRouter.procedure
          .output(z.object({ data: z.string() }))
          .get(() => ok({ data: "test" })),
        "/v1/users/{userId}": baseRouter.procedure
          .input({ params: z.object({ userId: z.string() }) })
          .output(z.object({ data: z.string() }))
          .get(() => ok({ data: "test" })),
      });

      const spec = generateOpenAPISpec(
        { api: testRouter },
        { title: "Test API", version: "1.0.0" }
      );

      expect(spec.paths["/api/v1/users"]?.get?.operationId).toBe(
        "getApiV1Users"
      );
      expect(spec.paths["/api/v1/users/{userId}"]?.get?.operationId).toBe(
        "getApiV1UsersUserId"
      );
    });
  });
});
