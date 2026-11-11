import { describe, expect, it } from 'vitest';
import type { Battle, BattleEvent, BattleUnit } from './battleTypes';
import { voiceMoments } from './momentVoices';
import { LineDirector, resetRaidMemory, LINES } from './raidDialogue';
import { scenes } from './cutFixtures';

const unit = (id: string, side: 'home' | 'raider', extra: Partial<BattleUnit> = {}): BattleUnit => ({ id, side, x: 0, z: 0, post: 'open', ...extra });
const base = (events: BattleEvent[]): Battle => ({ night: true, duration: 60, units: [unit('h_a', 'home', { traits: { trauma: 0, stress: 0, grief: 0, experience: 0, veteran: false, firstFight: true, courage: 'freezes', kin: [{ id: 'p2', name: 'Maya', rel: 'sister' }], history: [] } }), unit('h_b', 'home'), unit('r0', 'raider'), unit('r1', 'raider'), unit('r2', 'raider')], events });

describe('moment voices', () => {
  it('every marked moment gets a line from the right person, in the right words', () => {
    resetRaidMemory();
    const b = base([
      { t: 2, kind: 'scout', units: ['r1', 'r2'], spotted: true, intel: false },
      { t: 5, kind: 'reload', unit: 'h_b', secs: 2 }, { t: 8, kind: 'jam', unit: 'r0', secs: 3 },
      { t: 12, kind: 'panic', unit: 'h_a', how: 'freeze', secs: 5, kin: true },
      { t: 20, kind: 'heroic', unit: 'h_b', act: 'drag', for: 'h_a' },
      { t: 25, kind: 'flare', x: 0, z: 0, by: 'r0', secs: 8 },
      { t: 30, kind: 'diversion', decoys: ['r2'], from: { x: 1, z: 1 }, until: 30, pulled: ['h_b'] },
      { t: 40, kind: 'withdraw', units: ['r0', 'r1'], carrying: [], why: 'losses' },
    ]);
    const out = voiceMoments(b, new LineDirector(3), id => (id === 'h_a' ? 'Maya' : undefined));
    const says = out.events.filter(e => e.kind === 'say') as Extract<BattleEvent, { kind: 'say' }>[];
    const ctxs = says.map(s => s.ctx);
    for (const c of ['scouting', 'reload', 'jam', 'panic_freeze', 'heroic_drag', 'flare_up', 'decoy', 'pull_out']) expect(ctxs, c).toContain(c);
    expect(says.find(s => s.ctx === 'scouting')!.who).toBe('r1');
    expect(says.find(s => s.ctx === 'panic_freeze')!.who).toBe('h_a');
    // the kin line names the one who fell
    expect(says.find(s => s.ctx === 'panic_freeze')!.text).toMatch(/Maya|sister/i);
    // nobody repeats
    expect(new Set(says.map(s => s.text)).size).toBe(says.length);
  });
  it('does not talk over a line the sim wrote, and is deterministic', () => {
    const ev: BattleEvent[] = [{ t: 5, kind: 'reload', unit: 'h_b', secs: 2 }, { t: 5.2, kind: 'say', text: 'Reloading, cover me!', who: 'h_b' }];
    resetRaidMemory();
    expect(voiceMoments(base(ev), new LineDirector(1)).events.filter(e => e.kind === 'say').length).toBe(1);
    resetRaidMemory();
    const a = JSON.stringify(voiceMoments(base([{ t: 5, kind: 'jam', unit: 'r0', secs: 2 }]), new LineDirector(4)));
    resetRaidMemory();
    expect(JSON.stringify(voiceMoments(base([{ t: 5, kind: 'jam', unit: 'r0', secs: 2 }]), new LineDirector(4)))).toBe(a);
  });
  it('has ten or more lines for each defender moment, and works on whole sim scenes', () => {
    for (const c of ['reload', 'jam', 'panic_freeze', 'heroic_cover', 'heroic_drag'] as const) expect(new Set(Object.values(LINES.defender[c] ?? {}).flatMap(v => v ?? [])).size, c).toBeGreaterThanOrEqual(8);
    resetRaidMemory();
    const { battles } = scenes(2, 2.25, 'gang', 10, 'hard');
    for (const b of battles) {
      const out = voiceMoments(b, new LineDirector(9));
      const said = out.events.filter(e => e.kind === 'say' && e.who);
      expect(new Set(said.map(e => (e as { text: string }).text)).size).toBe(said.length);
    }
  }, 60000);
});
