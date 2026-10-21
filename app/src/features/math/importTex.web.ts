// Web: MathJax is a separate file (~1.7 MB) that the browser downloads only when a formula is
// shown, so the site's first load doesn't grow.
import type * as Tex from '@/lib/math/tex';

export function importTex(): Promise<typeof Tex> {
  return import('@/lib/math/tex');
}
