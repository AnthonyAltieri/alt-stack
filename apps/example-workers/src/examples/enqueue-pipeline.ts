/**
 * Example: How to enqueue items to data pipeline queues
 *
 * This file demonstrates how to trigger data pipeline tasks from your application code.
 * These examples show the Trigger.dev SDK patterns for enqueueing work.
 *
 * There are two ways to trigger tasks:
 * 1. Using the task object directly: `importCsvData.trigger({...})`
 * 2. Using the tasks SDK with task ID: `tasks.trigger("import-csv-data", {...})`
 */
import { tasks } from "@trigger.dev/sdk/v3";
import { z } from "zod";

// Define payload schemas for type safety when using tasks SDK
const csvRecordSchema = z.object({
  id: z.string(),
  data: z.record(z.string(), z.unknown()),
});

const importPayloadSchema = z.object({
  sourceUrl: z.string().url(),
  batchSize: z.number().min(1).max(1000).default(100),
  records: z.array(csvRecordSchema),
});

const transformPayloadSchema = z.object({
  importId: z.string(),
  transformations: z.array(z.enum(["normalize", "dedupe", "enrich", "validate"])),
  recordIds: z.array(z.string()).optional(),
});

const exportPayloadSchema = z.object({
  transformId: z.string(),
  destination: z.enum(["s3", "bigquery", "snowflake", "redshift"]),
  format: z.enum(["json", "parquet", "csv"]).default("json"),
});

const pipelinePayloadSchema = z.object({
  sourceUrl: z.string().url(),
  records: z.array(csvRecordSchema),
  transformations: z.array(z.enum(["normalize", "dedupe", "enrich", "validate"])),
  destination: z.enum(["s3", "bigquery", "snowflake", "redshift"]),
  batchSize: z.number().min(1).max(1000).default(100),
});

type ImportPayload = z.infer<typeof importPayloadSchema>;
type TransformPayload = z.infer<typeof transformPayloadSchema>;
type ExportPayload = z.infer<typeof exportPayloadSchema>;
type PipelinePayload = z.infer<typeof pipelinePayloadSchema>;

// Sample data for examples
const sampleRecords = [
  { id: "rec_001", data: { name: "John Doe", email: "john@example.com", age: 30 } },
  { id: "rec_002", data: { name: "Jane Smith", email: "jane@example.com", age: 25 } },
  { id: "rec_003", data: { name: "Bob Wilson", email: "bob@example.com", age: 35 } },
];

/**
 * Example 1: Trigger a single import task
 *
 * Use tasks.trigger() to enqueue a single job and get a handle to track it.
 */
export async function enqueueSingleImport(): Promise<{ id: string }> {
  const payload: ImportPayload = {
    sourceUrl: "https://example.com/data/users.csv",
    batchSize: 100,
    records: sampleRecords,
  };

  const handle = await tasks.trigger("import-csv-data", payload);

  console.log("Import task triggered:", handle.id);
  return handle;
}

/**
 * Example 2: Trigger and wait for result
 *
 * Use tasks.triggerAndWait() when you need the result before continuing.
 */
export async function importAndWaitForResult() {
  const payload: ImportPayload = {
    sourceUrl: "https://example.com/data/products.csv",
    batchSize: 50,
    records: sampleRecords,
  };

  const result = await tasks.triggerAndWait("import-csv-data", payload);

  if (result.ok) {
    console.log("Import completed:", result.output);
    return result.output;
  } else {
    console.error("Import failed:", result.error);
    throw new Error("Import failed");
  }
}

/**
 * Example 3: Batch trigger multiple jobs
 *
 * Use tasks.batchTrigger() to enqueue multiple jobs efficiently.
 */
export async function batchEnqueueImports() {
  const dataSources = [
    { url: "https://example.com/data/batch1.csv", records: sampleRecords.slice(0, 1) },
    { url: "https://example.com/data/batch2.csv", records: sampleRecords.slice(1, 2) },
    { url: "https://example.com/data/batch3.csv", records: sampleRecords.slice(2, 3) },
  ];

  const items = dataSources.map((source) => ({
    payload: {
      sourceUrl: source.url,
      batchSize: 100,
      records: source.records,
    } satisfies ImportPayload,
  }));

  const handles = await tasks.batchTrigger("import-csv-data", items);

  console.log(`Batch triggered ${handles.runs.length} import jobs`);
  return handles;
}

/**
 * Example 4: Chain tasks - Import, Transform, Export
 *
 * Trigger tasks in sequence, passing output from one to the next.
 */
export async function runPipelineManually() {
  // Step 1: Import data
  console.log("Step 1: Importing data...");
  const importPayload: ImportPayload = {
    sourceUrl: "https://example.com/data/full-dataset.csv",
    batchSize: 100,
    records: sampleRecords,
  };
  const importResult = await tasks.triggerAndWait("import-csv-data", importPayload);

  if (!importResult.ok) {
    throw new Error("Import failed");
  }
  const importOutput = importResult.output as { importId: string; recordsProcessed: number };

  // Step 2: Transform records
  console.log("Step 2: Transforming records...");
  const transformPayload: TransformPayload = {
    importId: importOutput.importId,
    transformations: ["normalize", "dedupe", "enrich", "validate"],
  };
  const transformResult = await tasks.triggerAndWait("transform-records", transformPayload);

  if (!transformResult.ok) {
    throw new Error("Transform failed");
  }
  const transformOutput = transformResult.output as {
    transformId: string;
    recordsTransformed: number;
  };

  // Step 3: Export to warehouse
  console.log("Step 3: Exporting to warehouse...");
  const exportPayload: ExportPayload = {
    transformId: transformOutput.transformId,
    destination: "bigquery",
    format: "json",
  };
  const exportResult = await tasks.triggerAndWait("export-to-warehouse", exportPayload);

  if (!exportResult.ok) {
    throw new Error("Export failed");
  }

  console.log("Pipeline completed!", {
    import: importOutput,
    transform: transformOutput,
    export: exportResult.output,
  });

  return {
    import: importOutput,
    transform: transformOutput,
    export: exportResult.output,
  };
}

/**
 * Example 5: Use the orchestrator task
 *
 * The run-etl-pipeline task handles all stages internally.
 */
export async function runFullPipeline(): Promise<{ id: string }> {
  const payload: PipelinePayload = {
    sourceUrl: "https://example.com/data/complete-dataset.csv",
    records: sampleRecords,
    transformations: ["normalize", "enrich", "validate"],
    destination: "snowflake",
    batchSize: 200,
  };

  const handle = await tasks.trigger("run-etl-pipeline", payload);

  console.log("Full ETL pipeline triggered:", handle.id);
  return handle;
}

/**
 * Example 6: Trigger with idempotency key
 *
 * Use idempotency keys to prevent duplicate processing.
 */
export async function enqueueWithIdempotency(datasetId: string): Promise<{ id: string }> {
  const payload: ImportPayload = {
    sourceUrl: `https://example.com/data/${datasetId}.csv`,
    batchSize: 100,
    records: sampleRecords,
  };

  const handle = await tasks.trigger("import-csv-data", payload, {
    idempotencyKey: `import-${datasetId}`,
  });

  console.log(`Import triggered with idempotency key: import-${datasetId}`);
  return handle;
}

/**
 * Example 7: Trigger with delay
 *
 * Schedule a task to run after a delay.
 */
export async function enqueueWithDelay(): Promise<{ id: string }> {
  const payload: ImportPayload = {
    sourceUrl: "https://example.com/data/delayed-import.csv",
    batchSize: 100,
    records: sampleRecords,
  };

  const handle = await tasks.trigger("import-csv-data", payload, {
    delay: "5m", // Run after 5 minutes
  });

  console.log("Import scheduled to run in 5 minutes:", handle.id);
  return handle;
}

/**
 * Example 8: Parallel processing with batch trigger and wait
 *
 * Process multiple datasets in parallel and wait for all to complete.
 */
export async function parallelProcessing() {
  const datasets = ["users", "products", "orders"];

  const items = datasets.map((dataset) => ({
    payload: {
      sourceUrl: `https://example.com/data/${dataset}.csv`,
      batchSize: 100,
      records: sampleRecords,
    } satisfies ImportPayload,
  }));

  const handles = await tasks.batchTriggerAndWait("import-csv-data", items);

  const results = handles.runs.map((run, i) => ({
    dataset: datasets[i],
    success: run.ok,
    output: run.ok ? run.output : null,
    error: run.ok ? null : run.error,
  }));

  console.log("Parallel processing completed:", results);
  return results;
}
