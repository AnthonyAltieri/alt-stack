# Example Kafka Consumer

A complete example Kafka consumer application built with `@alt-stack/kafka`, demonstrating type-safe message consumption with Zod validation.

## Features

- ✅ Type-safe message handling
- ✅ Automatic input/output validation
- ✅ Middleware support
- ✅ Custom context
- ✅ Error handling
- ✅ Multiple topic subscriptions

## Prerequisites

- Kafka broker running (default: `localhost:9092`)
- Node.js 20+

## Setup

```bash
# Install dependencies
pnpm install

# Make sure Kafka is running
# You can use Docker Compose or a local Kafka installation

# Start the consumer
pnpm dev
```

## Configuration

The consumer is configured via environment variables. Copy `.env.example` to `.env` and configure your settings:

```bash
cp .env.example .env
```

Environment variables are validated using `@t3-oss/env-core` on startup:

- `KAFKA_BROKERS`: Comma-separated list of Kafka brokers (default: `localhost:9092`)
- `KAFKA_CLIENT_ID`: Client ID for the Kafka consumer (default: `example-consumer`)
- `KAFKA_GROUP_ID`: Consumer group ID (default: `example-group`)

## Example Topics

### User Events (`user-events`)

Handles user-related events with validation.

**Message Schema:**
```typescript
{
  userId: string;
  eventType: "created" | "updated" | "deleted";
  timestamp: number;
  metadata?: Record<string, unknown>;
}
```

### Order Events (`orders/created`)

Handles order creation events.

**Message Schema:**
```typescript
{
  orderId: string;
  userId: string;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
  total: number;
}
```

## Usage

1. Start the consumer:
   ```bash
   pnpm dev
   ```

2. Send messages to Kafka topics using `kafka-console-producer` or any Kafka client:

   ```bash
   # User event
   echo '{"userId":"123","eventType":"created","timestamp":1234567890}' | \
     kafka-console-producer --broker-list localhost:9092 --topic user-events

   # Order event
   echo '{"orderId":"order-1","userId":"123","items":[{"productId":"prod-1","quantity":2,"price":29.99}],"total":59.98}' | \
     kafka-console-producer --broker-list localhost:9092 --topic orders/created
   ```

## Type Safety

All message handlers are fully type-safe:

- **Input validation**: Message payloads are validated against Zod schemas
- **Output validation**: Handler return values are validated against output schemas
- **Full inference**: `ctx.input` is fully typed based on your input configuration
- **Context access**: Access to Kafka message metadata (topic, partition, offset, headers)

## Project Structure

```
src/
  index.ts    # Main consumer file with topic handlers
```

## Error Handling

The consumer includes error handling that logs errors and continues processing. You can customize error handling via the `onError` callback in `createConsumer`.

