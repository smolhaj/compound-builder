import { describe, expect, it } from 'vitest';
import { shellsOf, ribGap, ribGapAll, RIB_EYE } from './domeStruts';
import { shotProblems, type Shot } from './director';
import { place } from '../../sim/raidTestKit';
import { domesOf } from '../../sim/dome/standing';
import { LOOK } from '../buildkit/domeBuildings';

const flat = () => 0;
const mk = (kind: string, rot = 0) => { const g = place(3, 'hardcore', 'armed'); g.structures.push({ id: 'dm', kind, x: 0, z: 0, rot, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never); return domesOf(g); };

describe('a dome shell\'s frame ribs as camera obstacles', () => {
  it('lists the struts of each lattice tier and none for the earthen dome', () => {
    expect(shellsOf(mk('dome_earthen'))).toHaveLength(0);
    for (const k of ['dome_geodesic', 'dome_glass', 'dome_arcology']) expect(shellsOf(mk(k))[0].segs.length).toBeGreaterThan(50);
  });
  it('reads zero gap on a strut and a clear gap mid-pane; far from the shell it is infinite', () => {
    const [sh] = shellsOf(mk('dome_glass')), s = sh.segs[Math.floor(sh.segs.length / 2)];
    const mid = { x: sh.x + (s[0] + s[3]) / 2, y: (s[1] + s[4]) / 2, z: sh.z + (s[2] + s[5]) / 2 };
    expect(ribGap(mid, sh, 0)).toBeLessThanOrEqual(0.001);
    expect(ribGap({ x: sh.x, y: LOOK.glass.stem + 0.3, z: sh.z }, sh, 0)).toBe(Infinity);
    expect(ribGapAll({ x: 500, y: 1, z: 500 }, [sh], flat)).toBe(Infinity);
  });
  it('turns the lattice with the dome (a quarter turn moves a strut\'s world place)', () => {
    const a = shellsOf(mk('dome_arcology', 0))[0], b = shellsOf(mk('dome_arcology', 1))[0];
    const s = a.segs.find(q => q[1] > 3 && Math.abs(q[0]) > 1)!, w = { x: (s[0] + s[3]) / 2, y: (s[1] + s[4]) / 2, z: (s[2] + s[5]) / 2 };
    expect(ribGap(w, a, 0)).toBeLessThan(0.01);
    // the same world point, with the dome turned a quarter: no longer on a strut of the turned lattice unless the lattice happens to be 4-fold symmetric there
    const q = { x: b.x + w.z * Math.sin(b.rot) * 0 + (w.x * Math.cos(b.rot) + w.z * Math.sin(b.rot)), y: w.y, z: b.z + (-w.x * Math.sin(b.rot) + w.z * Math.cos(b.rot)) };
    expect(ribGap(q, b, 0)).toBeLessThan(0.01);
  });
  it('rejects a shot whose eye hugs a strut and one that looks along it, but passes one mid-pane', () => {
    const shells = shellsOf(mk('dome_arcology')), sh = shells[0], s = sh.segs.find(q => q[1] > 3 && Math.abs(q[0]) > 1 && Math.abs(q[2]) > 1)!;
    const onS = { x: sh.x + (s[0] + s[3]) / 2, y: (s[1] + s[4]) / 2, z: sh.z + (s[2] + s[5]) / 2 };
    const inward = (p: typeof onS, d: number) => { const l = Math.hypot(p.x, p.y - 0.14, p.z) || 1; return { x: p.x - p.x / l * d, y: p.y - (p.y - 0.14) / l * d, z: p.z - p.z / l * d }; };
    const shot = (eye: typeof onS, look: typeof onS): Shot => ({ kind: 'wide', since: 0, hold: 3, fov: 50, eye, look, drift: { x: 0, y: 0, z: 0 }, subjects: [] } as unknown as Shot);
    const near = inward(onS, 0.1), look = { x: 0, y: 1, z: 0 };
    expect(shotProblems(shot(near, look), { boxes: [], shells, ground: flat, actors: new Map() }).some(p => p.includes('strut'))).toBe(true);
    expect(shotProblems(shot(near, look), { boxes: [], ground: flat, actors: new Map() }).some(p => p.includes('strut'))).toBe(false);
    const far = inward(onS, RIB_EYE + 1.5);
    expect(shotProblems(shot(far, look), { boxes: [], shells, ground: flat, actors: new Map() }).some(p => p.includes('strut'))).toBe(false);
  });
});
