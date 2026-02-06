# Lessons

## 2026-02-06: Prefer full-string codegen assertions
- What went wrong:
  - Some code-generation tests asserted partial substrings (for example, `assert "..." in code`) instead of exact output.
- Why it happened:
  - Initial tests prioritized quick coverage over deterministic readability checks.
- Prevention rule / guardrail:
  - For generated source assertions, use full normalized string equality with shared helper utilities and avoid substring membership assertions.
