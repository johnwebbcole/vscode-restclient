import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = path.join(__dirname, 'index.js');

async function startFixtureServer() {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

/**
 * A minimal PATH containing only a directory with no 'curl' binary in it, but
 * that still lets the spawned node subprocess itself run. This is the crux of
 * the negative proof below: if the default (non-curl) MCP path ever starts
 * shelling out to curl, the child process would fail with ENOENT here because
 * curl cannot be found on PATH.
 */
function pathWithoutCurl() {
  const emptyBinDir = fs.mkdtempSync(path.join(os.tmpdir(), 'no-curl-bin-'));
  return { PATH: emptyBinDir, emptyBinDir };
}

async function withMcpClient(env, fn) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY],
    env,
    stderr: 'pipe',
  });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(transport);

  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk.toString(); });

  try {
    return await fn(client, () => stderr);
  } finally {
    await client.close();
  }
}

describe('mcp-server run_request (real subprocess, curl stripped from PATH)', () => {
  test('runs a request successfully with no curl binary reachable on PATH', async () => {
    const { server, baseUrl } = await startFixtureServer();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-client-mcp-workspace-'));
    const httpFilePath = path.join(workspaceRoot, 'fixture.http');
    fs.writeFileSync(httpFilePath, [
      '# @name ping',
      `GET ${baseUrl}/ping HTTP/1.1`,
      '',
    ].join('\n'));

    const { PATH, emptyBinDir } = pathWithoutCurl();

    try {
      await withMcpClient(
        { PATH, REST_CLIENT_MCP_WORKSPACE_ROOT: workspaceRoot },
        async (client, getStderr) => {
          const result = await client.callTool({
            name: 'run_request',
            arguments: { filePath: 'fixture.http', name: 'ping' },
          });

          assert.equal(result.isError, undefined, 'run_request should not report a protocol-level error');
          const summary = JSON.parse(result.content[0].text);
          assert.equal(summary.ok, true, `expected a successful response, got: ${JSON.stringify(summary)}`);
          assert.equal(summary.status, 200);

          // Telemetry proof: the default path really did log as MCP, not curl.
          const stderrText = getStderr();
          const telemetryLine = stderrText.trim().split('\n').map(l => { try { return JSON.parse(l); } catch { return null; } }).find(l => l?.event === 'transport_selection');
          assert.ok(telemetryLine, `expected a transport_selection telemetry line on stderr, got: ${stderrText}`);
          assert.equal(telemetryLine.selected_transport, 'mcp');
          assert.equal(telemetryLine.selection_reason, 'default_mcp');
          assert.equal(telemetryLine.tool, 'run_request');
        },
      );
    } finally {
      server.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      fs.rmSync(emptyBinDir, { recursive: true, force: true });
    }
  });

  test('list_requests and run_file also succeed with curl unavailable on PATH', async () => {
    const { server, baseUrl } = await startFixtureServer();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-client-mcp-workspace-'));
    const httpFilePath = path.join(workspaceRoot, 'fixture.http');
    fs.writeFileSync(httpFilePath, [
      '# @name first',
      `GET ${baseUrl}/first HTTP/1.1`,
      '',
      '###',
      '',
      '# @name second',
      `GET ${baseUrl}/second HTTP/1.1`,
      '',
    ].join('\n'));

    const { PATH, emptyBinDir } = pathWithoutCurl();

    try {
      await withMcpClient(
        { PATH, REST_CLIENT_MCP_WORKSPACE_ROOT: workspaceRoot },
        async (client) => {
          const listed = await client.callTool({ name: 'list_requests', arguments: { filePath: 'fixture.http' } });
          const requests = JSON.parse(listed.content[0].text);
          assert.equal(requests.length, 2);

          const ran = await client.callTool({ name: 'run_file', arguments: { filePath: 'fixture.http' } });
          const results = JSON.parse(ran.content[0].text);
          assert.equal(results.length, 2);
          assert.ok(results.every(r => r.ok === true), `expected all requests to succeed, got: ${JSON.stringify(results)}`);
        },
      );
    } finally {
      server.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
      fs.rmSync(emptyBinDir, { recursive: true, force: true });
    }
  });
});

describe('mcp-server file variables referencing chained request results', () => {
  test("run_file resolves '@var = {{name.response.body...}}' declared as a file variable", async () => {
    // /accounts returns data; /use echoes back the request body it received,
    // so the assertion below sees exactly what the MCP server sent.
    const server = http.createServer((req, res) => {
      if (req.url === '/accounts') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ rows: [{ accountId: 'acct-42' }] }));
        return;
      }
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: body }));
      });
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address();
    const baseUrl = `http://127.0.0.1:${port}`;

    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-client-mcp-workspace-'));
    fs.writeFileSync(path.join(workspaceRoot, 'chained.http'), [
      '# @name accounts',
      `GET ${baseUrl}/accounts HTTP/1.1`,
      '',
      '###',
      '@accountId = {{accounts.response.body.rows[0].accountId}}',
      '',
      '###',
      '# @name use',
      `POST ${baseUrl}/use HTTP/1.1`,
      'Content-Type: application/json',
      '',
      '{"accountId": "{{accountId}}"}',
      '',
    ].join('\n'));

    try {
      await withMcpClient(
        { PATH: process.env.PATH, REST_CLIENT_MCP_WORKSPACE_ROOT: workspaceRoot },
        async (client) => {
          const ran = await client.callTool({ name: 'run_file', arguments: { filePath: 'chained.http' } });
          const results = JSON.parse(ran.content[0].text);
          assert.equal(results.length, 2, `expected 2 requests, got: ${JSON.stringify(results)}`);

          const use = results.find(r => r.name === 'use');
          assert.ok(use, `expected a result named 'use', got: ${JSON.stringify(results)}`);
          assert.equal(use.ok, true, `expected 'use' to succeed, got: ${JSON.stringify(use)}`);
          assert.equal(use.warnings, undefined, `expected no unresolved-variable warnings, got: ${JSON.stringify(use.warnings)}`);
          const echoed = JSON.parse(JSON.parse(use.body).received);
          assert.equal(echoed.accountId, 'acct-42');
        },
      );
    } finally {
      server.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
