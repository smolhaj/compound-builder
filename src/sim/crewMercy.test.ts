import { describe, expect, it } from 'vitest';
import { dispositionOf, doorSeconds, hidingFate, hostileVerdict, mercifulVerdict, snapOdds, temperamentOf, type Found } from './crewMercy';
import { mulberry32 } from './rng';
import { newGame } from './state';

const found = (o: Partial<Found> = {}): Found => ({ kid: false, age: 35, armed: false, down: false, complies: true, ...o });
const tally = (f: () => string, N = 4000) => { const t: Record<string, number> = {}; for (let i = 0; i < N; i++) { const k = f(); t[k] = (t[k] ?? 0) + 1; } return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, v / N])); };

describe('who is merciful', () => {
  it('savage, gangs and hordes are hostile; refugees and desperate crews merciful; hard militia, patrols and requisition teams merciful, hard looters hostile', () => {
    expect(dispositionOf('savage', 'looters')).toBe('hostile'); expect(dispositionOf('desperate', 'gang')).toBe('hostile'); expect(dispositionOf('hard', 'gang')).toBe('hostile'); expect(dispositionOf('desperate', 'horde')).toBe('hostile');
    expect(dispositionOf('desperate', 'refugees')).toBe('merciful'); expect(dispositionOf('desperate', 'militia')).toBe('merciful'); expect(dispositionOf('desperate', 'looters')).toBe('merciful');
    expect(dispositionOf('hard', 'militia')).toBe('merciful'); expect(dispositionOf('hard', 'patrol')).toBe('merciful'); expect(dispositionOf('hard', 'requisition')).toBe('merciful'); expect(dispositionOf('hard', 'looters')).toBe('hostile');
  });
});
describe('the merciful verdict', () => {
  it('always spares a child', () => { const r = mulberry32(1); for (let i = 0; i < 500; i++) expect(mercifulVerdict(found({ kid: true, age: 8 }), r)).toBe('spared'); });
  it('never spares an armed man', () => { const r = mulberry32(2); for (let i = 0; i < 1000; i++) expect(mercifulVerdict(found({ armed: true }), r)).not.toBe('spared'); });
  it('usually spares an unarmed adult who complies, and not one who fights back', () => {
    const r = mulberry32(3);
    expect(tally(() => mercifulVerdict(found(), r)).spared).toBeGreaterThan(0.8);
    expect(tally(() => mercifulVerdict(found({ complies: false }), r)).spared ?? 0).toBe(0);
  });
});
describe('the hostile verdict', () => {
  it('kills most of whom it finds, and keeps a captive now and then only when it has room', () => {
    const r = mulberry32(4);
    const adult = tally(() => hostileVerdict(found(), true, r));
    expect(adult.killed).toBeGreaterThan(0.45); expect(adult.taken).toBeGreaterThan(0.08);
    // a child: only a savage crew carries one off; another hostile crew mostly holds, sometimes kills, and sometimes lets a child be
    const kid = tally(() => hostileVerdict(found({ kid: true, age: 9 }), true, r)), kidS = tally(() => hostileVerdict(found({ kid: true, age: 9 }), true, r, true));
    expect(kid.taken ?? 0).toBe(0); expect(kid.held).toBeGreaterThan(0.4); expect(kidS.taken).toBeGreaterThan(0.4);
    expect(tally(() => hostileVerdict(found(), false, r)).taken ?? 0).toBe(0);
  });
});
describe('a hiding family', () => {
  const g = newGame(1);
  it('barricaded rooms buy time: the same crew with the same minutes finds the family less often', () => {
    const open = doorSeconds(g, { barricaded: false }), barred = doorSeconds(g, { barricaded: true });
    expect(barred).toBeGreaterThan(open);
    const r = mulberry32(5), work = (open + barred) / 2 / 1.0;
    const foundShare = (secs: number) => 1 - (tally(() => hidingFate(found({ kid: true, age: 9 }), { disposition: 'hostile' }, { workSecs: work, doorSecs: secs, canTake: true }, r)).hid ?? 0);
    expect(foundShare(open)).toBeGreaterThan(0.6); expect(foundShare(barred)).toBe(0);
  });
  it('a hardened safe room is not found in any fight', () => {
    const h = newGame(1); h.stock.safe_room_hardened = 1;
    expect(doorSeconds(h, { barricaded: false })).toBeGreaterThanOrEqual(600);
  });
  it('found, a hostile crew kills or takes them; a merciful one spares the children and the unarmed who comply', () => {
    const r = mulberry32(6), ctx = { workSecs: 100, doorSecs: 5, canTake: true };
    const host = tally(() => hidingFate(found({ kid: true, age: 9 }), { disposition: 'hostile', savage: true }, ctx, r));
    expect((host.killed ?? 0) + (host.taken ?? 0)).toBeGreaterThan(0.6);   // (a savage crew)
    const kids = tally(() => hidingFate(found({ kid: true, age: 9 }), { disposition: 'merciful' }, ctx, r));
    expect((kids.killed ?? 0) + (kids.taken ?? 0) + (kids.wounded ?? 0)).toBe(0);
    const adults = tally(() => hidingFate(found(), { disposition: 'merciful' }, ctx, r));
    expect(adults.killed ?? 0).toBe(0);
  });
  it('a merciful crew does not stay to break a door down', () => {
    const r = mulberry32(7);
    expect(tally(() => hidingFate(found(), { disposition: 'merciful' }, { workSecs: 20, doorSecs: 20, canTake: false }, r)).hid).toBe(1);
  });
});
describe('who answers a surrender with a shot', () => {
  const calm = { grief: 0, stress: 20, trauma: 0, kinFell: false, vet: true, negotiator: 6 };
  it('the calm almost never; the grieving who saw their own fall often enough to matter', () => {
    expect(snapOdds(calm)).toBeLessThan(0.02);
    expect(snapOdds({ grief: 25, stress: 90, trauma: 60, kinFell: true, vet: false, negotiator: 0 })).toBeGreaterThan(0.3);
    expect(snapOdds({ ...calm, kinFell: true })).toBeGreaterThan(snapOdds(calm));
  });
  it('is a probability and reads the person on the place', () => {
    const g = newGame(2), p = g.people[0];
    const t = temperamentOf(g, p.id, true);
    expect(t.kinFell).toBe(true);
    const o = snapOdds(t); expect(o).toBeGreaterThanOrEqual(0); expect(o).toBeLessThanOrEqual(0.6);
    expect(temperamentOf(g, 'nobody', false).grief).toBe(0);
  });
  it('differs person to person on the same place', () => {
    const g = newGame(3);
    g.mind = { psyche: { [g.people[0].id]: { stress: 95, trauma: 70, low: 40, kills: 0 } } } as unknown as typeof g.mind;
    const a = snapOdds(temperamentOf(g, g.people[0].id, true)), b = snapOdds(temperamentOf(g, g.people[1].id, false));
    expect(a).toBeGreaterThan(b);
  });
});
