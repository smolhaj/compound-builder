/**
 * The long game, part 2: eras (task #34). A run used to end at the report
 * card; now "Keep playing" closes the era (its grade goes in the chronicle
 * and the dynasty score) and, once the world has settled, the next era is
 * rolled from where this one left it (disaster.ts nextEraDisaster). Only a
 * wipe ends the line. Pure.
 */
import { DISASTERS, nextEraDisaster } from './disaster';
import { emptyStats, reportCard } from './report';
import { chronicle } from './lineage';
import { dayJob } from './family';
import { REGIONS } from './regions';
import { dayIndex, type GameState } from './state';

export const roman = (n: number) => {
  const R: Array<[number, string]> = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of R) while (n >= v) { out += s; n -= v; }
  return out;
};

const FATE_TEXT = { full: 'the world came back', partial: 'the world came back thinner', never: 'the world never came back' } as const;

/** Once a day: the era's hit goes in the chronicle; a played-on era is closed; a settled world rolls the next. */
export function erasDay(s: GameState): string[] {
  const L = s.lineage, d = s.disaster, out: string[] = [];
  const t = s.clock.t, day = dayIndex(t);
  // the hit, named (in Surprise you only learn what this era is when it comes)
  if (d.kind && t >= d.hitAt && L.hitEra !== L.era) {
    L.hitEra = L.era;
    const def = DISASTERS[d.kind];
    const v = def?.variants.find(x => x.id === d.variant)?.name;
    chronicle(s, 'era', `Era ${roman(L.era)}: ${def?.name ?? d.kind}${v ? ` (${v.toLowerCase()})` : ''}.`);
  }
  const e = s.ending;
  if (!e || !e.continued || e.kind === 'wipe') return out;
  if (!L.settling) {
    const card = reportCard(s);
    L.eras.push({ n: L.era, kind: d.kind ?? '', name: DISASTERS[d.kind!]?.name ?? 'The collapse', fate: d.fate, hitDay: Math.floor(d.hitAt), endDay: day, ending: e.kind, grade: card.grade, score: card.score });
    L.points += card.score;
    L.settling = true;
    chronicle(s, 'era', `Era ${roman(L.era)} closed (${card.grade}): ${FATE_TEXT[d.fate]}.`);
  }
  // wait for the world to settle where it's going to: back, at its new level, or a year of nothing
  const since = t - d.hitAt;
  const settled = s.stats.okSince >= 0 || (d.fate === 'never' && since >= 365) || since >= 3 * 365;
  if (!settled) return out;
  L.era++;
  L.settling = false;
  s.disaster = nextEraDisaster(d, t, s.seed, L.era, REGIONS[s.site.region].odds);
  s.ending = null;
  s.stats = emptyStats();
  s.wild.done = [];
  // the town works again: whoever lost a job when it hit finds work; the grown kids too
  const b = s.disaster.baseline;
  if ((b?.stores ?? 1) >= 0.5 && (b?.banks ?? 1) >= 0.5) s.people.forEach((p, i) => {
    const ps = s.personState[i];
    if (!ps || ps.needs.died != null || p.kid || p.elder) return;
    if (ps.laidOff || (!p.job && p.kin)) {
      p.job ??= dayJob(p, s.seed + L.era);
      ps.employed = true; ps.laidOff = false;
      out.push(`${p.first} found work again as a ${p.job.title.toLowerCase()}.`);
    }
  });
  const line = s.disaster.kind ? `Era ${roman(L.era)} begins: quiet, for now.` : `Era ${roman(L.era)} begins.`;
  chronicle(s, 'era', line);
  out.push(line);
  return out;
}
