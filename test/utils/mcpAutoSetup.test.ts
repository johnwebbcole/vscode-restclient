import * as path from 'node:path';
import { isCommandAvailable, resolveUserMcpConfigPath } from '../../src/utils/mcpAutoSetup';

describe('isCommandAvailable', () => {
    it('returns true when the command is present', async () => {
        const available = await isCommandAvailable('mcp.openUserConfiguration', async () => ['a', 'mcp.openUserConfiguration', 'b']);
        expect(available).toBe(true);
    });

    it('returns false when the command is missing (the bug scenario)', async () => {
        const available = await isCommandAvailable('mcp.openUserConfiguration', async () => ['a', 'b']);
        expect(available).toBe(false);
    });

    it('returns false instead of throwing when listing commands fails', async () => {
        const available = await isCommandAvailable('mcp.openUserConfiguration', async () => {
            throw new Error('boom');
        });
        expect(available).toBe(false);
    });
});

describe('resolveUserMcpConfigPath', () => {
    it('derives the User/mcp.json path from the extension global storage path', () => {
        const globalStorage = path.join('/Users/test/Library/Application Support/Code/User/globalStorage/johncole.restclient-mcp');
        const result = resolveUserMcpConfigPath(globalStorage);

        expect(result).toBe(path.join('/Users/test/Library/Application Support/Code/User/mcp.json'));
    });

    it('works for Linux-style config directories', () => {
        const globalStorage = path.join('/home/test/.config/Code/User/globalStorage/johncole.restclient-mcp');
        const result = resolveUserMcpConfigPath(globalStorage);

        expect(result).toBe(path.join('/home/test/.config/Code/User/mcp.json'));
    });
});
