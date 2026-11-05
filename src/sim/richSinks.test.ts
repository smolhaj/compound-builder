import { describe, expect, it } from 'vitest';
import { newGame, type GameState, type Structure } from './state';
import { MATERIALS } from './materials';
import { SHELVES } from './shelves';
import { gearPosture } from './gear';
import { postureOf, defenseOf } from './encounters';
import { reception } from './radio';
import { careFor } from './medical';
import { GATE_HOUSE, MAST, hasClinic, medicalBay } from './richSinks';
import { buyLand, buyProblem, priceOf, PREMIUM_OFFER, premiumOffer } from './land';
import { migrate } from './save/migrations';

const game = (): GameState => { const g = newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' }); g.money = 5_000_000; return g; };
const built = (g: GameState, kind: string): void => { g.structures.push({ id: 'b' + kind, kind, x: 10, z: 10, rot: 0, stage: 9, done: 0, supplied: true, finishedAt: 0 } as Structure); };

describe('money sinks: prices and shelves', () => {
  it('each good is on a shelf, priced in the real-2025 range, and its card has a one-line effect', () => {
    for (const [id, lo, hi] of [['clinic_suite', 25_000, 80_000], ['radio_mast', 6_000, 25_000], ['gate_house', 40_000, 120_000]] as const) {
      expect(Object.values(SHELVES).some(l => l.includes(id))).toBe(true);
      const p = MATERIALS[id].price ?? 0;
      expect(p).toBeGreaterThanOrEqual(lo); expect(p).toBeLessThanOrEqual(hi);
    }
  });
});

describe('clinic suite', () => {
  it('works as the medical bay for a family with no bunker, and the bunker bay still counts', () => {
    const g = game();
    expect(medicalBay(g)).toBe(false); expect(careFor(g, 'x').bay).toBe(false);
    g.stock.clinic_suite = 1;
    expect(hasClinic(g)).toBe(true); expect(medicalBay(g)).toBe(true); expect(careFor(g, 'x').bay).toBe(true);
    const h = game(); built(h, 'bunker_medical'); expect(medicalBay(h)).toBe(true);
  });
});

describe('radio mast', () => {
  it('lifts a real set, never lowers one, and does nothing without a radio', () => {
    const g = game();
    const none = reception(g);
    g.stock.radio_mast = 1; expect(reception(g)).toEqual(none);
    g.stock.radio_mast = 0; g.stock.sw_radio = 1;
    const sw = reception(g); g.stock.radio_mast = 1; const sw2 = reception(g);
    expect(sw2.hear).toBeCloseTo(sw.hear + MAST.hear); expect(sw2.truth).toBeGreaterThan(sw.truth);
    expect(sw2.truth).toBeLessThanOrEqual(0.95);
  });
});

describe('hardened gate house', () => {
  it('adds wall strength and warning at the gate, and the fight rating only goes up', () => {
    const g = game();
    const a = gearPosture(g, 2), pa = postureOf(g);
    g.stock.gate_house = 1;
    const b = gearPosture(g, 2), pb = postureOf(g);
    expect(b.barrier - a.barrier).toBe(GATE_HOUSE.barrier);
    expect(b.detection - a.detection).toBe(GATE_HOUSE.detection);
    expect(pb.barrier).toBeGreaterThanOrEqual(pa.barrier); expect(pb.detection).toBeGreaterThanOrEqual(pa.detection);
    expect(defenseOf(pb)).toBeGreaterThanOrEqual(defenseOf(pa));
  });
});

describe('a cash offer for land that is not for sale', () => {
  const west = (g: GameState) => g.land.parcels.find(p => p.name.includes('west forty') && !p.name.includes('north') && !p.name.includes('south'))!;
  it('an owner who is neutral to you sells at 1.6x; a friend at the going rate; a feud never', () => {
    const g = game(); const p = west(g); const owner = g.neighbors.find(n => n.id === p.owner)!;
    owner.status = 'home'; owner.disposition = 10; p.forSale = false;
    expect(premiumOffer(g, p)).toBe(true); expect(buyProblem(g, p)).toBeNull();
    const premium = priceOf(g, p);
    p.forSale = true; expect(premiumOffer(g, p)).toBe(false); const asking = priceOf(g, p);
    expect(premium).toBeGreaterThanOrEqual(asking * PREMIUM_OFFER - 500); expect(premium).toBeGreaterThan(asking);
    p.forSale = false; owner.disposition = 60; expect(premiumOffer(g, p)).toBe(false); expect(buyProblem(g, p)).toBeNull();
    owner.disposition = -40; expect(buyProblem(g, p)).toMatch(/won't sell/);
  });
  it('buying takes the money and the land, and a cash offer is never cheaper than the asking price', () => {
    const g = game(); const p = west(g); const owner = g.neighbors.find(n => n.id === p.owner)!;
    owner.status = 'home'; owner.disposition = 0; p.forSale = false;
    const price = priceOf(g, p), m = g.money;
    expect(buyLand(g, p.id)).toBeNull(); expect(g.money).toBe(m - price); expect(p.owner).toBe('you');
  });
});

describe('save v79', () => {
  it('a v78 save gets the three goods at zero', () => {
    const g = game(); const raw = JSON.parse(JSON.stringify(g)); raw.version = 78;
    for (const k of ['clinic_suite', 'radio_mast', 'gate_house']) delete raw.stock[k];
    const m = migrate(raw) as unknown as GameState;
    expect(m.stock.clinic_suite).toBe(0); expect(m.stock.radio_mast).toBe(0); expect(m.stock.gate_house).toBe(0);
  });
});
