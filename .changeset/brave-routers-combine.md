---
"@alt-stack/server-core": major
"@alt-stack/server-hono": major
"@alt-stack/server-express": major
"@alt-stack/server-bun": major
"@alt-stack/server-nestjs": major
"@alt-stack/server-tanstack-start": major
---

Replace the unchecked HTTP `mergeRouters` API with `combineRouters`, which requires at least one declarative router and rejects conflicting canonical method/path pairs at compile time. Router mounting APIs now accept one router per prefix; combine routers before mounting them. Runtime conflict checks protect JavaScript, casts, and routers mutated after construction.
