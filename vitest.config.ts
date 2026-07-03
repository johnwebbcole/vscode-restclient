import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        alias: {
            vscode: path.resolve(__dirname, 'test/__mocks__/vscode.ts')
        }
    },
    test: {
        include: ['test/**/*.test.ts'],
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['src/extension.ts', 'src/test/**']
        }
    }
});
