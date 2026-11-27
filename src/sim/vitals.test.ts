import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { planStructure } from './construction';
import { triggerDisaster } from './disaster';
import { compoundBoard } from './compoundBoard';
import { chipAria, topChips } from './vitals';
import { CHIP_ORDER } from './topBarPlan';

const fresh = (): GameState => { const g = newGame(11); g.structures = []; g.perimeter = []; g.site = { ...g.site, gwDepth: 5 }; return g; };
const done = (g: GameState, kind: string, x = 0, z = 0) => { const st = planStructure(g, kind, x, z, 0)!; st.finishedAt = 0; st.stage = 99; return st; };
const chips = (g: GameState) => topChips(g, compoundBoard(g));

describe('top-bar chips', () => {
  it('a fresh start has the nine chips in priority order and no owe chip', () => {
    const c = chips(fresh());
    expect(c.map(x => x.id)).toEqual(CHIP_ORDER.filter(i => i !== 'debt'));
    for (const x of c) { expect(x.full.length + x.compact.length, x.id).toBeGreaterThan(0); expect(x.label).not.toBe(''); }
  });
  it('tones agree with the compound board vitals (one source of truth)', () => {
    const g = fresh(); done(g, 'timber_cabin'); done(g, 'well_hand', 6, 0);
    const b = compoundBoard(g), c = chips(g);
    for (const id of ['power', 'water', 'food', 'defense', 'morale'] as const) expect(c.find(x => x.id === id)!.tone, id).toBe(b.vitals.find(v => v.id === id)!.tone);
  });
  it('a working well with empty tanks reads "OK", not "0 d"', () => {
    const g = fresh(); done(g, 'timber_cabin'); done(g, 'well_hand', 6, 0);
    const b = compoundBoard(g), w = chips(g).find(x => x.id === 'water')!, v = b.vitals.find(x => x.id === 'water')!;
    if (v.tone === 'good' && v.value.startsWith('a working source')) { expect(w.compact).toBe('OK'); expect(w.full).toBe('Source OK'); }
    else expect(w.compact).toMatch(/\d/);
  });
  it('food shows the board day count; defense shows the label and score; morale the average', () => {
    const g = fresh(); const b = compoundBoard(g), c = chips(g);
    expect(c.find(x => x.id === "food")!.full).toMatch(new RegExp(`^${b.vitals.find(v => v.id === "food")!.n} days?$`));
    expect(c.find(x => x.id === 'defense')!.compact).toBe(String(b.vitals.find(v => v.id === 'defense')!.n));
    expect(c.find(x => x.id === 'morale')!.full).toBe(`Mood ${b.vitals.find(v => v.id === 'morale')!.n}`);
  });
  it('the owe chip appears with a card debt of $25 or more, right after cash, as a problem', () => {
    const g = fresh(); g.fin.debt = { owed: 400, stage: 'card', lien: false } as unknown as NonNullable<GameState['fin']['debt']>;
    const c = chips(g);
    expect(c.map(x => x.id).slice(0, 3)).toEqual(['threat', 'cash', 'debt']);
    expect(c[2].tone).not.toBe('good'); expect(c[2].full).toContain('$400');
  });
  it('cash turns amber when low and red when negative; a problem tone always has a glyph in the accessible name', () => {
    const g = fresh(); g.money = 100; expect(chips(g).find(x => x.id === 'cash')!.tone).toBe('warn');
    g.money = -5; const cash = chips(g).find(x => x.id === 'cash')!; expect(cash.tone).toBe('bad'); expect(chipAria(cash)).toContain('critical');
    g.money = 9000; expect(chipAria(chips(g).find(x => x.id === 'cash')!)).not.toMatch(/critical|attention/);
  });
  it('the threat chip is quiet in peace and counts down through a warned disaster', () => {
    const g = fresh();
    const calm = chips(g)[0]; expect(calm.id).toBe('threat'); expect(calm.quiet).toBe(true); expect(calm.tone).toBe('good');
    triggerDisaster(g.disaster, g.clock.t, 'grid_down', g.seed, 10);
    g.clock.t = g.disaster.warnAt + 0.5;
    const warned = chips(g)[0];
    expect(warned.full).toMatch(/Impact/); expect(warned.tone).not.toBe('good'); expect(warned.bar).toBeGreaterThanOrEqual(0); expect(warned.compact).toMatch(/\d/);
    g.clock.t = g.disaster.hitAt + 1;
    expect(chips(g)[0].full).toMatch(/Day \d|Wave/);
  });
  it('every fix and click is an act the HUD can run', () => {
    const g = fresh(); triggerDisaster(g.disaster, g.clock.t, 'grid_down', g.seed, 10); g.clock.t = g.disaster.warnAt + 0.5;
    for (const c of chips(g)) {
      expect(['open', 'select', 'stake', 'shop', 'order', 'board']).toContain(c.open.type);
      if (c.fix) expect(['open', 'select', 'stake', 'shop', 'order', 'board']).toContain(c.fix.act.type);
    }
  });
  it('Needs counts the board decisions and gaps and lists them', () => {
    const g = fresh(); const b = compoundBoard(g), n = chips(g).find(x => x.id === 'needs')!;
    expect(n.full).toBe(String(b.decisions.length + b.gaps.length)); expect(n.items?.length).toBe(b.decisions.length + b.gaps.length);
  });
});
