// https-proxy-agent 5+ ships types via a package.json "exports" map without a
// "main"/"types" field, which the project's CommonJS module resolution
// cannot resolve statically. It's loaded via dynamic `import()` at runtime
// instead, so its types are untyped here rather than pulling in a
// moduleResolution change across the whole build.
declare module 'https-proxy-agent';
