# @alt-stack/server-core

## 1.5.0

### Minor Changes

- 6153688: Replace the unchecked HTTP `mergeRouters` API with `combineRouters`, which requires at least one declarative router and rejects conflicting canonical method/path pairs at compile time. Router mounting APIs now accept one router per prefix; combine routers before mounting them. Runtime conflict checks protect JavaScript, casts, and routers mutated after construction.

### Patch Changes

- @alt-stack/result@1.5.0

## 1.4.0

### Minor Changes

- 514884a: Enforce Result-wrapped procedure handler return types.

### Patch Changes

- @alt-stack/result@1.4.0
