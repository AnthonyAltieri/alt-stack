# Altstack documentation rebuild result

## Outcome

The stale documentation has been replaced with a source-backed system. The canonical site now contains 47 pages (7,446 lines), and 41 root/package/example README entry points have been rewritten to agree with it.

Every family has the same user journey:

| Family | Quickstart | Common Patterns | API Documentation |
| --- | --- | --- | --- |
| Result | `result/quickstart.md` | `result/common-patterns.md` | `result/api.md` |
| Servers | `server/quickstart.md` | `server/common-patterns.md` | core, Hono, Express, Bun, NestJS, TanStack Start |
| HTTP Clients | `http-client/quickstart.md` | `http-client/common-patterns.md` | core, Fetch, Ky, Rust/Tokio |
| Kafka | `kafka/quickstart.md` | `kafka/common-patterns.md` | core, client core, KafkaJS, WarpStream |
| Workers | `workers/quickstart.md` | `workers/common-patterns.md` | core, Trigger.dev/WarpStream runtimes and clients |
| Schema & SDK Generation | `codegen/quickstart.md` | `codegen/common-patterns.md` | TypeScript/Zod, Python/Pydantic, Rust, AsyncAPI, generated SDKs |
| Utilities | `utilities/quickstart.md` | `utilities/common-patterns.md` | Zod error formatting |
| Altstack Together | `together/quickstart.md` | `together/common-patterns.md` | `together/documentation.md` |

Orientation is provided by `intro.md` and `start/package-map.md`. The sidebar is explicit and checked against this map.

## Public-surface coverage

`apps/docs/api-coverage.json` maps every in-scope surface to canonical pages. `apps/docs/scripts/verify-docs.mjs` derives and checks:

- all exports for 25 TypeScript packages, following re-exports and generated-package entry points;
- descriptive coverage of package-owned public class/interface/type-literal members;
- the public symbols and CLI terms for four manually mapped Rust/Python surfaces;
- all eight family routes, exact evaluated sidebar membership/order uniqueness, and local links/anchors in the docs and required READMEs.

Final result:

```text
pnpm --dir apps/docs check-docs
Documentation verification passed: 8 families, 25 TypeScript packages, 4 Rust/Python surfaces.
```

The verifier reports 11 deliberately non-asserted member residuals: nine re-exported OpenTelemetry `Span` declarations and Ky's `KyInstance`/`KyOptions`. These are third-party declarations; every package-owned member is asserted. Negative fixtures proved that broken plain links and angle-bracket paths with fragments fail precisely.

## Verification evidence

| Command/check | Final result |
| --- | --- |
| `pnpm --filter docs-altstack-server build` | PASS; production client/server bundles, static pages, and `llms.txt` generated with broken links/Markdown links/anchors fatal |
| `pnpm --dir apps/docs check-docs` | PASS; 8 families, 25 TypeScript packages, 4 Rust/Python surfaces |
| targeted `oxlint --deny-warnings` over all 18 changed JS/TS files | PASS; 0 warnings, 0 errors |
| `pnpm --filter @alt-stack/result test --run` | PASS; 52/52 |
| `pnpm --filter @alt-stack/zod-openapi test --run` | PASS; 271/271 |
| `pnpm --filter @alt-stack/zod-asyncapi check-types` | PASS |
| `pnpm --filter @alt-stack/zod-asyncapi build` | PASS |
| both local generator launchers with `--help` | PASS; exit 0 through package-local `tsx` resolution |
| `pnpm --dir examples/real-life generate:all` | PASS; auth, logic, then worker SDKs generated deterministically |
| `pnpm --dir examples/real-life build` | PASS; all seven selected workspace projects |
| `pnpm --dir examples/real-life lint` | PASS; 0 warnings/errors on 14 hand-authored files; generated SDKs clean under targeted lint |
| strict NodeNext Worker and Kafka documentation fixtures | PASS; direct Trigger call, inferred topic/payload path, and explicit custom-context path compile |
| disposable root/Together quickstart smoke | PASS on Node 22.20; Hono response, OpenAPI/AsyncAPI generation, SDK typecheck, Fetch call, worker/producer typecheck |
| rendered desktop/mobile QA | PASS on overview, long Server API, and Together; no overflow or console warnings/errors |
| `pnpm lint` | exit 0; 50 pre-existing warnings, all outside the changed files |
| `git diff --check` | PASS |

Additional bounded family runs passed hundreds of focused TypeScript tests plus 79 Python and 20 Rust tests, the Python/Rust CLIs, generated Python/TypeScript/Rust clients, and generated Rust crate compilation. Exact lane details are retained in `WORKLOG.md`.

## Independent review

The first review correctly rejected the initially buildable rewrite. It found semantic and copy/paste defects involving returned `Err` behavior, bodyless HTTP methods, undeclared statuses, validation scope, unsafe server fallbacks, Result generics, real-life import/CORS/version drift, incomplete Together setup, and shallow verification. Those findings drove source-backed corrections and verifier hardening.

The final audit found and resolved four additional blockers:

1. replaced an invalid typed Trigger.dev direct-call example with a compiling string-ID call and the generated-client path for type safety;
2. aligned the docs package Node engine with the documented contributor runtime;
3. qualified TypeScript HTTP and Rust client validation claims;
4. rewrote the Kafka quickstart/package README to preserve inferred topics without custom context and documented the compiling `kafkaRouter<AppContext, typeof config>` workaround for the current factory limitation.

After recompiling these paths, the independent auditor returned **PASS — no remaining blockers**.

## Intentional non-documentation changes

Verification exposed a few defects that made the documented current workflows false. The implementation diff is limited to:

- correcting `TaggedError` source JSDoc to match actual TypeScript inference;
- making the real-life routers safe to import, enabling their documented localhost CORS path, updating them to published Altstack 1.4 dependencies, and consuming freshly generated SDK types/routes;
- making real-life generation deterministic and regenerating its three private SDKs;
- fixing both generator bin launchers to resolve the package-local `tsx` CLI without a fragile `.bin` search or `npx` fallback;
- emitting a scoped lint suppression for generated regex literals and removing one unused AsyncAPI iteration key.

No existing public API name or external system was changed. Nothing was deployed, published, pushed, staged, or committed.

## Diff and hygiene

The worktree started clean and detached at `origin/main` commit `cafb8b1`.

```text
git diff --shortstat
118 files changed, 6711 insertions(+), 21810 deletions(-)

git diff --check
<no output; exit 0>
```

The shortstat covers tracked paths only; Git does not include the new replacement pages/verifier/result files until they are staged. Final status contains only the intended rewrite, regenerated `llms.txt` and example SDKs, and the small source/example corrections listed above. Temporary compile fixtures were removed; ignored Docusaurus/Next.js build output remains locally as verification output and does not appear in status.

## Remaining risks and boundaries

- The 11 third-party `Span`/Ky member residuals are intentionally reported rather than copied into Altstack-owned API reference.
- Live Kafka/WarpStream delivery and Trigger.dev execution require external infrastructure and credentials; local proof covers builds, strict typing, generation, isolated CORS/runtime behavior, and documented prerequisites—not live provider delivery.
- Existing server telemetry test-source type gaps and 50 repository-wide lint warnings remain pre-existing debt outside this rewrite. Changed files are warning-free.
- Docusaurus still warns about stale browser compatibility data/update-check storage, and Next.js warns about the nested example's multiple lockfiles; both builds succeed.
- The Kafka object factory's custom-context inference limitation is documented with a verified exact-typing workaround rather than changing the public type API.
- The generator launcher corrections must ship with the packages before published users receive that behavior; the real-life SDK workspaces keep a direct `tsx` development dependency as a published-1.4 compatibility safeguard.
- A redundant final visual rerun was blocked by the in-app browser URL policy. Earlier rendered desktop/mobile QA passed, and the final content-only corrections passed the production build afterward.

## Entry points and artifacts

- Root entry: `README.md`
- Canonical start: `apps/docs/docs/intro.md`
- Package selection: `apps/docs/docs/start/package-map.md`
- End-to-end path: `apps/docs/docs/together/quickstart.md`
- Coverage manifest: `apps/docs/api-coverage.json`
- Verifier: `apps/docs/scripts/verify-docs.mjs`
- Durable-goal state is local and intentionally ignored
- Detailed evidence: `WORKLOG.md`
