import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CorridorDoors, HOLD_S, doorTarget } from './CorridorDoors';
import type { Corridor } from '../../sim/corridors';

const c: Corridor = { id: 'r1', kind: 'rock_tunnel', a: [0, 0], b: [40, 0], pts: [[0, 0], [40, 0]], lenU: 40, lenM: 240, bore: true, collapsed: false };
const group = () => {
  const g = new THREE.Group();
  for (const end of [0, 1] as const) { const d = new THREE.Group(); d.userData = { door: { end, lift: 3 } }; g.add(d); }
  const sw = new THREE.Group(); sw.userData = { door: { end: 0, swing: 1.6, base: 0.5 } }; sw.rotation.y = 0.5; g.add(sw);
  return g;
};

describe('doorTarget', () => {
  it('stands open by day whatever happens', () => { expect(doorTarget(false, false, 99)).toBe(1); });
  it('is shut at night unless a keyholder is at it, and holds a few seconds behind them', () => {
    expect(doorTarget(true, false, 99)).toBe(0);
    expect(doorTarget(true, true, 99)).toBe(1);
    expect(doorTarget(true, false, HOLD_S - 1)).toBe(1);
    expect(doorTarget(true, false, HOLD_S + 1)).toBe(0);
  });
});

describe('CorridorDoors', () => {
  it('lifts a bore door when it opens and drops it when it shuts; swings a bridge leaf', () => {
    const g = group(), d = new CorridorDoors(), groups = new Map([['r1', g]]);
    for (let i = 0; i < 60; i++) d.update(0.1, [c], groups, true, []);            // night, nobody about: shut
    expect(d.openness('r1', 0)).toBe(0);
    expect(g.children[0].position.y).toBeCloseTo(0, 6);
    expect(g.children[2].rotation.y).toBeCloseTo(0.5, 6);
    for (let i = 0; i < 30; i++) d.update(0.1, [c], groups, true, [[0.5, 0]]);    // the family at the near portal: opens it, not the far one
    expect(d.openness('r1', 0)).toBeCloseTo(1, 6);
    expect(d.openness('r1', 1)).toBe(0);
    expect(g.children[0].position.y).toBeCloseTo(3, 6);
    expect(g.children[2].rotation.y).toBeCloseTo(0.5 + 1.6, 6);
    for (let i = 0; i < 100; i++) d.update(0.1, [c], groups, true, []);           // they have gone: it closes behind them
    expect(d.openness('r1', 0)).toBe(0);
  });
  it('stands open by day', () => {
    const g = group(), d = new CorridorDoors();
    d.update(0.1, [c], new Map([['r1', g]]), false, []);
    expect(d.openness('r1', 1)).toBe(1);
  });
  it('takes a few moments to open (it does not snap)', () => {
    const g = group(), d = new CorridorDoors(), groups = new Map([['r1', g]]);
    for (let i = 0; i < 60; i++) d.update(0.1, [c], groups, true, []);
    d.update(0.2, [c], groups, true, [[0.5, 0]]);
    expect(d.openness('r1', 0)).toBeGreaterThan(0);
    expect(d.openness('r1', 0)).toBeLessThan(0.5);
  });
  it('a raid at a door: shut while the crew works at it, forced open when they are through', () => {
    const g = group(), d = new CorridorDoors(), groups = new Map([['r1', g]]);
    for (let i = 0; i < 30; i++) d.update(0.1, [c], groups, false, []);              // day: open
    d.force({ id: 'r1', end: 0, open: false });
    for (let i = 0; i < 30; i++) d.update(0.1, [c], groups, false, []);
    expect(d.openness('r1', 0)).toBe(0);
    expect(d.openness('r1', 1)).toBe(1);
    d.force({ id: 'r1', end: 0, open: true });
    for (let i = 0; i < 30; i++) d.update(0.1, [c], groups, true, []);
    expect(d.openness('r1', 0)).toBe(1);
    d.force(null);
    for (let i = 0; i < 200; i++) d.update(0.1, [c], groups, true, []);
    expect(d.openness('r1', 0)).toBe(0);
  });
});
