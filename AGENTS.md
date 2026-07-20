# AGENTS

Guidance for AI coding agents working in this repository.

## Scope

- This is a VS Code extension project written in TypeScript.
- Primary goal: maintain and extend REST Client behavior without changing user-facing behavior unintentionally.
- Prefer minimal changes and keep existing patterns unless a task explicitly requires refactoring.

## Fast Start

- Install deps: `npm install`
- Build production bundle: `npm run vscode:prepublish`
- Build extension + bundled MCP server: `npm run build` (vite; MCP server bundles to `dist/mcp-server.mjs`)
- Watch mode during development: `npm run watch`
- Lint: `npm run tslint`

## Required Validation Before Finishing Changes

- Run `npm run tslint` and fix new lint issues in touched files.
- Run `npm run vscode:prepublish` to verify extension bundle compiles.
- If behavior changed, manually verify in Extension Host (F5 in VS Code).

## Key Architecture

- Extension activation and registrations: [src/extension.ts](src/extension.ts)
- Main request flow and response rendering: [src/controllers/requestController.ts](src/controllers/requestController.ts)
- HTTP execution and auth/proxy/cookie behavior: [src/utils/httpClient.ts](src/utils/httpClient.ts)
- Request extraction from editor and `###` boundaries: [src/utils/selector.ts](src/utils/selector.ts)
- Request parsing interfaces/factory: [src/models/requestParser.ts](src/models/requestParser.ts), [src/models/requestParserFactory.ts](src/models/requestParserFactory.ts)
- Variable resolution pipeline: [src/utils/variableProcessor.ts](src/utils/variableProcessor.ts)
- Variable providers (system/request/file/environment): [src/utils/httpVariableProviders](src/utils/httpVariableProviders)
- Response views: [src/views/httpResponseWebview.ts](src/views/httpResponseWebview.ts), [src/views/httpResponseTextDocumentView.ts](src/views/httpResponseTextDocumentView.ts)
- Shared configuration access: [src/models/configurationSettings.ts](src/models/configurationSettings.ts)

## Conventions To Follow

- Lint rules are from TSLint in [tslint.json](tslint.json).
- Use spaces for indentation, semicolons, and `===`.
- Avoid `console.log`; use [src/logger.ts](src/logger.ts).
- Keep imports ordered case-insensitively.
- Use existing controller/provider/service patterns instead of introducing parallel abstractions.
- Prefer `async`/`await` with explicit error handling in user-visible flows.

## Change Guidelines By Area

- Command or activation changes: edit [src/extension.ts](src/extension.ts) and keep `context.subscriptions` consistent.
- Request execution changes: start with [src/controllers/requestController.ts](src/controllers/requestController.ts) and [src/utils/httpClient.ts](src/utils/httpClient.ts).
- Variable behavior changes: update provider(s) in [src/utils/httpVariableProviders](src/utils/httpVariableProviders) and resolution in [src/utils/variableProcessor.ts](src/utils/variableProcessor.ts).
- Language features (hover/definition/completion/codelens/diagnostics): update corresponding files in [src/providers](src/providers) and ensure registration still matches in [src/extension.ts](src/extension.ts).
- Settings changes: update contributes configuration in [package.json](package.json) and runtime access in [src/models/configurationSettings.ts](src/models/configurationSettings.ts).

## HTTP Request Tool Policy (Agents)

- Default: use the `rest-client` MCP tools (`list_requests`, `run_request`, `run_file` -
  registered via [.mcp.json](.mcp.json), implemented in [mcp-server/src/index.js](mcp-server/src/index.js))
  for any HTTP/API call made on the user's behalf, including ad hoc asks like "get the
  weather forecast for Huntsville". Prefer an existing `.http` file (see `examples/`) or
  write one, then call `run_request`/`run_file` - do not shell out to `curl` via Bash for
  this.
- Curl is opt-in only. Only use curl when the user explicitly asks for it: phrases like
  "use curl" / "run curl" / "via curl", or a literal curl command they typed/pasted. The
  exact detection rules live in [mcp-server/src/transportPolicy.js](mcp-server/src/transportPolicy.js)
  (`isExplicitCurlRequest`) - treat that file as the source of truth so this doc and the
  code can't drift.
- If the `rest-client` MCP tools are not available (not present in your tool list, or a
  call fails to connect): do not silently fall back to curl. Tell the user the MCP
  service is unavailable and give next steps - check that `.mcp.json` registers the
  `rest-client` server, run `cd mcp-server && npm install` if dependencies are missing,
  then restart the agent session so it reconnects. (This mirrors `selectTransport`'s
  `mcp_unavailable` error text in `transportPolicy.js`.)
- This policy only governs *agent-driven* HTTP calls. It does not change the extension's
  existing human-facing curl support (`Copy Request As cURL`, pasting a curl command
  directly into a `.http` file) - that's unrelated and unaffected.

## Known Pitfalls

- There is no stable automated test suite in scripts; rely on lint + build + targeted manual verification.
- Provider order in variable resolution is intentional (system -> request -> file -> environment); changing order can be breaking.
- Persistent data (history/cookies/token cache) can affect manual verification runs; see [src/utils/userDataManager.ts](src/utils/userDataManager.ts) and related cache utilities.

## Source Docs (Link, Do Not Duplicate)

- User and feature documentation: [README.md](README.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)
- CI baseline checks: [.github/workflows/nodejs.yml](.github/workflows/nodejs.yml)
- HTTP grammar: [syntaxes/http.tmLanguage.json](syntaxes/http.tmLanguage.json)

## Git Remote / PR Policy

- This repo is a fork: `origin` is `johnwebbcole/vscode-restclient` (yours), `upstream` is
  `Huachao/vscode-restclient` (the original project, not yours to open PRs against).
- `gh pr create` defaults to the fork *parent* (`upstream`) as the base repo, not `origin`
  - it will silently target `Huachao/vscode-restclient` unless told otherwise. Never rely
    on the default.
- Always create pull requests against `origin` (`johnwebbcole/vscode-restclient`) only.
  Pass `--repo johnwebbcole/vscode-restclient` explicitly to `gh pr create`, and confirm
  the printed PR URL starts with `github.com/johnwebbcole/` before treating it as done.
- Never open, push to, or otherwise modify `Huachao/vscode-restclient` (or any other
  upstream/original repo) unless the user explicitly asks to contribute upstream.

## PR Readiness Checklist

- Scope of change is minimal and localized.
- No unrelated refactors.
- Lint and build pass locally.
- Manual validation performed for changed behavior paths.
- Documentation/settings updated when user-visible behavior changes.

## AI Instruction Sync

- Keep [AGENTS.md](AGENTS.md) and [.github/copilot-instructions.md](.github/copilot-instructions.md) aligned on shared workflow and validation rules.
- Prefer updating existing guidance sections instead of introducing duplicate or conflicting instructions.
