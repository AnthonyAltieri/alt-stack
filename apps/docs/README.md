# Altstack documentation site

This Docusaurus application is the canonical long-form documentation for the complete Altstack family: Result, HTTP servers and clients, Kafka, workers, schema/SDK generation, utilities, and the end-to-end Altstack Together path.

## Content model

Every family is organized in this order:

1. **Quickstart** — the smallest supported working flow.
2. **Common Patterns** — recurring composition, lifecycle, error, and production concerns.
3. **API Documentation** — public functions, classes, types, options, properties, results, and constraints.

Claims should be derived from public entry points, manifests, implementations, tests, and examples. Existing prose is not a source of truth when it conflicts with code.

## Local development

Use Node.js 20.19+ or 22.12+ and pnpm 10. Install the repository from its root, then start Docusaurus:

```bash
pnpm install --frozen-lockfile
pnpm --filter docs-altstack-server start
```

## Verification

Run the source-driven coverage audit:

```bash
pnpm --filter docs-altstack-server check-docs
```

The audit derives TypeScript exports and declared public members, derives Rust/Python exports from their entry points, requires substantive symbol coverage, exact-compares canonical pages with the evaluated sidebar, validates local README links, verifies every family has Quickstart/Common Patterns/API Documentation, and rejects untracked legacy pages.

Build the production site with broken links treated as errors:

```bash
pnpm --filter docs-altstack-server build
```

The build also regenerates `static/llms.txt` from the current documentation.

## Key files

- `docs/` — canonical Markdown pages.
- `api-coverage.json` — family and public-surface coverage map.
- `scripts/verify-docs.mjs` — independent structural/API audit.
- `sidebars.js` — user-facing navigation order.
- `docusaurus.config.js` — site, search, broken-link, and generated-LLM configuration.

Do not hand-edit generated build output under `build/`.
