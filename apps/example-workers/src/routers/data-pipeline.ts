import { init } from "@alt-stack/workers-trigger";
import { z } from "zod";
import type { AppContext } from "../context.js";

const { router, procedure } = init<AppContext>();

// Pipeline middleware for logging and metrics
const pipelineProcedure = procedure.use(async ({ ctx, next }) => {
  const pipelineId = `pipeline_${Date.now()}`;
  console.log(`[Pipeline ${pipelineId}] Starting: ${ctx.jobName}`);
  const start = Date.now();

  try {
    const result = await next();
    console.log(`[Pipeline ${pipelineId}] Completed: ${ctx.jobName} in ${Date.now() - start}ms`);
    return result;
  } catch (error) {
    console.error(`[Pipeline ${pipelineId}] Failed: ${ctx.jobName} after ${Date.now() - start}ms`);
    throw error;
  }
});

// Record schema for CSV data
const csvRecordSchema = z.object({
  id: z.string(),
  data: z.record(z.string(), z.unknown()),
});

// Import result schema
const importResultSchema = z.object({
  importId: z.string(),
  recordsProcessed: z.number(),
  batchesCreated: z.number(),
  status: z.enum(["completed", "partial", "failed"]),
});

// Transform result schema
const transformResultSchema = z.object({
  transformId: z.string(),
  recordsTransformed: z.number(),
  transformations: z.array(z.string()),
});

// Export result schema
const exportResultSchema = z.object({
  exportId: z.string(),
  recordsExported: z.number(),
  destination: z.string(),
  completedAt: z.string(),
});

/**
 * Data pipeline router with ETL queue-based tasks.
 */
export const dataPipelineRouter = router({
  // Stage 1: Import CSV data with batching
  "import-csv-data": pipelineProcedure
    .input({
      payload: z.object({
        sourceUrl: z.string().url(),
        batchSize: z.number().min(1).max(1000).default(100),
        records: z.array(csvRecordSchema),
      }),
    })
    .output(importResultSchema)
    .queue("data-imports", async ({ input, ctx }) => {
      const importId = `import_${Date.now()}`;
      console.log(
        `[Import ${importId}] Processing ${input.records.length} records from ${input.sourceUrl}`,
      );

      // Track import in context
      ctx.db.dataImports.set(importId, {
        id: importId,
        status: "processing",
        recordsProcessed: 0,
        startedAt: new Date(),
      });

      // Process in batches
      const batches: string[][] = [];
      for (let i = 0; i < input.records.length; i += input.batchSize) {
        const batch = input.records.slice(i, i + input.batchSize);
        const batchIds = batch.map((r) => r.id);
        batches.push(batchIds);

        // Store raw records
        for (const record of batch) {
          ctx.db.rawRecords.set(record.id, {
            ...record,
            importId,
            importedAt: new Date(),
          });
        }

        // Update progress
        const importState = ctx.db.dataImports.get(importId);
        if (importState) {
          importState.recordsProcessed = Math.min(i + input.batchSize, input.records.length);
        }

        console.log(`[Import ${importId}] Batch ${batches.length}: ${batch.length} records`);
      }

      // Mark import complete
      const importState = ctx.db.dataImports.get(importId);
      if (importState) {
        importState.status = "completed";
        importState.recordsProcessed = input.records.length;
      }

      return {
        importId,
        recordsProcessed: input.records.length,
        batchesCreated: batches.length,
        status: "completed" as const,
      };
    }),

  // Stage 2: Transform records
  "transform-records": pipelineProcedure
    .input({
      payload: z.object({
        importId: z.string(),
        transformations: z.array(z.enum(["normalize", "dedupe", "enrich", "validate"])),
        recordIds: z.array(z.string()).optional(),
      }),
    })
    .output(transformResultSchema)
    .queue("data-transforms", async ({ input, ctx }) => {
      const transformId = `transform_${Date.now()}`;
      console.log(`[Transform ${transformId}] Applying: ${input.transformations.join(", ")}`);

      // Get records to transform
      const recordsToProcess = input.recordIds
        ? input.recordIds
            .map((id) => ctx.db.rawRecords.get(id))
            .filter((r): r is NonNullable<typeof r> => r !== undefined)
        : Array.from(ctx.db.rawRecords.values()).filter((r) => r.importId === input.importId);

      console.log(`[Transform ${transformId}] Processing ${recordsToProcess.length} records`);

      // Apply transformations
      for (const record of recordsToProcess) {
        const transformed = { ...record.data };

        for (const transformation of input.transformations) {
          switch (transformation) {
            case "normalize":
              // Normalize string fields to lowercase
              for (const [key, value] of Object.entries(transformed)) {
                if (typeof value === "string") {
                  transformed[key] = value.toLowerCase().trim();
                }
              }
              break;
            case "dedupe":
              // Mark as processed for deduplication
              transformed._deduped = true;
              break;
            case "enrich":
              // Add metadata
              transformed._enrichedAt = new Date().toISOString();
              transformed._transformId = transformId;
              break;
            case "validate":
              // Mark validation status
              transformed._validated = true;
              break;
          }
        }

        // Store transformed record
        ctx.db.transformedRecords.set(record.id, {
          id: record.id,
          originalData: record.data,
          transformedData: transformed,
          transformId,
          transformedAt: new Date(),
        });
      }

      return {
        transformId,
        recordsTransformed: recordsToProcess.length,
        transformations: input.transformations,
      };
    }),

  // Stage 3: Export to warehouse
  "export-to-warehouse": pipelineProcedure
    .input({
      payload: z.object({
        transformId: z.string(),
        destination: z.enum(["s3", "bigquery", "snowflake", "redshift"]),
        format: z.enum(["json", "parquet", "csv"]).default("json"),
      }),
    })
    .output(exportResultSchema)
    .queue("data-exports", async ({ input, ctx }) => {
      const exportId = `export_${Date.now()}`;
      console.log(`[Export ${exportId}] Exporting to ${input.destination} as ${input.format}`);

      // Get transformed records
      const records = Array.from(ctx.db.transformedRecords.values()).filter(
        (r) => r.transformId === input.transformId,
      );

      console.log(`[Export ${exportId}] Found ${records.length} records to export`);

      // Simulate export with progress
      const chunkSize = 50;
      for (let i = 0; i < records.length; i += chunkSize) {
        const chunk = records.slice(i, i + chunkSize);
        console.log(
          `[Export ${exportId}] Uploading chunk ${Math.floor(i / chunkSize) + 1}: ${chunk.length} records`,
        );

        // Track exported records
        for (const record of chunk) {
          ctx.db.exportedRecords.set(record.id, {
            id: record.id,
            exportId,
            destination: input.destination,
            format: input.format,
            exportedAt: new Date(),
          });
        }
      }

      return {
        exportId,
        recordsExported: records.length,
        destination: input.destination,
        completedAt: new Date().toISOString(),
      };
    }),

  // Orchestrator: Run full ETL pipeline
  "run-etl-pipeline": pipelineProcedure
    .input({
      payload: z.object({
        sourceUrl: z.string().url(),
        records: z.array(csvRecordSchema),
        transformations: z.array(z.enum(["normalize", "dedupe", "enrich", "validate"])),
        destination: z.enum(["s3", "bigquery", "snowflake", "redshift"]),
        batchSize: z.number().min(1).max(1000).default(100),
      }),
    })
    .output(
      z.object({
        pipelineId: z.string(),
        stages: z.object({
          import: importResultSchema,
          transform: transformResultSchema,
          export: exportResultSchema,
        }),
        totalDuration: z.number(),
      }),
    )
    .task(async ({ input, ctx }) => {
      const pipelineId = `pipeline_${Date.now()}`;
      const startTime = Date.now();
      console.log(`[ETL Pipeline ${pipelineId}] Starting full pipeline`);

      // Stage 1: Import
      console.log(`[ETL Pipeline ${pipelineId}] Stage 1: Import`);
      const importId = `import_${Date.now()}`;
      ctx.db.dataImports.set(importId, {
        id: importId,
        status: "processing",
        recordsProcessed: 0,
        startedAt: new Date(),
      });

      for (const record of input.records) {
        ctx.db.rawRecords.set(record.id, {
          ...record,
          importId,
          importedAt: new Date(),
        });
      }

      const importState = ctx.db.dataImports.get(importId)!;
      importState.status = "completed";
      importState.recordsProcessed = input.records.length;

      const importResult = {
        importId,
        recordsProcessed: input.records.length,
        batchesCreated: Math.ceil(input.records.length / input.batchSize),
        status: "completed" as const,
      };

      // Stage 2: Transform
      console.log(`[ETL Pipeline ${pipelineId}] Stage 2: Transform`);
      const transformId = `transform_${Date.now()}`;

      for (const record of input.records) {
        const rawRecord = ctx.db.rawRecords.get(record.id);
        if (!rawRecord) continue;

        const transformed = { ...rawRecord.data };
        for (const transformation of input.transformations) {
          switch (transformation) {
            case "normalize":
              for (const [key, value] of Object.entries(transformed)) {
                if (typeof value === "string") {
                  transformed[key] = value.toLowerCase().trim();
                }
              }
              break;
            case "dedupe":
              transformed._deduped = true;
              break;
            case "enrich":
              transformed._enrichedAt = new Date().toISOString();
              break;
            case "validate":
              transformed._validated = true;
              break;
          }
        }

        ctx.db.transformedRecords.set(record.id, {
          id: record.id,
          originalData: rawRecord.data,
          transformedData: transformed,
          transformId,
          transformedAt: new Date(),
        });
      }

      const transformResult = {
        transformId,
        recordsTransformed: input.records.length,
        transformations: input.transformations,
      };

      // Stage 3: Export
      console.log(`[ETL Pipeline ${pipelineId}] Stage 3: Export`);
      const exportId = `export_${Date.now()}`;

      for (const record of input.records) {
        ctx.db.exportedRecords.set(record.id, {
          id: record.id,
          exportId,
          destination: input.destination,
          format: "json",
          exportedAt: new Date(),
        });
      }

      const exportResult = {
        exportId,
        recordsExported: input.records.length,
        destination: input.destination,
        completedAt: new Date().toISOString(),
      };

      const totalDuration = Date.now() - startTime;
      console.log(`[ETL Pipeline ${pipelineId}] Completed in ${totalDuration}ms`);

      return {
        pipelineId,
        stages: {
          import: importResult,
          transform: transformResult,
          export: exportResult,
        },
        totalDuration,
      };
    }),

  // Scheduled: Cleanup old pipeline data
  "cleanup-pipeline-data": pipelineProcedure.cron("0 3 * * *", async ({ ctx }) => {
    console.log("[Cleanup] Running daily pipeline data cleanup");

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let cleaned = 0;

    // Cleanup old imports
    for (const [id, importData] of ctx.db.dataImports) {
      if (importData.startedAt < oneDayAgo && importData.status === "completed") {
        ctx.db.dataImports.delete(id);
        cleaned++;
      }
    }

    // Cleanup old exported records
    for (const [id, record] of ctx.db.exportedRecords) {
      if (record.exportedAt < oneDayAgo) {
        ctx.db.exportedRecords.delete(id);
        ctx.db.transformedRecords.delete(id);
        ctx.db.rawRecords.delete(id);
        cleaned++;
      }
    }

    console.log(`[Cleanup] Removed ${cleaned} old records`);
  }),
});
