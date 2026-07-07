import { parse } from 'jsonc-parser';

export interface McpStdioServerConfig {
    type: 'stdio';
    command: string;
    args: string[];
    cwd: string;
}

export type McpConfigUpsertStatus = 'added' | 'updated' | 'unchanged';

export interface McpConfigUpsertResult {
    content: string;
    status: McpConfigUpsertStatus;
}

interface McpConfigDocument {
    servers?: Record<string, unknown>;
    [key: string]: unknown;
}

export function createMcpStdioServerConfig(command: string, scriptPath: string, cwd: string): McpStdioServerConfig {
    return {
        type: 'stdio',
        command,
        args: [scriptPath],
        cwd,
    };
}

export function upsertMcpServerConfig(
    content: string | undefined,
    serverName: string,
    serverConfig: McpStdioServerConfig
): McpConfigUpsertResult {
    const raw = content?.trim();
    const parsed = raw ? parse(raw) : {};
    const normalizedRoot: McpConfigDocument = isRecord(parsed) ? parsed : {};
    const servers = isRecord(normalizedRoot.servers) ? normalizedRoot.servers : {};
    const existing = servers[serverName];

    let status: McpConfigUpsertStatus = 'added';
    if (existing !== undefined) {
        status = deepEqual(existing, serverConfig) ? 'unchanged' : 'updated';
    }

    normalizedRoot.servers = {
        ...servers,
        [serverName]: serverConfig,
    };

    return {
        content: `${JSON.stringify(normalizedRoot, null, 2)}\n`,
        status,
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function deepEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function normalize(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(item => normalize(item));
    }

    if (!isRecord(value)) {
        return value;
    }

    return Object.keys(value)
        .sort((a, b) => a.localeCompare(b))
        .reduce<Record<string, unknown>>((acc, key) => {
            acc[key] = normalize(value[key]);
            return acc;
        }, {});
}
