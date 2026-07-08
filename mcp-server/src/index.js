import fs from 'node:fs';
import path from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createCookieJar } from './cookieJar.js';
import { extractFileVariables, parseHttpFile } from './httpFileParser.js';
import { createRequestCache } from './requestCache.js';
import { resolveEnvironmentVariables } from './settings.js';
import { logTransportSelection } from './telemetry.js';
import { selectTransport } from './transportPolicy.js';
import { resolveFileVariables, substituteVariables } from './variableSubstitution.js';
import { sendRequest } from './sender.js';

const WORKSPACE_ROOT = process.env.REST_CLIENT_MCP_WORKSPACE_ROOT || process.cwd();

// One jar per server process, shared by every run_request/run_file call, so
// cookies from a login request are available to later requests/tool calls -
// the same "stay signed in across requests" behavior as the VS Code
// extension's cookie jar, minus its on-disk persistence.
const cookieJar = createCookieJar();

// One cache per server process, shared by every run_request/run_file call, so
// {{name.response.body.$.path}} / {{name.request...}} chaining (see
// resolveChainedVariable in variableSubstitution.js) works across separate
// tool calls, not just within a single run_file's request loop.
const requestCache = createRequestCache();

function readHttpFile(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE_ROOT, filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`File not found: ${absolutePath}`);
  }
  return { absolutePath, text: fs.readFileSync(absolutePath, 'utf8') };
}

function buildVariableContext(text, { environment, variables, httpFileDir } = {}) {
  const environmentVariables = resolveEnvironmentVariables(WORKSPACE_ROOT, environment);
  const inputVariables = variables || {};
  const systemVariableContext = { httpFileDir, environmentName: environment };
  const rawFileVariables = extractFileVariables(text);
  const fileVariables = resolveFileVariables(rawFileVariables, { environmentVariables, inputVariables, systemVariableContext });
  return { fileVariables, environmentVariables, inputVariables, systemVariableContext };
}

function selectRequests(requests, { name, index } = {}) {
  if (name !== undefined) {
    const matches = requests.filter(r => r.name === name);
    if (matches.length === 0) {
      throw new Error(`No request named '${name}' found. Available names: ${requests.filter(r => r.name).map(r => r.name).join(', ') || '(none)'}`);
    }
    return matches;
  }
  if (index !== undefined) {
    const found = requests.find(r => r.index === index);
    if (!found) {
      throw new Error(`No request at index ${index}. File has ${requests.length} request(s) (index 0-${requests.length - 1}).`);
    }
    return [found];
  }
  return requests;
}

function resolveRequest(request, context) {
  const { result: url, warnings: urlWarnings } = substituteVariables(request.url, context);
  const headers = [];
  const warnings = [...urlWarnings];
  for (const [name, rawValue] of request.headers) {
    const { result, warnings: headerWarnings } = substituteVariables(rawValue, context);
    headers.push([name, result]);
    warnings.push(...headerWarnings);
  }
  let body;
  if (request.body !== undefined) {
    const { result, warnings: bodyWarnings } = substituteVariables(request.body, context);
    body = result;
    warnings.push(...bodyWarnings);
  }
  return { resolved: { method: request.method, url, headers, body }, warnings };
}

function summarizeResult(name, request, sendResult, warnings) {
  const base = {
    name: name ?? null,
    method: request.method,
    url: request.url,
  };
  if (warnings.length > 0) base.warnings = warnings;

  if (sendResult.cookies) base.cookies = sendResult.cookies;

  if (!sendResult.ok) {
    return { ...base, ok: false, error: sendResult.error, durationMs: sendResult.durationMs };
  }

  return {
    ...base,
    ok: sendResult.status >= 200 && sendResult.status < 400,
    status: sendResult.status,
    statusText: sendResult.statusText,
    headers: Object.fromEntries(sendResult.headers),
    body: sendResult.body,
    durationMs: sendResult.durationMs,
  };
}

// Reaching any tool handler below means the agent already chose to call MCP,
// so this always resolves to 'default_mcp' - its purpose is observability
// (visibility into MCP call volume/rate via logs), not gating an in-flight call.
function logMcpToolSelected(tool) {
  const decision = selectTransport({ mcpAvailable: true });
  logTransportSelection({ tool, selectedTransport: decision.transport, selectionReason: decision.selectionReason });
}

const server = new McpServer({ name: 'rest-client-mcp', version: '0.1.0' });

server.registerTool(
  'list_requests',
  {
    title: 'List requests in an .http/.rest file',
    description: 'Parses a .http or .rest file (REST Client format) and lists the requests it contains, in order, without sending them.',
    inputSchema: {
      filePath: z.string().describe('Path to the .http/.rest file, absolute or relative to the workspace root.'),
    },
  },
  async ({ filePath }) => {
    logMcpToolSelected('list_requests');
    const { text } = readHttpFile(filePath);
    const requests = parseHttpFile(text);
    const summary = requests.map(r => ({ index: r.index, name: r.name ?? null, method: r.method, url: r.url, line: r.line }));
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
  },
);

server.registerTool(
  'run_request',
  {
    title: 'Run a single request from an .http/.rest file',
    description: "Sends one request from a .http/.rest file, selected by name (the request's '# @name' comment) or by its 0-based index. If neither is given and the file has exactly one request, that request is run.",
    inputSchema: {
      filePath: z.string().describe('Path to the .http/.rest file, absolute or relative to the workspace root.'),
      name: z.string().optional().describe("The request's '# @name' value."),
      index: z.number().int().min(0).optional().describe('0-based index of the request in the file, as returned by list_requests.'),
      environment: z.string().optional().describe("Name of the environment defined in .vscode/settings.json under 'rest-client.environmentVariables' to resolve {{variables}} against."),
      variables: z.record(z.string(), z.string()).optional().describe('Extra {{variable}}: value overrides, highest precedence.'),
      timeoutMs: z.number().int().positive().optional().describe('Request timeout in milliseconds (default 30000).'),
      useCookieJar: z.boolean().optional().describe('Read/write the server-lifetime cookie jar for this request: attach matching stored cookies (unless the request sets its own Cookie header) and store any Set-Cookie from the response (default true).'),
      useRequestCache: z.boolean().optional().describe("Read/write the server-lifetime request/response cache used for {{name.response.body.$.path}} chaining: resolve chained variables against named requests from earlier run_request/run_file calls, and (if this request has a '# @name') store its result for later calls to reference (default true)."),
    },
  },
  async ({ filePath, name, index, environment, variables, timeoutMs, useCookieJar, useRequestCache = true }) => {
    logMcpToolSelected('run_request');
    const { absolutePath, text } = readHttpFile(filePath);
    const requests = parseHttpFile(text);
    if (name === undefined && index === undefined && requests.length !== 1) {
      throw new Error(`File has ${requests.length} requests; specify 'name' or 'index' to pick one. Call list_requests to see the options.`);
    }
    const [request] = selectRequests(requests, { name, index });
    const context = buildVariableContext(text, { environment, variables, httpFileDir: path.dirname(absolutePath) });
    const chainedResults = useRequestCache ? requestCache.toObject() : {};
    const { resolved, warnings } = resolveRequest(request, { ...context, chainedResults });
    const sendResult = await sendRequest(resolved, { timeoutMs, cookieJar, useCookieJar });
    if (request.name && useRequestCache) {
      requestCache.set(request.name, {
        request: resolved,
        response: sendResult.ok ? { status: sendResult.status, headers: sendResult.headers, body: sendResult.body } : undefined,
      });
    }
    const summary = summarizeResult(request.name, request, sendResult, warnings);
    return { content: [{ type: 'text', text: JSON.stringify(summary, null, 2) }] };
  },
);

server.registerTool(
  'run_file',
  {
    title: 'Run every request in an .http/.rest file',
    description: 'Sends every request in a .http/.rest file, in order. Requests can reference earlier named requests via {{name.response.body.$.path}} / {{name.response.headers.X}}, the same chaining syntax the REST Client extension supports.',
    inputSchema: {
      filePath: z.string().describe('Path to the .http/.rest file, absolute or relative to the workspace root.'),
      environment: z.string().optional().describe("Name of the environment defined in .vscode/settings.json under 'rest-client.environmentVariables' to resolve {{variables}} against."),
      variables: z.record(z.string(), z.string()).optional().describe('Extra {{variable}}: value overrides, highest precedence.'),
      stopOnError: z.boolean().optional().describe('Stop after the first failed/errored request instead of continuing (default false).'),
      timeoutMs: z.number().int().positive().optional().describe('Per-request timeout in milliseconds (default 30000).'),
      useCookieJar: z.boolean().optional().describe('Read/write the server-lifetime cookie jar across the requests in this file: attach matching stored cookies (unless a request sets its own Cookie header) and store any Set-Cookie from each response (default true).'),
      useRequestCache: z.boolean().optional().describe("Read/write the server-lifetime request/response cache used for {{name.response.body.$.path}} chaining: seed this run's chaining with named requests from earlier run_request/run_file calls, and store each named request's result for later calls to reference (default true)."),
    },
  },
  async ({ filePath, environment, variables, stopOnError, timeoutMs, useCookieJar, useRequestCache = true }) => {
    logMcpToolSelected('run_file');
    const { absolutePath, text } = readHttpFile(filePath);
    const requests = parseHttpFile(text);
    const context = buildVariableContext(text, { environment, variables, httpFileDir: path.dirname(absolutePath) });
    const chainedResults = useRequestCache ? requestCache.toObject() : {};
    const results = [];

    for (const request of requests) {
      const { resolved, warnings } = resolveRequest(request, { ...context, chainedResults });
      const sendResult = await sendRequest(resolved, { timeoutMs, cookieJar, useCookieJar });
      if (request.name) {
        const entry = {
          request: resolved,
          response: sendResult.ok ? { status: sendResult.status, headers: sendResult.headers, body: sendResult.body } : undefined,
        };
        chainedResults[request.name] = entry;
        if (useRequestCache) requestCache.set(request.name, entry);
      }
      const summary = summarizeResult(request.name, request, sendResult, warnings);
      results.push(summary);
      if (!summary.ok && stopOnError) break;
    }

    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
