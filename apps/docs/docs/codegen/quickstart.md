# Code generation quickstart

Altstack generators consume OpenAPI or AsyncAPI documents and emit language-native validation models and lookup structures. They do not require the source service to use an Altstack server.

Choose the target you need:

| Input | Output | Generator |
| --- | --- | --- |
| OpenAPI | TypeScript interfaces, Zod schemas, `Request`/`Response` maps | `@alt-stack/zod-openapi` |
| OpenAPI | Python Pydantic models and `Request`/`Response` maps | `python-pydantic-openapi` |
| OpenAPI | Rust Serde models and route modules | `rust-openapi` |
| OpenAPI | complete Rust crate scaffold | `rust-openapi-crate-gen` |
| AsyncAPI | TypeScript Zod schemas and a `Topics` map | `@alt-stack/zod-asyncapi` |

## TypeScript from OpenAPI

Install the generator and its generated-code runtime:

```bash
pnpm add zod
pnpm add -D @alt-stack/zod-openapi
```

Create `openapi.json`:

```json
{
  "openapi": "3.0.0",
  "info": { "title": "Users", "version": "1.0.0" },
  "paths": {
    "/users/{id}": {
      "get": {
        "parameters": [
          { "name": "id", "in": "path", "required": true, "schema": { "type": "string" } }
        ],
        "responses": {
          "200": {
            "description": "Found",
            "content": {
              "application/json": { "schema": { "$ref": "#/components/schemas/User" } }
            }
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "User": {
        "type": "object",
        "properties": { "id": { "type": "string" }, "name": { "type": "string" } },
        "required": ["id", "name"],
        "additionalProperties": false
      }
    }
  }
}
```

Generate:

```bash
pnpm zod-openapi openapi.json --output src/generated-api.ts
```

The output includes `User`, `UserSchema`, route schemas, and `Request`/`Response` values suitable for `@alt-stack/http-client-fetch` or `@alt-stack/http-client-ky`:

```typescript
import { createApiClient } from "@alt-stack/http-client-fetch";
import { Request, Response, UserSchema } from "./generated-api.js";

const api = createApiClient({
  baseUrl: "http://127.0.0.1:3000",
  Request,
  Response,
});

const localUser = UserSchema.parse({ id: "u_1", name: "Ada" });
const result = await api.get("/users/{id}", { params: { id: localUser.id } });
```

The final request assumes the example API is running on port 3000. See the [HTTP client quickstart](../http-client/quickstart.md) for a complete local server-and-client run.

## Python from OpenAPI

Python generation requires Python 3.11 or newer and Pydantic 2.7 or newer.

```bash
python -m pip install python-pydantic-openapi
python-pydantic-openapi openapi.json --output generated_types.py
```

Validate with the generated model:

```python
from generated_types import User

user = User.model_validate({"id": "u_1", "name": "Ada"})
print(user.name)
```

The generated module also contains `Request` and `Response` dictionaries whose leaves are Pydantic model classes.

## Rust models from OpenAPI

The Rust generators are workspace crates in this repository. From the repository root:

```bash
cargo run -p rust-openapi -- openapi.json --output /tmp/generated.rs
```

The generated source contains Serde models, route type modules, the original document as `OPENAPI_JSON`, and a `default_http_client` re-export. A standalone file still needs a crate manifest with the dependencies used by its emitted types.

For a complete crate scaffold instead:

```bash
cargo run -p rust-openapi-crate-gen -- \
  openapi.json \
  --package-name users-sdk \
  --output /tmp/users-sdk \
  --runtime-path "$PWD/packages/http-client-rust-tokio"

cargo check --manifest-path /tmp/users-sdk/Cargo.toml
```

Use `--runtime-version 0.1.0` instead of `--runtime-path` when the runtime is available from your configured Cargo registry.

## TypeScript from AsyncAPI

Install:

```bash
pnpm add zod
pnpm add -D @alt-stack/zod-asyncapi
```

Create `asyncapi.json` using the AsyncAPI 3 channel shape consumed by the generator:

```json
{
  "asyncapi": "3.0.0",
  "info": { "title": "Jobs", "version": "1.0.0" },
  "channels": {
    "emailJob": {
      "address": "email.send",
      "messages": {
        "SendEmail": {
          "payload": {
            "type": "object",
            "properties": {
              "to": { "type": "string", "format": "email" },
              "subject": { "type": "string" }
            },
            "required": ["to", "subject"],
            "additionalProperties": false
          }
        }
      }
    }
  }
}
```

Generate and use the topic map:

```bash
pnpm zod-asyncapi asyncapi.json --output src/generated-topics.ts
```

```typescript
import { Topics, type MessageType } from "./generated-topics.js";

type EmailMessage = MessageType<"email.send">;
const message: EmailMessage = Topics["email.send"].parse({
  to: "ada@example.com",
  subject: "Welcome",
});
```

## Generated files are replaceable

Every emitted TypeScript and Python module, Rust source file, and scaffold README identifies itself as generated. Do not hand-edit generated output. Keep changes in the source document, registry/include file, or generator configuration, then regenerate.

Read [Code generation common patterns](./common-patterns.md) for registries, include files, route shapes, CI drift checks, and current input constraints. The package-specific API pages document every flag and programmatic export.
