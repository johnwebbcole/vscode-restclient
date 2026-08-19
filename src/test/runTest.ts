import { downloadAndUnzipVSCode, runTests } from '@vscode/test-electron';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'path';

function resolveVSCodeExecutablePath(vscodeExecutablePath: string): string {
    if (process.platform !== 'darwin' || fs.existsSync(vscodeExecutablePath)) {
        return vscodeExecutablePath;
    }

    // Recent macOS VS Code test builds use `.../Contents/MacOS/Code` instead of `Electron`.
    const macOSDir = path.dirname(vscodeExecutablePath);
    const fallbackExecutables = [
        path.join(macOSDir, 'Code'),
        path.join(macOSDir, 'Code - Insiders')
    ];

    for (const executablePath of fallbackExecutables) {
        if (fs.existsSync(executablePath)) {
            return executablePath;
        }
    }

    return vscodeExecutablePath;
}

async function main() {
    // A real, empty folder to open as the workspace so activation-flow tests can exercise the
    // "workspace is open" path (e.g. .vscode/mcp.json auto-registration) without touching the repo.
    const workspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'restclient-mcp-test-workspace-'));

    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');
        const downloadedVSCodeExecutablePath = await downloadAndUnzipVSCode();
        const vscodeExecutablePath = resolveVSCodeExecutablePath(downloadedVSCodeExecutablePath);

        // VS Code's integrated terminal sets this so `node` scripts can run under Electron;
        // it also makes the downloaded test VS Code launch as a bare Node process instead of the app.
        delete process.env.ELECTRON_RUN_AS_NODE;

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            vscodeExecutablePath,
            launchArgs: [workspacePath]
        });
    } catch (err) {
        console.error('Failed to run integration tests');
        console.error(err);
        process.exit(1);
    } finally {
        fs.rmSync(workspacePath, { recursive: true, force: true });
    }
}

main();
