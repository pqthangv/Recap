// Windows only: release builds compile C++ into folders whose paths pass Windows' old 260-character
// limit ("Filename longer than 260 characters"). The CMake 3.22.1 that Android builds use by default
// ships ninja 1.10, which can't handle long paths; CMake 3.31's ninja (1.12) can, with Windows long
// paths enabled (LongPathsEnabled=1). This points Gradle at the newest CMake ≥ 3.31 installed in the
// Android SDK (SDK Manager > SDK Tools > CMake), via android/local.properties. On other systems,
// or without that CMake, nothing changes.
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MIN = [3, 31];

function parse(version) {
  return version.split('.').map((n) => Number.parseInt(n, 10) || 0);
}

function newer(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

function findCmake() {
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (process.platform !== 'win32' || !sdk) return null;
  const root = path.join(sdk, 'cmake');
  if (!fs.existsSync(root)) return null;
  const versions = fs
    .readdirSync(root)
    .filter((v) => !newer(MIN, parse(v)) && fs.existsSync(path.join(root, v, 'bin', 'ninja.exe')));
  if (versions.length === 0) return null;
  const best = versions.reduce((a, b) => (newer(parse(b), parse(a)) ? b : a));
  return path.join(root, best);
}

module.exports = function withWindowsLongPathCmake(config) {
  return withDangerousMod(config, [
    'android',
    (cfg) => {
      const cmake = findCmake();
      if (!cmake) return cfg;
      const file = path.join(cfg.modRequest.platformProjectRoot, 'local.properties');
      const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
      const lines = existing.split(/\r?\n/).filter((l) => l && !l.startsWith('cmake.dir='));
      lines.push(`cmake.dir=${cmake.replace(/\\/g, '/')}`);
      fs.writeFileSync(file, `${lines.join('\n')}\n`);
      return cfg;
    },
  ]);
};
