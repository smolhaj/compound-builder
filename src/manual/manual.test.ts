import { describe, expect, it } from 'vitest';
import { GENERATORS, buildManual, markerClose, markerOpen, searchManual, usedGenerators } from './build';
import { GLOSSARY, PROSE } from './prose';
import { MATERIALS } from '../sim/materials';
import { SHELVES } from '../sim/shelves';
import { BLURB } from '../sim/disasterBlurbs';
import { DISASTERS } from '../sim/disaster';
import { REGIONS } from '../sim/regions';
import { catalogEntries } from '../sim/buildCatalog';
import { STANCE } from '../ui/stanceText';
import { MODES } from '../sim/startModes';
import { CHIP_ORDER } from '../sim/topBarPlan';
import { CHIP_MEANING } from './gen/hud';
import { OTHER_KEYS } from './keys';
import { parseMd } from './md';

/** The generated file and the sources the key table points at, as text (Vite raw imports: no Node types needed in the app project). */
const DOCS = import.meta.glob<string>('/docs/MANUAL.md', { query: '?raw', import: 'default', eager: true });
const SOURCES = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default' });
const readDoc = (): string | null => DOCS['/docs/MANUAL.md'] ?? null;

const FIX = 'run `npm run manual` to regenerate docs/MANUAL.md';
const manual = buildManual();

describe('docs/MANUAL.md', () => {
  it(`is up to date (${FIX})`, () => {
    const onDisk = readDoc();
    if (onDisk === null) throw new Error(`docs/MANUAL.md is missing: ${FIX}`);
    if (onDisk !== manual.markdown) {
      const a: string[] = onDisk.split('\n'), b: string[] = manual.markdown.split('\n');
      const i = a.findIndex((l, k) => l !== b[k]);
      throw new Error(`docs/MANUAL.md is stale (first difference at line ${i + 1}: file has "${(a[i] ?? '').slice(0, 80)}", the game says "${(b[i] ?? '').slice(0, 80)}"). ${FIX}.`);
    }
  });
  it(`has every generated section, marked (${FIX})`, () => {
    const onDisk = readDoc() ?? '';
    for (const name of new Set(usedGenerators())) {
      expect(onDisk, `generated section "${name}" is missing from docs/MANUAL.md: ${FIX}`).toContain(markerOpen(name));
      expect(onDisk, `generated section "${name}" has no closing marker: ${FIX}`).toContain(markerClose(name));
    }
  });
  it('registers every generator it uses, and uses every generator it registers', () => {
    const used = new Set(usedGenerators());
    for (const n of used) expect(Object.keys(GENERATORS), n).toContain(n);
    for (const n of Object.keys(GENERATORS)) expect(used.has(n), `generator "${n}" is not used by any section`).toBe(true);
  });
  it('has no empty generated block, no "undefined" or NaN, and no metric unit in the text', () => {
    for (const s of manual.sections) {
      expect(s.md.length, s.id).toBeGreaterThan(200);
      expect(s.md, s.id).not.toMatch(/undefined|NaN|\[object/);
    }
    for (const [n, g] of Object.entries(GENERATORS)) expect(g().trim().length, n).toBeGreaterThan(20);
    const metric = /(?:\d|\))\s?(?:km|kg|mm|cm|ml|m²|m³|kcal|°C)(?![A-Za-z0-9_²³])|\b(?:meters|metres|liters?|litres?|kilometers?|kilograms?|Celsius|kcal)\b/;
    expect(manual.markdown.match(metric)?.[0] ?? null).toBeNull();
  });
  it('prose sections have unique ids and each is reachable from the contents', () => {
    expect(new Set(PROSE.map(s => s.id)).size).toBe(PROSE.length);
    for (const s of PROSE) expect(manual.markdown).toContain(`## ${s.title}`);
  });
});

describe('every player-facing thing has a description', () => {
  it('every good for sale has a name and a unit that says what one is', () => {
    const shelved = new Set(Object.values(SHELVES).flat());
    for (const m of Object.values(MATERIALS)) {
      if (m.price == null) continue;
      expect(m.name.trim().length, m.id).toBeGreaterThan(1);
      expect(m.unit.trim().length, `${m.id} has no unit text`).toBeGreaterThan(2);
    }
    // anything for sale appears in the manual, on a shelf or in the other-goods table
    for (const m of Object.values(MATERIALS)) if (m.price != null && shelved.has(m.id)) expect(manual.markdown, m.id).toContain(`| ${m.name} |`);
  });
  it('every disaster has a blurb and a definition; every mode has a line', () => {
    for (const [k, b] of Object.entries(BLURB)) { expect(b.length, k).toBeGreaterThan(30); expect(DISASTERS[k as keyof typeof DISASTERS], `${k} has no definition`).toBeTruthy(); }
    for (const [, n, b] of MODES) { expect(n.length).toBeGreaterThan(1); expect(b.length, n).toBeGreaterThan(20); }
  });
  it('every region, build piece, gate choice and top-bar chip is described', () => {
    for (const r of Object.values(REGIONS)) expect(r.blurb.length, r.id).toBeGreaterThan(20);
    for (const e of catalogEntries()) expect(e.blurb.trim().length, `${e.key} has no description`).toBeGreaterThan(10);
    for (const [k, [n, t]] of Object.entries(STANCE)) { expect(n.length, k).toBeGreaterThan(1); expect(t.length, k).toBeGreaterThan(10); }
    for (const c of CHIP_ORDER) expect(CHIP_MEANING[c].length, c).toBeGreaterThan(20);
  });
  it('the glossary has unique terms in alphabetical order', () => {
    const terms = GLOSSARY.map(g => g[0]);
    expect(new Set(terms).size).toBe(terms.length);
    expect([...terms].sort((a, b) => a.localeCompare(b))).toEqual(terms);
    for (const [, m] of GLOSSARY) expect(m.length).toBeGreaterThan(15);
  });
});

describe('keys', () => {
  it('every non-drawer key is still handled where the manual says', async () => {
    for (const k of OTHER_KEYS) {
      const load = SOURCES[`/${k.file}`];
      expect(load, `${k.file} does not exist`).toBeTruthy();
      expect(await load(), `${k.keys} (${k.file})`).toContain(k.token);
    }
  });
});

describe('markdown and search', () => {
  it('parses tables, lists, headings and paragraphs, dropping the markers', () => {
    const b = parseMd('<!-- gen:x -->\n### Head\n\nA para\nover two lines.\n\n- one\n- two\n\n| A | B |\n| --- | --- |\n| 1 | 2 \\| 3 |\n<!-- /gen:x -->');
    expect(b).toEqual([{ t: 'h3', text: 'Head' }, { t: 'p', text: 'A para over two lines.' }, { t: 'ul', items: ['one', 'two'] }, { t: 'table', head: ['A', 'B'], rows: [['1', '2 | 3']] }]);
  });
  it('finds a good, a disaster and a key by a plain word', () => {
    expect(searchManual(manual.sections, 'tornado').length).toBeGreaterThan(0);
    expect(searchManual(manual.sections, 'hand-dug well').some(h => h.section === 'build' || h.section === 'pillars')).toBe(true);
    expect(searchManual(manual.sections, 'Field Guide').length).toBeGreaterThan(0);
    expect(searchManual(manual.sections, 'zzzzqqq')).toEqual([]);
    expect(searchManual(manual.sections, '')).toEqual([]);
  });
});
