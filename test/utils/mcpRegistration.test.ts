import { createMcpStdioServerConfig, upsertMcpServerConfig } from '../../src/utils/mcpRegistration';

describe('createMcpStdioServerConfig', () => {
    it('creates a stdio MCP server config payload', () => {
        const config = createMcpStdioServerConfig('/usr/local/bin/node', '/ext/mcp-server/src/index.js', '/ext');

        expect(config).toStrictEqual({
            type: 'stdio',
            command: '/usr/local/bin/node',
            args: ['/ext/mcp-server/src/index.js'],
            cwd: '/ext',
        });
    });
});

describe('upsertMcpServerConfig', () => {
    it('adds a new rest-client server to empty config', () => {
        const serverConfig = createMcpStdioServerConfig('node', '/ext/mcp-server/src/index.js', '/ext');
        const result = upsertMcpServerConfig(undefined, 'rest-client', serverConfig);

        expect(result.status).toBe('added');

        const parsed = JSON.parse(result.content);
        expect(parsed.servers['rest-client']).toStrictEqual(serverConfig);
    });

    it('is idempotent when matching server config already exists', () => {
        const serverConfig = createMcpStdioServerConfig('node', '/ext/mcp-server/src/index.js', '/ext');
        const existing = {
            servers: {
                'rest-client': serverConfig,
            },
        };

        const result = upsertMcpServerConfig(JSON.stringify(existing), 'rest-client', serverConfig);

        expect(result.status).toBe('unchanged');
        expect(JSON.parse(result.content)).toStrictEqual(existing);
    });

    it('updates an existing server when config differs', () => {
        const serverConfig = createMcpStdioServerConfig('/new/node', '/new/mcp-server/src/index.js', '/new');
        const existing = {
            servers: {
                'rest-client': {
                    type: 'stdio',
                    command: 'node',
                    args: ['/old/mcp-server/src/index.js'],
                    cwd: '/old',
                },
            },
        };

        const result = upsertMcpServerConfig(JSON.stringify(existing), 'rest-client', serverConfig);

        expect(result.status).toBe('updated');

        const parsed = JSON.parse(result.content);
        expect(parsed.servers['rest-client']).toStrictEqual(serverConfig);
    });
});
