# CI/CD SDK Generation

Automatically generate and publish TypeScript SDKs from your API schemas using GitHub Actions.

## Overview

Alt Stack provides example GitHub Action workflows for automating SDK generation:

| Workflow | Use Case |
|----------|----------|
| `generate-openapi-sdk.yml` | Generate types from OpenAPI and commit to repo |
| `generate-asyncapi-sdk.yml` | Generate types from AsyncAPI and commit to repo |
| `publish-openapi-schema.yml` | Publish OpenAPI SDK as npm package |
| `publish-asyncapi-schema.yml` | Publish AsyncAPI SDK as npm package |

## Setup for a TypeScript Project

### Prerequisites

Your project should have:
- A `package.json` with a start script
- An endpoint that serves your OpenAPI/AsyncAPI spec
- Node.js 20+ and pnpm (or npm/yarn)

### Project Structure

```
my-api/
├── .github/
│   └── workflows/
│       └── generate-sdk.yml    # Your workflow file
├── src/
│   └── index.ts                # Your API server
├── generated-types.ts          # Generated SDK (auto-committed)
├── package.json
└── tsconfig.json
```

## Generate OpenAPI SDK (In-Repo)

This workflow generates TypeScript types from your OpenAPI spec and commits them to your repository.

### Step 1: Create the Workflow

Create `.github/workflows/generate-sdk.yml`:

```yaml
name: Generate SDK

on:
  push:
    branches: [main]
    paths: ['src/**']
  pull_request:
    paths: ['src/**']

env:
  OPENAPI_ENDPOINT: '/docs/openapi.json'
  SERVER_START_CMD: 'pnpm start'
  OUTPUT_PATH: 'generated-types.ts'

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: pnpm/action-setup@v4

      - run: pnpm install --frozen-lockfile

      - run: pnpm add -D @alt-stack/zod-openapi

      - name: Start server
        id: server
        run: |
          ${{ env.SERVER_START_CMD }} > server.log 2>&1 &
          echo "pid=$!" >> $GITHUB_OUTPUT
          
          # Wait for server
          for i in {1..30}; do
            sleep 2
            if curl -s http://localhost:3000${{ env.OPENAPI_ENDPOINT }} > /dev/null; then
              echo "Server ready"
              exit 0
            fi
          done
          cat server.log
          exit 1

      - name: Generate SDK
        run: |
          npx zod-openapi http://localhost:3000${{ env.OPENAPI_ENDPOINT }} \
            -o ${{ env.OUTPUT_PATH }}

      - name: Stop server
        if: always()
        run: kill ${{ steps.server.outputs.pid }} 2>/dev/null || true

      - name: Check for changes
        id: changes
        run: |
          if git diff --quiet ${{ env.OUTPUT_PATH }}; then
            echo "changed=false" >> $GITHUB_OUTPUT
          else
            echo "changed=true" >> $GITHUB_OUTPUT
          fi

      - name: Commit changes
        if: steps.changes.outputs.changed == 'true' && github.event_name == 'push'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add ${{ env.OUTPUT_PATH }}
          git commit -m "chore: regenerate types [skip ci]"
          git push

      - name: Fail if outdated (PR)
        if: steps.changes.outputs.changed == 'true' && github.event_name == 'pull_request'
        run: |
          echo "::error::Generated types are outdated. Run locally:"
          echo "npx zod-openapi http://localhost:3000${{ env.OPENAPI_ENDPOINT }} -o ${{ env.OUTPUT_PATH }}"
          exit 1
```

### Step 2: Configure Your Server

Ensure your server exposes an OpenAPI endpoint. With `@alt-stack/server-hono`:

```typescript title="src/index.ts"
import { init, createServer, createDocsRouter, router } from '@alt-stack/server-hono';
import { z } from 'zod';

const { publicProcedure } = init();

const appRouter = router({
  getUser: publicProcedure
    .input({ params: z.object({ id: z.string() }) })
    .output(z.object({ id: z.string(), name: z.string() }))
    .get('/users/:id', async ({ input }) => {
      return { id: input.params.id, name: 'John' };
    }),
});

const app = createServer(appRouter);

// Add OpenAPI docs at /docs/openapi.json
app.route('/docs', createDocsRouter(appRouter, {
  title: 'My API',
  version: '1.0.0',
}));

export default app;
```

### Step 3: Add Start Script

```json title="package.json"
{
  "scripts": {
    "start": "tsx src/index.ts"
  }
}
```

## Generate AsyncAPI SDK (In-Repo)

For Kafka/event-driven APIs using AsyncAPI.

### Step 1: Create the Workflow

```yaml title=".github/workflows/generate-sdk.yml"
name: Generate SDK

on:
  push:
    branches: [main]
    paths: ['src/**', 'asyncapi.json']
  pull_request:
    paths: ['src/**', 'asyncapi.json']

env:
  ASYNCAPI_FILE: 'asyncapi.json'
  OUTPUT_PATH: 'generated-types.ts'

jobs:
  generate:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - uses: pnpm/action-setup@v4

      - run: pnpm install --frozen-lockfile

      - run: pnpm add -D @alt-stack/zod-asyncapi

      - name: Generate spec (optional)
        run: npm run generate-spec --if-present || true

      - name: Generate SDK
        run: npx zod-asyncapi ${{ env.ASYNCAPI_FILE }} -o ${{ env.OUTPUT_PATH }}

      - name: Check for changes
        id: changes
        run: |
          if git diff --quiet ${{ env.OUTPUT_PATH }}; then
            echo "changed=false" >> $GITHUB_OUTPUT
          else
            echo "changed=true" >> $GITHUB_OUTPUT
          fi

      - name: Commit changes
        if: steps.changes.outputs.changed == 'true' && github.event_name == 'push'
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add ${{ env.OUTPUT_PATH }}
          git commit -m "chore: regenerate types [skip ci]"
          git push

      - name: Fail if outdated (PR)
        if: steps.changes.outputs.changed == 'true' && github.event_name == 'pull_request'
        run: |
          echo "::error::Generated types are outdated."
          exit 1
```

### Step 2: Create Your Kafka Router

```typescript title="src/router.ts"
import { init, kafkaRouter } from '@alt-stack/kafka-core';
import { z } from 'zod';

const { procedure } = init();

export const myRouter = kafkaRouter({
  userCreated: procedure
    .topic('user.created')
    .payload(z.object({
      userId: z.string(),
      email: z.string().email(),
      createdAt: z.string().datetime(),
    }))
    .handler(async ({ payload }) => {
      console.log('User created:', payload.userId);
    }),
});
```

### Step 3: Add Generate Script

```typescript title="src/generate-spec.ts"
import { writeFileSync } from 'fs';
import { generateAsyncAPISpec } from '@alt-stack/kafka-core';
import { myRouter } from './router';

const spec = generateAsyncAPISpec(myRouter, {
  title: 'My Kafka API',
  version: '1.0.0',
});

writeFileSync('asyncapi.json', JSON.stringify(spec, null, 2));
console.log('Generated asyncapi.json');
```

```json title="package.json"
{
  "scripts": {
    "generate-spec": "tsx src/generate-spec.ts"
  }
}
```

## Publish SDK to npm

For publishing your SDK as a standalone npm package that consumers can install.

### Publish OpenAPI SDK

```yaml title=".github/workflows/publish-sdk.yml"
name: Publish SDK

on:
  push:
    branches: [main]
    paths: ['src/**']

env:
  OPENAPI_ENDPOINT: '/docs/openapi.json'
  SERVER_START_CMD: 'pnpm start'
  NPM_PACKAGE_NAME: '@my-org/my-api-sdk'

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          registry-url: 'https://registry.npmjs.org/'

      - uses: pnpm/action-setup@v4

      - run: pnpm install --frozen-lockfile
      
      - run: pnpm add -D @alt-stack/zod-openapi

      - name: Start server
        id: server
        run: |
          ${{ env.SERVER_START_CMD }} &
          echo "pid=$!" >> $GITHUB_OUTPUT
          sleep 10  # Wait for server

      - name: Generate SDK
        run: |
          mkdir -p sdk-package/src
          npx zod-openapi http://localhost:3000${{ env.OPENAPI_ENDPOINT }} \
            -o sdk-package/src/index.ts

      - name: Create package.json
        run: |
          VERSION=$(node -p "require('./package.json').version")
          cat > sdk-package/package.json << EOF
          {
            "name": "${{ env.NPM_PACKAGE_NAME }}",
            "version": "$VERSION",
            "type": "module",
            "main": "./dist/index.js",
            "types": "./dist/index.d.ts",
            "exports": {
              ".": {
                "types": "./dist/index.d.ts",
                "import": "./dist/index.js"
              }
            },
            "scripts": {
              "build": "tsup src/index.ts --format esm --dts"
            },
            "peerDependencies": {
              "zod": "^4.0.0"
            },
            "devDependencies": {
              "tsup": "^8.0.0",
              "typescript": "^5.0.0"
            }
          }
          EOF

      - name: Build and publish
        working-directory: sdk-package
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          pnpm install
          pnpm build
          npm publish --access public

      - name: Cleanup
        if: always()
        run: kill ${{ steps.server.outputs.pid }} 2>/dev/null || true
```

### Required Secrets

Add `NPM_TOKEN` to your repository secrets:

1. Go to **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret**
3. Name: `NPM_TOKEN`
4. Value: Your npm access token (from npmjs.com → Access Tokens)

## Using the Generated SDK

### In-Repo Types

```typescript
import { schemas, Request, Response } from './generated-types';

// Validate data
const user = schemas.User.parse(data);

// Type-safe request/response
type GetUserRequest = Request['GET /users/:id'];
type GetUserResponse = Response['GET /users/:id']['200'];
```

### Published SDK

```bash
pnpm add @my-org/my-api-sdk
```

```typescript
import { schemas, Request, Response } from '@my-org/my-api-sdk';

// Same usage as above
const user = schemas.User.parse(apiResponse);
```

## Best Practices

### Version Synchronization

Keep your SDK version in sync with your API:

```yaml
- name: Read version
  id: version
  run: echo "version=$(node -p \"require('./package.json').version\")" >> $GITHUB_OUTPUT
```

### Conditional Publishing

Only publish when source files change:

```yaml
on:
  push:
    paths:
      - 'src/**'
      - '!src/**/*.test.ts'
```

### PR Validation

Fail PRs if generated types are outdated to catch schema changes:

```yaml
- name: Fail if outdated
  if: steps.changes.outputs.changed == 'true' && github.event_name == 'pull_request'
  run: exit 1
```

## Troubleshooting

### Server Not Starting

- Check your `SERVER_START_CMD` matches your package.json scripts
- Increase the wait time if your server takes longer to boot
- Check server logs in the workflow output

### Types Not Generating

- Verify the OpenAPI/AsyncAPI endpoint is accessible
- Check the spec is valid JSON
- Ensure `@alt-stack/zod-openapi` or `@alt-stack/zod-asyncapi` is installed

### npm Publish Failing

- Verify `NPM_TOKEN` secret is set correctly
- Check the package name is available on npm
- Ensure version hasn't already been published

