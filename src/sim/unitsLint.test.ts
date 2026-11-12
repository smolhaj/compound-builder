/**
 * Regression guard for the U.S.-units decision (docs/DECISIONS.md): no metric unit may reach the player in text.
 * Scans every non-test source file for string literals and JSX text that put a number (or a `${value}`) next to
 * m, km, kg, g, L, mm, cm, m², m³, kcal or °C, or that say meters, liters, kilograms and the like. Convert at the
 * formatting layer instead (src/sim/units.ts). Names of things that really are metric in U.S. use go on the allowlist.
 */
import { describe, expect, it } from 'vitest';

/** Every source file as text (test files excluded below). */
const FILES = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

const UNIT = '(?:km|kg|mm|cm|ml|mL|m²|m³|m2|m3|kcal|°C|ha|L|m|g)';
/** "30 m", "${x} km", "12cm": a number or a placeholder next to a metric unit. */
const NUM_UNIT = new RegExp(`(?:\\d|§|\\))\\s?${UNIT}(?![A-Za-z0-9_²³])`);
/** Metric / SI radiation units (sievert, gray, becquerel); the player reads rem, mrem and curies (sim/units.ts remText, curieText). */
const RAD_UNIT = new RegExp(`(?:\\d|§|\\))\\s?(?:[mµuk]?Sv|[mµu]?Gy|[kMG]?Bq)(?:/h)?(?![A-Za-z0-9_])`);
const RAD_WORDS = /\b(?:sieverts?|millisieverts?|microsieverts?|becquerels?)\b|\b(?:mSv|µSv|Sv)\/h\b/i;
const WORDS = /\b(?:meters|metres|liters?|litres?|kilometers?|kilograms?|centimeters?|millimeters?|hectares?|Celsius|tonnes?|kcal)\b|\b(?:a|one|per|\d+)\s+meter\b|km\/h|\bm\/s\b/i;

/** Things that are metric in U.S. usage, or code that only looks like a unit. Each entry says why. */
const ALLOW: Array<{ re: RegExp; why: string }> = [
  { re: /\b(ammo:)?(9mm|65cm)\b/, why: "cartridge names (9mm Luger, 6.5 Creedmoor)" },
  { re: /^[`'"]9mm, 50 rounds[`'"]$/, why: '9mm is the U.S. name of the cartridge' },
  { re: /40-meter net/, why: 'the 40-meter amateur radio band' },
  { re: /the meter\b|set the last pole and the meter|pull the meter|pulled the meter/, why: 'the electric meter' },
  { re: /^[`'"]\$\{line\} L\$\{X\(L\)\}/, why: 'SVG path data' },
  { re: /^[`'"]\$\{[a-zA-Z]+\} ?[LMlmHhVvZz]\$\{/, why: 'SVG path data' },
  { re: /^[`'"][MmLlHhVvCcSsQqTtAaZz][-\d. ,MmLlHhVvCcSsQqTtAaZz§]*[`'"]$/, why: 'SVG path data' },
  { re: /^[`'"][^`'"]*\bl-?\d+ -?\d+[^`'"]*[`'"]$/, why: 'SVG path data' },
];

/** The string literals of a line; a template literal is taken whole, its `${...}` placeholders (and any template inside them) included. */
function literals(line: string): string[] {
  const out: string[] = [];
  const tpl = (i: number): number => {   // i at an opening backtick; returns the index just past its closing one
    let j = i + 1;
    while (j < line.length && line[j] !== '`') {
      if (line[j] === '\\') { j += 2; continue; }
      if (line.startsWith('${', j)) {
        let d = 0; j++;
        for (; j < line.length; j++) {
          if (line[j] === '`') { j = tpl(j) - 1; continue; }
          if (line[j] === '{') d++; else if (line[j] === '}' && --d === 0) break;
        }
      }
      j++;
    }
    return j + 1;
  };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '/' && line[i + 1] === '/') break;   // a trailing comment
    if (c === '`') { const e = tpl(i); out.push(line.slice(i, e)); i = e - 1; }
    else if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < line.length && line[j] !== c) j += line[j] === '\\' ? 2 : 1;
      out.push(line.slice(i, j + 1)); i = j;
    }
  }
  return out;
}

/** Placeholders `${...}` (with nested braces) collapsed to §. */
function mask(lit: string): string {
  let out = '', i = 0;
  while (i < lit.length) {
    if (lit.startsWith('${', i)) {
      let d = 0, j = i + 1;
      for (; j < lit.length; j++) { if (lit[j] === '{') d++; else if (lit[j] === '}' && --d === 0) break; }
      out += '§'; i = j + 1;
    } else out += lit[i++];
  }
  return out;
}

/** String literals written inside the `${...}` placeholders of a template ("${ok ? ` water at ${d} m` : ''}"): mask() hides them, so scan them on their own. */
function nestedLiterals(lit: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < lit.length; i++) {
    if (!lit.startsWith('${', i)) continue;
    let d = 0, j = i + 1;
    for (; j < lit.length; j++) { if (lit[j] === '{') d++; else if (lit[j] === '}' && --d === 0) break; }
    const inner = lit.slice(i + 2, j);
    for (const l of literals(inner)) { out.push(l, ...nestedLiterals(l)); }
    i = j;
  }
  return out;
}

export function metricHits(src: string): Array<{ line: number; text: string }> {
  const hits: Array<{ line: number; text: string }> = [];
  src.split('\n').forEach((ln, i) => {
    if (/^\s*(\/\/|\*|\/\*)/.test(ln)) return;
    for (const lit of literals(ln).flatMap(l => [l, ...nestedLiterals(l)])) {
      const m = mask(lit);
      if ((NUM_UNIT.test(m) || WORDS.test(m) || RAD_UNIT.test(m) || RAD_WORDS.test(m)) && !ALLOW.some(a => a.re.test(lit) || a.re.test(m))) { hits.push({ line: i + 1, text: lit.slice(0, 120) }); break; }
    }
    // JSX text: `{value} m</b>`, `12 km<`
    const bare = ln.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g, '""');
    const jsx = /(?:\}|\d)\s?(?:km|kg|L|m|mm|cm|kcal|°C|m²|m³)\s*(?=<|$)/.exec(bare);
    if (jsx && /<\/?[a-zA-Z]/.test(bare) && !/\bd=|viewBox/.test(bare)) hits.push({ line: i + 1, text: bare.trim().slice(0, 120) });
  });
  return hits;
}

describe('no metric units in player-facing text', () => {
  it('the scanner catches what it should', () => {
    expect(metricHits("const a = `${x} m of wall`;").length).toBe(1);
    expect(metricHits("const a = 'a 2.4 m fence';").length).toBe(1);
    expect(metricHits("const a = '5 kg bag';").length).toBe(1);
    expect(metricHits("const a = `${n} kcal a day`;").length).toBe(1);
    expect(metricHits("const a = '12 liters';").length).toBe(1);
    expect(metricHits('<b>{len} m</b>').length).toBe(1);
    expect(metricHits("const a = '30 ft and 2 gal and 40 lb and 72°F';").length).toBe(0);
    expect(metricHits("const a = `x ${ok ? ` water at ${d} m` : ''}`;").length).toBe(1);   // (QA run 6: the nested template hid it)
    expect(metricHits("const a = `${x} mSv/h`;").length).toBe(1);
    expect(metricHits("const a = 'the worst dose was 2 sieverts';").length).toBe(1);
    expect(metricHits("const a = `${d.toFixed(2)} Sv`;").length).toBe(1);
    expect(metricHits("const a = '5 Bq of fallout';").length).toBe(1);
    expect(metricHits("const a = '12 rem, 300 mrem, 2 mCi, 1,000 R/h';").length).toBe(0);
    expect(metricHits("const a = 'ammo:9mm';").length).toBe(0);
    expect(metricHits("const a = 'M10 5 l-3 4 z';").length).toBe(0);
  });

  it('no source file leaves a metric unit in a string or in JSX text', () => {
    const bad: string[] = [];
    for (const [f, text] of Object.entries(FILES)) {
      if (/\.test\.tsx?$/.test(f)) continue;
      for (const h of metricHits(text)) bad.push(`${f}:${h.line}: ${h.text}`);
    }
    expect(bad, `Convert these through src/sim/units.ts (feet, miles, gallons, pounds, °F, Calories):\n${bad.join('\n')}`).toEqual([]);
  });
});
