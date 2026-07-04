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

/**
 * A fixture server implementing a minimal login/session flow: GET /login
 * issues a session cookie, GET /secure requires it and 401s without it.
 */
async function startAuthFixtureServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/login') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': 'session=abc123; Path=/' });
      res.end(JSON.stringify({ loggedIn: true }));
      return;
    }
    if (req.url === '/secure') {
      const cookieHeader = req.headers.cookie || '';
      if (cookieHeader.includes('session=abc123')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ authenticated: true }));
      } else {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ authenticated: false }));
      }
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

async function withMcpClient(env, fn) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [SERVER_ENTRY], env, stderr: 'pipe' });
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

function writeWorkspaceFile(workspaceRoot, name, contents) {
  fs.writeFileSync(path.join(workspaceRoot, name), contents);
}

describe('cookie jar behavior across MCP tool calls', () => {
  test('run_file: a login response Set-Cookie is replayed on a later authenticated request', async () => {
    const { server, baseUrl } = await startAuthFixtureServer();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-client-mcp-cookie-'));
    writeWorkspaceFile(workspaceRoot, 'session.http', [
      '# @name login',
      `GET ${baseUrl}/login HTTP/1.1`,
      '',
      '###',
      '',
      '# @name secure',
      `GET ${baseUrl}/secure HTTP/1.1`,
      '',
    ].join('\n'));

    try {
      await withMcpClient({ REST_CLIENT_MCP_WORKSPACE_ROOT: workspaceRoot }, async (client) => {
        const ran = await client.callTool({ name: 'run_file', arguments: { filePath: 'session.http' } });
        const [loginResult, secureResult] = JSON.parse(ran.content[0].text);

        assert.equal(loginResult.ok, true);
        assert.equal(loginResult.cookies.received, 1);
        assert.equal(loginResult.cookies.sent, 0);

        assert.equal(secureResult.ok, true, `expected the cookie to authenticate the second request, got: ${JSON.stringify(secureResult)}`);
        assert.equal(secureResult.cookies.sent, 1);
        assert.equal(secureResult.cookies.explicitHeaderOverride, false);
      });
    } finally {
      server.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('run_request: cookies persist across two separate tool invocations in the same server process', async () => {
    const { server, baseUrl } = await startAuthFixtureServer();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-client-mcp-cookie-'));
    writeWorkspaceFile(workspaceRoot, 'session.http', [
      '# @name login',
      `GET ${baseUrl}/login HTTP/1.1`,
      '',
      '###',
      '',
      '# @name secure',
      `GET ${baseUrl}/secure HTTP/1.1`,
      '',
    ].join('\n'));

    try {
      await withMcpClient({ REST_CLIENT_MCP_WORKSPACE_ROOT: workspaceRoot }, async (client) => {
        const loginCall = await client.callTool({ name: 'run_request', arguments: { filePath: 'session.http', name: 'login' } });
        const loginResult = JSON.parse(loginCall.content[0].text);
        assert.equal(loginResult.ok, true);
        assert.equal(loginResult.cookies.received, 1);

        const secureCall = await client.callTool({ name: 'run_request', arguments: { filePath: 'session.http', name: 'secure' } });
        const secureResult = JSON.parse(secureCall.content[0].text);
        assert.equal(secureResult.ok, true, `expected jar cookie from the earlier call to authenticate this one, got: ${JSON.stringify(secureResult)}`);
        assert.equal(secureResult.cookies.sent, 1);
      });
    } finally {
      server.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('useCookieJar: false bypasses both reading and writing the jar', async () => {
    const { server, baseUrl } = await startAuthFixtureServer();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-client-mcp-cookie-'));
    writeWorkspaceFile(workspaceRoot, 'session.http', [
      '# @name login',
      `GET ${baseUrl}/login HTTP/1.1`,
      '',
      '###',
      '',
      '# @name secure',
      `GET ${baseUrl}/secure HTTP/1.1`,
      '',
    ].join('\n'));

    try {
      await withMcpClient({ REST_CLIENT_MCP_WORKSPACE_ROOT: workspaceRoot }, async (client) => {
        const loginCall = await client.callTool({
          name: 'run_request',
          arguments: { filePath: 'session.http', name: 'login', useCookieJar: false },
        });
        const loginResult = JSON.parse(loginCall.content[0].text);
        assert.equal(loginResult.ok, true);
        assert.equal(loginResult.cookies.received, 0, 'jar writes should be skipped when useCookieJar is false');

        const secureCall = await client.callTool({
          name: 'run_request',
          arguments: { filePath: 'session.http', name: 'secure', useCookieJar: false },
        });
        const secureResult = JSON.parse(secureCall.content[0].text);
        assert.equal(secureResult.ok, false, 'without the jar, the secure endpoint should reject the unauthenticated request');
        assert.equal(secureResult.status, 401);
        assert.equal(secureResult.cookies.sent, 0);
      });
    } finally {
      server.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('an explicit Cookie header on the request is never overridden by the jar', async () => {
    const { server, baseUrl } = await startAuthFixtureServer();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-client-mcp-cookie-'));
    writeWorkspaceFile(workspaceRoot, 'session.http', [
      '# @name login',
      `GET ${baseUrl}/login HTTP/1.1`,
      '',
      '###',
      '',
      '# @name secureWithOwnCookie',
      `GET ${baseUrl}/secure HTTP/1.1`,
      'Cookie: session=wrong-value',
      '',
    ].join('\n'));

    try {
      await withMcpClient({ REST_CLIENT_MCP_WORKSPACE_ROOT: workspaceRoot }, async (client) => {
        await client.callTool({ name: 'run_request', arguments: { filePath: 'session.http', name: 'login' } });

        const secureCall = await client.callTool({
          name: 'run_request',
          arguments: { filePath: 'session.http', name: 'secureWithOwnCookie' },
        });
        const secureResult = JSON.parse(secureCall.content[0].text);
        assert.equal(secureResult.cookies.explicitHeaderOverride, true);
        assert.equal(secureResult.cookies.sent, 0);
        assert.equal(secureResult.ok, false, 'the explicit (wrong) Cookie header should be sent as-is, not replaced by the jar');
        assert.equal(secureResult.status, 401);
      });
    } finally {
      server.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
