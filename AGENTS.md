# AGENTS

Guidance for AI coding agents working in this repository.

## Scope

- This is a VS Code extension project written in TypeScript.
- Primary goal: maintain and extend REST Client behavior without changing user-facing behavior unintentionally.
- Prefer minimal changes and keep existing patterns unless a task explicitly requires refactoring.

## Fast Start

- Install deps: `npm install`
- Build production bundle: `npm run vscode:prepublish`
- Build development bundle: `npm run webpack`
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

## Known Pitfalls

- There is no stable automated test suite in scripts; rely on lint + build + targeted manual verification.
- Provider order in variable resolution is intentional (system -> request -> file -> environment); changing order can be breaking.
- Persistent data (history/cookies/token cache) can affect manual verification runs; see [src/utils/userDataManager.ts](src/utils/userDataManager.ts) and related cache utilities.

## Source Docs (Link, Do Not Duplicate)

- User and feature documentation: [README.md](README.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)
- CI baseline checks: [.github/workflows/nodejs.yml](.github/workflows/nodejs.yml)
- HTTP grammar: [syntaxes/http.tmLanguage.json](syntaxes/http.tmLanguage.json)

## PR Readiness Checklist

- Scope of change is minimal and localized.
- No unrelated refactors.
- Lint and build pass locally.
- Manual validation performed for changed behavior paths.
- Documentation/settings updated when user-visible behavior changes.
