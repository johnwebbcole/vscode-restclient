import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Host', () => {
    test('extension is registered', () => {
        const extension = vscode.extensions.getExtension('johncole.restclient-mcp');
        assert.ok(extension);
    });

    test('activation does not write a static mcp.json entry', async function () {
        this.timeout(10000);

        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder, 'expected a workspace folder to be open for this test run (see src/test/runTest.ts)');

        const mcpConfigUri = vscode.Uri.joinPath(folder!.uri, '.vscode', 'mcp.json');

        const extension = vscode.extensions.getExtension('johncole.restclient-mcp');
        assert.ok(extension);
        await extension!.activate();

        // Give any stray async work a moment to run. VS Code discovers the bundled server
        // dynamically through registerBundledMcpServerProvider (lm.registerMcpServerDefinitionProvider),
        // so activation must not also write a static file entry - doing both makes "rest-client"
        // show up twice in "MCP: List Servers".
        await new Promise(resolve => setTimeout(resolve, 1000));

        await assert.rejects(
            () => Promise.resolve(vscode.workspace.fs.readFile(mcpConfigUri)),
            'expected no .vscode/mcp.json to be created automatically by activation'
        );
    });

    test('Register MCP Server writes the workspace entry, and re-running it is idempotent', async () => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        assert.ok(folder);
        const mcpConfigUri = vscode.Uri.joinPath(folder!.uri, '.vscode', 'mcp.json');

        await vscode.commands.executeCommand('rest-client.register-mcp-server');

        const first = Buffer.from(await vscode.workspace.fs.readFile(mcpConfigUri)).toString('utf8');
        const parsed = JSON.parse(first);
        assert.ok(parsed.servers?.['rest-client'], 'expected a rest-client entry under "servers"');
        assert.strictEqual(parsed.servers['rest-client'].type, 'stdio');

        await vscode.commands.executeCommand('rest-client.register-mcp-server');

        const second = Buffer.from(await vscode.workspace.fs.readFile(mcpConfigUri)).toString('utf8');
        assert.strictEqual(first, second, 'expected re-running registration against an already-registered config to leave the file byte-for-byte unchanged');
        assert.strictEqual(Object.keys(JSON.parse(second).servers).length, 1, 'expected exactly one server entry, not a duplicate');
    });

    test('Register MCP Server does not throw regardless of whether mcp.openUserConfiguration exists in this VS Code build', async () => {
        // This is the exact scenario from the bug report: the command must never hard-fail just
        // because a particular internal VS Code command id isn't present.
        await assert.doesNotReject(() => Promise.resolve(vscode.commands.executeCommand('rest-client.register-mcp-server')));
    });
});
