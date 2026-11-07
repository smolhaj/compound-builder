import { describe, expect, it } from 'vitest';
import { dragTheWounded } from './fightPoses';
import type { Battle } from './battleTypes';

const units = (n: number): Battle['units'] => Array.from({ length: n }, (_, i) => ({ id: `h${i}`, side: 'home' as const, personId: `p${i}`, x: i * 0.8, z: 0, post: 'open' as const }));
describe('dragging the wounded during the fight', () => {
  it('a mate crosses to a man hit hard, lifts him, carries him toward the house and sets him down', () => {
    const b: Battle = { night: true, duration: 40, units: units(4), events: [{ t: 10, kind: 'wound', unit: 'h1', sev: 60, part: 'leg' }] };
    const o = dragTheWounded(b, { x: -8, z: 0 });
    const lift = o.events.find(e => e.kind === 'lift'), lower = o.events.find(e => e.kind === 'lower');
    expect(lift && lift.kind === 'lift' && lift.unit).toBe('h1');
    expect(lower).toBeTruthy();
    expect(o.events.find(e => e.kind === 'move' && e.walk && e.near?.unit === 'h1')).toBeTruthy();
    for (let i = 1; i < o.events.length; i++) expect(o.events[i].t).toBeGreaterThanOrEqual(o.events[i - 1].t);
    expect(b.events).toHaveLength(1);   // the input is untouched
  });
  it('leaves alone a light wound, a man who dies of it, one the sim already carries, and a lone defender', () => {
    const light: Battle = { night: true, duration: 40, units: units(4), events: [{ t: 10, kind: 'wound', unit: 'h1', sev: 20 }] };
    expect(dragTheWounded(light, { x: -8, z: 0 })).toBe(light);
    const dies: Battle = { ...light, events: [{ t: 10, kind: 'wound', unit: 'h1', sev: 70 }, { t: 14, kind: 'death', unit: 'h1' }] };
    expect(dragTheWounded(dies, { x: -8, z: 0 })).toBe(dies);
    const carried: Battle = { ...light, events: [{ t: 10, kind: 'wound', unit: 'h1', sev: 70 }, { t: 20, kind: 'carry', unit: 'h1' }] };
    expect(dragTheWounded(carried, { x: -8, z: 0 })).toBe(carried);
    const alone: Battle = { night: true, duration: 40, units: units(2), events: [{ t: 10, kind: 'wound', unit: 'h1', sev: 70 }] };
    expect(dragTheWounded(alone, { x: -8, z: 0 })).toBe(alone);
  });
  it('at most two carries a fight', () => {
    const b: Battle = { night: true, duration: 80, units: units(6), events: [10, 30, 50].map((t, i) => ({ t, kind: 'wound' as const, unit: `h${i + 1}`, sev: 60 })) };
    expect(dragTheWounded(b, { x: -8, z: 0 }).events.filter(e => e.kind === 'lift')).toHaveLength(2);
  });
});
