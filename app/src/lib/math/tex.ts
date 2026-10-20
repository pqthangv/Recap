// Turns one TeX formula into an SVG picture, on the device: MathJax 3 with TeX in, SVG out and its
// own small DOM (liteAdaptor), so the same code runs in Hermes and in browsers, offline. Heavy
// (~1.5 MB of JavaScript), so screens load it only when a card has math (see features/math/load.ts).
// Not MathJax 4 yet: 4.1.3 crashes on load in Hermes (mathjax/MathJax#3616).
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/base/BaseConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import 'mathjax-full/js/input/tex/cancel/CancelConfiguration.js';
import 'mathjax-full/js/input/tex/color/ColorConfiguration.js';
import 'mathjax-full/js/input/tex/mhchem/MhchemConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { SVG } from 'mathjax-full/js/output/svg.js';

/** A drawn formula. Sizes are in ex (the font's x-height), as MathJax gives them. */
export type MathPicture = {
  svg: string;
  width: number;
  height: number;
  /** How far the picture reaches below the text baseline. */
  depth: number;
};

export type MathResult = MathPicture | { error: string };

const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);

const tex = new TeX({
  packages: ['base', 'ams', 'boldsymbol', 'cancel', 'color', 'mhchem', 'newcommand'],
  // A mistake ("\frac{1}{") throws instead of drawing red text, so the card can show the formula
  // as plain text and the editor can say what's wrong.
  formatError: (_jax: unknown, err: Error) => {
    throw err;
  },
});
// Glyphs drawn as paths in each picture (no shared <defs>/<use>, which react-native-svg's
// XML parser handles less reliably).
const svg = new SVG({ fontCache: 'none' });
const doc = mathjax.document('', { InputJax: tex, OutputJax: svg });

const ex = (pattern: RegExp, tag: string) => Number(pattern.exec(tag)?.[1] ?? 0);

export function texToSvg(formula: string, display: boolean): MathResult {
  try {
    const out = adaptor.innerHTML(doc.convert(formula, { display }));
    const tag = /^<svg[^>]*>/.exec(out)?.[0] ?? '';
    return {
      // The picture's own size and style are dropped: the screen sets them in pixels.
      svg: tag.replace(/\s(?:style|width|height)="[^"]*"/g, '') + out.slice(tag.length),
      width: ex(/\swidth="(-?[\d.]+)ex"/, tag),
      height: ex(/\sheight="(-?[\d.]+)ex"/, tag),
      depth: -ex(/vertical-align:\s*(-?[\d.]+)ex/, tag),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
