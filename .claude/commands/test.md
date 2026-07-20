---
model: haiku
---

# Run All Tests (Extension Unit + Integration + MCP Server)

Run this project's full test suite and report clean pass/fail results.
Any other skill or instruction that needs to "run the tests" should invoke this skill
(`/test`) instead of hand-rolling the individual commands.

Always run this skill on the cheapest available model (currently Haiku) — test running
is mechanical (run command, read pass/fail, report) and doesn't need a stronger model.

---

## What this runs

This repo has **two independently-tested packages** — root `npm test` does **not** cover
the `mcp-server` package, so it must be run as its own stage:

```
root package.json   →   npm test   =   npm run test:unit && npm run test:integration
mcp-server/package.json  →  npm test  =  node --test src/**/*.test.js
```

So a full run is three stages:

| Stage | Command | Warm baseline | Abort timeout |
|---|---|---|---|
| Extension unit | `npm run test:unit -- --run` | ~1s | 60s |
| MCP server | `cd mcp-server && npm test` | ~1s | 60s |
| Extension integration | `npm run test:integration` | unmeasured, expect 15-60s+ | 180s |

Baselines measured on a warm dev machine (deps installed, no fresh downloads). A cold run
can legitimately take longer — that's not a hang. The integration stage baseline is a
rough estimate, not measured end-to-end (see note below).

---

## Step 1 — Run stage by stage, not one giant `npm test`

Execute the three stages as **separate commands**, each with its own timeout. This lets
you tell exactly which stage failed, kill only that process, and avoid re-running stages
that already passed.

**Extension integration test notes:**
- `npm run test:integration` chains three steps: `vscode:prepublish` (vite build),
  `compile:integration-tests` (tsc), then `node ./out-test/test/runTest.js`, which
  launches a real VS Code (Electron) instance via `@vscode/test-electron` to run
  `src/test/suite/`.
- On macOS this **opens a visible VS Code window** — that's expected, not a bug.
- The test VS Code binary is cached under `.vscode-test/`. If it's not cached yet
  (first run, or after a version bump), it downloads over the network before launching,
  which can take a while — allow extra time, don't treat it as a hang.

---

## Step 2 — If a stage times out, abort and retry once

1. Kill the timed-out process (for the integration stage, also check for an orphaned
   `Code` / Electron helper process left running).
2. Re-run that single stage command once.
3. **Only retry once per stage.** If it hangs or fails again on the retry, stop — don't
   loop. Report which stage, the exact command, and the last output captured before the
   timeout, and ask the user how to proceed.

---

## Step 3 — No known flaky suites

There is currently no documented flaky suite in this project. Every failure must be
investigated and fixed, not dismissed as flaky — don't invent a "known flake" excuse.
If a failure repeats on a clean retry, treat it as real.

---

## Step 4 — Report results

Show a compact summary per stage (files/tests passed, duration) and the full output of
any failure. All three stages must be green before the calling workflow (commit, feature,
etc.) proceeds.

---

## Notes

- Single unit test file: `npx vitest run --reporter=verbose <filename>` (matches
  `test/**/*.test.ts`).
- Single mcp-server test file: `cd mcp-server && node --test <filename>`.
- Single integration test: filter inside `src/test/suite/extension.test.ts` with
  Mocha's `.only`, or narrow `src/test/suite/index.ts`'s glob — there's no CLI `--grep`
  wired through `runTest.js` today.
- `npm run test:unit:coverage` produces a coverage report (`vitest run --coverage`) —
  not part of the standard pass/fail run, only use when coverage is explicitly asked for.
