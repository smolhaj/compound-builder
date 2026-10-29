import { afterEach, describe, expect, it } from 'vitest';
import { makeLotSite, siteLot } from './lotListing';
import { calendarOf, dayIndex, newGame, type GameState, type Structure } from './state';
import { planStructure } from './construction';
import { BLUEPRINTS } from './blueprints';
import { gradedBlueprint, gradeBucket } from './slope';
import { planRun } from './perimeter';
import { FX, mudFactor, muddy } from './terrainFx';
import { drainLineFor, undrained } from './drainage';
import { WALL, plansOf, restackPallets, retainingLines, slumpDay, slumpRisks, slumped, wallHoldSeconds, wallHoldsAt, wallOf, wallPallets, walls } from './retaining';
import { setGroundOverride } from './terrainState';
import { RW } from './retainPlan';
import { landSuggestions } from './guidance';

afterEach(() => setGroundOverride(null));

/** A hillside place with a spot that has a wall of the height asked for (tall: 2.4 m or more; low: a wall that is under it). */
function find(tall: boolean): { g: GameState; spot: [number, number] } {
  for (let seed = 1; seed < 80; seed++) {
    const site = makeLotSite({ kind: 'hillside', relief: tall ? 14 : 10, elevM: 1800, seed });
    const g = newGame(7); g.site = { ...site, creek: false };
    const h = g.site.home;
    for (let x = h.x0 + 6; x < h.x1 - 6; x += 2) for (let z = h.z0 + 6; z < h.z1 - 6; z += 2) {
      const st = planStructure(g, 'workshop', x, z, 0);
      const w = wallOf(g, st);
      const ok = !!w && w.heightM >= (tall ? RW.TALL_M + 0.2 : 0.9) && (tall || w.heightM < RW.TALL_M - 0.3) && (st.grade ?? 0) >= 0.12;
      g.structures.pop(); g.nextId--;
      if (ok) return { g, spot: [x, z] };
    }
  }
  throw new Error('no hillside pad found');
}
const day = (g: GameState, doy: number) => { for (let t = 0; t < 800; t++) { g.clock.t = t + 0.25; if (calendarOf(g.clock).doy === doy) return; } throw new Error('no such day'); };
const stake = (g: GameState, x: number, z: number, kind = 'workshop'): Structure => planStructure(g, kind, x, z, 0);
const stage = (st: Structure, id: string) => { const bp = BLUEPRINTS[st.kind]; st.stage = bp.stages.findIndex(x => x.id === id); };

describe('retaining walls: the wall is what the foundation pays for', () => {
  it('a building on a slope has a wall plan; none on level ground or with no lot', () => {
    const { g, spot } = find(false);
    const st = stake(g, ...spot);
    const w = wallOf(g, st)!;
    expect(w).toBeTruthy();
    expect(w.heightM).toBeGreaterThan(0.5);
    expect(w.lenM).toBeGreaterThan(10);
    expect(plansOf(g).get(st.id)).toBe(w.plan);
    const flat = newGame(3);
    const f = planStructure(flat, 'workshop', 20, 20, 0);
    expect(wallOf(flat, f)).toBeNull();
    expect(plansOf(flat).size).toBe(0);
  });

  it('it is not charged twice: the pallets are the retaining-wall band of the graded blueprint, and the wall rises with that stage', () => {
    const { g, spot } = find(false);
    const st = stake(g, ...spot);
    const bp = BLUEPRINTS.workshop, gb = gradedBlueprint(bp, st.grade!);
    const extra = (gb.stages.find(x => x.id === 'foundation')!.materials.fieldstone ?? 0) - (bp.stages.find(x => x.id === 'foundation')!.materials.fieldstone ?? 0);
    expect(extra).toBe(2 * gradeBucket(st.grade!) ** 2);
    expect(wallOf(g, st)!.pallets).toBe(extra);
    expect(wallPallets({ grade: undefined }, 70)).toBe(20);       // a building that came with the land: from the face
    expect(wallOf(g, st)!.state).toBe('planned');
    stage(st, 'foundation');
    expect(wallOf(g, st)!.state).toBe('building');
    st.stage = BLUEPRINTS.workshop.stages.findIndex(x => x.id === 'foundation') + 1;
    expect(wallOf(g, st)!.state).toBe('standing');
    st.stage = 99;
    expect(wallOf(g, st)!.state).toBe('standing');
  });
});

describe('a finished wall holds the slope', () => {
  it('there is mud behind the cut until the wall stands (thaw), and none after it', () => {
    const { g, spot } = find(false);
    const st = stake(g, ...spot);
    day(g, 100);
    expect(muddy(g, st)).toBe(true);
    expect(mudFactor(g, st)).toBe(FX.MUD_SLOW);
    stage(st, 'foundation');
    expect(muddy(g, st)).toBe(true);                    // the wall is going up: not yet
    st.stage++;
    expect(wallHoldsAt(g, st.x, st.z)).toBe(true);
    expect(muddy(g, st)).toBe(false);
    expect(muddy(g, st, true)).toBe(false);             // nor in a storm
    expect(mudFactor(g, st, true)).toBe(1);
    expect(undrained(g)).not.toContain(st);             // it is not a building with nothing to turn the runoff any more
  });

  it('a tall wall holds only with a drainage channel near it', () => {
    const { g, spot } = find(true);
    const st = stake(g, ...spot);
    st.stage = 99;
    const w = wallOf(g, st)!;
    expect(w.tall).toBe(true);
    day(g, 100);
    expect(wallHoldsAt(g, st.x, st.z)).toBe(false);
    expect(muddy(g, st)).toBe(true);
    expect(undrained(g)).toContain(st);
    const line = drainLineFor(g, st)!;
    const run = planRun(g, 'drain_channel', line); run.finishedAt = 0;
    expect(wallHoldsAt(g, st.x, st.z)).toBe(true);
    expect(muddy(g, st)).toBe(false);
  });
});

describe('a tall wall with no drainage can let go', () => {
  it('slumps in the thaw or a rain storm, never when drained, never a short wall, and never in a dry season', () => {
    const { g, spot } = find(true);
    const st = stake(g, ...spot); st.stage = 99;
    expect(slumpRisks(g).map(x => x.st)).toContain(st);
    // high summer, no storm: nothing
    day(g, 220);
    for (let i = 0; i < 400; i++) { g.clock.t += 1; if (calendarOf(g.clock).doy >= 60 && calendarOf(g.clock).doy <= 150) continue; expect(slumpDay(g, false)).toEqual([]); }
    // a run of storm days: it goes
    let lines: string[] = [];
    for (let i = 0; i < 120 && !lines.length; i++) { g.clock.t += 1; lines = slumpDay(g, true); }
    expect(lines.join(' ')).toMatch(/let go in the rain/);
    expect(st.slumpedAt).toBeDefined();
    expect(wallOf(g, st)!.state).toBe('slumped');
    expect(wallHoldsAt(g, st.x, st.z)).toBe(false);
    expect(slumped(g)).toHaveLength(1);
    expect(retainingLines(g).join(' ')).toMatch(/is down/);
    // short walls and drained walls are safe
    const { g: g2, spot: sp2 } = find(false); const low = stake(g2, ...sp2); low.stage = 99;
    for (let i = 0; i < 300; i++) { g2.clock.t += 1; expect(slumpDay(g2, true)).toEqual([]); }
    const { g: g3, spot: sp3 } = find(true); const t3 = stake(g3, ...sp3); t3.stage = 99;
    planRun(g3, 'drain_channel', drainLineFor(g3, t3)!).finishedAt = 0;
    for (let i = 0; i < 300; i++) { g3.clock.t += 1; expect(slumpDay(g3, true)).toEqual([]); }
  });

  it('is restacked after a few days from the yard stone (a quarter of what the wall cost), and waits without it', () => {
    const { g, spot } = find(true);
    const st = stake(g, ...spot); st.stage = 99;
    st.slumpedAt = dayIndex(g.clock.t);
    const need = restackPallets(wallOf(g, st)!);
    expect(need).toBeGreaterThanOrEqual(1);
    g.stock.fieldstone = need - 1;
    g.clock.t += WALL.RESTACK_DAYS + 1;
    expect(slumpDay(g, false)).toEqual([]);
    expect(st.slumpedAt).toBeDefined();
    g.stock.fieldstone = need + 2;
    expect(slumpDay(g, false).join(' ')).toMatch(/restacked/);
    expect(st.slumpedAt).toBeUndefined();
    expect(g.stock.fieldstone).toBe(2);
  });
});

describe('raiders and tall walls', () => {
  it('each standing tall wall holds a crew a few seconds, two at most; a short one does not', () => {
    const { g, spot } = find(true);
    expect(wallHoldSeconds(g)).toBe(0);
    const a = stake(g, ...spot); a.stage = 99;
    expect(wallHoldSeconds(g)).toBe(WALL.HOLD);
    const b = stake(g, spot[0] + 14, spot[1]); b.stage = 99;
    const c = stake(g, spot[0] - 14, spot[1]); c.stage = 99;
    expect(wallHoldSeconds(g)).toBeLessThanOrEqual(WALL.HOLD * WALL.HOLD_MAX);
    expect(walls(g).length).toBeGreaterThanOrEqual(1);
    const { g: g2, spot: sp2 } = find(false);
    stake(g2, ...sp2).stage = 99;
    expect(wallHoldSeconds(g2)).toBe(0);
    void siteLot;
  });
});

describe('the cards', () => {
  it('the slope card says how big the wall is and that the foundation pays for it; a fallen wall has its own card with the stone to order', () => {
    const { g, spot } = find(true);
    const st = stake(g, ...spot);
    g.stock.fieldstone = 0;
    const card = landSuggestions(g).find(c => c.id === 'retaining');
    expect(card?.why).toMatch(/dry-stack wall \(up to [\d.]+ m high/);
    expect(card?.why).toMatch(/paid for by those pallets/);
    st.stage = 99;
    st.slumpedAt = dayIndex(g.clock.t);
    const down = landSuggestions(g).find(c => c.id === 'wall_down');
    expect(down?.title).toMatch(/came down/);
    expect(down?.acts?.[0].label).toMatch(/Order \d+ pallets? of fieldstone/);
  });
});
