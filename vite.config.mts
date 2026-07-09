import { defineConfig } from 'vite';

// Bundles the extension host entry (src/extension.ts) into dist/extension.js.
// Uses vite's SSR build so module resolution targets Node.js and node builtins
// stay external; the output is CommonJS because this package has no
// `"type": "module"`, which is what the VS Code extension host requires.
// The bundled MCP server is built separately by vite.mcp.config.mts.
export default defineConfig(({ mode }) => ({
    build: {
        ssr: 'src/extension.ts',
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        target: 'node20',
        minify: mode === 'production',
        rollupOptions: {
            external: ['vscode'],
            output: {
                format: 'cjs',
                entryFileNames: 'extension.js',
                chunkFileNames: 'chunks/[name]-[hash].js',
                // No top-level "use strict": bundled sloppy-mode CJS deps
                // (e.g. pretty-data's implicit globals) throw under strict
                // mode. Webpack likewise scoped strictness per module.
                strict: false,
            },
        },
    },
    ssr: {
        // Bundle every dependency into dist so the extension ships without
        // a top-level node_modules (see .vscodeignore).
        noExternal: true,
    },
}));
