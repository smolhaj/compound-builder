import { describe, expect, it } from 'vitest';
import { FALL_SECS, LIE_SECS, ladderGone, newLadder, stepLadder, tipOf, type OwnerAt } from './ladderLife';

const foot = { x: 0, z: 0 };
const at = (x: number, o: Partial<OwnerAt> = {}): OwnerAt => ({ x, y: 0, z: 0, dead: false, gone: false, ...o });

describe('a ladder is put away when its climber is done with it', () => {
  it('stands while the owner is on it, and tips once he has used it and walked away', () => {
    let l = newLadder('r1');
    l = stepLadder(l, 0.1, at(0.2), foot);           // at the foot
    expect(l.fell).toBeNull();
    l = stepLadder(l, 0.1, at(0.1, { y: 0.3 }), foot); // up the rungs
    expect(l.fell).toBeNull();
    l = stepLadder(l, 0.1, at(1.4), foot);           // gone off into the yard but still near
    expect(l.fell).toBeNull();
    l = stepLadder(l, 0.1, at(2.5), foot);           // retreating
    expect(l.fell).toBe(0);
    expect(tipOf(l)).toBe(0);
    l = stepLadder(l, FALL_SECS, at(9), foot);
    expect(tipOf(l)).toBe(1);
    expect(ladderGone(l)).toBe(false);
    l = stepLadder(l, LIE_SECS + 0.1, at(9), foot);
    expect(ladderGone(l)).toBe(true);
  });

  it('is put away when the owner dies or leaves the scene after using it', () => {
    let l = stepLadder(newLadder('r1'), 0.1, at(0.2), foot);
    l = stepLadder(l, 0.1, at(0.2, { dead: true }), foot);
    expect(l.fell).toBe(0);
    let m = stepLadder(newLadder('r2'), 0.1, at(0.3), foot);
    m = stepLadder(m, 0.1, null, foot);
    expect(m.fell).toBe(0);
  });

  it('a ladder nobody has reached yet stays up (a raider still on his way, or never coming)', () => {
    let l = newLadder('r1');
    for (let i = 0; i < 50; i++) l = stepLadder(l, 1, at(30), foot);
    expect(l.fell).toBeNull();
    l = stepLadder(l, 1, null, foot);
    expect(l.fell).toBeNull();
  });

  it('a ladder with no owner never moves', () => {
    let l = newLadder();
    for (let i = 0; i < 20; i++) l = stepLadder(l, 1, null, foot);
    expect(l.fell).toBeNull();
    expect(ladderGone(l)).toBe(false);
  });
});
