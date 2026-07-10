# `@real-life/backend-logic-sdk`

Private generated OpenAPI SDK for the real-life task service. Its checked-in `src/index.ts` is current generator output and requires Zod 4 from the consuming workspace.

## Current contract

| Route | `Request` input | `Response` statuses |
| --- | --- | --- |
| `GET /api` | no params, query, or body validator | 200 task array |
| `POST /api` | `PostApiBody`: required 1–200 character title and optional description up to 1,000 characters | 200 task; 401 tagged `UnauthorizedError` |
| `GET /api/{id}` | `GetApiIdParams`: UUID `id` | 200 task; 404 tagged `NotFoundError` |
| `PUT /api/{id}` | UUID params plus `PutApiIdBody`, a partial title/description/status update | 200 task; 401 unauthorized; 403 tagged `ForbiddenError`; 404 not found |
| `DELETE /api/{id}` | UUID params | 200 boolean `success`; 401 unauthorized; 403 forbidden; 404 not found |

Task values contain IDs, title, optional description, `pending`/`in_progress`/`completed` status, owner ID, and ISO date-time creation and update strings. The primary generated type/schema pairs are `GetApiResponse`/`GetApiResponseSchema`, `PostApiBody`/`PostApiBodySchema`, `PostApiResponse`/`PostApiResponseSchema`, `PostApi401Error`/`PostApi401ErrorSchema`, `GetApiId404Error`/`GetApiId404ErrorSchema`, `PutApiIdBody`/`PutApiIdBodySchema`, `PutApiId403Error`/`PutApiId403ErrorSchema`, and `DeleteApiIdResponse`/`DeleteApiIdResponseSchema`.

`Request` groups the five method/path pairs and their input validators. `Response` assigns each declared 200, 401, 403, and 404 schema. Route-specific aliases may reuse a common generated component schema.

## Regenerate

First regenerate the task app's OpenAPI artifact, then replace this SDK in full:

```bash
pnpm --dir examples/real-life --filter @real-life/backend-logic generate
```

The application script writes `apps/backend-logic/openapi.json`, then runs this SDK's `zod-openapi` command. Review the complete generated diff and keep the generated-file banner.

See [Generated SDKs and fixtures](../../../../apps/docs/docs/codegen/api/generated-sdks.md) and the [Code generation Quickstart](../../../../apps/docs/docs/codegen/quickstart.md).
