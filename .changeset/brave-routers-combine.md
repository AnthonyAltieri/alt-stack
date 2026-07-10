---
"@alt-stack/server-core": minor
"@alt-stack/server-hono": minor
"@alt-stack/server-express": minor
"@alt-stack/server-bun": minor
"@alt-stack/server-nestjs": minor
"@alt-stack/server-tanstack-start": minor
---

Replace the unchecked HTTP `mergeRouters` API with `combineRouters`, which requires at least one declarative router and rejects conflicting canonical method/path pairs at compile time. Router mounting APIs now accept one router per prefix; combine routers before mounting them. Runtime conflict checks protect JavaScript, casts, and routers mutated after construction.
