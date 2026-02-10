# Lessons

## 2026-02-05 - Use `apply_patch` tool for edits
- What went wrong: Tried to run `apply_patch` via `exec_command`.
- Why it happened: Forgot that `apply_patch` must be invoked as a tool call.
- Prevention rule: Use the `apply_patch` tool for file edits; never invoke it through the shell.

## 2026-02-05 - Don’t skip installs/tests when asked
- What went wrong: Skipped E2E coverage when Nest deps were missing.
- Why it happened: Assumed skipping in the sandbox was acceptable without confirming user intent.
- Prevention rule: If the user asks to run tests or install deps, install in the sandbox (request escalation if needed) and do not skip tests.
