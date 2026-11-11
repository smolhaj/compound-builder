import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planRun } from './perimeter';
import type { Encounter } from './encounters';
import { stageRaid, type StagedRaid } from './raidCutscene';
import { findVictim, kinRank, leftBehindRaiders, unitAt } from './raidDrama';
import { playbackLengths } from './siege';
import type { Battle } from './battleTypes';
import type { Person } from './family';

function base(seed: number, difficulty: 'cozy' | 'standard' = 'standard'): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  const r = planRun(g, 'container_wall', [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]], [{ at: 15, w: 2 }]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 6; }
  g.armory.ammo['556'] = 2000;
  g.gate.pending = { id: 'e1', kind: 'gang', day: seed, title: 'x', dossier: [], size: 10, armed: true, strength: 110, wants: {}, stances: ['defend'], temper: 'hard' } as Encounter;
  return g;
}
const find = (pred: (st: StagedRaid) => boolean, difficulty: 'cozy' | 'standard' = 'standard'): { st: StagedRaid; g: GameState } | null => {
  for (let seed = 1; seed <= 80; seed++) { const g = base(seed, difficulty); const st = stageRaid(g, 'defend'); if (pred(st)) return { st, g }; }
  return null;
};
const kinds = (b: Battle) => b.events.map(e => e.kind);

describe('the death and the wake', () => {
  it('stages the fall and the wake for the person the sim really killed', () => {
    // (a victim shot dead: one who bled out has no killing shot to aim at, and a wake is staged for him too)
    const shotDead = (st: StagedRaid) => { const b = st.battles[st.drama!.scene], de = b.events.find(e => e.kind === 'death' && e.unit === st.drama!.victim.unit); return !!de && b.events.some(e => e.kind === 'shot' && e.to === st.drama!.victim.unit && e.hit && e.t <= de.t + 0.01 && e.t >= de.t - 0.4); };
    const f = find(st => !!st.drama && shotDead(st));
    expect(f).not.toBeNull();
    const { st } = f!, d = st.drama!;
    expect(st.report.killed).toContain(d.victim.name);
    const b = st.battles[d.scene];
    // the fall: a held beat on the victim, after the camera finds the shot
    const fall = b.events.find(e => e.kind === 'beat' && e.role === 'fall');
    expect(fall && fall.kind === 'beat' && fall.unit).toBe(d.victim.unit);
    expect(b.events.some(e => e.kind === 'beat' && e.role === 'aim')).toBe(true);
    // the wake: gathered round the fallen, the end of the scene after all of it
    expect(b.events.some(e => e.kind === 'beat' && e.role === 'vigil' && e.unit === d.victim.unit)).toBe(true);
    expect(b.events.some(e => e.kind === 'lift' && e.unit === d.victim.unit)).toBe(true);
    const end = b.events.filter(e => e.kind === 'end');
    expect(end).toHaveLength(1);
    expect(b.events.every(e => e.t <= end[0].t + 1e-9)).toBe(true);
    expect(b.duration).toBeGreaterThanOrEqual(end[0].t);
    // sorted, so the renderer's cursor never skips an event
    for (let i = 1; i < b.events.length; i++) expect(b.events[i].t).toBeGreaterThanOrEqual(b.events[i - 1].t);
    // the tail plays long enough to see it, in playback time; the game clock is untouched
    expect(playbackLengths(st.plan.scenes[d.scene]).tail).toBeGreaterThanOrEqual(d.wake + 3);
    expect(d.wake).toBeLessThanOrEqual(95);   // about 25 s of vigil, then the burial, the cleanup and the shaken (sim/aftermathScenes.ts)
    // the burial is DRAWN: a pit opened by people with shovels, the fallen carried to it, laid in it, a mound heaped over them
    type Ev = { t: number; kind: string; unit?: string; stage?: string; what?: string };
    const ev = (k: string, f: (e: Ev) => boolean = () => true): Ev[] => (b.events as unknown as Ev[]).filter(e => e.kind === k && f(e));
    const dig = ev('grave', e => e.stage === 'dig')[0], low = ev('grave', e => e.stage === 'lower')[0], fillE = ev('grave', e => e.stage === 'fill')[0];
    if (dig) {
      expect(low && fillE).toBeTruthy();
      expect(dig.t).toBeLessThan(ev('lift', e => e.unit === d.victim.unit)[0].t);                 // dug before the body is carried
      expect(low.t).toBeGreaterThan(ev('lower', e => e.unit === d.victim.unit)[0].t - 0.01);       // laid in after it is set down
      expect(fillE.unit).toBe(d.victim.unit);
      expect(ev('tool', e => e.what === 'shovel').length).toBeGreaterThanOrEqual(2);
      for (const t of ev('tool', e => e.what === 'shovel')) expect(b.units.find(u => u.id === t.unit)?.civilian).toBeFalsy();
    }
    // every caption of the aftermath is for something drawn at that moment
    const caps = b.events.filter(e => e.kind === 'say' && e.ctx === 'aftermath') as Array<{ t: number; text: string }>;
    const near = (k: string, t: number, f: (e: Ev) => boolean = () => true) => (b.events as unknown as Ev[]).some(e => e.kind === k && f(e) && Math.abs(e.t - t) < 1.6);
    for (const c of caps) {
      if (/dig the grave/.test(c.text)) expect(near('grave', c.t, e => e.stage === 'dig'), c.text).toBe(true);
      if (/to the grave/.test(c.text)) expect(near('lift', c.t, e => e.unit === d.victim.unit), c.text).toBe(true);
      if (/in the ground/.test(c.text)) expect(near('grave', c.t, e => e.stage === 'lower'), c.text).toBe(true);
      if (/fill it in/.test(c.text)) expect(near('grave', c.t, e => e.stage === 'fill'), c.text).toBe(true);
      if (/rakes sand/.test(c.text)) expect(near('clean', c.t) && near('tool', c.t, e => e.what === 'rake'), c.text).toBe(true);
      if (/nails planks/.test(c.text)) expect(near('repair', c.t) && near('tool', c.t, e => e.what === 'hammer'), c.text).toBe(true);
      if (/frozen|can't move|stopped where|stares at nothing/.test(c.text)) expect(near('panic', c.t), c.text).toBe(true);
      expect(c.text).not.toMatch(/wheelbarrow|chickens|bedsheet|empty chair|scrub/i);                // (captions that have nothing behind them were cut)
    }
    // grief is named for who died, with no pronouns assumed and no gore in the words
    const words = b.events.filter(e => e.kind === 'say').map(e => (e as { text: string }).text).join(' ');
    expect(words).toContain(d.victim.name);
    expect(words).not.toMatch(/\b(he|she|his|her)\b.*\b(blood|brains|guts)\b/i);
  });
  it('where there are hands free, the grave is dug, the fallen carried to it and laid in it (drawn, not captioned)', () => {
    const a = find(st => !!st.drama && st.battles.some(bb => bb.events.some(e => e.kind === 'grave')));
    expect(a, 'some household in range buries its dead').toBeTruthy();
    const b = a!.st.battles[a!.st.drama!.scene], v = a!.st.drama!.victim.unit;
    const kinds = b.events.filter(e => e.kind === 'grave').map(e => (e as { stage: string }).stage);
    expect(kinds).toEqual(['dig', 'lower', 'fill']);
    const dig = b.events.find(e => e.kind === 'grave')!, lift = b.events.find(e => e.kind === 'lift' && e.unit === v)!;
    expect(dig.t).toBeLessThan(lift.t);
    expect(b.events.filter(e => e.kind === 'tool' && e.what === 'shovel').length).toBeGreaterThanOrEqual(4);   // two diggers, twice
  });
  it('the shaken freeze in the wake, in plain sight, and the caption is backed by the freeze', () => {
    let seen = false;
    for (let seed = 1; seed <= 30 && !seen; seed++) {
      const g = base(seed);
      for (const id of Object.keys(g.mind?.psyche ?? {})) g.mind!.psyche[id].trauma = 60;
      const st = stageRaid(g, 'defend');
      if (!st.drama) continue;
      const b = st.battles[st.drama.scene];
      const freezes = b.events.flatMap(e => (e.kind === 'panic' && e.how === 'freeze' && e.t >= st.drama!.victim.t + 10 ? [e] : []));
      const caps = b.events.flatMap(e => (e.kind === 'say' && e.ctx === 'aftermath' && /frozen|can't move|stopped where|stares at nothing/.test(e.text) ? [e] : []));
      if (!caps.length) continue;
      seen = true;
      expect(freezes.length).toBeGreaterThanOrEqual(caps.length);
      for (const c of caps) expect(freezes.some(f => Math.abs(f.t - c.t) < 1.6), c.text).toBe(true);
      // a close shot on them (a vigil beat on the shaken one, the others round)
      expect(b.events.some(e => e.kind === 'beat' && e.role === 'aim' && !e.rate && freezes.some(f => f.unit === e.unit))).toBe(true);
    }
    expect(seen, 'some household in range is shaken').toBe(true);
  });
  it('is deterministic', () => {
    const a = find(st => !!st.drama)!, g = base(a.g.seed), st2 = stageRaid(g, 'defend');
    expect(JSON.stringify(st2.battles)).toBe(JSON.stringify(a.st.battles));
  });
  it('a raid with no death has no wake; Cozy never kills, so never mourns', () => {
    const none = find(st => !st.drama && st.report.killed.length === 0)!;
    expect(none.st.plan.scenes.every(sc => !sc.wake || sc.ending === 'breached' || sc.ending === 'overrun')).toBe(true);
    expect(none.st.battles.every(b => !kinds(b).includes('lift') && !b.events.some(e => e.kind === 'beat'))).toBe(true);
    for (let seed = 1; seed <= 25; seed++) expect(stageRaid(base(seed, 'cozy'), 'defend').drama).toBeNull();
  });
  it('walks up to a raider only if the sim left one alive on the drive', () => {
    let withRaider = 0, without = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const g = base(seed), st = stageRaid(g, 'defend');
      if (!st.drama) continue;
      const b = st.battles[st.drama.scene];
      const approach = b.events.some(e => e.kind === 'beat' && e.role === 'prisoner');
      if (st.drama.raider) {
        withRaider++;
        expect(st.report.raidersWounded).toBeGreaterThan(0);
        expect(approach).toBe(true);
        expect(b.events.some(e => e.kind === 'lay' && e.unit === st.drama!.raider)).toBe(true);
        expect(leftBehindRaiders(b)).toContain(st.drama.raider);
        expect(b.events.some(e => e.kind === 'say' && e.ctx === 'prisoner_reply')).toBe(true);
      } else {
        without++;
        expect(approach).toBe(false);
        expect(b.events.filter(e => e.kind === 'lay').every(e => b.surrendered?.raiders.includes((e as { unit: string }).unit))).toBe(true);   // (only a hurt man in custody lies down)
      }
    }
    expect(withRaider).toBeGreaterThan(0);
    expect(without).toBeGreaterThan(0);
  });
  it('tends the injured: a helper kneels by a wounded person with first aid', () => {
    const f = find(st => !!st.drama && st.drama.injured.length > 0)!;
    const b = f.st.battles[f.st.drama!.scene];
    const aid = b.events.filter(e => e.kind === 'aid' && e.t > b.events.find(x => x.kind === 'beat' && x.role === 'vigil')!.t);
    expect(aid.length).toBeGreaterThan(0);
    expect(b.events.some(e => e.kind === 'beat' && e.role === 'tend')).toBe(true);
    expect(b.events.some(e => e.kind === 'say' && e.ctx === 'tend')).toBe(true);
  });
  it('findVictim ignores someone who was taken or lived', () => {
    const g = base(2), after = structuredClone(g);
    const b: Battle = { night: true, duration: 5, units: [{ id: `h_${g.people[0].id}`, side: 'home', personId: g.people[0].id, x: 0, z: 0 }], events: [{ t: 2, kind: 'death', unit: `h_${g.people[0].id}` }] };
    expect(findVictim(g, after, [b])).toBeNull();
    after.personState[0].needs.died = 3; after.personState[0].needs.taken = true;
    expect(findVictim(g, after, [b])).toBeNull();
    after.personState[0].needs.taken = false;
    expect(findVictim(g, after, [b])?.name).toBe(g.people[0].first);
  });
  it('who the dead person was to the mourner', () => {
    const p = (o: Partial<Person>): Person => ({ id: 'x', first: 'X', last: 'Y', age: 30, kid: false, body: 'f', skills: {} as never, shirt: 0, ...o });
    const victim = p({ id: 'v', partner: 'a', parents: ['m'] });
    expect(kinRank(victim, p({ id: 'a', partner: 'v' })).as).toBe('partner');
    expect(kinRank(victim, p({ id: 'k', kid: true, parents: ['v'] })).as).toBe('kid');
    expect(kinRank(victim, p({ id: 'm' })).as).toBe('family');
    expect(kinRank(p({ id: 'v', kid: true, parents: ['m'] }), p({ id: 'm' })).as).toBe('ofChild');
    expect(kinRank(victim, p({ id: 'z' })).rank).toBe(9);
  });
  it('unitAt reads the last move before the time', () => {
    const b: Battle = { night: false, duration: 9, units: [{ id: 'u', side: 'home', x: 1, z: 2 }], events: [{ t: 3, kind: 'move', unit: 'u', x: 5, z: 6 }, { t: 7, kind: 'cover', unit: 'u', x: 8, z: 9 }] };
    expect(unitAt(b, 'u', 1)).toEqual({ x: 1, z: 2 });
    expect(unitAt(b, 'u', 4)).toEqual({ x: 5, z: 6 });
    expect(unitAt(b, 'u', 8)).toEqual({ x: 8, z: 9 });
  });
});
