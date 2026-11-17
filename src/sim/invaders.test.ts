import { describe, expect, it } from 'vitest';
import { INVADERS, INVADER_VARIANT, REGION_LEAN, invaderStrings, pickInvader, primaryInvader, type InvaderId } from './invaders';
import { REGION_IDS } from './regions';
import { newGame, type GameState } from './state';
import { fxOnHit, fxMakeExtra, fxStanceLabels, fxRadio } from './disasterFx';
import { fxOf, invaderIn } from './orderEncounters';
import { resolve, type Stance } from './encounters';
import { mulberry32 } from './rng';
import { dayCard } from './dayCard';

const EXPECT: Record<string, InvaderId> = { pnw: 'china', desert: 'china', mountain_west: 'china', north_woods: 'russia', upper_midwest: 'russia', new_england: 'russia', rust_belt: 'russia', appalachia: 'russia', plains: 'russia', ozarks: 'axis', hill_country: 'axis' };

describe('region to invader', () => {
  it('every region has a lean and the primary matches the owner decision', () => {
    for (const r of REGION_IDS) { expect(REGION_LEAN[r]).toBeDefined(); expect(primaryInvader(r)).toBe(EXPECT[r]); }
  });
  it('most seeds go with the lean; a variant forces the invader', () => {
    for (const r of REGION_IDS) { let n = 0; for (let s = 1; s <= 200; s++) if (pickInvader(r, undefined, s) === EXPECT[r]) n++; expect(n).toBeGreaterThan(90); }
    for (const [v, id] of Object.entries(INVADER_VARIANT)) expect(pickInvader('pnw', v, 5)).toBe(id);
    expect(pickInvader('pnw', 'soft', 7)).toBe(pickInvader('pnw', 'contested', 7));
  });
});

describe('invader text', () => {
  const all = Object.values(INVADERS).flatMap(d => invaderStrings(d));
  const BLOCK = ['gook', 'chink', 'ruskie', 'russkie', 'commie', 'red menace', 'horde', 'subhuman', 'vermin', 'orcs', 'savages', 'barbarians', 'yellow peril', 'inscrutable', 'broken english', 'kommandantur', 'ausweis', 'gestapo', 'wehrmacht'];
  it('no stereotyping words and no WWII German terms', () => {
    for (const s of all) for (const w of BLOCK) expect(s.toLowerCase(), s).not.toContain(w);
  });
  it('American English, no metric or audio words', () => {
    for (const s of all) { expect(s).not.toMatch(/\b(colour|neighbour|metres?|kilometres?|armour)\b/i); expect(s).not.toMatch(/\b(sound|audio|hear the)\b/i); }
  });
  it('the card code no longer uses the German term', async () => {
    const src = (await import('./orderEncounters.ts?raw')).default as string;
    expect(src).not.toMatch(/Kommandantur|Ausweis/);
  });
});

describe('every invader plays every card', () => {
  const KINDS = ['checkpoint_stop', 'quota', 'draft_notice', 'fugitive', 'partisan', 'informant', 'lost_soldier'] as const;
  for (const v of Object.keys(INVADER_VARIANT)) it(v, () => {
    const mk = (): GameState => { const g = newGame(1, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'invasion', variant: v }); g.clock.t = g.disaster.hitAt + 70; g.disaster.phase = 'impact'; g.people[0].body = 'm'; g.people[0].age = 30; g.people[0].kid = false; fxOnHit(g); fxOf(g).tier = 3; fxOf(g).maxTier = 3; g.stock.canned = 40; g.stock.fuel = 10; g.stock.meds = 4; g.stock.staples = 8; g.money = 20000; g.disaster.tracks.banks = 1; return g; };
    const g0 = mk(); expect(invaderIn(g0)!.id).toBe(INVADER_VARIANT[v]);
    expect(fxOnHit(g0)[0]).toContain(v === 'pacific' ? 'Chinese' : v === 'northern' ? 'Russian' : 'coalition');
    expect(dayCard(g0)!.headline.length).toBeGreaterThan(10);
    for (const k of KINDS) {
      const c0 = fxMakeExtra(g0, k, mulberry32(3), 'e3', Math.floor(g0.clock.t)); expect(c0, k).not.toBeNull();
      for (const st of c0!.stances) {
        const g = mk(); const e = fxMakeExtra(g, k, mulberry32(3), 'e3', Math.floor(g.clock.t))!; g.gate.pending = e;
        const lab = fxStanceLabels(g, e); if (lab) expect(lab[st], `${k}/${st} label`).toBeTruthy();
        const o = resolve(g, st as Stance); expect(o.title.length).toBeGreaterThan(0); expect(g.gate.pending).toBeNull();
      }
    }
    const b = fxRadio(g0, { day: 70, r: mulberry32(2), once: () => true }); expect(b?.text.length).toBeGreaterThan(5);
  });
});
