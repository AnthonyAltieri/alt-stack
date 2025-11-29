# GitHub Workflow Examples

This directory contains example GitHub Actions workflows that you can copy and adapt for your own projects.

## Usage

These workflows are **not executed** by GitHub Actions (workflows in subdirectories are ignored). To use one:

1. Copy the workflow file to `.github/workflows/` (the parent directory)
2. Customize it for your project's needs
3. Commit and push - GitHub Actions will run it automatically

## Available Examples

### SDK Generation (in-repo)

These workflows generate TypeScript types and commit them to your repository. Useful when you want to keep generated types checked in.

#### `generate-openapi-sdk.yml`

Generates TypeScript types from an OpenAPI schema served by your running application:

- Starts your server
- Fetches the OpenAPI schema from an endpoint
- Generates TypeScript types using `@alt-stack/zod-openapi`
- Commits changes on push, fails PR if types are outdated

**Configuration:**
```yaml
env:
  OPENAPI_ENDPOINT: '/docs/openapi.json'  # Your OpenAPI endpoint
  SERVER_START_CMD: 'pnpm start'           # Command to start server
  OUTPUT_PATH: 'generated-types.ts'        # Where to write generated types
```

#### `generate-asyncapi-sdk.yml`

Generates TypeScript types from an AsyncAPI schema file:

- Optionally runs a `generate-spec` script to create the AsyncAPI JSON
- Generates TypeScript types using `@alt-stack/zod-asyncapi`
- Commits changes on push, fails PR if types are outdated

**Configuration:**
```yaml
env:
  ASYNCAPI_FILE: 'asyncapi.json'      # Your AsyncAPI spec file
  OUTPUT_PATH: 'generated-types.ts'   # Where to write generated types
```

---

### SDK Publishing (npm packages)

These workflows generate TypeScript SDKs and publish them to npm. Useful when you want consumers to install your API types as a package.

#### `publish-openapi-schema.yml`

Publishes an SDK package from your OpenAPI schema:

- Starts your server
- Fetches the OpenAPI schema
- Generates a complete npm package with TypeScript types
- Builds and publishes to npm

**Configuration:**
```yaml
env:
  OPENAPI_ENDPOINT: '/docs/openapi.json'
  SERVER_START_CMD: 'pnpm start'
  NPM_PACKAGE_NAME: '@your-org/your-api-sdk'  # Optional, defaults to {name}-sdk
```

**Required secrets:**
- `NPM_TOKEN` - npm access token for publishing

#### `publish-asyncapi-schema.yml`

Publishes an SDK package from your AsyncAPI schema:

- Generates TypeScript types from AsyncAPI spec
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

1. Ensure your server exposes an OpenAPI JSON endpoint (e.g., `/docs/openapi.json`)
2. Copy `generate-openapi-sdk.yml` or `publish-openapi-schema.yml` to `.github/workflows/`
3. Update the environment variables to match your setup
4. For publishing workflows, add `NPM_TOKEN` to your repository secrets

### For Kafka/Event-Driven APIs (AsyncAPI)

1. Define your Kafka topics using `@alt-stack/kafka-core` with the `kafkaRouter`
2. Add a script to generate `asyncapi.json` (see example below)
3. Copy `generate-asyncapi-sdk.yml` or `publish-asyncapi-schema.yml` to `.github/workflows/`
4. For publishing workflows, add `NPM_TOKEN` to your repository secrets

**Example generate-spec script (package.json):**
```json
{
  "scripts": {
    "generate-spec": "tsx src/generate-spec.ts"
  }
}
```

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
