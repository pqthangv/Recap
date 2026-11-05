// Every website file (x.web.ts next to x.ts, CLAUDE.md "Web rules") exports what its phone version
// does. TypeScript only checks x.ts, so a missing export only shows when the website loads: it
// stopped loading at all when tickets.web.ts lacked ticketsFor (2026-11-05). Types don't count.
/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs') as typeof import('fs');
const path = require('path') as typeof import('path');
/* eslint-enable @typescript-eslint/no-require-imports */

const SRC = path.join(__dirname, '..');

function files(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

/** The names a file exports that exist when it runs (not types). */
function runtimeExports(file: string): string[] {
  const text = fs.readFileSync(file, 'utf8');
  const declared = [
    ...text.matchAll(/export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+(\w+)/g),
  ].map((m) => m[1]!);
  const listed = [...text.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((m) =>
    m[1]!
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part && !part.startsWith('type '))
      .map((part) => part.split(/\s+as\s+/).pop()!),
  );
  return [...declared, ...listed, ...(/export\s+default\b/.test(text) ? ['default'] : [])];
}

it('website files export everything their phone files do', () => {
  const pairs = files(SRC)
    .filter((f) => /\.web\.tsx?$/.test(f))
    .map((web) => [web.replace(/\.web\.(tsx?)$/, '.$1'), web] as const)
    .filter(([phone]) => fs.existsSync(phone));
  expect(pairs.length).toBeGreaterThan(3);
  const missing = pairs.flatMap(([phone, web]) => {
    const onWeb = new Set(runtimeExports(web));
    return runtimeExports(phone)
      .filter((name) => !onWeb.has(name))
      .map((name) => `${path.relative(SRC, web)}: ${name}`);
  });
  expect(missing).toEqual([]);
});
