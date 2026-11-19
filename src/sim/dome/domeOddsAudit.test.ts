import { describe, it } from 'vitest';
import type { DomeTier } from './tiers';
import { rate } from './domeOddsKit';
describe.skipIf(!(globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.DOME_AUDIT)('odds audit', () => {
  it('table', () => {
    const rows: string[] = [];
    for (const tier of ['earthen', 'geodesic', 'glass', 'arcology'] as DomeTier[]) {
      const f = (n: number, m: { truck: boolean; satchels: number }, d: number) => `${n}m ${m.truck ? 'T' : '-'}${m.satchels}@${d}d ${(rate(tier, n, m, d) * 100).toFixed(0)}%`;
      rows.push(`${tier}: ` + [f(4, { truck: false, satchels: 0 }, 60), f(8, { truck: true, satchels: 1 }, 60), f(8, { truck: true, satchels: 2 }, 300), f(12, { truck: true, satchels: 2 }, 300), f(16, { truck: true, satchels: 2 }, 300)].join(' | '));
    }
    console.log(rows.join('\n'));
  }, 600000);
});
