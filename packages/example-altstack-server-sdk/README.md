# @alt-stack/example-altstack-server-sdk

Auto-generated TypeScript SDK for the example-altstack-server API.

## Installation

```bash
npm install @alt-stack/example-altstack-server-sdk
# or
pnpm add @alt-stack/example-altstack-server-sdk
```

## Usage

```typescript
import { Request, Response } from '@alt-stack/example-altstack-server-sdk';

// Request contains Zod schemas for all API request inputs
// Response contains Zod schemas for all API responses

// Example: validate a todo creation request
const body = Request['/api/todos'].POST.body.parse({
  title: 'My Todo',
  description: 'Optional description',
});

// Example: validate a response
const todo = Response['/api/todos/{id}'].GET['200'].parse(apiResponse);
```

## Generation

This package is automatically generated from the `example-altstack-server` OpenAPI schema using the "Cut Example Server Version" GitHub Actions workflow.

**Do not manually edit `src/index.ts`** - changes will be overwritten on the next generation.

### Regenerating

1. Go to the repository's Actions tab
2. Select "Cut Example Server Version" workflow
3. Click "Run workflow"
4. The workflow will:
   - Analyze conventional commits to determine version bump
   - Bump the server version
   - Start the server and fetch the OpenAPI schema
   - Generate TypeScript types using `@alt-stack/zod-openapi`
   - Update this SDK package with matching version
   - Commit all changes

## License

MIT

