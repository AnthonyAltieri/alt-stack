# Altstack Documentation Rebuild Goal

## Outcome

Replace Altstack's stale documentation with a source-backed documentation system that lets a new user successfully adopt each public part of the Altstack family independently and then combine the parts into an end-to-end application.

The canonical site must organize every user-facing family around the same three tasks:

1. **Quickstart** — install the right packages and complete the smallest working flow.
2. **Common Patterns** — solve realistic recurring problems with supported composition patterns.
3. **API Documentation** — understand each public function, class, type, option, property, return value, error, and runtime constraint in enough detail to use it correctly.

The site must also provide an **Altstack Together** path that explains package selection, architecture, schema/code generation, server/client integration, events, background work, error handling, and observability as one coherent system.

## Audience and destinations

- Primary audience: TypeScript developers evaluating or adopting Altstack.
- Secondary audience: Rust and Python users of the HTTP/OpenAPI generators and generated clients.
- Canonical long-form destination: `apps/docs/docs/` (Docusaurus).
- Repository entry points: the root `README.md`, user-facing package READMEs, and example READMEs.

## Baseline

- The user has declared all existing documentation stale; it is not an authoritative source.
- The existing Docusaurus information architecture is server-centric and does not cover every published package or adapter.
- Public behavior is distributed across package entry points, manifests, implementations, tests, and examples.
- At goal activation, the documentation build cannot start because workspace dependencies are not installed (`docusaurus: command not found`); this is an environment prerequisite, not an accepted final state.

## Canonical evidence

Documentation claims must be grounded, in priority order, in:

1. public package entry points and package/crate/project manifests;
2. implementation types and runtime behavior;
3. focused tests that demonstrate the contract;
4. working examples;
5. changelogs only for compatibility or migration context.

Existing Markdown prose may be mined only as a list of topics to re-check. It must not be copied forward as truth without source confirmation.

## Scope

### Canonical documentation families

- Orientation and package selection
- Result and typed error handling
- HTTP servers and all supported adapters: core, Hono, Express, Bun, NestJS, and TanStack Start
- HTTP clients: core concepts, Fetch, Ky, and Rust/Tokio
- Kafka/event APIs and clients: core, KafkaJS, and WarpStream
- Background workers and clients: core, Trigger.dev, and WarpStream
- Schema and SDK generation: TypeScript/Zod OpenAPI, Python/Pydantic OpenAPI, Rust OpenAPI and crate generation, Zod AsyncAPI, generated SDK shapes, and test specifications where relevant
- Utilities that are directly user-facing, including Zod error formatting
- Altstack Together: decision guide, end-to-end quickstart, cross-family patterns, and architecture/reference material

Every family must contain a clearly labeled Quickstart, Common Patterns, and API Documentation route. Adapter/package pages may live beneath those routes when a single page would be unwieldy.

### Repository documentation

- Rewrite the root README as an accurate map and smallest supported introduction.
- Rewrite user-facing package READMEs and example READMEs so they are accurate, concise entry points to the canonical site.
- Preserve changelogs, licenses, generated artifacts, and historical release records; they are not narrative documentation to rewrite.

## Constraints

- Minimize application-code changes. Change package behavior only if documentation verification exposes a genuine defect that prevents documenting the supported contract.
- Preserve public API names and compatibility unless separately justified and verified.
- Use current package names, peer dependencies, runtime requirements, and public exports.
- Prefer small runnable examples over pseudo-code. Mark intentionally abbreviated snippets.
- Explain adapter differences explicitly; do not imply parity where behavior or context differs.
- Keep generated example SDKs identified as generated output, not hand-authored APIs.
- Do not publish, deploy, push, open a pull request, or change external systems without separate user approval.

## Non-goals

- A visual brand redesign of the Docusaurus theme.
- New product capabilities invented solely to make the docs more attractive.
- Rewriting changelogs or license files.
- Documenting internal, non-exported implementation helpers as supported API.

## Primary verifier

From a clean dependency installation, the Docusaurus production build must succeed with broken links treated as errors:

```bash
pnpm --filter docs-altstack-server build
```

## Supporting checks

1. A repository-local documentation audit must map every in-scope public package and public export/configuration surface to a canonical API reference page and fail on missing pages or symbols.
2. Focused type checks/tests/builds must pass for packages and runnable examples used as canonical quickstarts.
3. Targeted lint must pass immediately after JavaScript/TypeScript configuration or verification-script edits; the final docs tree must pass the repository linter where supported.
4. A source-backed review must verify install commands, package names, peer dependencies, runtime assumptions, error semantics, and adapter differences.
5. A second-pass independent review must inspect the final information architecture, API coverage, and copy/paste viability of quickstarts.
6. `git diff --check` must pass, and the final diff must show no accidental application-code or generated-build-output changes.

## Iteration loop

1. Inventory one bounded family from source, tests, manifests, and examples.
2. Record its public surface and unsupported/uncertain behavior.
3. Write its Quickstart, Common Patterns, and API Documentation from that inventory.
4. Run the narrowest structural, lint, type, and build checks that can fail the new material.
5. Review the rendered/build output and source coverage, record evidence in `WORKLOG.md`, and correct discrepancies before moving on.
6. After all families, test the Altstack Together path and run full documentation verification.

When a verifier fails, diagnose the concrete mismatch, change one meaningful thing, rerun the narrow check, and only then return to the full verifier.

## Anti-cheating rules

- Do not make stale prose pass by weakening broken-link checks, shrinking the package scope, hiding missing exports, or reclassifying public APIs as internal without source evidence.
- Do not delete or loosen tests/verifiers to claim completion.
- Do not substitute mocks or hypothetical APIs for canonical package behavior.
- Do not claim a code sample was verified unless the recorded command actually parsed, type-checked, built, or ran the relevant path.
- Do not count a symbol-name dump as API documentation; reference entries must explain purpose, signature/shape, inputs/options, output, errors, and relevant constraints.

## Approval gates

Separate user approval is required before dependency installation that needs unrestricted network access, deployment, publication, pushing commits, opening a PR, changing package APIs, or any destructive cleanup outside generated build output.

## Blocker standard

A blocker requires an external condition that prevents further meaningful in-scope progress and the smallest concrete user/external action needed to remove it. Difficulty, documentation volume, uncertainty resolvable from source, or a single failed command is not a blocker. Goal status becomes blocked only after the platform-required repeated-blocker threshold is met.

## Completion proof

Before marking the goal complete, `RESULT.md` and `WORKLOG.md` must contain:

- the final docs inventory and family/page map;
- the public-surface coverage audit result;
- exact commands and outputs for the Docusaurus build and supporting lint/type/test checks;
- independent-review findings and their dispositions;
- `git diff --stat`, `git diff --check`, and a statement of any remaining risks or intentionally undocumented internal surfaces;
- paths to the rebuilt root README, canonical docs entry page, family sections, and verification artifacts.

The goal is complete only when these checks pass and the user can navigate from package choice to a working single-family quickstart, detailed API reference, and a verified end-to-end Altstack path without relying on the superseded documentation.
