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
 * A fixture server implementing a minimal login flow: GET /login returns a
 * JSON body with a token; GET /whoami echoes back whatever Authorization
 * header it received, so a test can prove the token from /login's response
 * body made it into a later request.
 */
async function startAuthFixtureServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/login') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ token: 'tok-abc123' }));
      return;
    }
    if (req.url === '/whoami') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ receivedAuth: req.headers.authorization || null }));
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

describe('request cache: {{name.response...}} chaining across separate run_request calls', () => {
  test('a second run_request call resolves {{login.response.body.$.token}} against an earlier run_request call', async () => {
    const { server, baseUrl } = await startAuthFixtureServer();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-client-mcp-reqcache-'));
    writeWorkspaceFile(workspaceRoot, 'session.http', [
      '# @name login',
      `GET ${baseUrl}/login HTTP/1.1`,
      '',
      '###',
      '',
      '# @name whoami',
      `GET ${baseUrl}/whoami HTTP/1.1`,
      'Authorization: Bearer {{login.response.body.$.token}}',
      '',
    ].join('\n'));

    try {
      await withMcpClient({ REST_CLIENT_MCP_WORKSPACE_ROOT: workspaceRoot }, async (client) => {
        const loginCall = await client.callTool({ name: 'run_request', arguments: { filePath: 'session.http', name: 'login' } });
        const loginResult = JSON.parse(loginCall.content[0].text);
        assert.equal(loginResult.ok, true, `expected login to succeed, got: ${JSON.stringify(loginResult)}`);

        // Separate tool call - this is the crux of the bug: chaining must
        // resolve against a request that ran in a *previous* run_request call.
        const whoamiCall = await client.callTool({ name: 'run_request', arguments: { filePath: 'session.http', name: 'whoami' } });
        const whoamiResult = JSON.parse(whoamiCall.content[0].text);

        assert.equal(whoamiResult.warnings, undefined, `expected no unresolved-variable warnings, got: ${JSON.stringify(whoamiResult)}`);
        assert.equal(whoamiResult.ok, true, `expected whoami to succeed, got: ${JSON.stringify(whoamiResult)}`);
        assert.deepEqual(JSON.parse(whoamiResult.body), { receivedAuth: 'Bearer tok-abc123' });
      });
    } finally {
      server.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('run_file can chain against a name that came from an earlier run_request call', async () => {
    const { server, baseUrl } = await startAuthFixtureServer();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-client-mcp-reqcache-'));
    writeWorkspaceFile(workspaceRoot, 'login.http', [
      '# @name login',
      `GET ${baseUrl}/login HTTP/1.1`,
      '',
    ].join('\n'));
    writeWorkspaceFile(workspaceRoot, 'whoami.http', [
      '# @name whoami',
      `GET ${baseUrl}/whoami HTTP/1.1`,
      'Authorization: Bearer {{login.response.body.$.token}}',
      '',
    ].join('\n'));

    try {
      await withMcpClient({ REST_CLIENT_MCP_WORKSPACE_ROOT: workspaceRoot }, async (client) => {
        await client.callTool({ name: 'run_request', arguments: { filePath: 'login.http', name: 'login' } });

        const ran = await client.callTool({ name: 'run_file', arguments: { filePath: 'whoami.http' } });
        const [whoamiResult] = JSON.parse(ran.content[0].text);

        assert.equal(whoamiResult.warnings, undefined, `expected no unresolved-variable warnings, got: ${JSON.stringify(whoamiResult)}`);
        assert.deepEqual(JSON.parse(whoamiResult.body), { receivedAuth: 'Bearer tok-abc123' });
      });
    } finally {
      server.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('a name produced by run_file is visible to a later, separate run_request call', async () => {
    const { server, baseUrl } = await startAuthFixtureServer();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-client-mcp-reqcache-'));
    writeWorkspaceFile(workspaceRoot, 'login.http', [
      '# @name login',
      `GET ${baseUrl}/login HTTP/1.1`,
      '',
    ].join('\n'));
    writeWorkspaceFile(workspaceRoot, 'whoami.http', [
      '# @name whoami',
      `GET ${baseUrl}/whoami HTTP/1.1`,
      'Authorization: Bearer {{login.response.body.$.token}}',
      '',
    ].join('\n'));

    try {
      await withMcpClient({ REST_CLIENT_MCP_WORKSPACE_ROOT: workspaceRoot }, async (client) => {
        await client.callTool({ name: 'run_file', arguments: { filePath: 'login.http' } });

        const whoamiCall = await client.callTool({ name: 'run_request', arguments: { filePath: 'whoami.http', name: 'whoami' } });
        const whoamiResult = JSON.parse(whoamiCall.content[0].text);

        assert.equal(whoamiResult.warnings, undefined, `expected no unresolved-variable warnings, got: ${JSON.stringify(whoamiResult)}`);
        assert.deepEqual(JSON.parse(whoamiResult.body), { receivedAuth: 'Bearer tok-abc123' });
      });
    } finally {
      server.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  test('useRequestCache: false prevents a later run_request call from seeing an earlier named result', async () => {
    const { server, baseUrl } = await startAuthFixtureServer();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-client-mcp-reqcache-'));
    writeWorkspaceFile(workspaceRoot, 'session.http', [
      '# @name login',
      `GET ${baseUrl}/login HTTP/1.1`,
      '',
      '###',
      '',
      '# @name whoami',
      `GET ${baseUrl}/whoami HTTP/1.1`,
      'Authorization: Bearer {{login.response.body.$.token}}',
      '',
    ].join('\n'));

    try {
      await withMcpClient({ REST_CLIENT_MCP_WORKSPACE_ROOT: workspaceRoot }, async (client) => {
        await client.callTool({
          name: 'run_request',
          arguments: { filePath: 'session.http', name: 'login', useRequestCache: false },
        });

        const whoamiCall = await client.callTool({
          name: 'run_request',
          arguments: { filePath: 'session.http', name: 'whoami', useRequestCache: false },
        });
        const whoamiResult = JSON.parse(whoamiCall.content[0].text);

        assert.ok(
          whoamiResult.warnings?.some(w => w.includes("Could not resolve variable '{{login.response.body.$.token}}'")),
          `expected an unresolved-variable warning with the cache disabled, got: ${JSON.stringify(whoamiResult)}`,
        );
        assert.deepEqual(JSON.parse(whoamiResult.body), { receivedAuth: 'Bearer {{login.response.body.$.token}}' });
      });
    } finally {
      server.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
