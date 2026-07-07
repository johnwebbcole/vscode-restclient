import { parse, ParseError } from 'jsonc-parser';

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

// Thrown instead of silently discarding the user's file when it can't be parsed, so callers can
// offer an explicit recovery path (open for manual fix, or back up and reset) rather than clobbering it.
export class InvalidMcpConfigError extends Error {
    public readonly parseErrors: ParseError[];

    constructor(parseErrors: ParseError[]) {
        super('The MCP configuration file contains invalid JSON.');
        this.name = 'InvalidMcpConfigError';
        this.parseErrors = parseErrors;
    }
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
    const normalizedRoot = parseMcpConfigDocument(content);
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

// Reports whether `serverName` is present in the config without rewriting anything; used by the
// status check command. Treats unparsable content as "not registered" rather than throwing.
export function isServerConfigured(content: string | undefined, serverName: string): boolean {
    try {
        const root = parseMcpConfigDocument(content);
        return isRecord(root.servers) && root.servers[serverName] !== undefined;
    } catch {
        return false;
    }
}

function parseMcpConfigDocument(content: string | undefined): McpConfigDocument {
    const raw = content?.trim();
    if (!raw) {
        return {};
    }

    const errors: ParseError[] = [];
    const parsed = parse(raw, errors, { allowTrailingComma: true });
    if (errors.length > 0) {
        throw new InvalidMcpConfigError(errors);
    }

    return isRecord(parsed) ? parsed : {};
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
