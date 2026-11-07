/**
 * Regression guard for player-facing text (QA run 5 and the text sweep): in every string literal that reads like prose,
 * no doubled word ("the the"), no "a" before a vowel sound or "an" before a consonant sound, no literal "1 doors"-style
 * plural, no British spelling. Counts built at run time go through `pluralize` (sim/words.ts); this guards the tables.
 * A real exception goes on an allowlist below with the reason.
 */
import { describe, expect, it } from 'vitest';

const FILES = import.meta.glob<string>('/src/**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });

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
const LIT = /'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

/** Words that start with a vowel letter but a consonant sound ("a unit"), and the reverse ("an hour"). */
const A_BEFORE_VOWEL_OK = /^(?:u[nsrtkl]|use|eu|ew|one|once|ouija|UV)/i;
const AN_BEFORE_CONS_OK = /^(?:hour\w*|honest\w*|honou?r\w*|heir\w*|SUV|SOS|MRI|FBI|LED|HVAC|IFAK|X-?\w*|M\d\w*|FM|AM|RV|NRA|EMP|ATV|ID|8\d*|11\d*|18\d*|80\d*)$/i;

export interface TextHit { rule: string; file: string; line: number; text: string }

export function textHits(file: string, src: string): TextHit[] {
  const hits: TextHit[] = [];
  src.split('\n').forEach((ln, i) => {
    if (/^\s*(\/\/|\*|\/\*|import )/.test(ln)) return;
    for (const lit of ln.match(LIT) ?? []) {
      const m = mask(lit.slice(1, -1));
      if (!/[A-Za-z]{3,} [A-Za-z]{2,}/.test(m)) continue;          // not prose
      if (/\d(?:fr|px|em)\b|\b(?:fr|px|rgba?|translate|flex|calc|viewBox)\b|[{};]\s*\w+:/.test(m)) continue;   // CSS and SVG
      const add = (rule: string) => hits.push({ rule, file, line: i + 1, text: m.slice(0, 110) });
      const dbl = /\b([A-Za-z]{2,})\s+\1\b/.exec(m);
      if (dbl && !/\bno no\b|\bhad had\b|\bthat that\b|\bbye bye\b/i.test(m)) add(`doubled word "${dbl[1]}"`);
      for (const x of m.matchAll(/\b(a|an) ([A-Za-z][\w-]*|\d+)/gi)) {
        const art = x[1].toLowerCase(), nxt = x[2];
        const vowel = /^[aeiou]/i.test(nxt), digitEight = /^(?:8|11|18|8\d)\b/.test(nxt);
        if (art === 'a' && /^\d/.test(nxt) ? digitEight : art === 'a' && vowel && !A_BEFORE_VOWEL_OK.test(nxt)) add(`"a ${nxt}"`);
        else if (art === 'an' && /^\d/.test(nxt) ? !digitEight : art === 'an' && !vowel && !AN_BEFORE_CONS_OK.test(nxt) && nxt !== '§') add(`"an ${nxt}"`);
      }
      const one = /(?:^|[\s(])1 (?!of\b)(?!(?:in|out|to|per|day|hr|h)\b)([a-z]{3,}s)\b/.exec(m);
      if (one && !/\b(?:diabetes|series|news|species|sets?|lbs?|yards?|ounces?|pounds?)\b/i.test(one[1]) && !/^1 (?:bus|gas|glass|grass|class|dress|cross|loss|mass|boss|moss)$/.test(one[0].trim())) add(`"${one[0].trim()}"`);
      const brit = /\b(colour\w*|metre\w*|litre\w*|neighbour\w*|grey\w*|tyre\w*|programme\w*|favour\w*|honour\w*|harbour\w*|defence\w*|licence\w*|organis\w*|realis\w*|centre\w*|practise\w*|judgement|whilst|storey\w*|armour\w*|labour\w*|behaviour\w*|plough\w*|kerb|petrol|lorry|fibre|theatre|cosy|cheque|mould\w*|sceptic\w*|amongst|pavement|rubbish|tonne\w*|cancell\w+|fortnight|towards|levell\w+|analys\w+|catalogue\w*|labell\w+|aluminium|ageing|learnt|dreamt|spelt)\b/i.exec(m);
      if (brit) add(`British "${brit[1]}"`);
    }
  });
  return hits;
}

describe('player-facing text', () => {
  it('catches what it should', () => {
    expect(textHits('x', 'const a = "Put the the lid on";').length).toBe(1);
    expect(textHits('x', 'const a = "Take a umbrella with you";').length).toBe(1);
    expect(textHits('x', 'const a = "Wait an day or two now";').length).toBe(1);
    expect(textHits('x', 'const a = "Order 1 doors, windows and hardware";').length).toBe(1);
    expect(textHits('x', 'const a = "A unit of an hour in a ewe barn, an 11 ft wall";').length).toBe(0);
  });
  it('has no doubled word, a/an slip, "1 plurals" or British spelling in any string', () => {
    const all: TextHit[] = [];
    for (const [path, src] of Object.entries(FILES)) {
      if (/\.test\.tsx?$/.test(path) || /\/(fuzz|dev)\//.test(path)) continue;
      all.push(...textHits(path.replace('/src/', ''), src));
    }
    if (all.length) console.log("TEXTHITS\n" + all.map(h => `${h.file}:${h.line} ${h.rule}: ${h.text}`).join("\n"));
    expect(all.map(h => `${h.file}:${h.line} ${h.rule}`)).toEqual([]);
  });
});
