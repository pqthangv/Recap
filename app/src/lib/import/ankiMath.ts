// Anki's older ways of marking math, turned into the ones Recap draws: [$]…[/$] → $…$,
// [$$]…[/$$] → $$…$$, [latex]…[/latex] → $$…$$. (MathJax's \(…\) and \[…\], Anki's default
// since 2.1, need nothing: Recap reads them as they are.)

const DISPLAY = /\[\$\$\]([\s\S]*?)\[\/\$\$\]/g;
const INLINE = /\[\$\]([\s\S]*?)\[\/\$\]/g;
const LATEX = /\[latex\]([\s\S]*?)\[\/latex\]/gi;

export function fromAnkiMath(text: string): string {
  if (!text.includes('[')) return text;
  return (
    text
      .replace(DISPLAY, (_, tex: string) => `$$${tex.trim()}$$`)
      .replace(INLINE, (_, tex: string) => `$${tex.trim()}$`)
      // [latex] holds LaTeX text, not math: when it marks its own math ($…$) or uses an
      // environment, only the tags go.
      .replace(LATEX, (_, tex: string) =>
        tex.includes('$') || tex.includes('\\begin{') ? tex.trim() : `$$${tex.trim()}$$`,
      )
  );
}
