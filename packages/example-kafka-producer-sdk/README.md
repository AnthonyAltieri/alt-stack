# @alt-stack/example-kafka-producer-sdk

Auto-generated TypeScript SDK for the example-kafka-producer Kafka topics.

## Installation

```bash
npm install @alt-stack/example-kafka-producer-sdk
# or
pnpm add @alt-stack/example-kafka-producer-sdk
```

## Usage

```typescript
import { Topics, TopicName, MessageType } from '@alt-stack/example-kafka-producer-sdk';

// Topics contains Zod schemas for all Kafka topic messages
// Use them to validate messages before consuming

// Validate a user-events message
const userEvent = Topics['user-events'].parse({
  userId: 'user-123',
  eventType: 'created',
  timestamp: Date.now(),
});

// Type-safe message types
type UserEventMessage = MessageType<'user-events'>;
type OrderCreatedMessage = MessageType<'orders/created'>;

// Get all available topic names
const topicNames: TopicName[] = Object.keys(Topics) as TopicName[];
```

## Available Topics

| Topic | Description |
|-------|-------------|
| `user-events` | User lifecycle events (created, updated, deleted) |
| `orders/created` | Order creation events with items and totals |
| `notifications` | Notification messages (email, push, etc.) |

## Generation

This package is automatically generated from the `example-kafka-producer` AsyncAPI schema using the "Cut Kafka Producer Version" GitHub Actions workflow.

**Do not manually edit `src/index.ts`** - changes will be overwritten on the next generation.

### Regenerating

1. Go to the repository's Actions tab
2. Select "Cut Kafka Producer Version" workflow
3. Click "Run workflow"
4. The workflow will:
   - Analyze conventional commits to determine version bump
   - Bump the producer version
   - Generate AsyncAPI spec from the producer router
   - Generate TypeScript types using `@alt-stack/zod-asyncapi`
   - Update this SDK package with matching version
   - Commit all changes

## License

MIT

