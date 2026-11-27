import { describe, expect, it } from 'vitest';
import { place, opts } from '../raidTestKit';
import { planBattle } from '../battle';
import { LineDirector, resetRaidMemory, CURSE } from '../raidDialogue';
import { HEAVY_ESCALATION, HEAVY_BEAT } from '../raidLinesDome';
import { domeBeats } from './domeBeats';
import { domesOf } from './standing';
import { addScars } from './scars';
import { planHeavyFire, chooseWeapons, heavyCount, heavyOptions, HEAVY_ORDER, HEAVY_SPOT, MIN_LINE_GAP } from './heavyFire';
import { raiderLabel } from '../raidSpeaker';
import type { BattleEvent } from '../battleTypes';

const input = (o: Partial<Parameters<typeof planHeavyFire>[0]> = {}) => ({ seed: 11, crew: 8, desperate: false, from: 8, to: 33, duration: 40, ...o });

describe('planHeavyFire (pure scheduling)', () => {
  it('is deterministic and seeded', () => {
    expect(planHeavyFire(input())).toEqual(planHeavyFire(input()));
    expect(JSON.stringify(planHeavyFire(input({ seed: 12 })))).not.toEqual(JSON.stringify(planHeavyFire(input())));
  });
  it('schedules weapons in escalating order inside the window, the truck bomb last when it is brought', () => {
    for (let seed = 1; seed < 30; seed++) for (const crew of [3, 6, 12]) {
      const p = planHeavyFire(input({ seed, crew }))!;
      expect(p.steps.length).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < p.steps.length; i++) {
        expect(p.steps[i].t).toBeGreaterThanOrEqual(8); expect(p.steps[i].t).toBeLessThanOrEqual(33);
        if (i) { expect(p.steps[i].t - p.steps[i - 1].t).toBeGreaterThanOrEqual(3.3); expect(HEAVY_ORDER.indexOf(p.steps[i].weapon)).toBeGreaterThan(HEAVY_ORDER.indexOf(p.steps[i - 1].weapon)); }
      }
      expect(new Set(p.steps.map(s => s.weapon)).size).toBe(p.steps.length);
      if (p.steps.some(s => s.weapon === 'vbied')) expect(p.steps.at(-1)!.weapon).toBe('vbied');
    }
  });
  it('a bigger crew brings more, a desperate one fewer, a short window fewer still', () => {
    expect(heavyCount(3, false, 30)).toBeLessThan(heavyCount(12, false, 30));
    expect(heavyCount(8, true, 30)).toBeLessThan(heavyCount(8, false, 30));
    expect(heavyCount(12, false, 4)).toBe(2);
    expect(planHeavyFire(input({ from: 10, to: 12 }))).toBeNull();
    expect(chooseWeapons(3, 5).length).toBe(3);
  });
  it('the crew disbelief grows in the pools order, no line is talked over, every line is inside the fight', () => {
    for (let seed = 1; seed < 30; seed++) {
      const p = planHeavyFire(input({ seed }))!;
      const esc = p.lines.filter(l => (HEAVY_ESCALATION as readonly string[]).includes(l.ctx));
      expect(esc.map(l => l.ctx)).toEqual([...HEAVY_ESCALATION]);
      for (let i = 1; i < p.lines.length; i++) expect(p.lines[i].t - p.lines[i - 1].t).toBeGreaterThanOrEqual(MIN_LINE_GAP - 0.011);
      for (const l of p.lines) expect(l.t).toBeLessThanOrEqual(39.2);
      // each weapon's own pool follows its strike
      for (const [i, s] of p.steps.entries()) { const l = p.lines.find(x => x.ctx === HEAVY_BEAT[s.weapon] && x.of === i); expect(l, s.weapon).toBeTruthy(); expect(l!.t).toBeGreaterThanOrEqual(s.t + 1.5); }
    }
  });
  it('a young speaker asks, only a grown man or the leader curses', () => {
    const p = planHeavyFire(input())!;
    expect(p.lines.find(l => l.ctx === 'dome_young_asks')!.who).toBe('young');
    expect(p.lines.find(l => l.ctx === 'dome_curse')!.who).toBe('worker');
    expect(p.lines.find(l => l.ctx === 'dome_quiet')!.who).toBe('leader');
  });
  it('QA can force the weapons', () => {
    heavyOptions.force = ['tank', 'rpg', 'thermite', 'vbied'];
    try { expect(planHeavyFire(input())!.steps.map(s => s.weapon)).toEqual(['tank', 'rpg', 'thermite', 'vbied']); } finally { heavyOptions.force = undefined; }
  });
});

describe('heavy fire in the staged raid on a sealed dome (domeBeats)', () => {
  const fight = (seed: number, tier: 'arcology' | 'glass' = 'arcology') => {
    const g = place(3, 'hardcore', 'armed'); g.structures.push({ id: 'dm', kind: tier === 'arcology' ? 'dome_arcology' : 'dome_glass', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 }); g.perimeter = [];
    const b = planBattle(g, 8, seed, { ...opts({ kind: 'gang', temper: 'hard', n: 8 }), means: { truck: true, satchels: 2 } });
    return { g, b, dome: domesOf(g)[0] };
  };
  it('the arcology raid has heavy events outside the shell, the dome takes no scar, nobody on the home side is hit or armed', () => {
    let any = 0;
    for (let seed = 300; seed < 310; seed++) {
      resetRaidMemory();
      const { g, b, dome } = fight(seed);
      const out = domeBeats(b, { dome, seed, temper: 'hard', dir: new LineDirector(seed) });
      const hv = out.events.filter((e): e is Extract<BattleEvent, { kind: 'heavy' }> => e.kind === 'heavy');
      any += hv.length;
      const raiders = new Set(out.units.filter(u => u.side === 'raider').map(u => u.id));
      for (const e of hv) {
        expect(raiders.has(e.unit)).toBe(true);
        expect(Math.hypot(e.x - dome.x, e.z - dome.z)).toBeGreaterThanOrEqual(dome.r - 0.01);          // on the shell face
        expect(Math.hypot(e.fx - dome.x, e.fz - dome.z)).toBeGreaterThan(dome.r + HEAVY_SPOT[e.weapon].dist - 0.05);   // the shooter stands outside
      }
      expect(out.events.some(e => (e.kind === 'wound' || e.kind === 'death' || e.kind === 'shot') && !raiders.has((e as { unit?: string; from?: string }).unit ?? (e as { from?: string }).from ?? ''))).toBe(false);
      // the shell is marked by nothing heavy: the scars are the same with or without the heavy events
      const g2 = structuredClone(g);
      expect(addScars(g, dome, out)).toBe(addScars(g2, dome, { ...out, events: out.events.filter(e => e.kind !== 'heavy') }));
      expect(JSON.stringify(g.shellScars ?? null)).toBe(JSON.stringify(g2.shellScars ?? null));
      expect(out.sealed).toBe(true);
    }
    expect(any).toBeGreaterThanOrEqual(30);
  });
  it('the captions escalate in order and the household stays calm; nobody young or in the household swears', () => {
    for (let seed = 300; seed < 310; seed++) {
      resetRaidMemory();
      const { b, dome } = fight(seed);
      const out = domeBeats(b, { dome, seed, temper: 'hard', dir: new LineDirector(seed) });
      const say = out.events.filter((e): e is Extract<BattleEvent, { kind: 'say' }> => e.kind === 'say');
      const esc = say.filter(e => (HEAVY_ESCALATION as readonly string[]).includes(e.ctx ?? ''));
      const idx = esc.map(e => HEAVY_ESCALATION.indexOf(e.ctx as never));
      for (let i = 1; i < idx.length; i++) expect(idx[i]).toBeGreaterThanOrEqual(idx[i - 1]);
      expect(esc.length).toBeGreaterThanOrEqual(4);
      for (const e of say) if (e.ctx === 'dome_react_heavy') expect(e.text, e.text).not.toMatch(CURSE);
    }
  });
  it('a glass dome gets no heavy weapons (only the sealed shell is shown shrugging them off)', () => {
    const { b, dome } = fight(301, 'glass');
    expect(domeBeats(b, { dome, seed: 301, temper: 'hard', dir: new LineDirector(301) }).events.some(e => e.kind === 'heavy')).toBe(false);
  });
});

describe('raiderLabel', () => {
  it('names the leader and numbers the rest so two voices are never one', () => {
    const units = [{ id: 'r0', side: 'raider', leader: true }, { id: 'r1', side: 'raider' }, { id: 'r2', side: 'raider' }, { id: 'r3', side: 'raider' }, { id: 'h0', side: 'home' }] as never;
    expect(raiderLabel({ units }, 'r0')).toBe('Their leader');
    expect(raiderLabel({ units }, 'r1')).toBe('Raider 1');
    expect(raiderLabel({ units }, 'r3')).toBe('Raider 3');
    expect(raiderLabel({ units }, 'zz')).toBe('Raider');
  });
});
