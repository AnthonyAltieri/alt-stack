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
  post(endpoint, options & { body: ... }): Promise<ApiResponse<...>>;
  put(endpoint, options & { body: ... }): Promise<ApiResponse<...>>;
  patch(endpoint, options & { body: ... }): Promise<ApiResponse<...>>;
  delete(endpoint, options): Promise<ApiResponse<...>>;
}
```

The endpoint generic is restricted to routes that contain the selected uppercase method in `TRequest`. All five methods require an options object; use `{}` when a route has no input. `post`, `put`, and `patch` require `body` in their public method signatures. Request/response behavior is described under [`RequestOptions`](#request-methods-and-requestoptions) and [`ApiResponse`](#apiresponse).

### `ApiClientOptions`

| Property | Type | Meaning |
| --- | --- | --- |
| `baseUrl` | `string` | Prefix concatenated directly with the interpolated endpoint. A trailing slash plus a leading endpoint slash produces `//`. |
| `headers` | `Record<string, unknown>?` | Client-wide headers. Non-null values are stringified. |
| `Request` | `TRequest` | Zod request-schema map keyed by endpoint and uppercase method. |
| `Response` | `TResponse` | Zod response-schema map keyed by endpoint, uppercase method, and string status code. |
| `onValidationError` | `ApiClientValidationErrorHandler<TRawResponse>?` | Observes Zod parse failures. Callback exceptions are swallowed. |
| `executor` | `HttpExecutor<TRawResponse>` | Performs transport I/O and decoding. |
| `logger` | `Logger?` | Optional structured logging handlers. |

`ApiClientLoggingOptions` is the reusable `{ logger?: Logger }` base interface.

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
- `UnexpectedErrorResponse` is the catch-all type for undocumented non-2xx statuses and response-validation mismatches.

An undocumented 2xx response is returned as success at runtime even though that success member is not represented by the static union. Its body is not validated. A documented response-schema mismatch calls the validation hook and currently returns `{ success: false, code: number, error: UnexpectedApiClientError, raw }`.

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
| `BodyRequired<...>` | `true` when the method entry has a Zod `body` schema |
| `EndpointsWithMethod<TRequest, TMethod>` | endpoint-key union containing the requested method |

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

Adds optional numeric `code`. Executors use it for network failures (without a code); response handling uses it for undocumented non-2xx statuses and response validation failures (with a status code).

### `ValidationError`

Adds `validationErrors: unknown`. Zod failures store `ZodIssue[]`; missing path tokens store `{ missing: string[] }`. Request validation throws this class. See the response-mismatch caveat under `ApiResponse`.

### `TimeoutError`

Adds `timeout: number` and uses the message `Request timeout after <timeout>ms`. Timeout enforcement belongs to the executor.

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
