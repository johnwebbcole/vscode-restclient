# rest-client-mcp

An MCP server that lets an agent (e.g. Claude Code) send requests from `.http`/`.rest`
files using the same file format the REST Client VS Code extension understands:
`###` request separators, `@name = value` file variables, `# @name requestName`
metadata comments, `{{variable}}` substitution, and `{{name.response.body.$.path}}`
request chaining.

It's a standalone process (not the VS Code extension itself), so it can run
requests headlessly from the command line or from an agent, without VS Code open.

## Setup

```
cd mcp-server && npm install
```

The server is already registered for this repo in `.mcp.json` at the repo
root, so any MCP-aware agent (Claude Code, etc.) run from this project picks
it up automatically. To use it from another project, add a similar entry to
that project's `.mcp.json`, or register it with `claude mcp add`, pointing at
this `mcp-server/src/index.js`.

## Testing

```
cd mcp-server && npm test
```

Runs unit tests for the transport-selection policy and telemetry, plus integration tests
that spawn the real server as a subprocess (with `curl` deliberately absent from `PATH`)
and drive it over the actual MCP protocol via `@modelcontextprotocol/sdk`'s client.

## Tools

- **list_requests** `{ filePath }` — parses a file and lists its requests
  (name, method, url, line) without sending anything.
- **run_request** `{ filePath, name?, index?, environment?, variables?, timeoutMs?, useCookieJar?, useRequestCache? }`
  — sends one request, selected by its `# @name` value or 0-based index.
- **run_file** `{ filePath, environment?, variables?, stopOnError?, timeoutMs?, useCookieJar?, useRequestCache? }`
  — sends every request in the file in order, resolving `{{name.response...}}`
  chaining references against earlier named requests as it goes.

`environment` resolves `{{vars}}` against `rest-client.environmentVariables` in
the workspace's `.vscode/settings.json`, same as switching environments in the
extension. `variables` lets the caller override/add variables for that call
(highest precedence).

## Cookie jar

The server keeps one in-memory cookie jar for its whole process lifetime,
shared across every `run_request`/`run_file` call - the same "stay signed in
across requests" behavior as the VS Code extension's cookie jar, without its
on-disk persistence:

- After each request, `Set-Cookie` response headers are parsed and stored
  (name, value, domain, path, expiry, `Secure`/`HttpOnly`/`SameSite`).
- Before each request, matching stored cookies are attached as a `Cookie`
  header, following standard domain/path/secure matching rules, unless the
  request already sets its own `Cookie` header - an explicit header always
  wins and the jar is not consulted for sending.
- Expired cookies (past `Expires`/`Max-Age`) are pruned automatically and
  never sent.
- Set `useCookieJar: false` on a `run_request`/`run_file` call to skip both
  reading and writing the jar for that call (default `true`).
- Each result includes a `cookies: { received, sent, explicitHeaderOverride }`
  summary (counts only, never cookie values) for observability.
- The jar is in-memory only: it resets on server restart and isn't shared
  across processes. There's no interactive sign-in support - it just replays
  whatever `Set-Cookie` headers a plain HTTP response sends back.

## Request/response cache

The server also keeps one in-memory request/response cache for its whole
process lifetime, shared across every `run_request`/`run_file` call. It backs
`{{name.response.body.$.path}}` / `{{name.response.headers.X}}` /
`{{name.request...}}` chaining, so a name from an earlier tool call is still
resolvable in a later, separate one - not just within a single `run_file` run:

- After a request with a `# @name` runs, its resolved request and response
  (status, headers, body) are stored under that name, overwriting any earlier
  entry with the same name.
- Before a request is sent, `{{name...}}` references are resolved against
  this cache (as well as any names that have already run earlier in the same
  `run_file` call).
- This is how an agent can call `run_request` for `login`, inspect the
  result, and then in a *separate* `run_request` call reference
  `{{login.response.body.$.token}}` and have it resolve - the same chaining
  syntax already supported within one `run_file` call, now shared across
  calls the same way the cookie jar already is.
- Set `useRequestCache: false` on a `run_request`/`run_file` call to skip both
  reading and writing the cache for that call (default `true`).
- The cache is in-memory only: it resets on server restart and isn't shared
  across processes.

## Transport policy: MCP vs curl

Agents (Claude Code, Copilot, etc.) working in this repo should default to these MCP
tools for any HTTP/API call, not `curl` via a shell. Curl is opt-in only.

- **Default**: use `list_requests` / `run_request` / `run_file` for any HTTP call made on
  the user's behalf, including ad hoc asks like "get the forecast for Huntsville".
- **Force curl**: only when the user explicitly asks - phrases like "use curl", "run
  curl", "via curl", or a literal curl command they typed/pasted. The exact detection
  rules are in [src/transportPolicy.js](src/transportPolicy.js) (`isExplicitCurlRequest`);
  that file is the single source of truth, referenced (not duplicated) from `AGENTS.md`
  and `.github/copilot-instructions.md` at the repo root.
- **MCP unavailable**: if these tools aren't reachable (not registered, or the server
  fails to start), the agent should report that clearly and give next steps rather than
  silently falling back to curl. Troubleshooting:
  - Confirm `.mcp.json` at the repo root registers the `rest-client` server.
  - Run `cd mcp-server && npm install` if dependencies are missing.
  - Restart the agent session so it reconnects to the MCP server.
  - Run `node mcp-server/src/index.js` directly to check for startup errors.

Each tool call logs a `transport_selection` line to stderr (`selected_transport`,
`selection_reason`, `tool`) via [src/telemetry.js](src/telemetry.js), so MCP usage is
observable in logs.

This policy only covers agent-driven calls. It has no effect on the VS Code extension's
own human-facing curl support (`Copy Request As cURL`, pasting curl into a `.http` file).

## What's not supported

This reimplements the file format headlessly, so anything that depends on an
interactive VS Code session is out of scope: Azure AD / OIDC / AWS Cognito
sign-in variables, client certificates, and GraphQL/file-upload body helpers.
Plain headers (including a hand-set `Authorization` header), JSON/text bodies,
`{{$guid}}`, `{{$timestamp}}`, `{{$datetime}}`, `{{$randomInt}}`,
`{{$processEnv}}`, and an in-memory cookie jar (see above) all work.
