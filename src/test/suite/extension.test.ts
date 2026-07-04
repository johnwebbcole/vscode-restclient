import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Host', () => {
    test('extension is registered', () => {
        const extension = vscode.extensions.getExtension('johncole.restclient-mcp');
        assert.ok(extension);
    });
});
