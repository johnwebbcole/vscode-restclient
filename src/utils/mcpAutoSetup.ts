import * as path from 'node:path';

// Checks command availability instead of assuming an ID exists, so callers never hard-fail when a
// VS Code build/environment lacks an internal command (e.g. `mcp.openUserConfiguration`).
export async function isCommandAvailable(
    commandId: string,
    listCommands: () => Thenable<string[]> | Promise<string[]>
): Promise<boolean> {
    try {
        const allCommands = await listCommands();
        return allCommands.includes(commandId);
    } catch {
        return false;
    }
}

// Derives the user-profile mcp.json path from the extension's global storage path instead of a
// hardcoded per-OS path, so it keeps working under portable installs, custom --user-data-dir,
// remote/WSL/container hosts, and VS Code forks (VSCodium, Cursor, etc).
// <user-data-dir>/User/globalStorage/<publisher>.<name>/../.. === <user-data-dir>/User
export function resolveUserMcpConfigPath(globalStorageFsPath: string): string {
    return path.join(globalStorageFsPath, '..', '..', 'mcp.json');
}
