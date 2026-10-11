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

module.exports = config;
