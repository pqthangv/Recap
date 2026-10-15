// https://docs.expo.dev/guides/customizing-metro/
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Keep Metro out of the generated native projects. Gradle writes thousands of build files there,
// and without Watchman (the usual case on Windows) Metro stalls while it tracks them.
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nativeDirs = ['android', 'ios'].map(
  (dir) => new RegExp(`^${escape(path.join(__dirname, dir) + path.sep)}`),
);
const existing = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existing) ? existing : existing ? [existing] : []),
  ...nativeDirs,
];

// Web: expo-sqlite runs SQLite as WebAssembly in a worker, and waits for it with
// SharedArrayBuffer, which browsers only allow on "cross-origin isolated" pages. The same two
// headers are set for the hosted site in public/_headers.
config.resolver.assetExts.push('wasm');
config.server.enhanceMiddleware = (middleware) => (req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  return middleware(req, res, next);
};

// Web: load Recap's patched copy of expo-sqlite's WorkerChannel (vendor/expo-sqlite, which says
// what's fixed) instead of its own, and resolve that copy's imports in expo-sqlite's web folder.
const sqliteWebDir = path.join(path.dirname(require.resolve('expo-sqlite/package.json')), 'web');
const patchedChannel = path.join(__dirname, 'vendor', 'expo-sqlite', 'WorkerChannel.ts');
const samePath = (a, b) => path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase();
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const from = context.originModulePath;
  if (moduleName === './WorkerChannel' && samePath(path.dirname(from), sqliteWebDir)) {
    return { type: 'sourceFile', filePath: patchedChannel };
  }
  if (samePath(from, patchedChannel) && moduleName.startsWith('./')) {
    const inSqlite = { ...context, originModulePath: path.join(sqliteWebDir, 'WorkerChannel.ts') };
    return context.resolveRequest(inSqlite, moduleName, platform);
  }
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
