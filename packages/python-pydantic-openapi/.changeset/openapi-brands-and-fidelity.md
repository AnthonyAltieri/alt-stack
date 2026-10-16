---
"alt-stack-openapi-pydantic": minor
---

Generate shared `NewType` aliases from `x-altstack-brand` while preserving Pydantic
validation across fields, parameters, references, nullable unions, and arrays.
Reject invalid brand names and conflicting base types.

Restrict empty schemas to JSON values and enforce numeric exclusive bounds.
Timestamp offset strings and open-object extra keys remain supported.
This minor release also includes the preceding anyOf, null, and const fixes.

Python releases use `pyproject.toml` and the Python publishing workflow. Keep this
package-local release declaration separate from the root npm Changesets queue.
