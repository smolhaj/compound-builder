import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION } from './state';
import { planStructure } from './construction';
import { applyForPermit, permitFee, reviewDays, COUNTY } from './paperwork';
import { housingPlan, cachedPlan } from './housing';
import { migrate } from './save/migrations';
import { startRental, rentalQuote, rentalDay, rushQuote, rushPermit, moveInEta, bridgeOffers, RENTALS, RENTAL_ORDER } from './shelterBridge';
import { dayIndex } from './state';

const base = () => { const g = newGame(7); g.structures = g.structures.filter(x => x.pre); g.perimeter = []; g.money = 300_000; return g; };
const staked = () => { const g = base(), st = planStructure(g, 'timber_cabin', 0, 0, 0); applyForPermit(g, st); return { g, st }; };

describe('shelter rentals', () => {
  it('are priced inside the 2025 US ranges', () => {
    const g = base();
    for (const k of RENTAL_ORDER) {
      const q = rentalQuote(g, k), per = q.nightly / q.units;
      expect(per).toBeGreaterThan(55); expect(per).toBeLessThan(220);
      expect(q.units * q.seats).toBeGreaterThanOrEqual(g.people.length);
    }
    expect(RENTALS.motel.night).toBeGreaterThanOrEqual(90); expect(RENTALS.motel.night).toBeLessThanOrEqual(180);
    expect(rentalQuote(g, 'rv').monthly / rentalQuote(g, 'rv').units).toBeGreaterThanOrEqual(1200);
    expect(rentalQuote(g, 'rv').monthly / rentalQuote(g, 'rv').units).toBeLessThanOrEqual(2600);
  });
  it('give everybody a bed the night they start (motel) and cut the people sleeping outside', () => {
    const { g } = staked();
    const before = housingPlan(g).outside;
    expect(before).toBeGreaterThan(0);
    expect(startRental(g, 'motel')).toBeNull();
    expect(housingPlan(g).outside).toBe(0);
    expect(cachedPlan(g).noBed).toBe(0);
  });
  it('an RV or modular unit arrives after its delivery days, and bills nothing until then', () => {
    const { g } = staked(); const m = g.money;
    expect(startRental(g, 'rv')).toBeNull();
    expect(g.money).toBeLessThan(m);   // the delivery and set-up
    const m1 = g.money;
    rentalDay(g);
    expect(g.money).toBe(m1);
    expect(housingPlan(g).outside).toBeGreaterThan(0);
    g.clock.t += 4;
    rentalDay(g);
    expect(g.money).toBeLessThan(m1);
    expect(housingPlan(g).outside).toBe(0);
  });
  it('bills by the night, refuses a second rental, and checks out when the money is gone', () => {
    const { g } = staked();
    startRental(g, 'motel');
    expect(startRental(g, 'rv')).toMatch(/already/);
    const n = g.rental!.nightly, m = g.money;
    rentalDay(g);
    expect(g.money).toBe(m - n);
    g.money = n - 1;
    rentalDay(g);
    expect(g.rental).toBeUndefined();
  });
  it('is refused with no money for it and not offered when the house already has beds', () => {
    const { g } = staked(); g.money = 50;
    expect(startRental(g, 'motel')).toMatch(/on hand/);
    expect(bridgeOffers(g).rentals.length).toBe(4);
    const h = base();
    expect(bridgeOffers(h).rentals).toEqual([]);   // nothing staked
  });
});

describe('rushed permits', () => {
  it('a strict county has a legal expedite desk at 2-3x the fee that halves the review', () => {
    const { g, st } = staked(); g.site.region = 'pnw'; applyForPermit(g, st); st.permitAt = g.clock.t + 21;
    const q = rushQuote(g, st)!;
    expect(q.legal).toBe(true); expect(q.risk).toBe(0);
    expect(q.mult).toBeGreaterThanOrEqual(2); expect(q.mult).toBeLessThanOrEqual(3);
    expect(q.fee).toBeCloseTo(permitFee(g, st.kind) * q.mult, -2);
    const m = g.money;
    expect(rushPermit(g, st.id)).toBeNull();
    expect(m - g.money).toBe(q.fee);
    expect((st.permitAt ?? 0) - g.clock.t).toBe(q.to);
    expect(q.to).toBeLessThan(q.from);
    expect(rushPermit(g, st.id)).toMatch(/already/);
  });
  it('a lax county has a cheaper, faster, gray runner with a risk of a fine and a restart', () => {
    const { g, st } = staked(); g.site.region = 'hill_country'; st.permitAt = g.clock.t + 21;
    const q = rushQuote(g, st)!;
    expect(q.legal).toBe(false); expect(q.risk).toBeGreaterThan(0);
    expect(q.mult).toBeLessThanOrEqual(1.5);
    let caught = 0, ok = 0;
    for (let seed = 1; seed <= 200; seed++) {
      const x = staked(); x.g.seed = seed; x.g.site.region = 'hill_country'; x.st.permitAt = x.g.clock.t + 21;
      rushPermit(x.g, x.st.id);
      if (x.st.rushed === 'caught') { caught++; expect((x.st.permitAt ?? 0) - x.g.clock.t).toBeGreaterThanOrEqual(reviewDays(x.g, x.st.kind) + 7); } else { ok++; expect((x.st.permitAt ?? 0) - x.g.clock.t).toBeLessThan(21); }
    }
    expect(caught / 200).toBeGreaterThan(0.04); expect(caught / 200).toBeLessThan(0.25); expect(ok).toBeGreaterThan(150);
  });
  it('is not offered with no review or in the last days, and costs more than the permit in every county', () => {
    const { g, st } = staked();
    st.permitAt = g.clock.t + 2;
    expect(rushQuote(g, st)).toBeNull();
    for (const r of Object.keys(COUNTY) as Array<keyof typeof COUNTY>) { const x = staked(); x.g.site.region = r; x.st.permitAt = x.g.clock.t + 21; const q = rushQuote(x.g, x.st)!; expect(q.fee).toBeGreaterThanOrEqual(permitFee(x.g, x.st.kind)); expect(q.fee).toBeLessThanOrEqual(permitFee(x.g, x.st.kind) * 3 + 10); }
    expect(dayIndex(0)).toBe(0);
  });
});

describe('the family ETA', () => {
  it('adds the county review and delivery to the work, and a crew is quicker than the family', () => {
    const g = base();
    const e = moveInEta(g, 'timber_cabin', 800, true);
    expect(e.review).toBeGreaterThan(0);
    expect(e.prep).toBe(Math.max(e.review, e.delivery));
    expect(e.crewDays).toBeLessThan(e.familyDays!);
    expect(e.line).toMatch(/Family moves in after about .* by hand, or about .* with a hired crew/);
    expect(e.meanwhile).toMatch(/county review/);
    const free = moveInEta(g, 'garden', 40, true);
    expect(free.review).toBe(0);
    expect(free.line).toMatch(/^Ready in about/);
  });
  it('takes longer with more already queued, and never undercuts the review', () => {
    const { g } = staked();
    const a = moveInEta(g, 'cottage', 300, true).familyDays!;
    planStructure(g, 'workshop', 12, 0, 0);
    expect(moveInEta(g, 'cottage', 300, true).familyDays!).toBeGreaterThan(a);
    expect(moveInEta(g, 'cottage', 300, true).familyDays!).toBeGreaterThanOrEqual(moveInEta(g, 'cottage', 300, true).review);
  });
});

describe('save v101', () => {
  it('migrates a v100 save untouched', () => {
    const g = newGame(3);
    const old = JSON.parse(JSON.stringify({ ...g, version: 100 }));
    const m = migrate(old);
    expect(m.version).toBe(SAVE_VERSION); expect(SAVE_VERSION).toBeGreaterThanOrEqual(101);
    expect(m.rental).toBeUndefined();
  });
});
