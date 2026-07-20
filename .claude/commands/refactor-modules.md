# Refactor Large TypeScript Modules

Use this skill when asked to refactor a controller, provider, or webview, or proactively when you encounter
a `src/` file that is large, doing multiple unrelated things, or hard to test.

---

## When to Offer This Refactor

Proactively offer this workflow when you see any of these signals in a `src/**/*.ts` file:
- File longer than ~150-200 lines with multiple distinct responsibilities
- A controller handling several unrelated commands, or a provider mixing unrelated language features
- Inline logic that could be its own focused, independently testable function or class
- No corresponding `test/**/*.test.ts` file, or tests that are hard to write because the file does too much
- A webview (`src/views/*.ts`) mixing view/HTML-rendering logic with business logic

Say: *"This file is doing a lot — would you like me to break it into smaller, focused pieces?
I'll organize them by responsibility and cover each one with unit tests."*
Wait for confirmation before proceeding.

---

## Step 1 — Analyze the File

Read the target file in full.
Identify logical sections that could be independent modules:
- Each section has a clear single responsibility
- Each section could be tested in isolation
- Each section is not tightly coupled to the parent's internal/private state (pass data in via parameters, return data out)

List the proposed extractions and where they'd live. Example, refactoring `src/views/httpResponseWebview.ts`:

```
src/views/
  httpResponseWebview.ts       ← thin orchestrator: creates panel, wires messages
  responseHtmlRenderer.ts      ← builds the HTML body from a response object
  responseHeaderFormatter.ts   ← formats headers for display
```

Ask: *"Does this grouping make sense? Any pieces to add, remove, or rename?"*
Wait for confirmation before writing any files.

---

## Step 2 — Place Extractions in the Right Folder

Use this project's existing top-level `src/` folders — there's no need to invent new categories:
- `controllers/` — request execution and command flows
- `providers/` — language features (hover, completion, codelens, diagnostics)
- `views/` — webviews and their rendering
- `models/` — data shapes and settings access
- `utils/` — pure helpers (HTTP client, variable processing, formatting)
- `common/` — shared cross-cutting types/constants

Propose a new top-level folder only when a piece genuinely doesn't fit any of the above.

---

## Step 3 — RED: Write Tests First

For each extracted piece, write its test **before** implementing it:

```ts
// Test one behavior at a time:
it('formats a 4xx response header block with the status line first', ...)
it('returns an empty string when the response has no headers', ...)
```
- Use Vitest, placed under `test/`, mirroring the target's `src/` path (e.g. `src/views/responseHtmlRenderer.ts` → `test/views/responseHtmlRenderer.test.ts`)
- Mock external boundaries at the edge (the `vscode` API via `test/__mocks__/vscode.ts`, filesystem, network)
- Run the test. **It must fail** (the module doesn't exist yet). Show the output.

---

## Step 4 — GREEN: Implement Each Piece

For each extracted piece:
1. Create the file with the simplest implementation that passes its tests
2. Data in via parameters, data out via return value — avoid reaching into the parent's private state
3. Run its unit test after each extraction — it must pass before moving to the next piece

---

## Step 5 — Update the Parent

Replace the extracted logic in the original file with calls into the new modules.
The parent should become a thin orchestrator: wiring and delegation only.

Run `/test` and confirm every stage is green (extension unit, MCP server, extension integration).

---

## Step 6 — Update Documentation

- `README.md` — only if user-visible behavior changed (usually not, for a pure refactor)
- `.github/copilot-instructions.md` — update `## Project Structure` if new files change where a responsibility lives

---

## Step 7 — Propose a Commit

Run `/commit` to draft the commit message, and commit only after the user confirms.
