import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planRun } from './perimeter';
import type { Encounter, EncounterKind } from './encounters';
import { stageRaid, type StagedRaid } from './raidCutscene';
import { LINES, LineDirector, RETREAT_RE, ctxAt, phasesOf, voiceCutscene } from './raidDialogue';
import type { Battle } from './battleTypes';

function base(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty: 'standard' });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
  g.stock.canned = 40; g.stock.fuel = 20; g.stock.meds = 3; g.stock.lumber = 20; g.stock.hardware = 20;
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  const r = planRun(g, 'container_wall', [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]], [{ at: 15, w: 2 }]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 6; }
  g.armory.ammo['556'] = 2000;
  return g;
}
const enc = (kind: EncounterKind, o: Partial<Encounter> = {}): Encounter => ({ id: 'e1', kind, day: 5, title: 'A crew', dossier: [], size: 6, armed: true, strength: 70, wants: { canned: 5, fuel: 2 }, stances: ['hide', 'parley', 'defend'], temper: 'desperate', ...o });

/** A staged night siege: a gang of ten, hard, arriving at 2:15 (several scenes). */
function siege(seed: number, o: Partial<Encounter> = {}): StagedRaid {
  const g = base(seed);
  g.clock.t = Math.floor(g.disaster.hitAt + 20) - 0.25 + 2.25 / 24;
  g.gate.pending = enc('gang', { size: 10, strength: 120, temper: 'hard', stances: ['defend'], day: seed, ...o });
  return stageRaid(g, 'defend');
}
const says = (st: StagedRaid) => st.battles.flatMap((b, scene) => b.events.flatMap(e => (e.kind === 'say' ? [{ scene, ...e }] : [])));

describe('line director', () => {
  it('is deterministic from the seed and never repeats a speaker back to back', () => {
    const run = (seed: number) => { const d = new LineDirector(seed); return Array.from({ length: 40 }, () => d.pick('raider', 'fight', { speaker: 'r1' })); };
    expect(run(3)).toEqual(run(3));
    const xs = run(5);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).not.toBe(xs[i - 1]);
  });
  it('uses every line of a pool before any repeats', () => {
    const d = new LineDirector(2);
    const pool = LINES.defender.fight!.any!;
    const got = Array.from({ length: pool.length }, (_, i) => d.pick('defender', 'fight', { speaker: `h${i % 3}` }));
    expect(new Set(got).size).toBe(pool.length);
  });
  it('speaks the crew\'s own voice and fills the {n} slot', () => {
    const d = new LineDirector(1);
    const mine = new Set(LINES.raider.approach!.families!);
    expect(mine.has(d.pick('raider', 'approach', { speaker: 'r0', variants: ['families'] })!)).toBe(true);
    expect(d.pick('defender', 'mate_down', { speaker: 'h1', vars: { n: 'Wren' } })).toContain('Wren');
  });
  it('has no retreat line in an approach pool and no pool line that trips the other phase', () => {
    for (const role of ['raider', 'defender'] as const) for (const [ctx, vs] of Object.entries(LINES[role])) for (const lines of Object.values(vs!)) for (const t of lines!) {
      if (ctx !== 'retreat' && ctx !== 'aftermath') expect(RETREAT_RE.test(t), `${role}.${ctx}: ${t}`).toBe(false);
      expect(t).not.toMatch(/[—–]/);
    }
  });
});

describe('a whole simulated cutscene', () => {
  it('no speaker says a line twice running, no line twice in a cutscene (while the pools last), and no retreat is called on the way in', () => {
    let scenesSeen = 0, linesSeen = 0, repeats = 0;
    for (let seed = 1; seed <= 12; seed++) for (const o of [{}, { temper: 'desperate' as const, size: 4, armed: false, kind: 'looters' as EncounterKind }, { kind: 'militia' as EncounterKind, size: 8 }]) {
      const st = siege(seed, o);
      scenesSeen += st.battles.length;
      const all = says(st);
      linesSeen += all.length;
      const lastBy = new Map<string, string>();
      const seen = new Map<string, number>();
      for (const s of all) {
        if (s.who) { expect(lastBy.get(s.who), `${s.who} repeats at scene ${s.scene} t=${s.t}`).not.toBe(s.text); lastBy.set(s.who, s.text); }
        seen.set(s.text, (seen.get(s.text) ?? 0) + 1);
      }
      for (const n of seen.values()) if (n > 1) repeats += n - 1;
      // approach: before the first shot of a scene, nobody calls a retreat
      st.battles.forEach((b, i) => {
        const ph = phasesOf(b, st.plan.scenes[i].kind);
        for (const e of b.events) if (e.kind === 'say' && ph.firstShot < Infinity && e.t < Math.min(ph.firstShot - 0.01, ph.firstFlee - 0.5)) {
          expect(RETREAT_RE.test(e.text), `scene ${i} t=${e.t} "${e.text}"`).toBe(false);
          expect(['approach', 'fire']).toContain(e.ctx);
        }
      });
    }
    expect(scenesSeen).toBeGreaterThan(20);
    expect(linesSeen).toBeGreaterThan(100);
    // (written lines that carry a name or a number may match; pool lines may not)
    expect(repeats / linesSeen).toBeLessThan(0.03);
  });
  it('fills the quiet places: a crew creeping up, the first shots, the break', () => {
    let approach = 0, retreat = 0, firstShots = 0;
    for (let seed = 1; seed <= 10; seed++) for (const b of siege(seed).battles) for (const e of b.events) if (e.kind === 'say') { if (e.ctx === 'approach') approach++; if (e.ctx === 'retreat') retreat++; if (e.ctx === 'first_shots') firstShots++; }
    expect(approach).toBeGreaterThan(10); expect(retreat).toBeGreaterThan(5); expect(firstShots).toBeGreaterThan(5);
  });
  it('scouts do not shout an assault, and the crew\'s voice shows up by style', () => {
    const rough = /Light 'em up|Hit the house|flank 'em/i;
    for (let seed = 1; seed <= 10; seed++) {
      const st = siege(seed);
      st.battles.forEach((b, i) => { if (st.plan.scenes[i].style === 'scouts') for (const e of b.events) if (e.kind === 'say' && e.who?.startsWith('r') && e.ctx === 'approach') expect(rough.test(e.text)).toBe(false); });
    }
  });
  it('ctxAt orders the phases of a scene', () => {
    const ph = { firstShot: 10, firstFlee: 50, breachAt: 40, endAt: 60, fire: false };
    expect([ctxAt(ph, 3), ctxAt(ph, 12), ctxAt(ph, 20), ctxAt(ph, 41), ctxAt(ph, 51), ctxAt(ph, 61)]).toEqual(['approach', 'first_shots', 'fight', 'breach', 'retreat', 'aftermath']);
  });
  it('voicing is idempotent in length of play and leaves a parley alone', () => {
    const g = base(2); g.gate.pending = enc('looters', { stances: ['parley', 'defend'] });
    const st = stageRaid(g, 'parley');
    const b: Battle = st.battles[0];
    expect(voiceCutscene([b], { seed: 1, temper: 'desperate', scenes: [{}] })[0].events.filter(e => e.kind === 'say').map(e => (e as { text: string }).text)).toEqual(b.events.filter(e => e.kind === 'say').map(e => (e as { text: string }).text));
  });
});
