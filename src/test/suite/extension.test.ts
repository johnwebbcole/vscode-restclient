import * as assert from 'assert';
import * as vscode from 'vscode';

suite('Extension Host', () => {
    test('extension is registered', () => {
        const extension = vscode.extensions.getExtension('humao.rest-client');
        assert.ok(extension);
    });
});
