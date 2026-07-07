import { createMcpStdioServerConfig, InvalidMcpConfigError, isServerConfigured, upsertMcpServerConfig } from '../../src/utils/mcpRegistration';

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

    it('treats an empty string as an empty config', () => {
        const serverConfig = createMcpStdioServerConfig('node', '/ext/mcp-server/src/index.js', '/ext');
        const result = upsertMcpServerConfig('', 'rest-client', serverConfig);

        expect(result.status).toBe('added');
        expect(JSON.parse(result.content).servers['rest-client']).toStrictEqual(serverConfig);
    });

    it('treats whitespace-only content as an empty config', () => {
        const serverConfig = createMcpStdioServerConfig('node', '/ext/mcp-server/src/index.js', '/ext');
        const result = upsertMcpServerConfig('   \n\t  ', 'rest-client', serverConfig);

        expect(result.status).toBe('added');
        expect(JSON.parse(result.content).servers['rest-client']).toStrictEqual(serverConfig);
    });

    it('preserves unrelated existing servers and top-level keys', () => {
        const serverConfig = createMcpStdioServerConfig('node', '/ext/mcp-server/src/index.js', '/ext');
        const existing = {
            inputs: ['some-input'],
            servers: {
                'other-server': { type: 'stdio', command: 'other', args: [], cwd: '/other' },
            },
        };

        const result = upsertMcpServerConfig(JSON.stringify(existing), 'rest-client', serverConfig);
        const parsed = JSON.parse(result.content);

        expect(parsed.inputs).toStrictEqual(['some-input']);
        expect(parsed.servers['other-server']).toStrictEqual(existing.servers['other-server']);
        expect(parsed.servers['rest-client']).toStrictEqual(serverConfig);
    });

    it('throws InvalidMcpConfigError on malformed JSON instead of silently discarding it', () => {
        const serverConfig = createMcpStdioServerConfig('node', '/ext/mcp-server/src/index.js', '/ext');

        expect(() => upsertMcpServerConfig('{ this is not json', 'rest-client', serverConfig))
            .toThrow(InvalidMcpConfigError);
    });

    it('tolerates JSONC comments and trailing commas', () => {
        const serverConfig = createMcpStdioServerConfig('node', '/ext/mcp-server/src/index.js', '/ext');
        const jsonc = `{
            // a comment
            "servers": {},
        }`;

        expect(() => upsertMcpServerConfig(jsonc, 'rest-client', serverConfig)).not.toThrow();
    });
});

describe('isServerConfigured', () => {
    it('returns false for undefined content', () => {
        expect(isServerConfigured(undefined, 'rest-client')).toBe(false);
    });

    it('returns false for malformed JSON instead of throwing', () => {
        expect(isServerConfigured('{ not json', 'rest-client')).toBe(false);
    });

    it('returns false when the server is absent', () => {
        expect(isServerConfigured(JSON.stringify({ servers: { other: {} } }), 'rest-client')).toBe(false);
    });

    it('returns true when the server is present', () => {
        const content = JSON.stringify({ servers: { 'rest-client': { type: 'stdio', command: 'node', args: [], cwd: '/ext' } } });
        expect(isServerConfigured(content, 'rest-client')).toBe(true);
    });
});
