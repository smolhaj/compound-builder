import { describe, expect, it } from 'vitest';
import { Director, MAX_SURFACE_COVER, MAX_WALL_COVER, wallCover, STANDOFF, auditPose, bestEye, surfaceCover, brushCover, MAX_BRUSH_COVER, figurePx, lensProblem, poseAt, shotProblems, type Actor, type Box, type Shot } from './director';
import { obstaclesOf, treeBoxes, domeWallBoxes, vestibuleBoxes, SKIRT_H, YARD_ROOF } from './cameraObstacles';
import { YARD_H, yardGeometry, yardWallHeight } from '../../sim/dome/plantYard';
import { blockedBetween, nearBox } from './director';
import { place } from '../../sim/raidTestKit';
import { domesOf } from '../../sim/dome/standing';
import { lightLabel } from './lightLabel';
import { planSiege, sceneCaption, segments, type SceneKind } from '../../sim/siege';
import type { EncounterKind } from '../../sim/encounters';
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
          expect(au.cover, `seed ${seed} ${s.kind} t=${t}: one surface covers ${Math.round(au.cover * 100)}% of the picture`).toBeLessThanOrEqual(MAX_SURFACE_COVER);
          if (t === 0) expect(au.wall, `seed ${seed} ${s.kind}: a wall covers ${Math.round(au.wall * 100)}% of the picture at the cut`).toBeLessThanOrEqual(MAX_WALL_COVER);
          if (t === 0 && au.live > 0 && s.subjects?.length) expect(au.visible, `seed ${seed} ${s.kind} shows no one`).toBeGreaterThan(0);
        }
      }
    }
    expect(total).toBeGreaterThan(150);
    for (const k of ['wall', 'raiders', 'house', 'wide', 'close']) expect(kinds.has(k), k).toBe(true);
  }, 180_000);   // heavy: multi-seed sim, about 10 to 20 s alone, so it needs headroom when the suite runs in parallel

  it('keeps the minimum standoff for its type', () => {
    for (let seed = 1; seed <= 25; seed++) for (const { s, actors } of cuts(seed, bx)) {
      for (const id of s.subjects ?? []) {
        const a = actors.find(x => x.id === id); if (!a || a.dead) continue;
        expect(Math.hypot(a.x - s.eye.x, a.z - s.eye.z), `${s.kind} on ${id}`).toBeGreaterThanOrEqual(STANDOFF[s.kind] - 1e-6);
      }
    }
  }, 180_000);   // heavy: multi-seed sim, about 10 to 20 s alone, so it needs headroom when the suite runs in parallel

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

describe('a dome\'s airlock modules are solid to the camera', () => {
  it('gives each person airlock a box at the shell, so no shot sits inside one', () => {
    const g = place(3, 'hardcore', 'armed'); g.structures.push({ id: 'dm', kind: 'dome_glass', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const dome = domesOf(g)[0], boxes = obstaclesOf(g).filter(b => b.id === 'dome_airlock');
    expect(dome.airlocks.length).toBeGreaterThan(0); expect(boxes.length).toBe(dome.airlocks.length);
    for (const l of dome.airlocks) expect(boxes.some(b => Math.hypot((b.x0 + b.x1) / 2 - Math.sin(l.angle) * dome.r, (b.z0 + b.z1) / 2 - Math.cos(l.angle) * dome.r) < 0.01)).toBe(true);
  });
});

describe('a dome\'s opaque walls are solid to the camera and hide name tags', () => {
  const mk = (kind: string) => { const g = place(3, 'hardcore', 'armed'); g.structures.push({ id: 'dm', kind, x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never); return g; };
  const flat = () => 0;
  it('boxes the armored, roofed plant yard of an arcology as one solid block as tall as it is drawn', () => {
    const g = mk('dome_arcology'), d = domesOf(g)[0], yg = yardGeometry(d.tier, d.r, d.structure.rot)!;
    const yard = domeWallBoxes(d).filter(b => b.id === 'dome_yard');
    expect(yard.length).toBeGreaterThanOrEqual(4);
    const H = yardWallHeight(d.tier, yg) + YARD_ROOF;
    expect(H).toBeGreaterThanOrEqual(1.7);   // (armor as tall as the plant, 34 ft+, plus the roof: the old 0.58 box left the camera free to sit against a 1.5-unit wall)
    expect(yard.every(b => b.kind === 'building' && Math.abs(b.h - H) < 1e-9)).toBe(true);
    const inBox = (x: number, z: number) => yard.some(b => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1);
    for (const [cx, cz] of yg.corners) expect(inBox(cx + d.x, cz + d.z)).toBe(true);
    expect(inBox(yg.center[0] + d.x, yg.center[1] + d.z)).toBe(true);   // (the roof covers the middle too)
    expect(inBox(yg.center[0] + d.x + yg.er[0] * (yg.D / 2 + 0.5), yg.center[1] + d.z + yg.er[1] * (yg.D / 2 + 0.5))).toBe(false);   // (open ground beyond the outer wall)
    expect(obstaclesOf(g).filter(b => b.id === 'dome_yard').length).toBe(yard.length);
  });
  it('boxes each arcology entrance module (person airlock and vehicle port) from its inner door out past the shell, 1.5+ tall', () => {
    const g = mk('dome_arcology'), d = domesOf(g)[0], bx = obstaclesOf(g).filter(b => b.id === 'dome_airlock');
    expect(d.airlocks.length).toBeGreaterThanOrEqual(2);
    const inBox = (x: number, z: number, h = 0.5) => bx.some(b => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.h > h);
    for (const l of d.airlocks) {
      for (const f of [0.1, 0.5, 0.9]) expect(inBox(l.inX + (l.outX - l.inX) * f, l.inZ + (l.outZ - l.inZ) * f, 1.5)).toBe(true);
      // a unit inside its inner door, on the dome floor, is open
      expect(inBox(l.inX - Math.sin(l.angle) * 1.0, l.inZ - Math.cos(l.angle) * 1.0)).toBe(false);
    }
    // the tiles are tight: no tile is wider than a step plus the diagonal of a turned cell
    const tiles = vestibuleBoxes(d.airlocks[0], 1.55);
    expect(tiles.every(b => b.x1 - b.x0 < 0.75 && b.z1 - b.z0 < 0.75)).toBe(true);
  });
  it('boxes the arcology control block inside the shell, clear of the open middle of the floor', () => {
    const d = domesOf(mk('dome_arcology'))[0], cb = domeWallBoxes(d).filter(b => b.id === 'dome_control');
    expect(cb.length).toBeGreaterThanOrEqual(2);
    expect(cb.every(b => b.kind === 'building' && b.h >= 0.5)).toBe(true);
    for (const b of cb) expect(Math.hypot((b.x0 + b.x1) / 2 - d.x, (b.z0 + b.z1) / 2 - d.z)).toBeLessThan(d.r);   // (inside the shell)
    expect(cb.some(b => d.x >= b.x0 && d.x <= b.x1 && d.z >= b.z0 && d.z <= b.z1)).toBe(false);
    expect(domeWallBoxes(domesOf(mk('dome_glass'))[0]).some(b => b.id === 'dome_control')).toBe(false);
  });
  it('boxes a glass dome\'s low concrete yard wall as a ring that leaves the middle open', () => {
    const d = domesOf(mk('dome_glass'))[0], yg = yardGeometry(d.tier, d.r, d.structure.rot)!, yard = domeWallBoxes(d).filter(b => b.id === 'dome_yard_wall');
    expect(yard.length).toBeGreaterThanOrEqual(4);
    expect(yard.every(b => b.kind === 'wall' && Math.abs(b.h - YARD_H) < 1e-9)).toBe(true);
    for (const [cx, cz] of yg.corners) expect(yard.some(b => cx + d.x >= b.x0 && cx + d.x <= b.x1 && cz + d.z >= b.z0 && cz + d.z <= b.z1)).toBe(true);
    expect(yard.some(b => yg.center[0] + d.x >= b.x0 && yg.center[0] + d.x <= b.x1 && yg.center[1] + d.z >= b.z0 && yg.center[1] + d.z <= b.z1)).toBe(false);
  });
  it('boxes the arcology skirt band all round the shell, and not the glass dome\'s open lawn or the shell\'s inside', () => {
    const d = domesOf(mk('dome_arcology'))[0], skirt = domeWallBoxes(d).filter(b => b.id === 'dome_skirt');
    for (let a = 0; a < 6.28; a += 0.2) { const x = Math.sin(a) * d.r, z = Math.cos(a) * d.r; expect(skirt.some(b => x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1 && b.h === SKIRT_H)).toBe(true); }
    expect(skirt.some(b => 0 >= b.x0 && 0 <= b.x1 && 0 >= b.z0 && 0 <= b.z1)).toBe(false);   // (the middle of the dome is open to a shot)
    const glass = domeWallBoxes(domesOf(mk('dome_glass'))[0]);
    expect(glass.some(b => b.id === 'dome_skirt')).toBe(false);
    expect(glass.some(b => b.id === 'dome_yard_wall')).toBe(true);
  });
  it('flags an eye against the yard wall and a name tag behind it', () => {
    const d = domesOf(mk('dome_arcology'))[0], yg = yardGeometry(d.tier, d.r, d.structure.rot)!, boxes = domeWallBoxes(d);
    const out = yg.er, mid = [yg.center[0] + d.x, yg.center[1] + d.z], edge = [mid[0] + out[0] * yg.D / 2, mid[1] + out[1] * yg.D / 2];
    // eye 0.05 off the outer face, low: against the wall
    const eye = { x: edge[0] + out[0] * 0.05, y: 0.3, z: edge[1] + out[1] * 0.05 };
    expect(boxes.some(b => nearBox(eye, b, flat, 0.12))).toBe(true);
    // a person in the yard's middle seen from well outside, through the wall: blocked; from above the wall top: clear
    // a tag over someone standing past the yard, seen from this side: hidden by the block; a person on the camera's own side of the yard: clear
    const head = { x: edge[0] - out[0] * (yg.D + 0.6), y: 0.3, z: edge[1] - out[1] * (yg.D + 0.6) };
    const far = { x: edge[0] + out[0] * 3, y: 0.3, z: edge[1] + out[1] * 3 };
    expect(blockedBetween(far, head, boxes, flat)).toBe(true);
    expect(blockedBetween(far, { x: far.x + out[0] * 2, y: 0.3, z: far.z + out[1] * 2 }, boxes, flat)).toBe(false);
  });
});

describe('a heavy-weapon strike on a dome shows the burst, not the plant yard in front of it', () => {
  it('cuts to a pose that sees the impact point with nothing solid between, whichever way the yard faces', () => {
    for (const rot of [0, 1, 2, 3]) {
      const g = place(3, 'hardcore', 'armed'); g.structures.push({ id: 'dm', kind: 'dome_arcology', x: 0, z: 0, rot, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);
      const d0 = domesOf(g)[0], yg = yardGeometry(d0.tier, d0.r, d0.structure.rot)!, boxes = obstaclesOf(g);
      // the impact is on the shell 0.5 rad to one side of the yard; the firer stands 9 units out from it
      const a = yg.phi + 0.5, ox = Math.sin(a), oz = Math.cos(a), hit = { x: ox * d0.r, z: oz * d0.r };
      const ev = { t: 0, kind: 'heavy', unit: 'r0', weapon: 'rpg', x: hit.x, z: hit.z, y: 0.6, ox, oz, fx: hit.x + ox * 9, fz: hit.z + oz * 9, hold: 3 } as Extract<BattleEvent, { kind: 'heavy' }>;
      const actors: Actor[] = [{ id: 'r0', side: 'raider', x: ev.fx, y: 0, z: ev.fz, dead: false, gone: false }, { id: 'h0', side: 'home', post: 'open', x: 0, y: 0, z: 0, dead: false, gone: false }];
      const dir = new Director(5);
      dir.setObstacles(boxes);
      const s = dir.update(0, actors, [ev], { x: 0, y: 0, z: 0 }, ground);
      expect(s.kind).toBe('strike');
      expect(s.mustSee?.length).toBe(1);
      const bad = shotProblems(s, { boxes, ground, actors: new Map(actors.map(x => [x.id, x])) }).filter(p => /mark/.test(p));
      expect(bad).toEqual([]);
    }
  });
  it('refuses a strike pose whose burst is behind the yard block', () => {
    const g = place(3, 'hardcore', 'armed'); g.structures.push({ id: 'dm', kind: 'dome_arcology', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);
    const d0 = domesOf(g)[0], yg = yardGeometry(d0.tier, d0.r, 0)!, boxes = obstaclesOf(g);
    const mid = { x: yg.center[0] + yg.er[0] * (yg.D / 2 + 3), y: 0.7, z: yg.center[1] + yg.er[1] * (yg.D / 2 + 3) };
    const behind = { x: yg.center[0] - yg.er[0] * 1.5, y: 0.6, z: yg.center[1] - yg.er[1] * 1.5 };   // (inside the yard's inner side)
    const shot = { kind: 'strike', eye: mid, look: behind, fov: 58, since: 0, hold: 3, drift: { x: 0, y: 0, z: 0 }, mustSee: [behind], subjects: [] } as unknown as Shot;
    expect(shotProblems(shot, { boxes, ground, actors: new Map() }).join()).toMatch(/mark is hidden/);
    const open = { ...mid, x: mid.x + yg.et[0] * 4, z: mid.z + yg.et[1] * 4 };   // (open ground to the side, in front of the lens)
    expect(shotProblems({ ...shot, look: open, mustSee: [open] }, { boxes, ground, actors: new Map() }).join()).not.toMatch(/mark/);
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

/** A pine at (x, z): trunk and crown, as the camera sees it. */
const pine = (x: number, z: number, scale = 1.6) => treeBoxes([{ x, z, y: 0, scale, kind: 'conifer', sx: 1, sy: 1 }], { x, z }, 5);

describe('the daylight lead-in puts the crew in the picture, large, and varies its frames', () => {
  const bx = boxes();
  /** Every lead-in cut of a staged daylight approach, one director per scene index. */
  function leadCuts(seed: number, scene: number, night: boolean) {
    const r = mulberry32(seed * 11 + 5);
    const d = new Director(seed);
    d.setObstacles(bx); d.leadIn = true; d.night = night; d.variant = scene;
    const actors = cast(r);
    const out: Array<{ s: Shot; actors: Actor[] }> = [];
    let last: Shot | null = null;
    for (let t = 0; t < 30; t += 0.25) {
      const s = d.update(t, actors, [], house, ground);
      if (s !== last) { out.push({ s: structuredClone(s), actors: actors.map(a => ({ ...a })) }); last = s; }
    }
    return { out, d };
  }

  it('framing audit: by day every lead-in cut shows raiders at least 20 px tall (a 720-line picture), unblocked, with no fallback cut', () => {
    let n = 0;
    for (let seed = 1; seed <= 20; seed++) for (let scene = 0; scene < 4; scene++) {
      const { out, d } = leadCuts(seed, scene, false);
      expect(d.fallbacks, `seed ${seed} scene ${scene}`).toBe(0);
      expect(d.softened, `seed ${seed} scene ${scene}: the pixel rule had to be relaxed`).toBe(0);
      for (const { s, actors } of out) {
        n++;
        const p = poseAt(s, s.since), au = auditPose(p.eye, p.look, p.fov, bx, actors, ground);
        expect(au.raiderPx, `seed ${seed} scene ${scene} ${s.kind}: crew size in the frame`).toBeGreaterThanOrEqual(20);
        expect(au.visible).toBeGreaterThan(0);
        expect(shotProblems(s, { boxes: bx, ground, actors: new Map(actors.map(a => [a.id, a])) })).toEqual([]);
      }
    }
    expect(n).toBeGreaterThan(100);
  }, 180_000);   // heavy: multi-seed sim, about 10 to 20 s alone, so it needs headroom when the suite runs in parallel

  it('by day a wide cut on a crew still far from the house shows the crew at least 14 px tall', () => {
    let n = 0;
    for (let seed = 1; seed <= 16; seed++) {
      const d = new Director(seed);
      d.setObstacles(bx); d.night = false; d.variant = seed % 3;
      const actors = cast(mulberry32(seed * 3 + 1));
      d.update(0, actors, [], house, ground);
      const s = d.update(4, actors, [{ t: 4, kind: 'breach' } as never], house, ground);
      expect(s.kind).toBe('wide');
      expect(d.fallbacks).toBe(0);
      const p = poseAt(s, s.since), au = auditPose(p.eye, p.look, p.fov, bx, actors, ground);
      expect(au.raiderPx, `seed ${seed}`).toBeGreaterThanOrEqual(14);
      n++;
    }
    expect(n).toBe(16);
  });

  it('two scenes never open on the same frame, and a scene never repeats its own', () => {
    for (let seed = 1; seed <= 12; seed++) {
      // one director for the whole raid, as the player has: each scene starts afresh (no shot yet) with the lead-in on
      const d = new Director(seed);
      d.setObstacles(bx); d.night = false;
      const actors = cast(mulberry32(seed * 11 + 5));
      const firsts: Shot[] = [];
      for (let scene = 0; scene < 4; scene++) {   // (a day raid has two scenes at most, a night siege five; the daylight opener is the tight one)
        d.variant = scene; d.leadIn = true; d.shot = null;
        const cuts: Shot[] = [];
        let last: Shot | null = null;
        for (let t = scene * 40; t < scene * 40 + 30; t += 0.25) {
          const s = d.update(t, actors, [], house, ground);
          if (s !== last) { cuts.push(structuredClone(s)); last = s; }
        }
        firsts.push(cuts[0]);
        for (let i = 1; i < cuts.length; i++) expect(cuts[i].kind === cuts[i - 1].kind && Math.hypot(cuts[i].eye.x - cuts[i - 1].eye.x, cuts[i].eye.z - cuts[i - 1].eye.z) < 1.8, `seed ${seed} scene ${scene} repeats itself`).toBe(false);
      }
      for (let i = 0; i < firsts.length; i++) for (let j = i + 1; j < firsts.length; j++) {
        const a = firsts[i], b = firsts[j];
        const same = Math.abs(a.fov - b.fov) < 3 && Math.hypot(a.eye.x - b.eye.x, a.eye.z - b.eye.z) < 1.8 && Math.abs(Math.atan2(a.look.x - a.eye.x, a.look.z - a.eye.z) - Math.atan2(b.look.x - b.eye.x, b.look.z - b.eye.z)) < 0.45;
        expect(same, `seed ${seed}: scenes ${i} and ${j} open on one frame`).toBe(false);
      }
    }
  }, 180_000);   // heavy: multi-seed sim, about 10 to 20 s alone, so it needs headroom when the suite runs in parallel

  it('the night lead-in keeps its own wide (no pixel rule on the crew)', () => {
    const { out, d } = leadCuts(3, 0, true);
    expect(d.fallbacks).toBe(0);
    expect(out.every(c => c.s.minPx === undefined)).toBe(true);
  });

  it('measures a figure the way the picture draws it', () => {
    // 0.28 tall, 6 units away, a 54 degree lens, 720 lines: about 0.28 / (2 * 6 * 0.51) * 720
    expect(figurePx({ x: 0, y: 0.17, z: 0 }, { x: 0, y: 0.17, z: 6 }, 54)).toBeCloseTo(0.28 * 720 / (2 * 6 * Math.tan(27 * Math.PI / 180)), 3);
  });
});

describe('the lens stays clear of trees and hillsides', () => {
  it('refuses a trunk across the lens, a wall of trees, and a hillside, and passes open ground and a tree seen past a subject', () => {
    const eye = { x: 0, y: 0.5, z: 0 }, look = { x: 0, y: 0.4, z: 8 };
    expect(lensProblem(eye, look, 54, pine(0.2, 2), ground)).toMatch(/lens/);                       // a pine 2 units out, a little off the axis
    expect(lensProblem(eye, look, 54, pine(-2.6, 1.9, 0.5), ground)).toBeNull();                       // (a sapling beside the frame: it is out of the picture)
    const wall = [-2.4, -1.2, 0, 1.2, 2.4].flatMap(tx => pine(tx, 4.2));
    expect(lensProblem(eye, look, 54, wall, ground)).not.toBeNull();
    expect(lensProblem(eye, look, 54, [], (_x, z) => (z > 1.5 ? (z - 1.5) * 0.6 : 0))).toMatch(/hillside/);   // a slope rising 0.6 per unit ahead
    expect(lensProblem(eye, look, 54, [], () => 0)).toBeNull();
    expect(lensProblem(eye, look, 54, pine(0, 7), ground)).toBeNull();                                // a tree at the far end of the lens is scenery
  });

  it('the director cuts clear of a grove between the camera and the crew', () => {
    const bx = [...boxes()];
    // a grove around the yard, so the first angles are cluttered
    for (let a = 0; a < 14; a++) bx.push(...pine(Math.cos(a) * 11 + 1, Math.sin(a) * 11 + 12, 1.4 + (a % 3) * 0.4));
    for (let seed = 1; seed <= 10; seed++) {
      const r = mulberry32(seed), d = new Director(seed);
      d.setObstacles(bx); d.leadIn = true; d.night = false; d.variant = seed;
      const actors = cast(r);
      let last: Shot | null = null;
      for (let t = 0; t < 20; t += 0.25) {
        const s = d.update(t, actors, [], house, ground);
        if (s === last) continue;
        last = s;   // (judged as cut: the operator pans after the unit afterwards, and re-checks the lens every half second)
        const trees = bx.filter(b => b.kind === 'tree');
        for (const k of [0, Math.min(s.hold, 12) / 2, Math.min(s.hold, 12)]) { const p = poseAt(s, s.since + k); expect(lensProblem(p.eye, p.look, p.fov, trees, ground), `seed ${seed} ${s.kind}`).toBeNull(); }
      }
      expect(d.fallbacks, `seed ${seed}`).toBe(0);
    }
  }, 180_000);   // heavy: multi-seed sim, about 10 to 20 s alone, so it needs headroom when the suite runs in parallel

  it('treeBoxes gives each tree a trunk and a floating crown, nearest first, and skips shrubs', () => {
    const t = (x: number, z: number, scale: number) => ({ x, z, y: 0, scale, kind: 'conifer', sx: 1, sy: 1 });
    const out = treeBoxes([t(30, 0, 1), t(3, 0, 1.5), t(2, 0, 0.2), t(200, 0, 1)], { x: 0, z: 0 }, 70);
    expect(out.length).toBe(4);                      // two trees x (trunk + crown); the shrub and the far tree are out
    expect(out[0].x0).toBeGreaterThan(1);            // the near one first
    expect(out.every(b => b.kind === 'tree')).toBe(true);
    expect(out.filter(b => b.y0 !== undefined).length).toBe(2);
  });
});

describe('the light word follows the sky, not the hour the raid began', () => {
  it('names night, dawn, day and dusk by the day phase', () => {
    expect(lightLabel(2.25)).toBe('Night');
    expect(lightLabel(5.0)).toBe('Night');
    expect(lightLabel(5.4)).toBe('Night');
    expect(lightLabel(5.9)).toBe('Dawn');           // 'NIGHT 5:46 AM' in the QA run, with the sky already lifting
    expect(lightLabel(6.2)).toBe('Dawn');
    expect(lightLabel(6.13)).toBe('Dawn');          // the "NIGHT 6:08 AM" over a bright dawn
    expect(lightLabel(7.3)).toBe('Dawn');
    expect(lightLabel(10)).toBe('Day');
    expect(lightLabel(14)).toBe('Day');
    expect(lightLabel(18.4)).toBe('Dusk');
    expect(lightLabel(19.9)).toBe('Dusk');
    expect(lightLabel(20.6)).toBe('Night');
    expect(lightLabel(23.9)).toBe('Night');
    expect(lightLabel(30)).toBe('Dawn');              // wraps
  });
});

describe('every scene of every raid has a caption for each part', () => {
  const crews: EncounterKind[] = ['gang', 'militia', 'patrol', 'requisition', 'looters', 'break_in', 'horde'];
  it('lead, fight and tail are never empty, by day or by night, for any crew', () => {
    const kinds = new Set<SceneKind>();
    for (const crew of crews) for (const hour of [2.25, 5.75, 9, 14, 18.5, 21]) for (const fought of [true, false]) for (let seed = 1; seed <= 12; seed++) {
      const plan = planSiege({ kind: crew, size: 4 + (seed % 7), temper: seed % 2 ? 'hard' as const : 'savage' as const, hour, seed, fought, fightSeconds: fought ? 60 : null });
      for (const sc of plan.scenes) {
        kinds.add(sc.kind);
        for (const part of ['lead', 'fight', 'tail'] as const) expect(sceneCaption(plan, sc, part, seed).trim().length, `${crew} ${sc.kind} ${part} @${hour}`).toBeGreaterThan(8);
        if (sc.gap > 0) expect(sceneCaption(plan, sc, 'gap', seed)).toMatch(/later/);
      }
      expect(segments(plan).length).toBeGreaterThan(0);
    }
    for (const k of ['gate', 'probe', 'harass', 'fires', 'assault'] as const) expect(kinds.has(k), k).toBe(true);
  });
});


describe('a bush close to the camera may not fill the picture', () => {
  const bush: Box = { x0: -1.5, x1: 1.5, z0: 0.3, z1: 0.9, h: 0.6, kind: 'brush' };
  const eye = { x: 0, y: 0.3, z: 0 }, look = { x: 0, y: 0.25, z: 4 };
  it('flags a leaf wall just ahead of the lens, and not one far away or beside the view', () => {
    expect(brushCover(eye, look, 42, [bush], ground)).toBeGreaterThan(MAX_BRUSH_COVER);
    expect(brushCover({ x: 0, y: 0.3, z: -6 }, look, 42, [bush], ground)).toBe(0);
    expect(brushCover({ x: 4, y: 0.3, z: 0 }, look, 42, [bush], ground)).toBe(0);
  });
  it('shotProblems rejects such a shot', () => {
    const s = { kind: 'close', since: 0, hold: 3, eye, look, fov: 42, drift: { x: 0, y: 0, z: 0 }, subjects: [] } as unknown as Shot;
    const bad = shotProblems(s, { boxes: [bush], ground, live: false, actors: new Map() });
    expect(bad.some(p => p.includes('bush'))).toBe(true);
  });
});

describe('a surface close to the camera may not fill the picture', () => {
  const roof: Box = { x0: -3, x1: 3, z0: -3, z1: 3, h: 1.3, kind: 'building' };
  const wall: Box = { x0: -6, x1: 6, z0: 0.5, z1: 0.7, h: 0.6, kind: 'wall' };
  it('flags a roof skimmed from just above, and a wall the camera is pressed against', () => {
    // 0.2 above the roof, looking along it: a flat grey plane over the picture
    expect(surfaceCover({ x: -2.8, y: 1.45, z: 0 }, { x: 2, y: 0.9, z: 0 }, 42, [roof], ground)).toBeGreaterThan(MAX_SURFACE_COVER);
    // 0.25 from a wall, looking at it low: half the picture is wall
    expect(surfaceCover({ x: 0, y: 0.3, z: 0.2 }, { x: 0, y: 0.25, z: 3 }, 42, [wall], ground)).toBeGreaterThan(MAX_SURFACE_COVER);
  });
  it('reads nothing for an open yard, and for a house seen from across it', () => {
    expect(surfaceCover({ x: 0, y: 1, z: -12 }, { x: 0, y: 0.2, z: 0 }, 42, [roof, wall], ground)).toBe(0);
    expect(surfaceCover({ x: 0, y: 0.8, z: -8 }, { x: 0, y: 0.3, z: -3.2 }, 42, [roof], ground)).toBeLessThan(0.1);
  });
  it('picks the eye with the least surface in the way', () => {
    const look = { x: 0, y: 0.2, z: 3 };
    const bad = { x: 0, y: 0.3, z: 0.25 }, good = { x: 0, y: 1.2, z: -3 };
    expect(bestEye([bad, good], look, 42, [wall], ground, 0.1)).toEqual(good);
  });
});

describe('a house wall a few metres off may not fill a third of the picture (the "Probing the line" gable)', () => {
  // the night invasion at 2:21 AM: an over-the-shoulder shot from beside the house, a gable wall 1.8 units off the lens and nothing of it touching the eye
  const gable: Box = { x0: -1, x1: 4, z0: 1.8, z1: 6, h: 1.1, kind: 'building' };
  const eye = { x: 0.2, y: 0.5, z: 0 }, aim = { x: 4, y: 0.4, z: 6 };
  it('reads a gable wall beside the lens as a wall, though the old near-surface test passes it', () => {
    expect(surfaceCover(eye, aim, 50, [gable], ground)).toBeLessThanOrEqual(MAX_SURFACE_COVER);
    expect(wallCover(eye, aim, 50, [gable], ground)).toBeGreaterThan(MAX_WALL_COVER);
  });
  it('reads a house across the yard, and a tree crown close by, as nothing', () => {
    expect(wallCover({ x: 0, y: 0.8, z: -8 }, { x: 0, y: 0.3, z: -3.2 }, 50, [gable], ground)).toBe(0);
    expect(wallCover(eye, aim, 50, [{ x0: 0, x1: 3.5, z0: 1.8, z1: 6, h: 1.1, kind: 'tree' }], ground)).toBe(0);
  });
  it('shotProblems refuses the shot, and bestEye prefers the eye with the wall out of the picture', () => {
    const shot: Shot = { kind: 'wall', eye, look: aim, fov: 50, since: 0, hold: 4, drift: { x: 0, y: 0, z: 0 } };
    expect(shotProblems(shot, { boxes: [gable], ground, actors: new Map() }).some(p => p.includes('a wall covers'))).toBe(true);
    const away = { x: 0.2, y: 0.5, z: -8 };
    expect(bestEye([eye, away], aim, 50, [gable], ground, 0.1)).toEqual(away);
  });
});
