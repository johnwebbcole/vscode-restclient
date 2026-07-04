import { runTests } from '@vscode/test-electron';
import * as path from 'path';

async function main() {
    try {
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // VS Code's integrated terminal sets this so `node` scripts can run under Electron;
        // it also makes the downloaded test VS Code launch as a bare Node process instead of the app.
        delete process.env.ELECTRON_RUN_AS_NODE;

        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath
        });
    } catch (err) {
        console.error('Failed to run integration tests');
        console.error(err);
        process.exit(1);
    }
}

main();
