#!/usr/bin/env python3
"""Survival table from scripts/survival.test.ts output: python3 scripts/survivalTable.py a.jsonl [b.jsonl ...]
Per scenario x difficulty: n, share with anyone alive at 365 / 730 days after the hit (a wipe = nobody left), median wipe day, top death causes."""
import sys, json, collections
rows = [json.loads(l) for f in sys.argv[1:] for l in open(f) if l.strip()]
cell = collections.defaultdict(list)
for r in rows: cell[(r['kind'], r['diff'])].append(r)
def surv(rs, d):
    # a game that was not wiped by day d counts as alive at d (every game plays to the end of SURV_DAYS or a wipe)
    return sum(1 for r in rs if r['wipeDay'] is None or r['wipeDay'] > d) / len(rs) if rs else None
fmt = lambda x: '  - ' if x is None else '%3d%%' % round(100 * x)
print('| scenario | difficulty | n | alive d365 | alive d730 | median wipe day |'); print('|---|---|---|---|---|---|')
for k in sorted(cell):
    rs = cell[k]; w = sorted(r['wipeDay'] for r in rs if r['wipeDay'] is not None)
    print('| %s | %s | %d | %s | %s | %s |' % (k[0], k[1], len(rs), fmt(surv(rs, 365)), fmt(surv(rs, 730)), w[len(w)//2] if w else '-'))

print(); print('| all scenarios | n | alive d365 | alive d730 |'); print('|---|---|---|---|')
for d in ('cozy', 'standard', 'hardcore'):
    rs = [r for r in rows if r['diff'] == d]
    if rs: print('| %s | %d | %s | %s |' % (d, len(rs), fmt(surv(rs, 365)), fmt(surv(rs, 730))))
