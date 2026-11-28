/**
 * A tiny markdown subset for the player manual (pure): tables, bullet lists, `###` headings, paragraphs and inline **bold**, *italic*
 * and `code`. docs/MANUAL.md is written in it and the in-game Field Guide renders the same text, so there is one source.
 * HTML comments (the generated-section markers) are dropped.
 */
export type Block =
  | { t: 'h3'; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] };

const cells = (line: string): string[] => line.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
const isRule = (line: string): boolean => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test(line.trim());

export function parseMd(md: string): Block[] {
  const lines = md.replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) { out.push({ t: 'p', text: para.join(' ') }); para = []; } };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (!l.trim()) { flush(); continue; }
    if (l.startsWith('### ')) { flush(); out.push({ t: 'h3', text: l.slice(4).trim() }); continue; }
    if (l.trim().startsWith('|') && i + 1 < lines.length && isRule(lines[i + 1])) {
      flush();
      const head = cells(l), rows: string[][] = [];
      i += 2;
      for (; i < lines.length && lines[i].trim().startsWith('|'); i++) rows.push(cells(lines[i]));
      i--;
      out.push({ t: 'table', head, rows });
      continue;
    }
    if (/^\s*[-*] /.test(l)) {
      flush();
      const items: string[] = [];
      for (; i < lines.length && /^\s*[-*] /.test(lines[i]); i++) items.push(lines[i].replace(/^\s*[-*] /, '').trim());
      i--;
      out.push({ t: 'ul', items });
      continue;
    }
    para.push(l.trim());
  }
  flush();
  return out;
}

export type Span = { text: string; bold?: boolean; italic?: boolean; code?: boolean };
/** Inline markup to spans. */
export function inline(text: string): Span[] {
  const spans: Span[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`/g;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) spans.push({ text: text.slice(last, m.index) });
    if (m[1] !== undefined) spans.push({ text: m[1], bold: true });
    else if (m[2] !== undefined) spans.push({ text: m[2], italic: true });
    else spans.push({ text: m[3], code: true });
    last = m.index + m[0].length;
  }
  if (last < text.length) spans.push({ text: text.slice(last) });
  return spans;
}
export const plain = (text: string): string => inline(text).map(s => s.text).join('');

/** Markdown for a table (cells have `|` escaped and newlines folded). */
export function table(head: readonly string[], rows: ReadonlyArray<readonly string[]>): string {
  const c = (x: string) => x.replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ');
  return [`| ${head.map(c).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...rows.map(r => `| ${r.map(c).join(' | ')} |`)].join('\n');
}
export const bullets = (items: readonly string[]): string => items.map(i => `- ${i}`).join('\n');
