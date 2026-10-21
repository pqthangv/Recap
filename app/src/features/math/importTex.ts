// Phone: the bundle holds MathJax, but its code only runs the first time it's required here.
// (The web version downloads it as a separate file: importTex.web.ts.)
import type * as Tex from '@/lib/math/tex';

export function importTex(): Promise<typeof Tex> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return Promise.resolve(require('@/lib/math/tex') as typeof Tex);
}
