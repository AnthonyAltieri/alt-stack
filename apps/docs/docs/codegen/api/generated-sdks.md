# Generated SDKs and fixtures API Documentation

The repository commits five current generated TypeScript SDKs and one private conformance fixture. Generated route and topic names describe their input documents; they are examples of generator output, not stable framework APIs.

## Classify the directories first

| Directory/package | Status | Intended use |
| --- | --- | --- |
| `packages/example-altstack-server-sdk` / `@alt-stack/example-altstack-server-sdk` | public generated OpenAPI snapshot | inspect or test TypeScript HTTP SDK output |
| `packages/example-kafka-producer-sdk` / `@alt-stack/example-kafka-producer-sdk` | public generated AsyncAPI snapshot | inspect or test topic SDK output |
| `examples/real-life/packages/backend-auth-sdk` / `@real-life/backend-auth-sdk` | private generated OpenAPI SDK | call the real-life authentication service |
| `examples/real-life/packages/backend-logic-sdk` / `@real-life/backend-logic-sdk` | private generated OpenAPI SDK | call the real-life task service |
| `examples/real-life/packages/workers-sdk` / `@real-life/workers-sdk` | private generated AsyncAPI SDK | publish real-life worker messages |
| `packages/openapi-test-spec` / `@alt-stack/openapi-test-spec` | private test fixture | exercise cross-language generator conformance |

Never import the `@real-life/*` packages outside their private example workspace. Regeneration may add, remove, or rename any route-specific or topic-specific identifier below.

## `@alt-stack/example-altstack-server-sdk`

This generated OpenAPI SDK requires Zod 4 as a peer. It exports runtime validators, their inferred TypeScript types, route-specific aliases, and the `Request` and `Response` maps consumed by Altstack HTTP clients.

```typescript
import { Request, Response } from "@alt-stack/example-altstack-server-sdk";
import { createApiClient } from "@alt-stack/http-client-fetch";

const api = createApiClient({
  baseUrl: "http://127.0.0.1:3000",
  Request,
  Response,
});
```

### Component schema and type pairs

| Exports | Contract |
| --- | --- |
| `GetApiTodosResponseSchema` / `GetApiTodosResponse` | Validates a strict array of todos. Every todo has string `id`, `title`, `createdAt`, and `userId`, optional string `description`, and boolean `completed`. |
| `PostApiTodosBodySchema` / `PostApiTodosBody` | Validates a create-todo body with a 1–200 character `title` and an optional `description` of at most 1,000 characters. The type and route-value namespaces intentionally share `PostApiTodosBody`. |
| `PostApiTodosResponseSchema` / `PostApiTodosResponse` | Validates the strict todo object returned by create, get-by-id, update, and complete routes. |
| `PostApiTodos401ErrorSchema` / `PostApiTodos401Error` | Validates a strict error envelope whose nested code is exactly `UNAUTHORIZED` and whose message is a string. |
| `GetApiTodosId404ErrorSchema` / `GetApiTodosId404Error` | Validates a strict error envelope whose nested code is exactly `NOT_FOUND` and whose message is a string. |
| `PutApiTodosIdBodySchema` / `PutApiTodosIdBody` | Validates a partial todo update: optional bounded `title` and `description` fields plus optional boolean `completed`. The type and route-value namespaces share `PutApiTodosIdBody`. |
| `PutApiTodosId400ErrorSchema` / `PutApiTodosId400Error` | Validates a strict `CUSTOM_VALIDATION_ERROR` envelope with string `message` and `field` values. |
| `PutApiTodosId403ErrorSchema` / `PutApiTodosId403Error` | Validates a strict `FORBIDDEN` error envelope with a string message. |
| `DeleteApiTodosIdResponseSchema` / `DeleteApiTodosIdResponse` | Validates the strict delete acknowledgement object containing boolean `success`. |
| `PatchApiTodosIdCompleteBodySchema` / `PatchApiTodosIdCompleteBody` | Validates the completion body containing a required boolean `completed`. The type and route-value namespaces share `PatchApiTodosIdCompleteBody`. |
| `GetApiUsersMeResponseSchema` / `GetApiUsersMeResponse` | Validates the strict current-user object with string `id` and `email` plus role `admin` or `user`. |
| `GetApiUsersIdResponseSchema` / `GetApiUsersIdResponse` | Validates the strict public-user object with string `id` and `email`. |
| `GetApiAdminUsersResponseSchema` / `GetApiAdminUsersResponse` | Validates an array of strict admin-visible user objects with `id`, `email`, and `admin`/`user` role. |

### Route input validators

| Export | Contract |
| --- | --- |
| `GetApiTodosQuery` | Validates the list filter: optional string enum `completed` (`true` or `false`), optional integer `limit`, and non-negative optional integer `offset`. |
| `PostApiTodosBody` | Reuses the bounded create-todo body for `POST /api/todos`. |
| `GetApiTodosIdParams` | Validates the UUID `id` path parameter for `GET /api/todos/{id}`. |
| `PutApiTodosIdParams` | Validates the UUID `id` path parameter for the todo update route. |
| `PutApiTodosIdQuery` | Validates the optional boolean `notify` query flag on a todo update. |
| `PutApiTodosIdBody` | Reuses the partial todo-update validator for `PUT /api/todos/{id}`. |
| `DeleteApiTodosIdParams` | Validates the UUID `id` path parameter for deleting a todo. |
| `PatchApiTodosIdCompleteParams` | Validates the UUID `id` path parameter for the completion route. |
| `PatchApiTodosIdCompleteBody` | Reuses the required boolean completion body for the completion route. |
| `GetApiUsersIdParams` | Validates the UUID `id` path parameter for looking up a user. |
| `GetApiAdminUsersQuery` | Validates the optional `admin`/`user` role filter for the admin list route. |
| `DeleteApiAdminUsersIdParams` | Validates the UUID `id` path parameter for the admin delete route. |

### Route response validators

| Export | Contract |
| --- | --- |
| `GetApiTodos200Response` | Validates the 200 todo-array response for `GET /api/todos`. |
| `PostApiTodos200Response` | Validates the created todo returned with status 200. |
| `PostApiTodos401ErrorResponse` | Validates the 401 unauthorized envelope for creating a todo. |
| `GetApiTodosId200Response` | Validates the todo returned by a successful get-by-id request. |
| `GetApiTodosId404ErrorResponse` | Validates the 404 not-found envelope for get-by-id. |
| `PutApiTodosId200Response` | Validates the updated todo returned with status 200. |
| `PutApiTodosId400ErrorResponse` | Validates the update route's 400 custom field-validation error. |
| `PutApiTodosId401ErrorResponse` | Validates the update route's 401 unauthorized error. |
| `PutApiTodosId403ErrorResponse` | Validates the update route's 403 forbidden error. |
| `PutApiTodosId404ErrorResponse` | Validates the update route's 404 not-found error. |
| `DeleteApiTodosId200Response` | Validates the successful todo-deletion acknowledgement. |
| `DeleteApiTodosId401ErrorResponse` | Validates the todo delete route's 401 unauthorized error. |
| `DeleteApiTodosId404ErrorResponse` | Validates the todo delete route's 404 not-found error. |
| `PatchApiTodosIdComplete200Response` | Validates the updated todo returned by a successful completion request. |
| `PatchApiTodosIdComplete401ErrorResponse` | Validates the completion route's 401 unauthorized error. |
| `PatchApiTodosIdComplete404ErrorResponse` | Validates the completion route's 404 not-found error. |
| `GetApiUsersMe200Response` | Validates the current user's strict `id`, `email`, and role object. |
| `GetApiUsersMe401ErrorResponse` | Validates the current-user route's 401 unauthorized error. |
| `GetApiUsersId200Response` | Validates the public `id` and `email` object returned for a user. |
| `GetApiUsersId404ErrorResponse` | Validates the user lookup route's 404 not-found error. |
| `GetApiAdminUsers200Response` | Validates the admin route's array of user records. |
| `GetApiAdminUsers401ErrorResponse` | Validates the admin list route's 401 unauthorized error. |
| `GetApiAdminUsers403ErrorResponse` | Validates the admin list route's 403 forbidden error. |
| `DeleteApiAdminUsersId200Response` | Validates the successful admin-user deletion acknowledgement. |
| `DeleteApiAdminUsersId401ErrorResponse` | Validates the admin delete route's 401 unauthorized error. |
| `DeleteApiAdminUsersId403ErrorResponse` | Validates the admin delete route's 403 forbidden error. |
| `DeleteApiAdminUsersId404ErrorResponse` | Validates the admin delete route's 404 not-found error. |

### Request and response maps

| Export | Contract |
| --- | --- |
| `Request` | Groups input validators under their exact OpenAPI path and uppercase method. It covers todo list/create/get/update/delete/complete, user get-by-id, admin user list, and admin user delete; routes without input validators are absent from this map. |
| `Response` | Groups every declared status validator under its exact path and method. It additionally contains `GET /api/users/me`, which has no corresponding `Request` entry because it accepts no params, query, or body. |

Both maps are emitted `as const`, allowing clients to derive path, method, input, and status unions. Route aliases may point at a shared component schema; their route-specific names remain generated details.

## `@alt-stack/example-kafka-producer-sdk`

This generated AsyncAPI SDK also requires Zod 4 as a peer. Payload component pairs describe reusable schemas, while message pairs represent the schema attached to each concrete topic.

| Exports | Contract |
| --- | --- |
| `UserEventsPayloadSchema` / `UserEventsPayload` | Validates a user event with string `userId`, event type `created`, `updated`, or `deleted`, numeric `timestamp`, and optional string-keyed unknown `metadata`. |
| `OrdersCreatedPayloadSchema` / `OrdersCreatedPayload` | Validates an order with string `orderId` and `userId`, item records containing string `productId`, integer `quantity`, and non-negative `price`, plus a non-negative `total`. |
| `NotificationsPayloadSchema` / `NotificationsPayload` | Validates a notification containing string `type`, `recipient`, and `message` fields. |
| `UserEventsMessageSchema` / `UserEventsMessage` | Validates the complete message published on `user-events`; its current shape matches the user-events payload component. |
| `OrdersCreatedMessageSchema` / `OrdersCreatedMessage` | Validates the complete message published on `orders/created`; its current shape matches the order-created payload component. |
| `NotificationsMessageSchema` / `NotificationsMessage` | Validates the complete message published on `notifications`; its current shape matches the notification payload component. |
| `Topics` | Maps `user-events`, `orders/created`, and `notifications` to their generated message schemas for runtime parsing and producer configuration. |
| `TopicName` | Represents the exact key union of `Topics`, preventing arbitrary topic strings in typed callers. |
| `MessageType<T extends TopicName>` | Infers the parsed message type for the selected topic key from its Zod schema. |

```typescript
import { Topics, type MessageType } from "@alt-stack/example-kafka-producer-sdk";

const event: MessageType<"user-events"> = Topics["user-events"].parse({
  userId: "u_1",
  eventType: "created",
  timestamp: Date.now(),
});
```

## Private real-life generated SDKs

The real-life workspace now commits actual output from its current OpenAPI and AsyncAPI documents. Each package is private, and each generated `src/index.ts` remains replaceable in full.

### `@real-life/backend-auth-sdk`

The authentication SDK exposes these generated interface/schema pairs:

| Exports | Contract |
| --- | --- |
| `PostApiSignupBody` / `PostApiSignupBodySchema` | Requires a valid email, password of at least eight characters, and non-empty name. |
| `PostApiSignupResponse` / `PostApiSignupResponseSchema` | Represents a strict user plus session object; the session contains token, user ID, and an ISO date-time expiry. |
| `PostApiSignup409Error` / `PostApiSignup409ErrorSchema` | Represents a tagged `EmailExistsError` conflict. |
| `PostApiLoginBody` / `PostApiLoginBodySchema` | Requires a valid email and string password for login. |
| `PostApiLogin401Error` / `PostApiLogin401ErrorSchema` | Represents a tagged `InvalidCredentialsError`. |
| `PostApiLogoutResponse` / `PostApiLogoutResponseSchema` | Represents the boolean `success` logout acknowledgement. |
| `GetApiMeResponse` / `GetApiMeResponseSchema` | Represents the authenticated user's ID, valid email, and name. |
| `GetApiMe401Error` / `GetApiMe401ErrorSchema` | Represents a tagged `UnauthorizedError`. |
| `GetApiValidateResponse` / `GetApiValidateResponseSchema` | Represents session validity and an optional user ID. |

`PostApiSignupBody`, `PostApiSignup200Response`, and `PostApiSignup409ErrorResponse` form signup's generated body, success, and conflict aliases. `PostApiLoginBody`, `PostApiLogin200Response`, and `PostApiLogin401ErrorResponse` form login's body, shared signup-shaped success, and invalid-credentials response. `PostApiLogout200Response`, `GetApiMe200Response`, `GetApiMe401ErrorResponse`, and `GetApiValidate200Response` cover the remaining route responses.

`Request` maps `POST /api/signup` and `POST /api/login` bodies plus empty input objects for logout, current-user, and validation routes. `Response` maps all five routes to their declared 200, 401, or 409 status validators.

```bash
pnpm --dir examples/real-life --filter @real-life/backend-auth generate
```

### `@real-life/backend-logic-sdk`

The task SDK exposes these generated interface/type and schema pairs:

| Exports | Contract |
| --- | --- |
| `GetApiResponse` / `GetApiResponseSchema` | Represents an array of tasks with IDs, task data, status, owner ID, and ISO date-time creation/update timestamps. |
| `PostApiBody` / `PostApiBodySchema` | Validates a non-empty 1–200 character title and optional description of at most 1,000 characters. |
| `PostApiResponse` / `PostApiResponseSchema` | Represents one strict task with `pending`, `in_progress`, or `completed` status and ISO timestamps. |
| `PostApi401Error` / `PostApi401ErrorSchema` | Represents a tagged `UnauthorizedError`. |
| `GetApiId404Error` / `GetApiId404ErrorSchema` | Represents a tagged `NotFoundError`. |
| `PutApiIdBody` / `PutApiIdBodySchema` | Validates a partial update of bounded title/description and the three-state status enum. |
| `PutApiId403Error` / `PutApiId403ErrorSchema` | Represents a tagged `ForbiddenError`. |
| `DeleteApiIdResponse` / `DeleteApiIdResponseSchema` | Represents the boolean `success` deletion acknowledgement. |

The shared response aliases are `PostApi200Response`, `PostApi401ErrorResponse`, `GetApiId404ErrorResponse`, and `PutApiId403ErrorResponse`. Route input aliases are `PostApiBody`, `GetApiIdParams`, `PutApiIdParams`, `PutApiIdBody`, and `DeleteApiIdParams`; every path parameter validates a UUID. Route response aliases are `GetApi200Response`, `GetApiId200Response`, `PutApiId200Response`, `PutApiId401ErrorResponse`, `PutApiId404ErrorResponse`, `DeleteApiId200Response`, `DeleteApiId401ErrorResponse`, `DeleteApiId403ErrorResponse`, and `DeleteApiId404ErrorResponse`.

`Request` maps list/create at `/api` and get/update/delete at `/api/{id}`. `Response` assigns the generated 200, 401, 403, and 404 validators to those same method/path pairs.

```bash
pnpm --dir examples/real-life --filter @real-life/backend-logic generate
```

### `@real-life/workers-sdk`

| Exports | Contract |
| --- | --- |
| `SendNotificationPayloadSchema` / `SendNotificationPayload` | Validates a notification job with event type `task_created`, `task_completed`, or `task_assigned` plus string user, task, and title fields. |
| `GenerateReportPayloadSchema` / `GenerateReportPayload` | Validates a report job with string task and user IDs plus an ISO-like completion date-time string. |
| `SendNotificationMessageSchema` / `SendNotificationMessage` | Represents the complete message for `send-notification` and currently aliases its payload validator. |
| `GenerateReportMessageSchema` / `GenerateReportMessage` | Represents the complete message for `generate-report` and currently aliases its payload validator. |
| `Topics` | Maps `send-notification` and `generate-report` to their current runtime validators. |
| `TopicName` | Represents exactly the two topic keys in `Topics`. |
| `MessageType<T extends TopicName>` | Infers the validated message type for a selected worker topic. |

```bash
pnpm --dir examples/real-life --filter @real-life/workers generate
```

## `@alt-stack/openapi-test-spec`

This package is marked `private: true` and exports only the subpath `@alt-stack/openapi-test-spec/openapi.json`. It is not an application dependency or a general sample API.

The OpenAPI 3.0 fixture deliberately covers:

- string formats, enums, patterns, lengths, numeric bounds, booleans, and arrays;
- strict, free-form, optional, nullable, and additional-property objects;
- local references, nested objects, `oneOf` discriminators, and `allOf` intersections;
- path/query/header parameters, JSON request bodies, success/error statuses, and repeated error shapes;
- `x-altstack-examples.valid` and `.invalid` samples used by conformance tests.

TypeScript, Python, and Rust generator tests read this same document. The `x-altstack-examples` extension is fixture metadata, not a generator configuration field and not emitted into route validation logic.

## Safe update workflow

1. Change the owning server/event schemas or the explicit test fixture.
2. Regenerate the relevant SDK with the pinned workspace generator.
3. Run its package type check or language test.
4. Review the entire generated diff; do not hand-correct it.

Keep the generated banner in every snapshot so consumers do not mistake route-specific output for a stable hand-authored API.
