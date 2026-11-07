// Turns the balance harness's JSON lines (scripts/balance.test.ts) into the markdown tables of docs/BALANCE_PASS.md.
//   node scripts/balanceReport.mjs before.0.jsonl before.1.jsonl > REPORT.md
import { readFileSync } from 'node:fs';

const rows = process.argv.slice(2).flatMap(f => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)));
const DIFFS = ['cozy', 'standard', 'hardcore'], STYLES = ['passive', 'careless', 'average', 'careful', 'walled'];
const status = r => r.ending.startsWith('wipe') ? 'wipe' : r.ending.includes('nobody home') ? 'fostered' : 'alive';
const pct = (a, n) => n ? Math.round(100 * a / n) + '%' : '-';
const q = (xs, p) => { const a = xs.filter(x => x != null && Number.isFinite(x)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : null; };
const med = xs => q(xs, 0.5), k = x => x == null ? '-' : Math.abs(x) >= 1000 ? Math.round(x / 1000) + 'k' : String(Math.round(x));
const mean = xs => xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : null;
const out = [];
const table = (head, body) => { out.push('| ' + head.join(' | ') + ' |', '|' + head.map(() => '---').join('|') + '|', ...body.map(r => '| ' + r.join(' | ') + ' |'), ''); };
const by = (f) => rows.filter(f);

out.push(`# Balance harness report (${rows.length} games, one year after the hit)`, '');
out.push('## 1. Outcomes by difficulty and bot style', '', 'wipe = every person dead; ext = wipe or only wards left (adults extinct); lost = share of the household dead at the end.', '');
const body = [];
for (const d of DIFFS) {
  for (const s of [...STYLES, 'all']) {
    const g = by(r => r.diff === d && (s === 'all' || r.style === s));
    if (!g.length) continue;
    const w = g.filter(r => status(r) === 'wipe').length, f = g.filter(r => status(r) === 'fostered').length;
    body.push([d, s, g.length, pct(w, g.length), pct(w + f, g.length), pct(mean(g.map(r => 1 - r.alive / Math.max(1, r.total))) * 1, 1)]);
  }
}
table(['difficulty', 'style', 'n', 'wipe', 'ext', 'lost'], body);

out.push('## 2. Days survived (after the hit) in runs that ended in a wipe', '');
table(['difficulty', 'wipes', 'p10', 'median', 'p90'], DIFFS.map(d => { const g = by(r => r.diff === d && status(r) === 'wipe'); return [d, g.length, q(g.map(r => r.endDay), 0.1) ?? '-', med(g.map(r => r.endDay)) ?? '-', q(g.map(r => r.endDay), 0.9) ?? '-']; }));

out.push('## 3. Raids: the first fight, and the waves by number', '');
table(['difficulty', 'style', 'first fight: n', 'held (repelled/fled)', 'breached/overrun', 'median day', 'people lost in it'], DIFFS.flatMap(d => [...STYLES].map(s => {
  const g = by(r => r.diff === d && r.style === s && r.firstRaid), f = g.map(r => r.firstRaid);
  return [d, s, g.length, pct(f.filter(x => ['repelled', 'fled'].includes(x.result)).length, g.length), pct(f.filter(x => ['breached', 'overrun'].includes(x.result)).length, g.length), med(f.map(x => x.day)) ?? '-', (mean(f.map(x => x.homeDead)) ?? 0).toFixed(2)];
})));
out.push('Waves (all styles; "defense" is encounters.defenseOf, "fought" = a battle happened; held = repelled or fled):', '');
const wb = [];
for (const d of DIFFS) for (const n of [1, 2, 3, 4, 5, 6, 8]) {
  const w = by(r => r.diff === d).flatMap(r => r.waves.filter(x => x.n === n));
  if (!w.length) continue;
  const fought = w.filter(x => ['repelled', 'fled', 'breached', 'overrun'].includes(x.result));
  wb.push([d, n, w.length, med(w.map(x => x.day)), (mean(w.map(x => x.size)) ?? 0).toFixed(1), (mean(w.map(x => x.def)) ?? 0).toFixed(0), pct(fought.length, w.length), pct(fought.filter(x => ['repelled', 'fled'].includes(x.result)).length, fought.length), (mean(fought.map(x => x.homeDead)) ?? 0).toFixed(2)]);
}
table(['difficulty', 'wave', 'n', 'median day', 'crew', 'defense', 'fought', 'held', 'home dead/fight'], wb);
out.push('Wave outcome by defense band (all difficulties; fought waves only):', '');
const bands = [[0, 30], [30, 50], [50, 70], [70, 101]];
table(['defense', 'fights', 'held', 'home dead/fight', 'crew'], bands.map(([lo, hi]) => { const w = rows.flatMap(r => r.waves).filter(x => x.def >= lo && x.def < hi && ['repelled', 'fled', 'breached', 'overrun'].includes(x.result)); return [`${lo}-${hi - 1}`, w.length, pct(w.filter(x => ['repelled', 'fled'].includes(x.result)).length, w.length), (mean(w.map(x => x.homeDead)) ?? 0).toFixed(2), (mean(w.map(x => x.size)) ?? 0).toFixed(1)]; }));

out.push('## 4. Cash (median dollars)', '', 'd = days from the start (before the hit), h = days after the hit.', '');
table(['difficulty', 'life', 'n', 'd0', 'd30', 'd90', 'd180', 'd365', 'h0', 'h90', 'h365', 'min'], DIFFS.flatMap(d => ['fulltime', 'independent', 'weekend'].map(l => { const g = by(r => r.diff === d && r.life === l); const c = key => k(med(g.map(r => r.cash[key]))); return [d, l, g.length, c('d0'), c('d30'), c('d90'), c('d180'), c('d365'), c('h0'), c('h90'), c('h365'), k(med(g.map(r => r.minMoney)))]; })));

out.push('## 5. Food, water, illness (after the hit)', '');
table(['difficulty', 'style', 'food days at hit', 'at +90', 'at +180', 'at +365', 'lowest (median)', 'runs with a dry day', 'ill at some point', 'ill person-days'], DIFFS.flatMap(d => STYLES.map(s => { const g = by(r => r.diff === d && r.style === s); const f = key => med(g.map(r => r.foodAt[key])) ?? '-'; return [d, s, f('d0'), f('d90'), f('d180'), f('d365'), med(g.map(r => r.foodMin)) ?? '-', pct(g.filter(r => r.waterShortDays > 0).length, g.length), pct(mean(g.map(r => r.sickPeopleShare)) ?? 0, 1), ((mean(g.map(r => r.sickDays)) ?? 0) * 100).toFixed(1) + '%']; })));

out.push('## 6. The first home: days from the start until it is finished', '', 'crew = a hired crew worked on it at some point. "quote" = the crew quote seen on the unfinished home. Raw/house-less starts only (homeDay > 0).', '');
table(['life', 'difficulty', 'crew?', 'n', 'median day', 'p90', 'quote (median)', 'cash at d0 (median)'], ['fulltime', 'independent', 'weekend'].flatMap(l => DIFFS.flatMap(d => [true, false].map(c => { const g = by(r => r.life === l && r.diff === d && r.homeCrew === c && r.homeDay > 0); return [l, d, c ? 'yes' : 'by hand', g.length, med(g.map(r => r.homeDay)) ?? '-', q(g.map(r => r.homeDay), 0.9) ?? '-', k(med(g.map(r => r.homeCrewQuote))), k(med(g.map(r => r.cash.d0)))]; })).filter(r => r[3] > 0)));

out.push('## 7. Stuck or bored', '', 'nothing to do = longest stretch of days with every structure finished, nothing on order and nothing at the gate. quiet = longest stretch with no log line.', '');
table(['style', 'n', 'nothing-to-do median', 'p90', 'quiet median', 'p90'], STYLES.map(s => { const g = by(r => r.style === s); return [s, g.length, med(g.map(r => r.nothingToDo)), q(g.map(r => r.nothingToDo), 0.9), med(g.map(r => r.quiet)), q(g.map(r => r.quiet), 0.9)]; }));
console.log(out.join('\n'));
