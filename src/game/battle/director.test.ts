import { describe, expect, it } from 'vitest';
import { Director, poseAt, type Actor } from './director';

const ground = () => 0;
const house = { x: 0, y: 0, z: 0 };
const cast = (): Actor[] => [
  { id: 'h_a', side: 'home', post: 'wall', x: -1, y: 0, z: 4, dead: false, gone: false },
  { id: 'h_b', side: 'home', post: 'tower', x: 2, y: 0.9, z: 1, dead: false, gone: false },
  { id: 'h_c', side: 'home', post: 'open', x: 0, y: 0, z: 0.5, dead: false, gone: false },
  { id: 'r0', side: 'raider', x: 0, y: 0, z: 14, dead: false, gone: false },
  { id: 'r1', side: 'raider', x: 2, y: 0, z: 16, dead: false, gone: false },
];

describe('the cutscene camera operator', () => {
  it('cuts between wall, raiders, house and wide, never holding under the minimum, never repeating a kind back to back', () => {
    const d = new Director(5), kinds: string[] = [];
    let last = d.update(0, cast(), [{ t: 0, kind: 'alarm', what: 'dog' }], house, ground);
    kinds.push(last.kind);
    for (let t = 0.25; t < 90; t += 0.25) {
      const s = d.update(t, cast(), [], house, ground);
      if (s !== last) { expect(t - last.since).toBeGreaterThanOrEqual(3.2 - 1e-9); expect(s.kind).not.toBe(last.kind); kinds.push(s.kind); last = s; }
    }
    expect(new Set(kinds).size).toBeGreaterThanOrEqual(4);
    expect(kinds).toContain('wall'); expect(kinds).toContain('raiders'); expect(kinds).toContain('house');
  });

  it('goes close on a wound, and every pose is finite, above the ground and looks somewhere else', () => {
    const d = new Director(2);
    d.update(0, cast(), [{ t: 0, kind: 'alarm', what: 'watch' }], house, ground);
    const s = d.update(5, cast(), [{ t: 5, kind: 'wound', unit: 'h_a', sev: 40 }], house, ground);
    expect(s.kind).toBe('close'); expect(s.subject).toBe('h_a');
    for (let t = 0; t < 40; t += 0.5) {
      const sh = d.update(10 + t, cast(), t % 7 === 0 ? [{ t, kind: 'say', text: 'x', who: 'r1' }] : [], house, ground);
      const p = poseAt(sh, 10 + t);
      for (const v of [p.eye.x, p.eye.y, p.eye.z, p.look.x, p.look.y, p.look.z]) expect(Number.isFinite(v)).toBe(true);
      expect(p.eye.y).toBeGreaterThanOrEqual(0.1);
      expect(Math.hypot(p.eye.x - p.look.x, p.eye.z - p.look.z)).toBeGreaterThan(0.2);
    }
  });

  it('survives an empty field and is deterministic', () => {
    const a = new Director(9), b = new Director(9);
    const e = a.update(0, [], [], house, ground), f = b.update(0, [], [], house, ground);
    expect(JSON.stringify(e)).toBe(JSON.stringify(f));
    const sh = a.establish(1, house, { x: 0, z: 1 }, ground);
    expect(sh.kind).toBe('establish');
  });
});
