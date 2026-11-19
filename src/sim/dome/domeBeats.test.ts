import { describe, expect, it } from 'vitest';
import type { DomeTier } from './tiers';
import { place, opts } from '../raidTestKit';
import { planBattle } from '../battle';
import { LineDirector, resetRaidMemory, LINES } from '../raidDialogue';
import { DOME_LINES, DOME_RAIDER_CTX, DOME_DEFENDER_CTX, DOME_VARIANT_KEYS } from '../raidLinesDome';
import { domeBeats, BEAT_CTX_USED } from './domeBeats';
import { domesOf, PANELS } from './standing';
import { addScars, visibleScars, SCAR_LIFE } from './scars';
import { chooseHow } from '../breachMeans';
import { SHELL_ODDS, AIRLOCK_DOOR, cutSeconds } from './siege';
import type { BattleEvent } from '../battleTypes';
import { dayIndex } from '../state';

const KIND: Record<DomeTier, string> = { earthen: 'dome_earthen', geodesic: 'dome_geodesic', glass: 'dome_glass', arcology: 'dome_arcology' };
const fight = (tier: DomeTier, seed: number, n = 8, means = { truck: true, satchels: 2 }) => {
  const g = place(3, 'hardcore', 'armed'); g.structures.push({ id: 'dm', kind: KIND[tier], x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 }); g.perimeter = [];
  const b = planBattle(g, n, seed, { ...opts({ kind: 'gang', temper: 'hard', n }), means });
  const dome = domesOf(g)[0];
  return { g, b, dome };
};
const say = (b: { events: BattleEvent[] }) => b.events.filter((e): e is Extract<BattleEvent, { kind: 'say' }> => e.kind === 'say');

describe('raids on a dome are staged (presentation only)', () => {
  it('every tier gets probes on the shell, voiced, in order, without changing the outcome', () => {
    for (const tier of ['geodesic', 'glass', 'arcology'] as const) {
      let probes = 0, kinds = new Set<string>();
      for (let seed = 300; seed < 306; seed++) {
        resetRaidMemory();
        const { b, dome } = fight(tier, seed);
        const out = domeBeats(b, { dome, seed, temper: 'hard', dir: new LineDirector(seed) });
        expect(out.result).toBe(b.result);
        for (let i = 1; i < out.events.length; i++) expect(out.events[i].t).toBeGreaterThanOrEqual(out.events[i - 1].t);
        for (const e of out.events) if (e.kind === 'probe') {
          probes++; kinds.add(e.what);
          expect(Math.hypot(e.x - dome.x, e.z - dome.z)).toBeCloseTo(dome.r, 1);   // on the shell, never past it
          expect(Math.hypot(e.ox, e.oz)).toBeCloseTo(1, 1);
          expect(e.tier).toBe(tier);
        }
        // nobody is sent into the dome: every added move stays outside the shell
        const before = new Set(b.events);
        for (const e of out.events) if (e.kind === 'move' && !before.has(e)) expect(Math.hypot(e.x - dome.x, e.z - dome.z)).toBeGreaterThan(dome.r - 0.001);
        // an arcology shows nothing the shell does not hold against
        if (tier === 'arcology') for (const e of out.events) if (e.kind === 'probe') expect(e.holds).toBe(true);
        const t = say(out).filter(s => s.ctx?.startsWith('dome_')).map(s => s.text);
        expect(new Set(t).size).toBe(t.length);
      }
      expect(probes, tier).toBeGreaterThan(10);
      expect(kinds.has('rifle') && kinds.has('pry'), tier).toBe(true);
    }
  });
  it('is deterministic, and a plain fight with no dome is not touched', () => {
    resetRaidMemory(); const a = fight('glass', 301); const j1 = JSON.stringify(domeBeats(a.b, { dome: a.dome, seed: 301, temper: 'hard', dir: new LineDirector(301) }));
    resetRaidMemory(); const c = fight('glass', 301); expect(JSON.stringify(domeBeats(c.b, { dome: c.dome, seed: 301, temper: 'hard', dir: new LineDirector(301) }))).toBe(j1);
  });
  it('the crew speaks in the moods of the scene: reports, shock, the airlock, an argument, an order, a vow, and the family answers', () => {
    const seen = new Set<string>();
    for (let seed = 300; seed < 330; seed++) for (const tier of ['glass', 'arcology'] as const) {
      resetRaidMemory(); const { b, dome } = fight(tier, seed, 6 + (seed % 9));
      for (const s of say(domeBeats(b, { dome, seed, temper: (['desperate', 'hard', 'savage'] as const)[seed % 3], dir: new LineDirector(seed), skirtCrew: seed % 4 === 0 }))) if (s.ctx) seen.add(s.ctx);
    }
    for (const c of ['dome_scout', 'dome_shots', 'dome_tool', 'dome_airlock', 'dome_argue', 'dome_order', 'dome_panic', 'dome_vow', 'dome_watch', 'dome_holds', 'dome_gone', 'dome_skirt']) expect([...seen], c).toContain(c);
  });
});

describe('dome voice tables', () => {
  const all = (role: 'raider' | 'defender') => Object.entries(DOME_LINES[role]).flatMap(([c, v]) => Object.entries(v ?? {}).flatMap(([k, ls]) => (ls ?? []).map(t => ({ c, k, t }))));
  it('every key is used by the planner and every context is a real pool', () => {
    expect([...DOME_RAIDER_CTX, ...DOME_DEFENDER_CTX].sort()).toEqual([...BEAT_CTX_USED].sort());
    for (const c of DOME_RAIDER_CTX) expect(Object.keys(DOME_LINES.raider[c] ?? {}).length, c).toBeGreaterThan(0);
    for (const c of DOME_DEFENDER_CTX) expect(DOME_LINES.defender[c]?.any?.length ?? 0, c).toBeGreaterThanOrEqual(4);
    for (const r of ['raider', 'defender'] as const) for (const { k } of all(r)) expect(DOME_VARIANT_KEYS).toContain(k);
    for (const c of ['dome_shots', 'dome_airlock', 'dome_argue', 'dome_vow']) expect(Object.keys(DOME_LINES.raider[c as 'dome_shots'] ?? {}).length, c).toBeGreaterThanOrEqual(5);   // crews differ by temper and size
    expect(LINES.raider.dome_shots?.any?.length).toBeGreaterThan(5);
  });
  it('plain American English: no jargon, nothing stronger than damn, no repeats inside a pool', () => {
    for (const r of ['raider', 'defender'] as const) {
      const seen = new Set<string>();
      for (const { c, t } of all(r)) {
        expect(t, t).not.toMatch(/\bsortie|\bfuck|\bshit|\bass\b|\bbitch|\bbastard|\bgoddamn|\bhell\b/i);
        expect(t.length).toBeLessThan(110);
        const key = `${c}|${t}`; expect(seen.has(key), key).toBe(false); seen.add(key);
      }
    }
  });
});

describe('what a raid leaves on the shell, and the audit claims', () => {
  it('scorch, chips and dents are recorded, wear off, and never outlive their life', () => {
    resetRaidMemory(); const { g, b, dome } = fight('arcology', 302);
    const staged = domeBeats(b, { dome, seed: 302, temper: 'hard', dir: new LineDirector(302) });
    const n = addScars(g, dome, staged);
    expect(n).toBeGreaterThan(3); expect(visibleScars(g, dome).length).toBe(n);
    g.clock.t += SCAR_LIFE.scorch.arcology + 1;
    expect(visibleScars(g, dome).filter(s => s.kind === 'scorch').length).toBe(0);
    expect(dayIndex(g.clock.t)).toBeGreaterThan(0);
  });
  it('the arcology is nearly, not literally, shut: a wall charge is 2 percent, the airlock door ram 3 percent, a saw never; one attempt a fight', () => {
    expect(SHELL_ODDS.arcology.ram).toBe(0); expect(SHELL_ODDS.arcology.blast).toBeGreaterThan(0); expect(SHELL_ODDS.arcology.blast).toBeLessThan(0.04);
    expect(chooseHow({ truck: true, satchels: 3 }, SHELL_ODDS.arcology.ram, SHELL_ODDS.arcology.blast)).toBe('charge');
    expect(chooseHow({ truck: false, satchels: 0 }, 0, 0.02)).toBe('climb');
    expect(cutSeconds('arcology', 40)).toBe(Infinity);
    expect(AIRLOCK_DOOR.arcology.blast).toBeGreaterThan(0.04);   // the door is the soft spot, but a charge is aimed at the wall (owner decision: docs/design/dome_raids.md)
  });
  it('glass and geodesic can be cut by a big crew with hand tools alone', () => {
    expect(cutSeconds('glass', 16)).toBeLessThan(120); expect(cutSeconds('geodesic', 4)).toBeLessThan(60); expect(PANELS.glass).toBeGreaterThan(0);
  });
});
