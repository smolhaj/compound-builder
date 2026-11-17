// node scripts/dsweepReport.mjs /tmp/dsweep.jsonl : survival per kind per difficulty, errors and NaNs, outliers.
import { readFileSync } from 'node:fs';
const rows = readFileSync(process.argv[2], 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const D = ['cozy', 'standard', 'hardcore'], kinds = [...new Set(rows.map(r => r.kind))];
const surv = g => g.length ? Math.round(100 * g.filter(r => !r.error && r.alive > 0).length / g.length) : null;
console.log('| kind | n/cell | ' + D.join(' | ') + ' | errors | NaN |', '\n|---|---|' + D.map(() => '---').join('|') + '|---|---|');
const all = {};
for (const k of kinds) {
  const cells = D.map(d => rows.filter(r => r.kind === k && r.diff === d));
  all[k] = cells.map(surv);
  console.log(`| ${k} | ${cells[0].length} | ${cells.map(c => surv(c) == null ? '-' : surv(c) + '%').join(' | ')} | ${rows.filter(r => r.kind === k && r.error).length} | ${rows.filter(r => r.kind === k && r.nan).length} |`);
}
const base = all.grid_down?.[1];
console.log('\nOutliers: Cozy under 100%:', kinds.filter(k => all[k][0] != null && all[k][0] < 100).join(', ') || 'none');
console.log('Standard more than 40 points under grid_down (' + base + '%):', kinds.filter(k => base != null && all[k][1] != null && all[k][1] < base - 40).join(', ') || 'none');
for (const r of rows.filter(r => r.error)) console.log('ERROR', r.kind, r.diff, r.seed, r.error);
