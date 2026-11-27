import { describe, expect, it } from 'vitest';
import { DOME_LINES, DOME_HEAVY_CTX, HEAVY_BEAT, HEAVY_ESCALATION, DOME_VARIANT_KEYS, type DomeCtx, type HeavyCtx } from '../raidLinesDome';
import { CURSE, LineDirector, contract } from '../raidDialogue';

const raiderPool = (c: HeavyCtx) => DOME_LINES.raider[c as DomeCtx] ?? {};
const lines = (pool: Partial<Record<string, readonly string[]>>) => Object.values(pool).flat() as string[];
const RAIDER_HEAVY = DOME_HEAVY_CTX.filter((c): c is HeavyCtx => c !== 'dome_react_heavy');

describe('heavy-fire dome lines (a crew whose heaviest weapons do nothing to the sealed shell)', () => {
  it('has a pool for every weapon and every step of the escalation, and uses only known variant keys', () => {
    for (const c of Object.values(HEAVY_BEAT)) expect(lines(raiderPool(c)).length, c).toBeGreaterThanOrEqual(5);
    for (const c of HEAVY_ESCALATION) expect(raiderPool(c).any?.length ?? 0, c).toBeGreaterThanOrEqual(2);
    expect(DOME_LINES.defender.dome_react_heavy?.any?.length ?? 0).toBeGreaterThanOrEqual(4);
    for (const c of DOME_HEAVY_CTX) for (const side of ['raider', 'defender'] as const) for (const k of Object.keys((DOME_LINES[side] as Record<string, object>)[c] ?? {})) expect(DOME_VARIANT_KEYS, `${c}/${k}`).toContain(k);
  });
  it('follows the style guide: short, plain, no dashes, no masked or stronger-than-listed swearing, nothing campy', () => {
    for (const side of ['raider', 'defender'] as const) for (const c of DOME_HEAVY_CTX) for (const t of lines((DOME_LINES[side] as Record<string, Partial<Record<string, readonly string[]>>>)[c] ?? {})) {
      expect(t, t).not.toMatch(/[–—]/);
      expect(t.split(/\s+/).length, t).toBeLessThanOrEqual(10);
      expect(t, t).not.toMatch(/\bf\*|\*\*|\bf off\b|nigg|fag|retard|cunt|chink|spic\b|you'll pay|nobody crosses/i);
    }
  });
  it('swearing: whole words, a minority of the crew pools, never from a young one or the household', () => {
    const all = RAIDER_HEAVY.flatMap(c => lines(raiderPool(c)));
    const cursing = all.filter(t => CURSE.test(t));
    expect(cursing.length).toBeGreaterThan(3);
    expect(cursing.length / all.length).toBeLessThan(0.2);
    for (const c of RAIDER_HEAVY) for (const k of ['young', 'kid', 'elder']) for (const t of raiderPool(c)[k] ?? []) expect(t, t).not.toMatch(CURSE);
    for (const t of lines(DOME_LINES.defender.dome_react_heavy ?? {})) expect(t, t).not.toMatch(CURSE);
    // the only ctx that is mostly swearing is the one built for it
    for (const c of RAIDER_HEAVY.filter(x => x !== 'dome_curse')) expect(lines(raiderPool(c)).filter(t => CURSE.test(t)).length / lines(raiderPool(c)).length, c).toBeLessThanOrEqual(0.2);
  });
  it('the director can pick a line for every heavy ctx and the engine contracts it', () => {
    for (const c of DOME_HEAVY_CTX) {
      const dir = new LineDirector(7);
      const role = c === 'dome_react_heavy' ? 'defender' : 'raider';
      const t = dir.pick(role, c as never, { speaker: 'x' });
      expect(t, c).toBeTruthy();
      expect(contract(t!).length).toBeGreaterThan(0);
    }
  });
});
