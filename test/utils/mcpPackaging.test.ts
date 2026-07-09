import { readFileSync } from 'fs';
import { join } from 'path';

describe('MCP packaging metadata', () => {
    it('excludes mcp-server sources from the VSIX since the server is bundled into dist', () => {
        const ignorePath = join(__dirname, '../../.vscodeignore');
        const ignoreContent = readFileSync(ignorePath, 'utf8');

        expect(ignoreContent).toContain('mcp-server/**');
        expect(ignoreContent).toContain('node_modules/**');
        // dist/ must ship (only its source maps are excluded), since it holds
        // both the extension bundle and dist/mcp-server.mjs.
        expect(ignoreContent).not.toMatch(/^dist\/\*\*$/m);
    });

    it('declares runtime dependencies required by the bundled mcp server', () => {
        const packagePath = join(__dirname, '../../package.json');
        const packageContent = JSON.parse(readFileSync(packagePath, 'utf8'));
        const dependencies = packageContent.dependencies || {};

        expect(dependencies['@modelcontextprotocol/sdk']).toBeTruthy();
        expect(dependencies['jsonc-parser']).toBeTruthy();
        expect(dependencies['jsonpath-plus']).toBeTruthy();
        expect(dependencies['zod']).toBeTruthy();
    });

    it('contributes official MCP provider metadata and fallback registration command', () => {
        const packagePath = join(__dirname, '../../package.json');
        const packageContent = JSON.parse(readFileSync(packagePath, 'utf8'));

        const providers = packageContent.contributes?.mcpServerDefinitionProviders || [];
        const commands = packageContent.contributes?.commands || [];

        expect(providers).toContainEqual({
            id: 'restclient-mcp.bundled-mcp-server',
            label: 'Rest Client MCP Server',
        });

        expect(commands).toContainEqual(expect.objectContaining({
            command: 'rest-client.register-mcp-server',
        }));

        expect(commands).toContainEqual(expect.objectContaining({
            command: 'rest-client.mcp-server-status',
        }));
    });
});
