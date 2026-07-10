# `@real-life/backend-auth-sdk`

Private generated OpenAPI SDK for the real-life authentication service. Its checked-in `src/index.ts` is current generator output and requires Zod 4 from the consuming workspace.

## Current contract

| Route | `Request` input | `Response` statuses |
| --- | --- | --- |
| `POST /api/signup` | `PostApiSignupBody`: valid email, password of at least eight characters, and non-empty name | 200 user/session object; 409 tagged `EmailExistsError` |
| `POST /api/login` | `PostApiLoginBody`: valid email and string password | 200 user/session object; 401 tagged `InvalidCredentialsError` |
| `POST /api/logout` | no params, query, or body validator | 200 object with boolean `success` |
| `GET /api/me` | no params, query, or body validator | 200 authenticated user; 401 tagged `UnauthorizedError` |
| `GET /api/validate` | no params, query, or body validator | 200 boolean `valid` plus optional `userId` |

The generated interfaces and matching runtime schemas are `PostApiSignupBody`/`PostApiSignupBodySchema`, `PostApiSignupResponse`/`PostApiSignupResponseSchema`, `PostApiSignup409Error`/`PostApiSignup409ErrorSchema`, `PostApiLoginBody`/`PostApiLoginBodySchema`, `PostApiLogin401Error`/`PostApiLogin401ErrorSchema`, `PostApiLogoutResponse`/`PostApiLogoutResponseSchema`, `GetApiMeResponse`/`GetApiMeResponseSchema`, `GetApiMe401Error`/`GetApiMe401ErrorSchema`, and `GetApiValidateResponse`/`GetApiValidateResponseSchema`.

`Request` groups route inputs by path and method. `Response` groups the declared 200, 401, and 409 validators. Use those maps with an Altstack HTTP client instead of reconstructing route types by hand.

## Regenerate

First regenerate the authentication app's OpenAPI artifact, then replace this SDK in full:

```bash
pnpm --dir examples/real-life --filter @real-life/backend-auth generate
```

The application script writes `apps/backend-auth/openapi.json`, then runs this SDK's `zod-openapi` command. Review the complete generated diff and keep the generated-file banner.

See [Generated SDKs and fixtures](../../../../apps/docs/docs/codegen/api/generated-sdks.md) and the [Code generation Quickstart](../../../../apps/docs/docs/codegen/quickstart.md).
