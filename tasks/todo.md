# Plan: Rename TypeScript Package + Add Python Pydantic Package

## Goal / Success Criteria
- `packages/zod-openapi` is renamed to `packages/typescript-zod-openapi` without changing the npm package name (`@alt-stack/zod-openapi`).
- A new `packages/python-zod-openapi` package exists that generates Pydantic-based validation/types from OpenAPI with feature parity to `typescript-zod-openapi`.
- The master OpenAPI fixture tests pass for Python (mirroring the TypeScript suite), and the existing `typescript-zod-openapi` tests continue to pass.
- Python tooling uses `uv` for dependency management, `ruff` for lint/format, and `ty` for type checking.

## Assumptions / Constraints
- Keep the JS package name and public API of `@alt-stack/zod-openapi` unchanged; only the folder path changes.
- Use Pydantic v2 for Python implementation unless repo standards dictate otherwise.
- OpenAPI 3.0 (`nullable: true`) semantics must be respected.
- No breaking changes to existing TypeScript tests or fixtures.

## Plan (Checklist)
- [x] Inventory `zod-openapi` functionality (CLI, registry, schema conversion, route generation, schema dedup, tests) and map each feature to a Python/Pydantic equivalent.
- [x] Rename `packages/zod-openapi` → `packages/typescript-zod-openapi` and update any in-repo references to the old path (docs, scripts, lockfile entries).
- [x] Scaffold `packages/python-zod-openapi`:
  - [x] `pyproject.toml` with `uv`-managed deps, `ruff` config, and `ty` config.
  - [x] `src/python_zod_openapi/` with core modules (registry, schema conversion, codegen, routes, dependencies, CLI).
  - [x] `README.md` and `LICENSE` (align with repo conventions).
- [x] Implement OpenAPI → Pydantic code generation:
  - [x] Schema conversion for primitives, arrays, objects, enums, nullable, `$ref`, `oneOf`/`allOf`, constraints, and `additionalProperties`.
  - [x] Registry for custom string formats/primitive overrides and emitted aliases.
  - [x] Dependency analysis + topological sort to emit schemas in order and deduplicate route schemas.
  - [x] Request/Response lookup objects mirroring TS output (Pythonic structures with validation adapters).
- [x] Implement CLI parity (file/URL input, output path, registry/include hooks).
- [x] Port tests from `typescript-zod-openapi` into Python pytest equivalents:
  - [x] Unit tests for converters, registry, routes, dedup, interface/type output.
  - [x] Master OpenAPI fixture roundtrip test (generate code, import module, convert back to OpenAPI, compare to fixture minus examples).
  - [x] Validation tests using `x-altstack-examples` in the fixture (valid/invalid cases).
- [x] Update generator-related tests to full string matches (no substring assertions) for readability and determinism.
- [x] Verification and cleanup:
  - [x] Run `ruff` (format + lint) and `ty` in the Python package.
  - [x] Run Python tests (pytest) for the new package.
  - [x] Run `vitest` for `typescript-zod-openapi` to confirm no regressions.

## Risks / Edge Cases
- Pydantic JSON schema differences vs OpenAPI 3.0 may require custom metadata handling to preserve `format`, `pattern`, and `nullable` behavior.
- Discriminator handling for `oneOf` unions may not map cleanly to Pydantic without explicit tags.
- `additionalProperties: false` needs correct `ConfigDict(extra="forbid")`/`model_config` mapping.
- Deduplication and reference resolution must match TS behavior to keep fixture output stable.
- `ty` configuration and behavior may require iteration to satisfy type checking without false positives.

## Verification Plan
- `ruff format` and `ruff check` in `packages/python-zod-openapi`.
- `uv run ty check` (or repo-standard `ty` invocation) in `packages/python-zod-openapi`.
- `uv run pytest` (or equivalent) in `packages/python-zod-openapi`.
- `pnpm --filter @alt-stack/zod-openapi test` (or direct `vitest`) in `packages/typescript-zod-openapi`.

## Review
- Python package checks:
  - `cd packages/python-zod-openapi && uv run --extra dev ruff format --check .` -> pass (`36 files already formatted`)
  - `cd packages/python-zod-openapi && uv run --extra dev ruff check .` -> pass
  - `cd packages/python-zod-openapi && uv run --extra dev ty check` -> pass
  - `cd packages/python-zod-openapi && uv run --extra dev pytest` -> pass (`81 passed`)
- TypeScript package checks:
  - `pnpm --filter @alt-stack/zod-openapi test` -> pass (`13 files, 263 tests`)
- Additional validation:
  - Python tests now use full generated-code string equality assertions for codegen-focused checks.
