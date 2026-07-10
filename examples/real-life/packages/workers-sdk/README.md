# `@real-life/workers-sdk`

Private generated AsyncAPI SDK for the real-life workers example. Its checked-in `src/index.ts` is current generator output and requires Zod 4 from the consuming workspace.

## Current contract

| Topic | Runtime validator and message |
| --- | --- |
| `send-notification` | `SendNotificationPayloadSchema` validates event type `task_created`, `task_completed`, or `task_assigned` plus string `userId`, `taskId`, and `taskTitle`; `SendNotificationMessageSchema` currently aliases it. |
| `generate-report` | `GenerateReportPayloadSchema` validates string `taskId` and `userId` plus a date-time-shaped `completedAt`; `GenerateReportMessageSchema` currently aliases it. |

The inferred payload types are `SendNotificationPayload` and `GenerateReportPayload`; the corresponding message types are `SendNotificationMessage` and `GenerateReportMessage`. `Topics` maps the two exact topic strings to their validators, `TopicName` is that key union, and `MessageType<T extends TopicName>` infers the selected topic's validated value.

Prefer `Topics` and `MessageType` at worker-client boundaries. Topic-derived schema aliases may change when the AsyncAPI document changes.

## Regenerate

First regenerate the workers app's AsyncAPI artifact, then replace this SDK in full:

```bash
pnpm --dir examples/real-life --filter @real-life/workers generate
```

The application script writes `apps/workers/asyncapi.json`, then runs this SDK's `zod-asyncapi` command. Review the complete generated diff and keep the generated-file banner.

See [Generated SDKs and fixtures](../../../../apps/docs/docs/codegen/api/generated-sdks.md) and the [Code generation Quickstart](../../../../apps/docs/docs/codegen/quickstart.md).
