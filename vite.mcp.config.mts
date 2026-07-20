import { defineConfig } from 'vite';

// Bundles the MCP server (mcp-server/src/index.js) and its dependencies into
// the single file dist/mcp-server.mjs, so the extension can ship it without
// mcp-server/node_modules. The .mjs extension keeps it ESM (the server source
// is ESM) even though this package.json has no `"type": "module"`.
// Run after vite.config.mts, which empties dist first.
export default defineConfig(({ mode }) => ({
    build: {
        ssr: 'mcp-server/src/index.js',
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: true,
        target: 'node20',
        minify: mode === 'production',
        rollupOptions: {
            output: {
                format: 'es',
                entryFileNames: 'mcp-server.mjs',
                codeSplitting: false,
            },
        },
    },
    ssr: {
        noExternal: true,
    },
}));
