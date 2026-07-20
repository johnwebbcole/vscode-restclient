# GitHub Copilot Instructions - VS Code REST Client

These instructions apply to all Copilot models used in this repository.

## Scope

- This is a VS Code extension project written in TypeScript.
- Primary goal: preserve REST Client behavior unless the user explicitly requests a behavior change.
- Prefer minimal, localized changes over broad refactors.

## Project Structure

- `src/extension.ts` - activation and registrations
- `src/controllers/` - request execution and command flows
- `src/providers/` - language features (hover, completion, codelens, diagnostics)
- `src/utils/httpClient.ts` - HTTP execution/auth/proxy/cookie behavior
- `src/utils/variableProcessor.ts` - variable substitution pipeline
- `src/models/configurationSettings.ts` - runtime settings access
- `syntaxes/http.tmLanguage.json` - HTTP grammar

## Commands

| Task | Command |
|------|---------|
| Install dependencies | `npm install` |
| Lint | `npm run tslint` |
| Build (extension + MCP server) | `npm run build` |
| Build (prepublish) | `npm run vscode:prepublish` |
| Watch | `npm run watch` |

## General Rules

- Read before modifying: inspect impacted files before editing.
- Clarify ambiguity: ask when request scope is unclear or behavior impact is uncertain.
- Minimal changes only: avoid unrelated refactors.
- No auto-commit: do not commit unless the user explicitly asks.
- If drafting social posts, produce BlueSky (<=300 chars) and LinkedIn (2-3 short paragraphs with CTA) variants.
- Keep architecture patterns: reuse existing controller/provider/service style.
- Avoid `console.log`; use `src/logger.ts` for logging.

## Social Post Storage

- Save social drafts to `/chat/bluesky-posts.md` and `/chat/linkedin-posts.md`.
- Use #OpenSource and REST Client topic tags when relevant.
- For each appended entry include: ISO 8601 timestamp, one-line summary, post content, links, hashtags, and a `To Add` checklist.

## Validation Rules

- Run `npm run tslint` for touched code paths.
- Run `npm run vscode:prepublish` before finishing substantial changes.
- If behavior changes, validate manually in Extension Host (F5 path).
- If tests are added or touched, run the relevant test command and report results.

## Workflow: Build or Change a Feature

When the user asks to add or change behavior:

1. Locate the owning area first (`extension`, `controller`, `provider`, `utils`, or `settings`).
2. Implement the smallest change that satisfies the request.
3. Preserve existing user-facing behavior outside the requested scope.
4. Run lint and prepublish build.
5. Summarize what changed and any behavior risks.

## Workflow: Fix a Bug

When the user asks to debug or fix an issue:

1. Reproduce from available context (request file, logs, diagnostics, failing path).
2. Trace through request parsing, variable resolution, and HTTP execution as needed.
3. Apply a targeted fix where the faulty behavior originates.
4. Validate with lint/build and any relevant manual scenario.
5. Report root cause, fix, and residual risk.

## HTTP Request Tool Policy (Agents)

- Default to the `rest-client` MCP tools (`list_requests`/`run_request`/`run_file`, see
  `.mcp.json` and `mcp-server/src/index.js`) for any HTTP/API call made on the user's
  behalf. Only use curl when the user explicitly asks for it (e.g. "use curl", "run
  curl", or a literal curl command) - see `AGENTS.md` and `mcp-server/src/transportPolicy.js`
  for the full policy and detection rules (source of truth, not duplicated here).
- If the MCP tools are unavailable, report that clearly with fallback guidance; do not
  silently fall back to curl.

## Git Remote / PR Policy

- This repo is a fork: `origin` is `johnwebbcole/vscode-restclient` (yours), `upstream` is
  `Huachao/vscode-restclient` (the original project). `gh pr create` defaults to the fork
  parent (`upstream`) as the base repo unless told otherwise - never rely on the default.
- Always create pull requests against `origin` only, passing
  `--repo johnwebbcole/vscode-restclient` explicitly to `gh pr create`. Confirm the
  returned PR URL starts with `github.com/johnwebbcole/` before treating it as done.
- Never open, push to, or otherwise modify `Huachao/vscode-restclient` (or any other
  upstream/original repo) unless the user explicitly asks to contribute upstream.

## Workflow: AI Instruction Sync

When AI guidance files are changed:

1. Keep `AGENTS.md` and `.github/copilot-instructions.md` aligned on shared rules.
2. Do not duplicate long architecture docs; link to source files instead.
3. Prefer updating existing sections over adding overlapping guidance.
