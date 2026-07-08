// End-to-end proof for two bugs found running a login-style .http file
// through run_request: {{$dotenv %NAME}} file variables didn't resolve
// (systemVariables.js used to hard-list $dotenv as unsupported), and a
// form-urlencoded body wrapped across lines with a leading '&' arrived at
// the server with literal embedded newlines instead of being joined into one
// parameter string - corrupting whichever field straddled the line break.
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

async function startEchoServer() {
  let lastRequest;
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      lastRequest = { url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString('utf8') };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return { server, baseUrl: `http://127.0.0.1:${port}`, getLastRequest: () => lastRequest };
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

describe('run_request: {{$dotenv}} file variables + multi-line form-urlencoded bodies', () => {
  test('resolves {{$dotenv %NAME}} via a .env file and joins a wrapped form body with no embedded newlines', async () => {
    const { server, baseUrl, getLastRequest } = await startEchoServer();
    const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'rest-client-mcp-dotenv-'));

    try {
      fs.writeFileSync(path.join(workspaceRoot, '.env'), [
        `GATEWAY=${baseUrl}`,
        'TEST_USERNAME=fake-user',
        'TEST_PASSWORD=fake-pass-24@',
        '',
      ].join('\n'));

      fs.writeFileSync(path.join(workspaceRoot, 'fixture.http'), [
        '@bff-gateway = {{$dotenv %GATEWAY}}',
        '@password = {{$dotenv %TEST_PASSWORD}}',
        '@username = {{$dotenv %TEST_USERNAME}}',
        '',
        '# @name login',
        'POST {{bff-gateway}}/login HTTP/1.1',
        'Content-Type: application/x-www-form-urlencoded',
        '',
        'user_id={{username}}',
        '&password={{password}}',
        '&RememberUserId=false',
        '',
      ].join('\n'));

      await withMcpClient({ REST_CLIENT_MCP_WORKSPACE_ROOT: workspaceRoot }, async (client) => {
        const result = await client.callTool({
          name: 'run_request',
          arguments: { filePath: 'fixture.http', name: 'login' },
        });

        assert.equal(result.isError, undefined, 'run_request should not report a protocol-level error');
        const summary = JSON.parse(result.content[0].text);
        assert.equal(summary.warnings, undefined, `expected no unresolved-variable warnings, got: ${JSON.stringify(summary.warnings)}`);
        assert.equal(summary.ok, true, `expected a successful response, got: ${JSON.stringify(summary)}`);

        const sent = getLastRequest();
        assert.equal(sent.url, '/login', 'the {{$dotenv %GATEWAY}} host should have resolved into the request URL');
        assert.equal(
          sent.body,
          'user_id=fake-user&password=fake-pass-24@&RememberUserId=false',
          'the wrapped form body should join into one parameter string with no embedded newlines',
        );
      });
    } finally {
      server.close();
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });
});
