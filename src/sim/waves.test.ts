import { afterEach, describe, expect, it } from 'vitest';
import { newGame, dayIndex, type GameState, type Structure } from './state';
import { setGroundOverride } from './terrainState';
import { DIFFICULTY, type Difficulty } from './difficulty';
import { WAVE, crewFactor, intensity, kitLevel, nextWaveDay, phaseOf, waveDue, warningSign } from './waves';
import { gateDay, postureOf, strengthOf } from './encounters';
import { waveStatus } from './waveStatus';
import { planBattle } from './battle';
import { planRun, type Pt } from './perimeter';
import { BLUEPRINTS } from './blueprints';
import { migrate } from './save/migrations';

afterEach(() => setGroundOverride(null));
const LULL = (d: Difficulty) => DIFFICULTY[d].lull;

describe('the wave schedule', () => {
  it('is deterministic in the seed and differs between seeds', () => {
    for (let n = 1; n <= 12; n++) expect(waveDue(7, 100, n, 1)).toBe(waveDue(7, 100, n, 1));
    expect([1, 2, 3, 4, 5].map(sd => waveDue(sd, 100, 3, 1)).join()).not.toBe([1, 1, 1, 1, 1].map(sd => waveDue(sd, 100, 3, 1)).join());
  });
  it('is strictly increasing with real downtime between waves (never under LULL_MIN)', () => {
    for (const d of ['cozy', 'standard', 'hardcore'] as Difficulty[]) for (let seed = 1; seed <= 40; seed++) {
      let last = waveDue(seed, 0, 1, LULL(d));
      expect(last).toBeGreaterThan(0);
      for (let n = 2; n <= 25; n++) { const t = waveDue(seed, 0, n, LULL(d)); expect(t - last).toBeGreaterThanOrEqual(WAVE.LULL_MIN); last = t; }
    }
  });
  it('the lull shrinks as the waves climb on average, and Cozy waits longest, Hardcore least', () => {
    const gap = (d: Difficulty, n: number) => { let a = 0; for (let seed = 1; seed <= 60; seed++) a += waveDue(seed, 0, n + 1, LULL(d)) - waveDue(seed, 0, n, LULL(d)); return a / 60; };
    expect(gap('standard', 9)).toBeLessThan(gap('standard', 1));
    expect(gap('cozy', 3)).toBeGreaterThan(gap('standard', 3));
    expect(gap('standard', 3)).toBeGreaterThan(gap('hardcore', 3));
  });
  it('a held-up wave does not stack on the one before it', () => {
    expect(nextWaveDay(3, 100, { n: 0, last: 5000 }, 1)).toBeGreaterThanOrEqual(5000 + WAVE.LULL_MIN);
    expect(nextWaveDay(3, 100, { n: 0 }, 1)).toBe(waveDue(3, 100, 1, 1));
  });
  it('warning is the last WARN days before the wave, with a distinct sign each of the three days', () => {
    expect(phaseOf(10, 20)).toBe('quiet');
    expect(phaseOf(20 - WAVE.WARN, 20)).toBe('warning');
    expect(phaseOf(19, 20)).toBe('warning');
    expect(phaseOf(20, 20)).toBe('arriving');
    const signs = [3, 2, 1].map(d => warningSign(d, true));
    expect(signs.every(Boolean)).toBe(true);
    expect(new Set(signs).size).toBe(3);
    expect(warningSign(4, true)).toBeNull();
    expect(warningSign(2, false)).not.toBe(warningSign(2, true));
  });
});

describe('escalation', () => {
  it('crews and kit rise wave by wave, never fall, and stop at the peak', () => {
    for (const w of [0.35, 1, 1.4]) for (const ds of [0, 0.5, 1]) {
      let lastF = 0, lastK = -1;
      for (let n = 1; n <= 20; n++) { const f = crewFactor(n, ds, w), k = kitLevel(n, ds, w); expect(f).toBeGreaterThanOrEqual(lastF); expect(k).toBeGreaterThanOrEqual(lastK); lastF = f; lastK = k; }
      expect(crewFactor(WAVE.PEAK, ds, w)).toBe(crewFactor(WAVE.PEAK + 9, ds, w));
      expect(crewFactor(20, ds, w)).toBeLessThanOrEqual(WAVE.HEADS_CAP);
    }
    expect(intensity(1)).toBe(0); expect(intensity(WAVE.PEAK)).toBe(1);
  });
  it('the first wave is the crew as rolled when nothing is defended', () => {
    expect(crewFactor(1, 0, 1)).toBe(1);
    expect(kitLevel(1, 1, 1)).toBe(0);
  });
  it('difficulty orders the climb: Cozy < Standard < Hardcore, and Cozy stays gentle', () => {
    const f = (d: Difficulty) => crewFactor(WAVE.PEAK, 0.5, DIFFICULTY[d].wave);
    expect(f('cozy')).toBeLessThan(f('standard')); expect(f('standard')).toBeLessThan(f('hardcore'));
    expect(f('cozy')).toBeLessThan(1.4);
    expect(kitLevel(WAVE.PEAK, 1, DIFFICULTY.cozy.wave)).toBeLessThan(0.3);
  });
  it('the defense share of the crew is small beside what defense takes off the odds', () => {
    expect(crewFactor(5, 1, 1) / crewFactor(5, 0, 1)).toBeLessThanOrEqual(1 + WAVE.HEADS_DEF + 1e-9);
  });
});

function runGame(seed: number, difficulty: Difficulty = 'standard'): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty });
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.clock.t = Math.floor(g.disaster.hitAt) + 1.1;
  return g;
}
/** Play the gate day by day, dismissing every card; returns the encounters by day. */
function gateRun(g: GameState, days: number) {
  const out: Array<{ day: number; kind: string; size: number; wave?: number; adapt?: number }> = [], logs: string[] = [];
  for (let i = 0; i < days; i++) {
    g.clock.t = Math.floor(g.clock.t) + 1.1;
    const before = g.log.length;
    const e = gateDay(g);
    for (const l of g.log.slice(before)) logs.push(`${dayIndex(g.clock.t)} ${l.text}`);
    if (e) { out.push({ day: dayIndex(g.clock.t), kind: e.kind, size: e.size, wave: e.wave, adapt: e.adapt }); g.gate.pending = null; }
  }
  return { out, logs };
}

describe('the clock in the sim', () => {
  it('a new run has the clock; an old save (no gate.waves) has none and its status is hidden', () => {
    const g = runGame(5);
    expect(g.gate.waves).toEqual({ n: 0 });
    expect(waveStatus(g)).not.toBeNull();
    delete g.gate.waves;
    expect(waveStatus(g)).toBeNull();
  });
  it('save v81 -> v82 migration drops the clock so an old run plays as before', () => {
    const g = runGame(5);
    const raw = JSON.parse(JSON.stringify(g)) as Record<string, unknown> & { version: number };
    raw.version = 81;
    const up = migrate(raw);
    expect(up.version).toBeGreaterThanOrEqual(82);
    expect(up.gate.waves).toBeUndefined();
  });
  it('hostile crews come on the scheduled days, escalate, and nothing hostile comes between (one wave per entry in the schedule)', () => {
    const g = runGame(9);
    const hit = Math.floor(g.disaster.hitAt);
    const { out } = gateRun(g, 330);
    const waves = out.filter(x => x.wave);
    expect(waves.length).toBeGreaterThanOrEqual(4);
    waves.forEach((w, i) => { expect(w.wave).toBe(i + 1); expect(w.day).toBeGreaterThanOrEqual(waveDue(9, hit, i + 1, 1)); });
    const hostile = out.filter(x => !x.wave && ['looters', 'gang', 'militia', 'patrol', 'requisition', 'horde'].includes(x.kind));
    expect(hostile).toHaveLength(0);
    for (let i = 1; i < waves.length; i++) expect(waves[i].day - waves[i - 1].day).toBeGreaterThanOrEqual(WAVE.LULL_MIN);
  });
  it('warning signs are logged on the three days before a wave, and the road empties of travelers', () => {
    const g = runGame(9);
    const hit = Math.floor(g.disaster.hitAt), due = waveDue(9, hit, 1, 1);
    const { logs, out } = gateRun(g, due - hit + 2);
    const signDays = logs.filter(l => /smoke|chatter|restless|empty/.test(l)).map(l => Number(l.split(' ')[0]));
    for (const d of [due - 3, due - 2, due - 1]) expect(signDays).toContain(d);
    expect(out.filter(x => x.day >= due - WAVE.WARN && x.day < due && !x.wave)).toHaveLength(0);
  });
  it('is deterministic: the same seed gives the same waves', () => {
    const a = gateRun(runGame(4), 250).out, b = gateRun(runGame(4), 250).out;
    expect(a).toEqual(b);
  });
  it('Cozy waves are fewer and smaller than Standard, which are smaller than Hardcore', () => {
    const stat = (d: Difficulty) => { let n = 0, heads = 0; for (let seed = 1; seed <= 6; seed++) for (const x of gateRun(runGame(seed, d), 400).out.filter(y => y.wave)) { n++; heads += x.size; } return { n, avg: heads / Math.max(1, n) }; };
    const c = stat('cozy'), s = stat('standard'), h = stat('hardcore');
    expect(c.n).toBeLessThan(s.n); expect(s.n).toBeLessThan(h.n);
    expect(c.avg).toBeLessThan(s.avg);
  });
  it('the wave stops when the county has order again', () => {
    const g = runGame(9);
    g.disaster.tracks.law = 0.9;
    expect(gateRun(g, 200).out.filter(x => x.wave)).toHaveLength(0);
    expect(waveStatus(g)).toBeNull();
  });
  it('the status counts down, warns, and names the coming wave', () => {
    const g = runGame(9);
    const s0 = waveStatus(g)!;
    expect(s0.phase).toBe('quiet'); expect(s0.next).toBe(1); expect(s0.daysTo).toBeGreaterThan(3);
    expect(s0.explain).toMatch(/waves/i);
    g.clock.t += s0.daysTo - 2;
    expect(waveStatus(g)!.phase).toBe('warning');
  });
});

// ── monotone: more defense never makes a wave go worse ──────────────────
const N = 100;
const built = (g: GameState, id: string, kind: string, x: number, z: number): Structure => { const st: Structure = { id, kind, x, z, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 }; g.structures.push(st); return st; };
function lot(seed: number): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.site = { ...g.site, creek: false };
  built(g, 'h', 'timber_cabin', 30, 30);
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 5; }
  g.armory.ammo['556'] = 3000;
  g.clock.t = Math.floor(g.disaster.hitAt + 60) + 0.8;
  return g;
}
const finishAll = (g: GameState) => { for (const r of g.perimeter) { r.finishedAt = 0; r.done = r.hours; } for (const st of g.structures) st.stage = BLUEPRINTS[st.kind].stages.length; };
const LEVELS: Array<[string, (g: GameState) => void]> = [
  ['one tower', g => { built(g, 't0', 'watchtower_wood', 30, 38); finishAll(g); }],
  ['three towers', g => { [[27, 36], [33, 36], [30, 40]].forEach(([x, z], i) => built(g, `t${i}`, 'watchtower_wood', x, z)); finishAll(g); }],
  ['a stone wall and a tower', g => { const r = planRun(g, 'stone_wall', [[20, 20], [40, 20], [40, 40], [20, 40], [20, 20]] as Pt[]); r.finishedAt = 0; r.done = r.hours; r.supplied = true; built(g, 't0', 'watchtower_wood', 30, 38); finishAll(g); }],
];
/** The wave crew the chain really produces (crew factor from strengthOf, kit from the wave) fought against this lot: breach rate and defenders killed. */
function waveOutcome(g: GameState, n: number, base: number): { breach: number; deaths: number } {
  const ds = strengthOf(g, postureOf(g)), w = DIFFICULTY.standard.wave;
  const crew = Math.max(1, Math.round(base * crewFactor(n, ds, w))), adapt = kitLevel(n, ds, w);
  let breach = 0, deaths = 0;
  for (let seed = 1; seed <= N; seed++) {
    const b = planBattle(g, crew, seed, { armed: true, organized: true, ...(adapt ? { adapt } : {}) });
    if (b.result === 'breached' || b.result === 'overrun') breach++;
    deaths += b.events.filter(e => e.kind === 'death' && e.unit.startsWith('h_')).length;
  }
  return { breach: breach / N, deaths: deaths / N };
}

describe('defense is monotone against waves: more of it is never worse, crew growth included', () => {
  for (const n of [2, 6, 10]) for (const base of [6, 10]) for (const [name, add] of LEVELS) {
    it(`${name}, wave ${n}, crew of ${base} before the wave`, () => {
      const a = lot(3), b = lot(3);
      add(b);
      const oa = waveOutcome(a, n, base), ob = waveOutcome(b, n, base);
      const sd = Math.sqrt((oa.breach * (1 - oa.breach) + ob.breach * (1 - ob.breach)) / N);
      expect(ob.breach).toBeLessThanOrEqual(oa.breach + 2 * sd + 1e-9);
      expect(ob.deaths).toBeLessThanOrEqual(oa.deaths + 0.35);
    }, 120000);
  }
  it('strength itself never falls as defenses are added', () => {
    let last = strengthOf(lot(3));
    const g = lot(3);
    for (const [, add] of LEVELS) { add(g); const s = strengthOf(g); expect(s).toBeGreaterThanOrEqual(last); last = s; }
  });
});
