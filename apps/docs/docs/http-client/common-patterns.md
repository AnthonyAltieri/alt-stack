# HTTP client common patterns

## Generate the contract once

The TypeScript client consumes values, not type declarations. Keep the generated Zod `Request` and `Response` maps in a dedicated module:

```typescript
import { createApiClient } from "@alt-stack/http-client-fetch";
import { Request, Response } from "./generated-api.js";

export const api = createApiClient({
  baseUrl: process.env.API_URL ?? "http://127.0.0.1:3000",
  Request,
  Response,
});
```

`@alt-stack/zod-openapi` generates both maps when its CLI runs. Do not manually add a route to generated output; change the OpenAPI source and regenerate.

## Handle all three failure channels

An HTTP call has three distinct outcomes.

### Documented HTTP errors are values

A non-2xx status with a schema in `Response` returns `{ success: false, code: "...", error, raw }`:

```typescript
const result = await api.get("/users/{id}", { params: { id } });

if (result.success) {
  return result.body;
}

if (result.code === "404") {
  return null;
}

// Numeric codes identify undocumented non-2xx responses.
if (typeof result.code === "number") {
  console.error("Undocumented HTTP status", result.code, result.error);
}
```

Documented codes are strings because they are keys in the generated response map. An undocumented non-2xx status uses a numeric `code` and an `UnexpectedApiClientError`. An undocumented 2xx status is returned as a successful response with unvalidated `body` and a string code.

### Request validation and transport failures throw

Catch `ValidationError`, `TimeoutError`, and `UnexpectedApiClientError` around the awaited call:

```typescript
import {
  TimeoutError,
  UnexpectedApiClientError,
  ValidationError,
} from "@alt-stack/http-client-fetch";

try {
  return await api.get("/users/{id}", {
    params: { id },
    timeout: 2_000,
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(error.endpoint, error.method, error.validationErrors);
  } else if (error instanceof TimeoutError) {
    console.error(`Timed out after ${error.timeout}ms`);
  } else if (error instanceof UnexpectedApiClientError) {
    console.error(error.cause);
  }
  throw error;
}
```

Request Zod failures throw. A response Zod failure invokes `onValidationError`, then the current core implementation returns the numeric unexpected-response variant instead of rethrowing the `ValidationError`. Use the callback when response-schema mismatches must be observed.

## Observe validation mismatches

```typescript
const api = createApiClient({
  baseUrl,
  Request,
  Response,
  onValidationError(context) {
    console.error({
      kind: context.kind,
      location: context.location,
      endpoint: context.endpoint,
      method: context.method,
      status: context.status,
      issues: context.issues,
    });
  },
});
```

The hook runs only for Zod parse failures in `params`, `query`, `body`, or `response`. The missing-path-parameter check does not call it. Exceptions thrown by this hook are swallowed so observability cannot change request control flow.

## Set headers at the right level

Client headers provide shared defaults; request headers override a duplicate key:

```typescript
const api = createApiClient({
  baseUrl,
  headers: { Authorization: `Bearer ${token}` },
  Request,
  Response,
});

await api.get("/users/{id}", {
  params: { id },
  headers: { "X-Trace-Id": traceId },
});
```

Header values are converted with `String`; `undefined` and `null` are omitted. The client always begins with `Content-Type: application/json`, even for requests without a body. Header keys are merged as ordinary JavaScript object keys, so differently cased names are not normalized before the executor receives them.

The generated OpenAPI map can contain a `headers` schema, but the current `RequestOptions` and runtime validate only `params`, `query`, and `body`. Send HTTP headers through the top-level `headers` option.

## Know the serialization rules

- Path values replace the matching `{name}` with `String(value)`; they are not URL-encoded.
- Query values become `String(value)` and `URLSearchParams` encodes the result. `undefined` and `null` are omitted. Arrays and nested objects are not expanded; they stringify as a single value.
- Only `POST`, `PUT`, and `PATCH` bodies are JSON-stringified and forwarded. `GET` and `DELETE` bodies are not sent.
- Request schemas may transform values, but body validation currently checks the transformed result without replacing the original body. Params and query do use parsed/transformed values.

Pre-encode path values and flatten complex query objects at your application boundary when those defaults are not the API's wire format.

## Retry deliberately

```typescript
const result = await api.get("/reports/{id}", {
  params: { id },
  retries: 2,
  shouldRetry({ error, response }) {
    if (error instanceof TimeoutError) return true;
    return response !== undefined && response.status >= 500;
  },
});
```

`retries` is the number of retries after the initial attempt. Backoff is 1 second, 2 seconds, 4 seconds, and so on, capped at 30 seconds. `attempt` is zero-based. Response-based retries occur only when `shouldRetry` is supplied. Without it, thrown transport errors are retried, except an `UnexpectedApiClientError` carrying a 4xx code. Validation errors are never retried.

If every response-based retry is consumed, the last response is parsed and returned. If thrown failures are exhausted, the last `Error` is rethrown.

## Add structured logging

```typescript
const api = createApiClient({
  baseUrl,
  Request,
  Response,
  logger: {
    warn: (message, meta) => console.warn(message, meta),
    error: (message, meta) => console.error(message, meta),
  },
});
```

Handlers are optional per level and receive a stable message plus metadata. Handler exceptions are swallowed. Set `DEBUG=alt-stack:http-client*` in a Node process to enable the package's `debug` namespaces in addition to your logger.

## Choose Fetch or Ky

| Need | Adapter |
| --- | --- |
| no additional transport dependency; native `Response` | Fetch |
| Ky hooks, a preconfigured `KyInstance`, or Ky defaults | Ky |
| generated Rust SDK execution | Rust/Tokio |

Both TypeScript adapters disable their transport's automatic HTTP-error throwing and pass status/data into the core response union. Adapter-wide Fetch or Ky options are applied first; request method, headers, body, signal/timeout, and Ky's `throwHttpErrors: false` are controlled by the executor.

## Supply a custom executor

```typescript
import {
  ApiClient,
  type ExecuteRequest,
  type ExecuteResponse,
  type HttpExecutor,
} from "@alt-stack/http-client-core";

class PlatformExecutor implements HttpExecutor<{ requestId: string }> {
  async execute(request: ExecuteRequest): Promise<ExecuteResponse<{ requestId: string }>> {
    const platformResult = await platformHttp(request);
    return {
      status: platformResult.status,
      statusText: platformResult.statusText,
      data: platformResult.json,
      raw: { requestId: platformResult.requestId },
    };
  }
}

const api = new ApiClient({
  baseUrl,
  Request,
  Response,
  executor: new PlatformExecutor(),
});
```

An executor owns I/O, timeout enforcement, and response decoding. It must return status, status text, decoded data, and a raw transport value; the core owns request/response validation and result shaping.
