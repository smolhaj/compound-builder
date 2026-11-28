// node scripts/soakReport.mjs /tmp/soak.jsonl [more.jsonl ...]  -> Markdown: coverage, failures grouped by code (with the smallest repro), balance
import { readFileSync } from 'node:fs';
const rows = process.argv.slice(2).flatMap(f => readFileSync(f, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)));
const out = [];
const kinds = [...new Set(rows.map(r => r.spec.kind))];
const years = rows.reduce((a, r) => a + r.endDay / 365, 0);
out.push('# Soak report', '', `${rows.length} runs, ${kinds.length} scenarios, ${years.toFixed(0)} simulated game years, ${rows.reduce((a, r) => a + r.checks, 0).toLocaleString('en-US')} per-day invariant checks, ${rows.reduce((a, r) => a + r.roundTrips, 0)} save round trips, ${rows.filter(r => r.deterministic !== null).length} determinism pairs (${rows.filter(r => r.deterministic === false).length} differ), ${(rows.reduce((a, r) => a + r.ms, 0) / 3.6e6).toFixed(1)} CPU hours.`, '');
const byCode = new Map();
for (const r of rows) for (const f of r.failures) { const g = byCode.get(f.code) ?? []; g.push({ r, f }); byCode.set(f.code, g); }
out.push('## Failures by code', '', '| code | runs | scenarios | smallest repro (kind:seedIndex:years, first day) | detail |', '|---|---|---|---|---|');
for (const [code, g] of [...byCode].sort((a, b) => b[1].length - a[1].length)) {
  const best = g.sort((a, b) => a.f.day - b.f.day)[0];
  out.push(`| ${code} | ${g.length} | ${new Set(g.map(x => x.r.spec.kind)).size} | ${best.r.spec.kind}:${best.r.spec.j}:${best.r.spec.years} day ${best.f.day} | ${best.f.detail.replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 160)} |`);
}
if (!byCode.size) out.push('| none | | | | |');
out.push('', '## Endings by scenario', '', '| scenario | runs | still going | wiped | other | mean alive share | median min food days | peak money (median) |', '|---|---|---|---|---|---|---|---|');
const med = a => { a = a.slice().sort((x, y) => x - y); return a.length ? a[Math.floor(a.length / 2)] : 0; };
for (const k of kinds) {
  const g = rows.filter(r => r.spec.kind === k), going = g.filter(r => /still going/.test(r.ending)).length, wipe = g.filter(r => /wipe/.test(r.ending)).length;
  out.push(`| ${k} | ${g.length} | ${going} | ${wipe} | ${g.length - going - wipe} | ${(g.reduce((a, r) => a + (r.total ? r.alive / r.total : 0), 0) / g.length).toFixed(2)} | ${med(g.map(r => r.foodMin).filter(x => x >= 0))} | ${med(g.map(r => r.peakMoney)).toLocaleString('en-US')} |`);
}
out.push('', '## By bot style x difficulty (share wiped)', '', '| style | cozy | standard | hardcore |', '|---|---|---|---|');
for (const st of [...new Set(rows.map(r => r.spec.strat))]) out.push(`| ${st} | ${['cozy', 'standard', 'hardcore'].map(d => { const g = rows.filter(r => r.spec.strat === st && r.spec.diff === d); return g.length ? `${Math.round(100 * g.filter(r => /wipe/.test(r.ending)).length / g.length)}% of ${g.length}` : '-'; }).join(' | ')} |`);
out.push('', '## Runaway money (peak over $5M) and slowest runs', '');
for (const r of rows.filter(r => r.peakMoney > 5e6).sort((a, b) => b.peakMoney - a.peakMoney).slice(0, 10)) out.push(`- ${r.spec.kind}:${r.spec.j} ${r.spec.strat}/${r.spec.diff}: peak $${r.peakMoney.toLocaleString('en-US')}`);
for (const r of rows.slice().sort((a, b) => b.ms - a.ms).slice(0, 5)) out.push(`- slow: ${r.spec.kind}:${r.spec.j} ${(r.ms / 1000).toFixed(0)} s for ${r.endDay} days`);
console.log(out.join('\n'));
