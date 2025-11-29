# GitHub Workflow Examples

This directory contains example GitHub Actions workflows that you can copy and adapt for your own projects.

## Usage

These workflows are **not executed** by GitHub Actions (workflows in subdirectories are ignored). To use one:

1. Copy the workflow file to `.github/workflows/` (the parent directory)
2. Customize it for your project's needs
3. Commit and push - GitHub Actions will run it automatically

## Available Examples

### SDK Generation (in-repo)

These workflows generate TypeScript types from a spec file and commit them to your repository. They use a `generate-spec` script to create the spec from your router definitions.

#### `generate-openapi-sdk.yml`

Generates TypeScript types from an OpenAPI schema:

- Runs your `generate-spec` script to create `openapi.json`
- Generates TypeScript types using `@alt-stack/zod-openapi`
- Commits changes on push, fails PR if types are outdated

**Configuration:**
```yaml
env:
  OPENAPI_FILE: 'openapi.json'       # Your OpenAPI spec file
  OUTPUT_PATH: 'generated-types.ts'  # Where to write generated types
```

**Required script in package.json:**
```json
{
  "scripts": {
    "generate-spec": "tsx src/generate-spec.ts"
  }
}
```

#### `generate-asyncapi-sdk.yml`

Generates TypeScript types from an AsyncAPI schema:

- Runs your `generate-spec` script to create `asyncapi.json`
- Generates TypeScript types using `@alt-stack/zod-asyncapi`
- Commits changes on push, fails PR if types are outdated

**Configuration:**
```yaml
env:
  ASYNCAPI_FILE: 'asyncapi.json'     # Your AsyncAPI spec file
  OUTPUT_PATH: 'generated-types.ts'  # Where to write generated types
```

---

### SDK Publishing (npm packages)

These workflows generate TypeScript SDKs and publish them to npm. Useful when you want consumers to install your API types as a package.

#### `publish-openapi-schema.yml`

Publishes an SDK package from your OpenAPI schema:

- Runs your `generate-spec` script (optional)
- Generates a complete npm package with TypeScript types
- Builds and publishes to npm

**Configuration:**
```yaml
env:
  OPENAPI_FILE: 'openapi.json'
  NPM_PACKAGE_NAME: '@your-org/your-api-sdk'  # Optional, defaults to {name}-sdk
```

**Required secrets:**
- `NPM_TOKEN` - npm access token for publishing

#### `publish-asyncapi-schema.yml`

Publishes an SDK package from your AsyncAPI schema:

- Runs your `generate-spec` script (optional)
- Creates a complete npm package
- Builds and publishes to npm

**Configuration:**
```yaml
env:
  ASYNCAPI_FILE: 'asyncapi.json'
  NPM_PACKAGE_NAME: '@your-org/your-kafka-sdk'  # Optional, defaults to {name}-sdk
```

**Required secrets:**
- `NPM_TOKEN` - npm access token for publishing

---

## Quick Start

### For REST APIs (OpenAPI)

1. Create a router with `@alt-stack/server-hono`
2. Add a `generate-spec` script that uses `generateOpenAPISpec()`
3. Copy `generate-openapi-sdk.yml` or `publish-openapi-schema.yml` to `.github/workflows/`
4. For publishing workflows, add `NPM_TOKEN` to your repository secrets

**Example generate-spec.ts:**
```typescript
import { writeFileSync } from 'fs';
import { generateOpenAPISpec } from '@alt-stack/server-hono';
import { appRouter } from './router';

const spec = generateOpenAPISpec(appRouter, {
  title: 'My API',
  version: '1.0.0',
});

writeFileSync('openapi.json', JSON.stringify(spec, null, 2));
```

### For Kafka/Event-Driven APIs (AsyncAPI)

1. Define your Kafka topics using `@alt-stack/kafka-core` with the `kafkaRouter`
2. Add a `generate-spec` script that uses `generateAsyncAPISpec()`
3. Copy `generate-asyncapi-sdk.yml` or `publish-asyncapi-schema.yml` to `.github/workflows/`
4. For publishing workflows, add `NPM_TOKEN` to your repository secrets

**Example generate-spec.ts:**
```typescript
import { writeFileSync } from 'fs';
import { generateAsyncAPISpec } from '@alt-stack/kafka-core';
import { myKafkaRouter } from './router';

const spec = generateAsyncAPISpec(myKafkaRouter, {
  title: 'My Kafka API',
  version: '1.0.0',
});

writeFileSync('asyncapi.json', JSON.stringify(spec, null, 2));
```

---

## Local Development

Run the same commands locally to test before pushing:

```bash
# Generate spec
npm run generate-spec

# Generate types
npx zod-openapi openapi.json -o generated-types.ts
# or
npx zod-asyncapi asyncapi.json -o generated-types.ts
```

Or combine them in a single script:

```json
{
  "scripts": {
    "generate-spec": "tsx src/generate-spec.ts",
    "generate-types": "npm run generate-spec && npx zod-openapi openapi.json -o generated-types.ts"
  }
}
```
