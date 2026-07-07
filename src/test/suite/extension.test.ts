import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Host', () => {
    test('extension is registered', () => {
        const extension = vscode.extensions.getExtension('johncole.restclient-mcp');
        assert.ok(extension);
    });

    test('activation auto-registers the bundled MCP server in the open workspace', async function () {
        this.timeout(30000);

        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder, 'expected a workspace folder to be open for this test run (see src/test/runTest.ts)');

        const mcpConfigUri = vscode.Uri.joinPath(folder!.uri, '.vscode', 'mcp.json');

        const extension = vscode.extensions.getExtension('johncole.restclient-mcp');
        assert.ok(extension);
        await extension!.activate();

        // Auto-setup runs fire-and-forget from activate(), so poll briefly for the file to appear
        // rather than assuming it exists synchronously once activate() resolves.
        const content = await waitForFileContent(mcpConfigUri, 15000);
        assert.ok(content, 'expected .vscode/mcp.json to be created automatically after activation, with no manual "Register MCP Server" step');

        const parsed = JSON.parse(content!);
        assert.ok(parsed.servers?.['rest-client'], 'expected a rest-client entry under "servers"');
        assert.strictEqual(parsed.servers['rest-client'].type, 'stdio');
    });

    test('re-running Register MCP Server is idempotent and does not duplicate the entry', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const mcpConfigUri = vscode.Uri.joinPath(folder!.uri, '.vscode', 'mcp.json');

        const before = Buffer.from(await vscode.workspace.fs.readFile(mcpConfigUri)).toString('utf8');

        await vscode.commands.executeCommand('rest-client.register-mcp-server');

        const after = Buffer.from(await vscode.workspace.fs.readFile(mcpConfigUri)).toString('utf8');
        assert.strictEqual(before, after, 'expected re-running registration against an already-registered config to leave the file byte-for-byte unchanged');

        const parsed = JSON.parse(after);
        assert.strictEqual(Object.keys(parsed.servers).length, 1, 'expected exactly one server entry, not a duplicate');
    });

    test('Register MCP Server does not throw regardless of whether mcp.openUserConfiguration exists in this VS Code build', async () => {
        // This is the exact scenario from the bug report: the command must never hard-fail just
        // because a particular internal VS Code command id isn't present.
        await assert.doesNotReject(() => Promise.resolve(vscode.commands.executeCommand('rest-client.register-mcp-server')));
    });
});

async function waitForFileContent(uri: vscode.Uri, timeoutMs: number): Promise<string | undefined> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const data = await vscode.workspace.fs.readFile(uri);
            return Buffer.from(data).toString('utf8');
        } catch {
            await new Promise(resolve => setTimeout(resolve, 250));
        }
    }
    return undefined;
}
