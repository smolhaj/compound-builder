import { describe, expect, it } from 'vitest';
import { scenes as stage, game, enc } from './cutFixtures';
import { stageRaid } from './raidCutscene';
import { raidClass } from './raidLength';

function totals(hour: number, kind: 'looters' | 'gang' | 'militia', size: number, temper: 'desperate' | 'hard' | 'savage') {
  const rows: Array<{ s: number; cls: string }> = [];
  for (let seed = 1; seed <= 10; seed++) {
    const g = game(seed, hour); g.gate.pending = enc(kind, size, temper, Math.floor(g.clock.t));
    const st = stageRaid(g, 'defend');
    const broke = st.battles.some(b => b.events.some(e => e.kind === 'breach')) && st.battles.some(b => b.events.some(e => e.kind === 'end' && (e.result === 'breached' || e.result === 'overrun')));
    rows.push({ s: st.plan.totalReal, cls: raidClass({ scenes: st.plan.scenes.length, crew: size, broke }) });
  }
  return rows;
}

describe('how long a raid plays', () => {
  it('classes: a break of the line is an invasion; several scenes or a big crew is serious; the rest a skirmish', () => {
    expect(raidClass({ scenes: 1, crew: 4, broke: false })).toBe('skirmish');
    expect(raidClass({ scenes: 3, crew: 4, broke: false })).toBe('serious');
    expect(raidClass({ scenes: 1, crew: 10, broke: false })).toBe('serious');
    expect(raidClass({ scenes: 1, crew: 4, broke: true })).toBe('invasion');
  });
  it('a skirmish plays about a minute, a serious raid three to four, a full invasion no more than six', () => {
    const sk = totals(12.5, 'looters', 4, 'desperate').filter(r => r.cls === 'skirmish');
    const se = totals(2.25, 'gang', 10, 'hard').filter(r => r.cls === 'serious');
    const inv = totals(2.25, 'gang', 12, 'savage').filter(r => r.cls === 'invasion');
    expect(sk.length).toBeGreaterThan(0); expect(se.length).toBeGreaterThan(0); expect(inv.length).toBeGreaterThan(0);
    const med = (a: Array<{ s: number }>) => a.map(x => x.s).sort((p, q) => p - q)[Math.floor(a.length / 2)];
    expect(med(sk), 'skirmish').toBeGreaterThan(40); expect(med(sk), 'skirmish').toBeLessThan(100);
    expect(med(se), 'serious').toBeGreaterThan(120);   // (walls/hide balance pass: 150 before; a wall that holds ends a serious raid in a standoff that plays shorter than the old climb-and-breach, a median near 135 s)
    expect(med(se), 'serious').toBeLessThan(270);
    expect(med(inv), 'invasion').toBeGreaterThan(210); expect(med(inv), 'invasion').toBeLessThan(360);
    for (const r of inv) expect(r.s).toBeLessThan(380);
  }, 240000);
  void stage;
});
