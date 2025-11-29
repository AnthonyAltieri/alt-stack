# Routing Strategies

Two strategies for routing jobs through Kafka.

## Topic-per-Job (Default)

Each job name becomes a Kafka topic:

```
job "send-email"     → topic "send-email"
job "process-image"  → topic "process-image"
```

```typescript
const worker = await createWorker(router, {
  kafka: { brokers: ["localhost:9092"] },
  groupId: "workers",
  routing: { type: "topic-per-job" },
});
```

With a prefix:

```typescript
routing: { type: "topic-per-job", topicPrefix: "jobs." }
// job "send-email" → topic "jobs.send-email"
```

## Single-Queue

All jobs go to one topic with an envelope:

```typescript
const worker = await createWorker(router, {
  kafka: { brokers: ["localhost:9092"] },
  groupId: "workers",
  routing: { type: "single-queue", topic: "job-queue" },
});
```

Messages are wrapped:

```json
{ "jobName": "send-email", "payload": { "to": "user@example.com", ... } }
```

## Matching Producer and Consumer

Use the same routing strategy for both:

```typescript
const routing = { type: "single-queue", topic: "jobs" } as const;

// Consumer
const worker = await createWorker(router, {
  kafka: { brokers: ["localhost:9092"] },
  groupId: "workers",
  routing,
});

// Producer
const client = await createJobClient(router, {
  kafka: { brokers: ["localhost:9092"] },
  routing,
});
```

