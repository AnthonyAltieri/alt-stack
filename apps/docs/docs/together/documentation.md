# Altstack Together API Documentation

This page documents the contracts between Altstack families. For individual function signatures and every exported property, follow the linked family API pages.

## Contract artifact map

| Owning source | Document/artifact | Consumer | Runtime guarantee |
| --- | --- | --- | --- |
| server `Router` | OpenAPI from `generateOpenAPISpec` | Zod, Pydantic, or Rust generator | route method, path, input schemas, success schemas, and declared error schemas |
| generated TypeScript OpenAPI module | `Request` map | `ApiClient` through Fetch or Ky | endpoint/method selection and request validation |
| generated TypeScript OpenAPI module | `Response` map | `ApiClient` through Fetch or Ky | status-specific response parsing and result narrowing |
| Kafka router | AsyncAPI from `generateAsyncAPISpec` | `@alt-stack/zod-asyncapi` | topic names and message payload schemas |
| worker router | AsyncAPI from `generateAsyncAPISpec` | `@alt-stack/zod-asyncapi` | job names and payload schemas |
| generated AsyncAPI module | `Topics` map | Kafka or worker client | producer-side payload validation and key-safe topic/job names |

The document is a snapshot. Regenerate it after changing the owning router, then regenerate every consumer artifact.

## HTTP `Request` map

The TypeScript OpenAPI generator emits a nested constant keyed by literal path and uppercase HTTP method:

```typescript
const Request = {
  "/api/users/{id}": {
    GET: {
      params: UserParamsSchema,
    },
  },
} as const;
```

A method with no params, query, headers, or body is still emitted as an empty object so `EndpointsWithMethod` can expose it to the typed client.

Client request options derive from the selected entry:

| Property | When available/required |
| --- | --- |
| `params` | required for a declared params schema or braces in the endpoint path |
| `query` | available when the request entry has a query schema |
| `body` | the current `post`, `put`, and `patch` method signatures always require this property; with a generated body schema its type is the inferred body, but without one its type becomes `never`, so a bodyless POST/PUT/PATCH cannot be called without an unsafe cast (a current type-level limitation) |
| `headers` | always optional caller headers; generated header schemas are represented in the request map but core request validation centers on params/query/body |
| `timeout` | optional milliseconds for the executor |
| `retries` | optional retry count, default `0` |
| `shouldRetry` | optional callback receiving attempt, error, or response context |

See [HTTP client core API Documentation](../http-client/api/core.md) for the exact conditional types.

## HTTP `Response` map

The generated `Response` map is keyed by path, method, and status string. `ApiClient` uses the actual numeric response status converted to a string to select a schema.

The returned union has three shapes:

| Branch | Discriminants and payload |
| --- | --- |
| 2xx response | `success: true`, string `code`, `body`, `raw`; the body is schema-validated and typed for a declared status, but remains unvalidated/unknown for an undeclared 2xx status |
| declared non-2xx response | `success: false`, string `code`, typed `error`, `raw` transport response |
| unexpected failure | `success: false`, numeric `code`, `error: unknown`, optional `raw`; used for undeclared non-2xx statuses and response-validation failures |

If a status is missing from `Response[path][method]`, an unlisted 2xx response is returned as success with an unvalidated body, while an unlisted non-2xx response becomes the numeric unexpected-failure branch.

### Current server-error compatibility boundary

Server procedures declare a schema such as `{ _tag, userId }`. OpenAPI contains that declared schema, but current adapters serialize a runtime envelope:

```json
{
  "error": {
    "code": "UserNotFoundError",
    "message": "User u_missing was not found",
    "_tag": "UserNotFoundError",
    "userId": "u_missing"
  }
}
```

Generated clients validate against the OpenAPI schema, so a declared error response may fail validation unless the published contract accounts for the envelope. This is a documented current limitation, not a shape to silently normalize in client code.

## AsyncAPI `Topics` map

`@alt-stack/zod-asyncapi` emits a constant whose keys are topic or job names and whose values are Zod payload schemas:

```typescript
const Topics = {
  "send-welcome": SendWelcomeMessageSchema,
} as const;
```

Kafka clients call `send(topic, message, options?)`; worker clients call `trigger(jobName, payload, options?)` or `triggerBatch`. Both validate against the selected generated schema before invoking the transport.

The shared key map does not encode broker addresses, consumer groups, retry policy, topic provisioning, or worker routing strategy. Those remain runtime configuration.

## Runtime ownership and shutdown

| Component | Construction | Resource owner | Shutdown |
| --- | --- | --- | --- |
| Hono server | `createServer` returns a Hono app | host listener such as `@hono/node-server` | stop the host listener |
| Express server | `createServer` returns an Express app | Node HTTP server returned by `listen` | close the Node server |
| Bun server | `createServer` calls `Bun.serve` | returned Bun server | `server.stop()` |
| TanStack Start | route adapter returns request handlers | TanStack Start runtime | host lifecycle |
| Kafka/worker producer client | async factory connects a producer | returned client | `disconnect()` |
| WarpStream worker | async factory connects consumer resources | returned worker | `disconnect()` |
| Trigger.dev worker/client | Trigger.dev SDK | Trigger.dev runtime/client | follow Trigger.dev lifecycle |

## Compatibility checklist

Before releasing a coordinated contract change, verify:

- package peer ranges match the selected framework, Zod, KafkaJS, or Trigger.dev versions;
- the owner can regenerate OpenAPI or AsyncAPI without starting a listener or broker connection;
- TypeScript generated output type-checks with Zod 4;
- Python output imports under Python 3.11+ and Pydantic 2.7+;
- Rust output compiles with the Rust 2021 toolchain and selected runtime dependency;
- every documented status, error, topic, and job is exercised at the appropriate boundary;
- long-lived clients and workers disconnect cleanly;
- generated artifacts and the owning document change together in review.

## Family API indexes

- [Result API Documentation](../result/api.md)
- [Server core API Documentation](../server/api/core.md)
- [HTTP client core API Documentation](../http-client/api/core.md)
- [Kafka core API Documentation](../kafka/api/core.md)
- [Workers core API Documentation](../workers/api/core.md)
- [Code-generation API Documentation](../codegen/api/zod-openapi.md)
- [Utilities API Documentation](../utilities/api.md)
