# Feature Development (TDD Workflow)

You are guiding a full Test-Driven Development feature cycle for this project (RestClient MCP — a VS Code extension plus bundled MCP server).
Follow every phase in order. Do not skip ahead.

---

## PHASE 1 — Discovery: Ask first, code never

Before touching any file, ask ALL of these questions in a single message.
Wait for the user's answers before continuing.

**Ask:**
1. In one sentence, what should this feature do for the user?
2. Which part of the system does it touch? (extension controller / language provider (hover, completion, codelens, diagnostics) / webview view / MCP server / Postman import-export / docs only)
3. What are the success criteria? How will we know it's working?
4. Are there any edge cases or error states we need to handle?
5. Should this be user-configurable, or is the behavior fixed?
6. Does it replace or extend anything that already exists? If so, what?
7. Are there related commands, providers, or views we should stay consistent with?
8. Any performance concerns, or webview theming (light/dark) to account for?

Summarize the answers back and ask: "Does this match your intent? Anything to add or change?" — then wait for final confirmation before moving on.

---

## PHASE 2 — Research: Read before writing

Read the relevant existing code before designing anything:
- Find related controllers, providers, views, tests, and docs
- Understand naming conventions and patterns already in use
- Check `.github/copilot-instructions.md` for project standards
- Note the test frameworks:
  - **Vitest** for extension unit tests — `test/**/*.test.ts`, mirroring `src/`'s folder structure; mocks the `vscode` module via `test/__mocks__/vscode.ts`
  - **Mocha + `@vscode/test-electron`** for extension integration tests — `src/test/suite/`, runs inside a real launched VS Code instance
  - **node:test** for the MCP server package — `mcp-server/src/*.test.js`

Summarize what you found in a short paragraph, then describe the approach you plan to take.
Ask: "Does this approach sound right before I write any tests?"

---

## PHASE 3 — RED: Write failing tests first

Write the tests **before** writing any implementation code.

Rules:
- Each test must describe one specific behavior from the success criteria
- Tests must be runnable right now and **must fail** (the feature doesn't exist yet)
- Use descriptive test names: `it('resolves the $dotenv indirection before sending the request', ...)`
- Mock all external dependencies at their boundary (the `vscode` API, filesystem, network)
- Place test files under `test/`, mirroring the path of the file under test in `src/`
  (e.g. `src/controllers/requestController.ts` → `test/controllers/requestController.test.ts`)

After writing the tests, **run them** and show the failure output.
Confirm with the user: "Tests are red — failing as expected. Ready to implement?"

---

## PHASE 4 — GREEN: Implement the minimum to pass

Write the minimum code that makes all the tests pass.
Do not add features, abstractions, or polish beyond what the tests require.

### Rule: keep controllers, providers, and webviews focused

If the feature adds to or grows a controller, provider, or webview file past ~150 lines with multiple distinct responsibilities, extract the cohesive pieces into their own file under the matching `src/` subfolder before considering this phase done. See the Refactor Modules skill (`/refactor-modules`) for the extraction workflow.

After writing the implementation, run `/test` and confirm every stage is green (extension unit, MCP server, extension integration).

All tests must pass before continuing. If any fail, fix them before moving on.

Confirm: "All tests are green. Moving on to cleanup and docs."

---

## PHASE 5 — Documentation

Update documentation to reflect the new feature:

1. **README.md** — Add or update the section for this feature. Use a `### New:` prefix or `**New in vX.X:**` callout to highlight it. Include a brief description of what it does and how to use it. Add a screenshot placeholder comment `<!-- screenshot: describe what to capture -->` if the feature has visible UI.
2. **`.github/copilot-instructions.md`** — Update if architecture, conventions, or commands changed.
3. **Inline comments** — Add comments only where logic is non-obvious.

Show a summary of what documentation was changed.

---

## PHASE 6 — Commit

Run `/commit` to draft the commit message and any social posts, and commit only after the user confirms.
