import { describe, expect, it } from 'vitest';
import { Director, STANDOFF, auditPose, poseAt, shotProblems, type Actor, type Box, type Shot } from './director';
import { obstaclesOf } from './cameraObstacles';
import { newGame } from '../../sim/state';
import { mulberry32 } from '../../sim/rng';
import type { BattleEvent } from '../../sim/battleTypes';

const ground = () => 0;
const house = { x: 0, y: 0, z: 0 };
/** A cabin 3 x 2 units at the origin (roof 1.3), a tower at the north-east corner and a palisade square 9 out. */
const boxes = (): Box[] => {
  const out: Box[] = [
    { x0: -1.5, x1: 1.5, z0: -1, z1: 1, h: 1.3, kind: 'building' },
    { x0: 7.5, x1: 8.5, z0: 7.5, z1: 8.5, h: 1.25, kind: 'building' },
    { x0: -4, x1: -2.5, z0: -4, z1: -2.8, h: 1.1, kind: 'building' },
  ];
  for (let i = -9; i < 9; i += 0.8) {
    out.push({ x0: i, x1: i + 0.9, z0: 8.9, z1: 9.1, h: 0.5, kind: 'wall' }, { x0: i, x1: i + 0.9, z0: -9.1, z1: -8.9, h: 0.5, kind: 'wall' });
    out.push({ x0: 8.9, x1: 9.1, z0: i, z1: i + 0.9, h: 0.5, kind: 'wall' }, { x0: -9.1, x1: -8.9, z0: i, z1: i + 0.9, h: 0.5, kind: 'wall' });
  }
  return out;
};

const cast = (r: () => number): Actor[] => {
  const a: Actor[] = [];
  // defenders: at the cabin walls (even hard against them), on the tower, along the palisade, in the yard
  const posts: Array<[number, number, number, string]> = [[-1.7, 0.2, 0, 'open'], [0, 1.15, 0, 'open'], [1.6, -0.9, 0, 'open'], [8, 0.9, 8, 'tower'], [3, 0, 8.6, 'wall'], [-5, 0, 8.6, 'wall'], [2, 0, 3, 'open'], [-3.4, 0, -3.4, 'open']];
  posts.forEach(([x, y, z, post], i) => a.push({ id: `h${i}`, side: 'home', post, x: x + (r() - 0.5) * 0.4, y, z: z + (r() - 0.5) * 0.4, dead: false, gone: false }));
  for (let i = 0; i < 6; i++) a.push({ id: i ? `r${i}` : 'r0', side: 'raider', x: -6 + r() * 12, y: 0, z: 13 + r() * 8, dead: false, gone: false });
  // a few raiders at the wall, one by the cabin's back
  a.push({ id: 'rw', side: 'raider', x: 2, y: 0, z: 9.8, dead: false, gone: false }, { id: 'rb', side: 'raider', x: 0.3, y: 0, z: -1.4, dead: false, gone: false });
  return a;
};

const events = (r: () => number, a: Actor[]): BattleEvent[] => {
  const e: BattleEvent[] = [];
  const pick = () => a[Math.floor(r() * a.length)].id;
  const k = r();
  if (k < 0.15) e.push({ t: 0, kind: 'wound', unit: pick(), sev: 40 } as BattleEvent);
  else if (k < 0.22) e.push({ t: 0, kind: 'death', unit: pick() } as BattleEvent);
  else if (k < 0.3) e.push({ t: 0, kind: 'breach' } as BattleEvent);
  else if (k < 0.4) e.push({ t: 0, kind: 'say', text: 'x', who: pick() } as BattleEvent);
  else if (k < 0.43) e.push({ t: 0, kind: 'alarm', what: 'dog' } as BattleEvent);
  return e;
};

/** Every distinct shot the director cuts to over a staged fight, with the actors as they were at the cut. */
function cuts(seed: number, obstacles: Box[]): Array<{ s: Shot; actors: Actor[]; fb: number }> {
  const r = mulberry32(seed * 7 + 1);
  const d = new Director(seed);
  d.setObstacles(obstacles);
  const out: Array<{ s: Shot; actors: Actor[]; fb: number }> = [];
  let actors = cast(r), last: Shot | null = null;
  for (let t = 0; t < 90; t += 0.25) {
    // everyone shuffles about, some fall
    actors = actors.map(a => (a.post === 'tower' || a.post === 'wall' ? a : { ...a, x: a.x + (r() - 0.5) * 0.3, z: a.z + (r() - 0.5) * 0.3 }));
    if (r() < 0.01) actors[Math.floor(r() * actors.length)].dead = true;
    const s = d.update(t, actors, events(r, actors), house, ground);
    if (s !== last) { out.push({ s: structuredClone(s), actors: actors.map(a => ({ ...a })), fb: d.fallbacks }); last = s; }
  }
  return out;
}

describe('every raid-cutscene shot frames its subject and stays out of the geometry', () => {
  const bx = boxes();
  const ctxOf = (actors: Actor[]) => ({ boxes: bx, ground, actors: new Map(actors.map(a => [a.id, a])) });

  it('passes its own check, and an independent audit, over 24 staged fights', () => {
    let total = 0;
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      for (const { s, actors, fb } of cuts(seed, bx)) {
        total++; kinds.add(s.kind);
        expect(shotProblems(s, ctxOf(actors)), `seed ${seed} ${s.kind}`).toEqual([]);
        expect(fb, `seed ${seed}: a cut had no clean candidate`).toBe(0);
        // measured on its own: at the cut, mid-hold and at the end of the drift
        for (const t of [0, s.hold / 2, s.hold]) {
          const p = poseAt(s, s.since + t);
          const au = auditPose(p.eye, p.look, p.fov, bx, actors, ground);
          expect(au.inside, `seed ${seed} ${s.kind} t=${t} inside`).toBeNull();
          if (au.aboveGround < 1.3) expect(au.nearest, `seed ${seed} ${s.kind} t=${t} hugging a ${au.nearest}`).toBeGreaterThanOrEqual(0.25);
          expect(au.ahead, `seed ${seed} ${s.kind} t=${t} dead ahead`).toBeGreaterThanOrEqual(0.6);
          if (t === 0 && au.live > 0 && s.subjects?.length) expect(au.visible, `seed ${seed} ${s.kind} shows no one`).toBeGreaterThan(0);
        }
      }
    }
    expect(total).toBeGreaterThan(150);
    for (const k of ['wall', 'raiders', 'house', 'wide', 'close']) expect(kinds.has(k), k).toBe(true);
  });

  it('keeps the minimum standoff for its type', () => {
    for (let seed = 1; seed <= 25; seed++) for (const { s, actors } of cuts(seed, bx)) {
      for (const id of s.subjects ?? []) {
        const a = actors.find(x => x.id === id); if (!a || a.dead) continue;
        expect(Math.hypot(a.x - s.eye.x, a.z - s.eye.z), `${s.kind} on ${id}`).toBeGreaterThanOrEqual(STANDOFF[s.kind] - 1e-6);
      }
    }
  });

  it('the old failure: a house shot used to put the eye a few centimetres off the cabin roof; now it stands clear in any direction the crew comes from', () => {
    for (let a = 0; a < 16; a++) {
      const ang = a / 16 * Math.PI * 2;
      const d = new Director(a + 3);
      d.setObstacles(bx);
      const actors: Actor[] = [
        { id: 'h0', side: 'home', post: 'open', x: 0.4, y: 0, z: 1.3, dead: false, gone: false },
        { id: 'r0', side: 'raider', x: Math.sin(ang) * 6, y: 0, z: Math.cos(ang) * 6, dead: false, gone: false },
      ];
      const s = d.update(0, actors, [{ t: 0, kind: 'alarm', what: 'dog' }], house, ground);
      expect(s.kind).toBe('house');
      const au = auditPose(s.eye, s.look, s.fov, bx, actors, ground);
      expect(au.inside).toBeNull();
      expect(au.nearest).toBeGreaterThanOrEqual(0.3);
      expect(au.visible).toBeGreaterThan(0);
    }
  });

  it('in the lead-in it varies its cuts (wide, the crew from the side, low at the gate), each held a few seconds and never the same twice running, and never a defender at the wall', () => {
    const d = new Director(4);
    d.setObstacles(bx);
    d.leadIn = true;
    const actors = cast(mulberry32(3));
    const cuts: Array<{ kind: string; at: number }> = [];
    let last = null as unknown;
    for (let t = 0; t < 40; t += 0.25) {
      const s = d.update(t, actors, [], house, ground);
      if (s !== last) { cuts.push({ kind: s.kind, at: t }); last = s; }
    }
    const kinds = new Set(cuts.map(c => c.kind));
    expect([...kinds].every(k => ['wide', 'raiders', 'gate'].includes(k))).toBe(true);
    expect(kinds.size).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < cuts.length; i++) {
      expect(cuts[i].kind).not.toBe(cuts[i - 1].kind);
      expect(cuts[i].at - cuts[i - 1].at).toBeGreaterThanOrEqual(3);
    }
  });

  it('pans after the unit it is about, and cuts away when that unit leaves the picture', () => {
    const d = new Director(8);
    d.setObstacles(bx);
    const actors: Actor[] = [
      { id: 'h0', side: 'home', post: 'open', x: 2, y: 0, z: 3, dead: false, gone: false },
      { id: 'r0', side: 'raider', x: 0, y: 0, z: 14, dead: false, gone: false },
    ];
    const s = d.update(0, actors, [{ t: 0, kind: 'say', text: 'Go!', who: 'r0' }], house, ground);
    const s0 = structuredClone(s);
    expect(s.kind).toBe('close');
    expect(s.track).toBe('r0');
    // the raider sprints sideways: the look follows
    for (let t = 0.25; t <= 1.5; t += 0.25) { actors[1].x += 0.8; d.update(t, actors, [], house, ground); }
    expect(s.look.x).toBeGreaterThan(s0.look.x + 0.5);
    // far enough to leave any frame: a new shot is cut
    for (let t = 1.75; t <= 6; t += 0.25) { actors[1].x += 2; d.update(t, actors, [], house, ground); }
    expect(d.shot).not.toBe(s);
  });

  it('cuts away at once when the one it is about falls', () => {
    const d = new Director(6);
    d.setObstacles(bx);
    const actors: Actor[] = [
      { id: 'h0', side: 'home', post: 'open', x: 2, y: 0, z: 3, dead: false, gone: false },
      { id: 'h1', side: 'home', post: 'open', x: -2, y: 0, z: 3, dead: false, gone: false },
      { id: 'r0', side: 'raider', x: 0, y: 0, z: 14, dead: false, gone: false },
    ];
    const s = d.update(0, actors, [{ t: 0, kind: 'say', text: 'Go!', who: 'h0' }], house, ground);
    expect(s.subject).toBe('h0');
    actors[0].dead = true;
    d.update(1.0, actors, [], house, ground);
    expect(d.shot).toBe(s);          // (a beat first: the minimum hold)
    const next = d.update(1.6, actors, [], house, ground);
    expect(next).not.toBe(s);
    expect(next.subjects ?? []).not.toContain('h0');
  });

  it('refuses a shot with the eye in a building, a roof dead ahead, or the subject behind the cabin', () => {
    const actors = [{ id: 'h0', side: 'home' as const, post: 'open', x: 0, y: 0, z: 3, dead: false, gone: false }];
    const base = { kind: 'house' as const, since: 0, hold: 5, fov: 58, drift: { x: 0, y: 0, z: 0 }, subjects: ['h0'], need: 1 };
    const ctx = ctxOf(actors);
    expect(shotProblems({ ...base, eye: { x: 0.2, y: 0.4, z: 0.1 }, look: { x: 0, y: 0.2, z: 3 } }, ctx).join()).toMatch(/inside/);
    expect(shotProblems({ ...base, eye: { x: 0, y: 0.5, z: 1.15 }, look: { x: 0, y: 0.6, z: -3 } }, ctx).join()).toMatch(/against|fills/);
    expect(shotProblems({ ...base, eye: { x: 0, y: 0.5, z: -3 }, look: { x: 0, y: 0.2, z: 3 } }, ctx).join()).toMatch(/subjects in frame/);
    expect(shotProblems({ ...base, eye: { x: 0, y: 0.5, z: 3.8 }, look: { x: 0, y: 0.2, z: 3 } }, ctx).join()).toMatch(/too close/);
    expect(shotProblems({ ...base, eye: { x: 2.5, y: 0.5, z: 6 }, look: { x: 0, y: 0.2, z: 3 } }, ctx)).toEqual([]);
  });
});

describe('obstaclesOf reads the buildings and the walls off a game', () => {
  it('boxes a finished cabin and a palisade run, and skips fields and cellars', () => {
    const g = newGame(1);
    g.structures.push({ id: 's1', kind: 'timber_cabin', x: 4, z: 4, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 }, { id: 's2', kind: 'field', x: 0, z: 0, rot: 0, stage: 5, done: 0, supplied: true, finishedAt: 0 });
    g.perimeter.push({ id: 'p1', kind: 'log_palisade', pts: [[0, 0], [6, 0]], gates: [], done: 1, hours: 1, supplied: true, finishedAt: 0 } as never);
    const bxs = obstaclesOf(g);
    const cabin = bxs.filter(b => b.kind === 'building' && b.h > 1);
    expect(cabin.length).toBe(1);
    expect(bxs.some(b => b.kind === 'building' && b.h < 0.5)).toBe(true);   // (the porch deck)
    expect(cabin[0].x0 < 4 && cabin[0].x1 > 4 && cabin[0].z0 < 4 && cabin[0].z1 > 4).toBe(true);
    expect(cabin[0].h).toBeGreaterThan(1);
    const walls = bxs.filter(b => b.kind === 'wall');
    expect(walls.length).toBeGreaterThanOrEqual(7);
    expect(Math.min(...walls.map(w => w.x0))).toBeLessThan(0.01);
    expect(Math.max(...walls.map(w => w.x1))).toBeGreaterThan(5.99);
  });
});
