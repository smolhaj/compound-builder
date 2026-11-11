/**
 * The people of the house talk like themselves (user: an untrained family never gives tactical orders; a veteran keeps it calm and short; a child says
 * a few frightened words or nothing). Unit tests on the picker, and whole prepared scenes checked line by line.
 */
import { describe, expect, it } from 'vitest';
import type { BattleUnit } from './battleTypes';
import { CURSE, LineDirector, TACTICAL, profileOfUnit, resetRaidMemory, rolePool, type Ctx } from './raidDialogue';
import { scenes, prepared } from './cutFixtures';

const BANNED = /covering fire|cover fire|suppressing|suppress|flank|tango|breach|perimeter/i;
const unit = (id: string, extra: Partial<BattleUnit> = {}): BattleUnit => ({ id, side: 'home', x: 0, z: 0, post: 'open', ...extra });
const civ = unit('h_civ'), kid = unit('h_kid', { civilian: true });
const vet = unit('h_vet', { traits: { trauma: 0, stress: 0, grief: 0, experience: 8, veteran: true, firstFight: false, courage: 'heroic', kin: [], history: ['veteran'] } });
const DEF_CTX = ['approach', 'first_shots', 'fight', 'defender_hit', 'mate_down', 'hold_room', 'cover_fire', 'funnel', 'last_stand', 'rally', 'pie_corner', 'fallback_stage', 'wounded_fallback', 'hide', 'freeze', 'shield', 'come_out', 'captive', 'reload', 'jam', 'dry', 'breach', 'fire', 'held', 'plead', 'tend', 'tended', 'retreat', 'aftermath', 'kill', 'heroic_cover', 'heroic_drag', 'heroic_avenge'] as const;

function lines(who: BattleUnit, ctx: Ctx, n = 40): string[] {
  const out: string[] = [];
  for (let seed = 1; seed <= n; seed++) {
    resetRaidMemory();
    const d = new LineDirector(seed); d.noteUnits([who, civ, kid, vet]);
    const t = d.pick('defender', ctx, { speaker: who.id, vars: { n: 'Elena', w: 'arm', c: 'Dad', item: 'food' } });
    if (t) out.push(t);
  }
  return out;
}

describe('who is speaking', () => {
  it('reads the voice from the traits: a child, an untrained adult, a veteran', () => {
    expect(profileOfUnit(kid)).toBe('kid'); expect(profileOfUnit(civ)).toBe('civ'); expect(profileOfUnit(vet)).toBe('vet');
    expect(profileOfUnit(unit('h_x', { traits: { trauma: 0, stress: 0, grief: 0, experience: 7, veteran: false, firstFight: false, courage: 'steady', kin: [], history: [] } }))).toBe('vet');   // a hunter with a high shot
    expect(profileOfUnit(unit('h_g', { traits: { trauma: 0, stress: 0, grief: 0, experience: 2, veteran: false, firstFight: false, courage: 'steady', kin: [], history: ['guard'] } }))).toBe('vet');
    expect(profileOfUnit(undefined)).toBe('civ');
  });
  it('an untrained adult never gets tactical talk, in any moment of the fight', () => {
    for (const ctx of DEF_CTX) for (const t of lines(civ, ctx)) { expect(t, `${ctx}: "${t}"`).not.toMatch(BANNED); expect(t, `${ctx}: "${t}"`).not.toMatch(TACTICAL); }
  });
  it('a child says a few frightened words or nothing', () => {
    for (const ctx of DEF_CTX) for (const t of lines(kid, ctx)) { expect(t.split(/\s+/).length, `${ctx}: "${t}"`).toBeLessThanOrEqual(8); expect(t).not.toMatch(TACTICAL); }
    expect(lines(kid, 'approach').length).toBeGreaterThan(0);
  });
  it('a veteran may use plain tactical words, short and calm', () => {
    const cf = lines(vet, 'cover_fire'); expect(cf.length).toBeGreaterThan(0); expect(cf.some(t => /cover|go|move/i.test(t))).toBe(true);
    for (const ctx of ['first_shots', 'hold_room', 'reload'] as const) for (const t of lines(vet, ctx)) expect(t.split(/\s+/).length, `${ctx}: "${t}"`).toBeLessThanOrEqual(14);
    expect(rolePool('defender', 'cover_fire')?.vet?.length).toBeGreaterThan(0);
  });
  it('the untrained speak differently from the veteran in the same moment', () => {
    for (const ctx of ['first_shots', 'hold_room', 'reload', 'fallback_stage'] as const) {
      const a = new Set(lines(civ, ctx)), b = new Set(lines(vet, ctx));
      expect([...b].some(t => !a.has(t)), ctx).toBe(true);
    }
  });
});

describe('swearing fits the person', () => {
  const elder = unit('h_old', { traits: { trauma: 0, stress: 0, grief: 0, experience: 1, veteran: false, firstFight: true, courage: 'steady', kin: [], history: ['elder'] } });
  it('a scared adult swears sometimes, not in every line', () => {
    const all = DEF_CTX.flatMap(c => lines(civ, c));
    const sw = all.filter(t => CURSE.test(t)).length;
    expect(sw).toBeGreaterThan(5); expect(sw / all.length).toBeLessThan(0.3);
  });
  it('a child never swears, an old devout person prays instead', () => {
    for (const c of DEF_CTX) for (const t of lines(kid, c)) expect(t).not.toMatch(CURSE);
    const old = DEF_CTX.flatMap(c => lines(elder, c));
    expect(old.some(t => CURSE.test(t))).toBe(false);
    expect(old.some(t => /Lord|God help|Our Father|Hail Mary|Dear God/.test(t))).toBe(true);
  });
  it('a veteran stays calm: a curse only when hit', () => {
    for (const c of DEF_CTX) if (c !== 'defender_hit') for (const t of lines(vet, c)) expect(t, c).not.toMatch(CURSE);
  });
});

describe('whole scenes: nobody untrained is given a fire team\'s words', () => {
  for (const [label, hour, kind, size, temper] of [['night gang', 2.25, 'gang', 10, 'savage'], ['day raid', 12.5, 'gang', 8, 'hard'], ['invasion', 2.25, 'gang', 12, 'savage']] as const) for (const seed of [3, 5, 8]) {
    it(`${label} seed ${seed}`, () => {
      const { g, battles } = scenes(seed, hour, kind, size, temper, 'log_palisade');
      for (const b0 of battles) {
        const b = prepared(b0, g, seed * 17);
        for (const e of b.events) {
          if (e.kind !== 'say' || !e.who?.startsWith('h_')) continue;
          const u = b.units.find(x => x.id === e.who);
          if (profileOfUnit(u) === 'vet') continue;
          expect(e.text, `${label} s${seed} ${e.who} (${e.ctx ?? 'sim line'}) says "${e.text}"`).not.toMatch(BANNED);
        }
      }
    }, 90000);
  }
});
