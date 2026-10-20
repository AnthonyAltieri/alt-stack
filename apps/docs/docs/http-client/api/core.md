# HTTP client core API Documentation

`@alt-stack/http-client-core` is the transport-neutral TypeScript runtime. Most applications import its API through the Fetch or Ky package, which re-export the core symbols.

```bash
pnpm add @alt-stack/http-client-core zod
```

The package requires Zod 4. It performs JSON-oriented request construction and depends on standard `URLSearchParams` and timer globals. It does not perform I/O without an `HttpExecutor`.

## `ApiClient`

```typescript
class ApiClient<
  TRequest extends ApiRequestSchema,
  TResponse extends ApiResponseSchema,
  TRawResponse = unknown,
> {
  constructor(options: ApiClientOptions<TRequest, TResponse, TRawResponse>);
  readonly options: ApiClientOptions<TRequest, TResponse, TRawResponse>;

  get(endpoint, options): Promise<ApiResponse<...>>;
  post(endpoint, options): Promise<ApiResponse<...>>;
  put(endpoint, options): Promise<ApiResponse<...>>;
  patch(endpoint, options): Promise<ApiResponse<...>>;
  delete(endpoint, options): Promise<ApiResponse<...>>;
}
```

The endpoint generic is restricted to routes that contain the selected uppercase method in `TRequest`. All five methods require an options object; use `{}` when a route has no input. A required body schema requires `body`; a schema accepting `undefined` makes it optional. Routes without a body schema accept omitted `body` and reject payloads. These rules are shared by Fetch and Ky. Request/response behavior is described under [`RequestOptions`](#request-methods-and-requestoptions) and [`ApiResponse`](#apiresponse).

### `ApiClientOptions`

| Property | Type | Meaning |
| --- | --- | --- |
| `baseUrl` | `string` | Prefix concatenated directly with the interpolated endpoint. A trailing slash plus a leading endpoint slash produces `//`. |
| `headers` | `Record<string, unknown> \| (() => Record<string, unknown> \| Promise<Record<string, unknown>>)` (optional) | Static client headers or a provider evaluated once per attempt. |
| `Request` | `TRequest` | Zod request-schema map keyed by endpoint and uppercase method. |
| `Response` | `TResponse` | Zod response-schema map keyed by endpoint, uppercase method, and string status code. |
| `onValidationError` | `ApiClientValidationErrorHandler<TRawResponse>?` | Observes Zod parse failures. Callback exceptions are swallowed. |
| `executor` | `HttpExecutor<TRawResponse>` | Performs transport I/O and decoding. |
| `logger` | `Logger?` | Optional structured logging handlers. |

`ApiClientLoggingOptions` is the reusable `{ logger?: Logger }` base interface.

### Header providers

Client `headers` can be a record or a zero-argument function returning a record or a `Promise` of one. A provider runs after request validation, once per attempt, including retries controlled by core. Its resolved headers are not cached between requests or attempts.

Headers merge in order: `Content-Type: application/json` when a JSON body is sent, client headers, then per-request headers. Requests without a body have no default `Content-Type`; explicitly supplied headers are preserved. Non-nullish values are converted with `String`; `null` and `undefined` are skipped without removing an earlier value. Keys merge as ordinary case-sensitive object keys. Only records are supported; convert `Headers` or tuple lists to a record before supplying them.

Provider throws and rejections enter the existing thrown-error retry path as `UnexpectedApiClientError("Header provider failed")`, with endpoint and method context. The original thrown value is discarded, including its message and cause, so it cannot expose credentials through the returned error, retry callbacks or internal logs. The failed attempt does not invoke the executor. The executor's `timeout` starts after headers resolve and does not bound provider execution.

See [custom fetch and auth headers](../common-patterns.md#custom-fetch-and-auth-headers) for an example shared by the Fetch and Ky adapters. Ky's internal retries reuse resolved headers; use core `retries` to refresh a provider on retry.

## Request methods and `RequestOptions`

```typescript
type RequestOptions<TRequest, TEndpoint, TMethod> = {
  timeout?: number;
  retries?: number;
  headers?: Record<string, unknown>;
  shouldRetry?: (context: RetryContext) => boolean;
  // params, query, and body are conditionally present from TRequest
};
```

| Property | Runtime behavior |
| --- | --- |
| `params` | Validated with the route's `params` schema, then replaces `{key}` tokens. Required when a schema exists or the endpoint contains a token. |
| `query` | Validated when a `query` schema exists. Non-null entries are stringified into `URLSearchParams`. |
| `body` | Validated when a `body` schema exists. Serialized only by `POST`, `PUT`, and `PATCH`. |
| `headers` | Overlays client headers; nullish values are omitted. |
| `timeout` | Forwarded in milliseconds to the executor. The core does not enforce it. |
| `retries` | Retry count after the first attempt; defaults to `0`. Negative values cause no execution and ultimately an unexpected error. Use a non-negative integer. |
| `shouldRetry` | Decides both thrown-error and response-based retries. Only consulted while another retry remains. |

`RetryContext` has `attempt: number` (zero-based) and either `error?: unknown` or `response?: { status; statusText; data }`. A response is available before schema validation. The callback is synchronous; a returned truthy boolean retries after exponential backoff.

## `ApiResponse`

```typescript
type SuccessResponse<TBody, TCode extends string, TRaw = unknown> = {
  success: true;
  body: TBody;
  code: TCode;
  raw: TRaw;
};

type ErrorResponse<TError, TCode extends string, TRaw = unknown> = {
  success: false;
  error: TError;
  code: TCode;
  raw: TRaw;
};

type UnexpectedErrorResponse<TRaw = unknown> = {
  success: false;
  error: unknown;
  code: number;
  raw?: TRaw;
};
```

`ApiResponse<TResponse, TEndpoint, TMethod, TRawResponse>` distributes over all documented status schemas:

- `SuccessResponse` is produced for string codes beginning with `2`.
- `ErrorResponse` is produced for documented codes that do not begin with `2`.
- `UnexpectedErrorResponse` is the catch-all type for undocumented statuses (including 2xx) and response-validation mismatches.

An undocumented status, including 2xx, returns `{ success: false, code: number, error: UnexpectedApiClientError, raw }`. The error carries the received numeric status. This strict behavior also applies when the response map is empty; there is no permissive option. Declare every expected success status. A content-free success uses `z.undefined()` and returns `body: undefined`; custom executors must supply `data: undefined` for an empty body. A documented response-schema mismatch calls the validation hook and currently returns `{ success: false, code: number, error: UnexpectedApiClientError, raw }`.

### Response extraction types

| Export | Result |
| --- | --- |
| `ExtractStatusCodes<TResponse, TEndpoint, TMethod>` | all string status keys |
| `ExtractSuccessCodes<...>` | keys matching `` `2${string}` `` |
| `ExtractErrorCodes<...>` | all other keys |
| `ExtractResponseSchema<..., TCode>` | the Zod schema at one code |
| `ExtractSuccessBody<...>` | union of inferred bodies across success codes, despite the historical “first” comment in source |

## Request-schema types

`ApiRequestSchema` is `Record<string, Record<string, unknown>>`. Each endpoint contains uppercase method entries; each method entry may contain `params`, `query`, and `body` Zod schemas.

`ApiResponseSchema` is `Record<string, Record<string, Record<string, z.ZodTypeAny>>>`.

| Export | Purpose |
| --- | --- |
| `ExtractPathParams<T>` | extracts token names from strings such as `"/users/{id}"` |
| `ExtractRequestParams<...>` | infers a declared params schema, or falls back to string-valued path-token params |
| `ExtractRequestQuery<...>` | infers a declared query schema or `never` |
| `ExtractRequestBody<...>` | infers a declared body schema or `never` |
| `ParamsRequired<...>` | `true` for a params schema or a path containing tokens |
| `BodyRequired<...>` | `true` when the method entry has a Zod `body` schema whose input excludes `undefined` |
| `EndpointsWithMethod<TRequest, TMethod>` | endpoint-key union containing the requested method |

Path parameter fields whose schema output is branded require the branded output type. Parse identifiers with their schema before passing them to the client. Unbranded path fields retain schema input types, preserving codec inputs. Query and body types always use `z.input`, so output-only brands do not tighten those call sites.

These are compile-time utilities; they do not inspect the response map.

## `HttpExecutor`

```typescript
interface HttpExecutor<TRawResponse = unknown> {
  execute(request: ExecuteRequest): Promise<ExecuteResponse<TRawResponse>>;
}
```

### `ExecuteRequest`

| Property | Type |
| --- | --- |
| `method` | `string` |
| `url` | `string` |
| `headers` | `Record<string, string>` |
| `body` | `string?` |
| `timeout` | `number?` |

### `ExecuteResponse`

| Property | Type | Contract |
| --- | --- | --- |
| `status` | `number` | HTTP status used for schema lookup. |
| `statusText` | `string` | Included in logs and unexpected-error messages. |
| `data` | `unknown` | Already-decoded response data to validate. |
| `raw` | `TRawResponse` | Transport-specific response returned to callers. |

The executor should throw an `Error` for transport failures. The core retries or rethrows that error according to `RequestOptions`.

## Validation hook

`ApiClientValidationErrorLocation` is `"params" | "query" | "body" | "response"`.

`ApiClientValidationErrorHandler<TRawResponse>` receives `ApiClientValidationErrorContext<TRawResponse>`:

| Property | Type | Notes |
| --- | --- | --- |
| `kind` | `"request" | "response"` | Boundary that failed. |
| `location` | `ApiClientValidationErrorLocation` | Schema location. |
| `endpoint`, `method` | `string` | Contract keys. |
| `message` | `string` | Same message used to construct the internal `ValidationError`. |
| `data` | `unknown` | Value passed to Zod. Treat it as potentially sensitive. |
| `issues` | `z.ZodIssue[]` | Zod issue list. |
| `zodError` | `z.ZodError` | Original Zod error. |
| `status`, `statusCode`, `statusText`, `raw` | optional response context | Present for response validation. |

Missing path parameters are detected without a Zod parse and therefore do not call the hook.

## Errors

### `ApiClientError`

Base `Error` with readonly optional `endpoint`, `method`, and `cause`. Its `name` is `"ApiClientError"`.

### `UnexpectedApiClientError`

Adds optional numeric `code`. Executors use it for network failures (without a code); response handling uses it for undocumented statuses and response validation failures (with a status code).

### `ValidationError`

Adds `validationErrors: unknown`. Zod failures store `ZodIssue[]`; missing path tokens store `{ missing: string[] }`. Request validation throws this class. See the response-mismatch caveat under `ApiResponse`.

### `TimeoutError`

Adds `timeout: number` and uses the message `Request timeout after <timeout>ms`. Timeout enforcement belongs to the executor.

The Fetch and Ky adapters discard original transport exceptions, including their name, code, message and cause. Network failures use the fixed message `Network request failed`; timeout failures retain only the configured timeout. Their errors omit the request URL and original cause, keeping query credentials out of error serialization. Core logs contain the stable wrapper name and message alongside the route template and method. Custom executors own sanitization of their thrown errors.

All subclasses repair their prototype chain and expose stable `name` values for `instanceof` checks.

| Constructor member | Signature and behavior |
| --- | --- |
| `ApiClientError.constructor` | `new ApiClientError(message, endpoint?, method?, cause?)`; records the optional request context and original cause |
| `UnexpectedApiClientError.constructor` | `new UnexpectedApiClientError(message, code?, endpoint?, method?, cause?)`; adds an optional numeric HTTP/status code |
| `ValidationError.constructor` | `new ValidationError(message, validationErrors, endpoint?, method?)`; requires the Zod issues or missing-parameter detail and does not accept a cause |
| `TimeoutError.constructor` | `new TimeoutError(timeout, endpoint?, method?, cause?)`; derives the message from the required millisecond timeout |

## Logging exports

`LogLevel` is `"error" | "warn" | "info" | "debug"`; `LogMeta` is `Record<string, unknown>`; `LogHandler` is `(message, meta?) => void`; and `Logger` is a partial record of levels to handlers.

`HTTP_CLIENT_DEBUG_NAMESPACE` is the string `"alt-stack:http-client"`. Internal logging also emits to `alt-stack:http-client:error`, `:warn`, `:info`, and `:debug` through the `debug` package. User logger and debug-handler failures are swallowed.

## Complete export checklist

The package entry point exports:

- values/classes: `ApiClient`, `HTTP_CLIENT_DEBUG_NAMESPACE`, `ApiClientError`, `UnexpectedApiClientError`, `ValidationError`, `TimeoutError`;
- client types: `ApiClientOptions`, `ApiClientValidationErrorLocation`, `ApiClientValidationErrorContext`, `ApiClientValidationErrorHandler`;
- executor and logging types: `HttpExecutor`, `ExecuteRequest`, `ExecuteResponse`, `LogLevel`, `LogMeta`, `LogHandler`, `Logger`, `ApiClientLoggingOptions`;
- request types: `ApiRequestSchema`, `ExtractPathParams`, `ExtractRequestParams`, `ExtractRequestQuery`, `ExtractRequestBody`, `ParamsRequired`, `BodyRequired`, `EndpointsWithMethod`, `RequestOptions`, `RetryContext`;
- response types: `ApiResponseSchema`, `ExtractStatusCodes`, `ExtractSuccessCodes`, `ExtractErrorCodes`, `ExtractResponseSchema`, `ExtractSuccessBody`, `SuccessResponse`, `ErrorResponse`, `UnexpectedErrorResponse`, `ApiResponse`.
