import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { CLASSIC, RAW, type Site } from './site';
import { addCarryWork, deliverOrders, onOrder, placeOrder } from './economy';
import { planStructure } from './construction';
import { hireCrew, crewStep } from './crews';
import { suggestions } from './guidance';
import { wantedNow } from './stalls';
import { perfNoticePlace, PERF_NOTICE_MS } from '../ui/hudLayout';

const noDrive = (): GameState => {
  const site: Site = { ...CLASSIC, improvements: { ...RAW, poleFt: 300, driveFt: 600 } };
  const g = newGame(4, 105, 2027, { site });
  g.structures = []; g.money = 400_000;
  return g;
};
const deliver = (g: GameState, lines: Array<{ material: never; qty: number }> | Array<{ material: string; qty: number }>) => {
  placeOrder(g, lines as never);
  g.clock.t = g.orders[g.orders.length - 1].dueAt + 0.1;
  deliverOrders(g);
};

describe('a lot with no drive: deliveries left at the road', () => {
  it('each heavy good is its own load and goods that need no carrying go straight to the stockpile', () => {
    const g = noDrive();
    deliver(g, [{ material: 'lumber', qty: 40 }, { material: 'concrete', qty: 6 }, { material: 'hardware', qty: 1 }]);
    expect(g.stock.concrete).toBe(6);                                   // a mixer truck needs no carrying
    expect(g.roadside.map(r => r.lines[0].material).sort()).toEqual(['lumber']);
    expect(g.stock.hardware).toBeGreaterThan(0);                       // a small box is carried in with the order, not stuck behind the lumber
  });

  it('the load a waiting project needs is carried in first, not the oldest', () => {
    const g = noDrive();
    const st = planStructure(g, 'outhouse', 0, 0, 0);
    st.permit = 'ok'; st.stage = 1;   // the stage after the footing wants fieldstone
    deliver(g, [{ material: 'lumber', qty: 40 }]);
    deliver(g, [{ material: 'fieldstone', qty: 3 }]);
    expect(g.roadside.length).toBe(2);
    expect(wantedNow(g).has('fieldstone')).toBe(true);
    addCarryWork(g, 6.5, wantedNow(g));
    expect(g.stock.fieldstone).toBe(3);
    expect(g.stock.lumber).toBe(0);
    expect(g.roadside.length).toBe(1);
  });

  it('a hired crew carries the pile in on weekdays, billed by the hour', () => {
    const g = noDrive();
    const st = planStructure(g, 'timber_cabin', 0, 0, 0); st.permit = 'ok';
    deliver(g, [{ material: 'lumber', qty: 30 }]);
    expect(hireCrew(g, st.id)).toBeNull();
    g.clock.t = Math.ceil(g.clock.t) + 7 + 9 / 24;   // a Monday-to-Friday morning, whatever the weekday
    while (Math.floor(g.clock.t) % 7 >= 5) g.clock.t += 1;
    const money = g.money, before = g.roadside.reduce((a, r) => a + r.hours - r.done, 0);
    for (let i = 0; i < 16; i++) { g.clock.t += 0.25 / 24; crewStep(g, 0.25 / 24); }
    const after = g.roadside.reduce((a, r) => a + r.hours - r.done, 0);
    expect(after).toBeLessThan(before);
    expect(g.money).toBeLessThan(money);
  });

  it('a Next-steps card offers the gravel drive once the pile is big, and not when a drive is on the books or in', () => {
    const g = noDrive();
    deliver(g, [{ material: 'lumber', qty: 60 }]);
    const card = suggestions(g, 20).find(x => x.id === 'road_pile');
    expect(card?.acts?.[0].act).toEqual({ type: 'hookup', what: 'drive' });
    g.siteJobs.drive = g.clock.t + 5;
    expect(suggestions(g, 20).find(x => x.id === 'road_pile')).toBeUndefined();
    g.siteJobs.drive = null; g.site = { ...g.site, improvements: { ...g.site.improvements, drive: true } };
    expect(suggestions(g, 20).find(x => x.id === 'road_pile')).toBeUndefined();
    expect(onOrder(g).lumber).toBeGreaterThan(0);
  });
});

describe('the "graphics switched to LOW" toast', () => {
  it('sits right of the left panel and above the bottom toolbars, and goes after 8 seconds', () => {
    const wide = perfNoticePlace(1280);
    expect(wide.left).toBeGreaterThanOrEqual(244 + 10);               // clear of the left panel
    expect(wide.bottom).toBeGreaterThanOrEqual(34 + 40);              // above the bottom toolbars
    expect(wide.left + wide.width).toBeLessThanOrEqual(1280 - 320 - 10);   // clear of the right panel
    expect(PERF_NOTICE_MS).toBe(8000);
  });
  it('on a narrow window it lies along the very bottom, full width', () => {
    const narrow = perfNoticePlace(600);
    expect(narrow.bottom).toBeLessThan(10);
    expect(narrow.left + narrow.width).toBeLessThanOrEqual(600);
  });
});
