export interface ClickHouseTableNames {
  events: string;
  current: string;
}

export function getTableNames(prefix = "queue_state"): ClickHouseTableNames {
  return {
    events: `${prefix}_events`,
    current: `${prefix}_current`,
  };
}

export function buildSchemaStatements(tables: ClickHouseTableNames): string[] {
  return [
    `
CREATE TABLE IF NOT EXISTS ${tables.events} (
  event_id String,
  event_type LowCardinality(String),
  event_time DateTime64(3, 'UTC'),
  created_at DateTime64(3, 'UTC'),
  job_id String,
  job_name String,
  queue_name String,
  attempt UInt16,
  next_attempt Nullable(UInt16),
  state LowCardinality(String),
  scheduled_at Nullable(DateTime64(3, 'UTC')),
  dispatch_kind LowCardinality(String),
  redrive_id Nullable(String),
  retry_budget UInt16,
  retry_backoff_type LowCardinality(String),
  retry_backoff_starting_seconds UInt32,
  retry_count UInt16,
  redrive_budget Nullable(UInt16),
  redrive_count UInt16,
  partition_key Nullable(String),
  payload_json String,
  queue_json String,
  headers_json String,
  error_json String,
  dead_letter_reason_json String,
  requested_by Nullable(String),
  requested_reason Nullable(String)
) ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (queue_name, job_name, job_id, event_time, event_id)
    `.trim(),
    `
CREATE TABLE IF NOT EXISTS ${tables.current} (
  job_id String,
  queue_name String,
  job_name String,
  created_at DateTime64(3, 'UTC'),
  updated_at DateTime64(3, 'UTC'),
  state LowCardinality(String),
  attempt UInt16,
  scheduled_at Nullable(DateTime64(3, 'UTC')),
  dispatch_kind LowCardinality(String),
  redrive_id Nullable(String),
  retry_budget UInt16,
  retry_backoff_type LowCardinality(String),
  retry_backoff_starting_seconds UInt32,
  retry_count UInt16,
  redrive_budget Nullable(UInt16),
  redrive_count UInt16,
  partition_key Nullable(String),
  payload_json String,
  queue_json String,
  headers_json String,
  error_json String,
  dead_letter_reason_json String
) ENGINE = ReplacingMergeTree(updated_at)
ORDER BY (queue_name, job_id)
    `.trim(),
    `
ALTER TABLE ${tables.events}
ADD COLUMN IF NOT EXISTS next_attempt Nullable(UInt16)
    `.trim(),
    `
ALTER TABLE ${tables.events}
ADD COLUMN IF NOT EXISTS partition_key Nullable(String)
    `.trim(),
    `
ALTER TABLE ${tables.events}
ADD COLUMN IF NOT EXISTS retry_budget UInt16 DEFAULT 0
    `.trim(),
    `
ALTER TABLE ${tables.events}
ADD COLUMN IF NOT EXISTS retry_backoff_type LowCardinality(String) DEFAULT 'static'
    `.trim(),
    `
ALTER TABLE ${tables.events}
ADD COLUMN IF NOT EXISTS retry_backoff_starting_seconds UInt32 DEFAULT 0
    `.trim(),
    `
ALTER TABLE ${tables.events}
ADD COLUMN IF NOT EXISTS retry_count UInt16 DEFAULT 0
    `.trim(),
    `
ALTER TABLE ${tables.events}
ADD COLUMN IF NOT EXISTS redrive_budget Nullable(UInt16)
    `.trim(),
    `
ALTER TABLE ${tables.events}
ADD COLUMN IF NOT EXISTS redrive_count UInt16 DEFAULT 0
    `.trim(),
    `
ALTER TABLE ${tables.current}
ADD COLUMN IF NOT EXISTS partition_key Nullable(String)
    `.trim(),
    `
ALTER TABLE ${tables.current}
ADD COLUMN IF NOT EXISTS retry_budget UInt16 DEFAULT 0
    `.trim(),
    `
ALTER TABLE ${tables.current}
ADD COLUMN IF NOT EXISTS retry_backoff_type LowCardinality(String) DEFAULT 'static'
    `.trim(),
    `
ALTER TABLE ${tables.current}
ADD COLUMN IF NOT EXISTS retry_backoff_starting_seconds UInt32 DEFAULT 0
    `.trim(),
    `
ALTER TABLE ${tables.current}
ADD COLUMN IF NOT EXISTS retry_count UInt16 DEFAULT 0
    `.trim(),
    `
ALTER TABLE ${tables.current}
ADD COLUMN IF NOT EXISTS redrive_budget Nullable(UInt16)
    `.trim(),
    `
ALTER TABLE ${tables.current}
ADD COLUMN IF NOT EXISTS redrive_count UInt16 DEFAULT 0
    `.trim(),
  ];
}
