import { describe, expect, it } from 'vitest';
import { demoBattle } from './demoBattle';

describe('demoBattle', () => {
  it('makes a sorted raid with the expected beats', () => {
    const b = demoBattle([{ kind: 'house', x: 30, z: 30 }], [{ id: 'p1' }, { id: 'p2' }, { id: 'k', kid: true }]);
    expect(b.units.filter(u => u.side === 'raider')).toHaveLength(6);
    expect(b.units.filter(u => u.side === 'home')).toHaveLength(4);
    for (let i = 1; i < b.events.length; i++) expect(b.events[i].t).toBeGreaterThanOrEqual(b.events[i - 1].t);
    for (const k of ['alarm', 'lights', 'shot', 'mine', 'wound', 'flee', 'end', 'cover', 'throw', 'rocket', 'explosion']) expect(b.events.some(e => e.kind === k)).toBe(true);
    const ids = new Set(b.units.map(u => u.id));
    for (const e of b.events) if (e.kind === 'shot') { expect(ids.has(e.from)).toBe(true); expect(ids.has(e.to)).toBe(true); }
  });
});
