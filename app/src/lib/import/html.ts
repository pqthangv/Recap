// Turning the HTML inside imported cards (Anki fields) into Recap's plain text.

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  middot: '·',
  bull: '•',
  times: '×',
  divide: '÷',
  deg: '°',
  copy: '©',
  reg: '®',
  euro: '€',
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/** File names of pictures used in the HTML (`<img src="cat.jpg">`), in order. */
export function extractImages(html: string): string[] {
  const names: string[] = [];
  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
    const raw = decodeEntities(m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (!raw || /^(https?:|data:)/i.test(raw)) continue;
    let name = raw;
    try {
      name = decodeURIComponent(raw);
    } catch {
      // Keep the raw name if it isn't valid percent-encoding.
    }
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

/**
 * HTML → plain text: line breaks from <br>/<div>/<p>/<li>, tags removed, entities decoded,
 * Anki sound tags dropped, whitespace tidied (but line breaks kept).
 */
export function htmlToText(html: string): string {
  // Block tags become a marker, and a run of markers becomes one line break, so stacked
  // <div>s (how Anki stores lines) don't turn into blank lines.
  const BLOCK = '\u0001';
  return decodeEntities(
    html
      // Raw line breaks are just spaces in HTML; only tags make new lines.
      .replace(/\r?\n/g, ' ')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/\[sound:[^\]]*\]/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, `${BLOCK}• `)
      .replace(/<\/?(div|p|li|tr|h[1-6]|ul|ol|table|blockquote|hr)\b[^>]*>/gi, BLOCK)
      .replace(/<[^>]+>/g, '')
      .replace(/\u0001(?:[ \t]*\u0001)*/g, '\n'),
  )
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[ \t\f\v]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
