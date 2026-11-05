import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { GATE_SEC, arrivalAmbush, arrivalAmbushP, fitGate, fitGateProblem, gateLines, gatePosture, hasGateMotor, hasIntercom, hasSallyGate, intercomLive } from './gateSecurity';
import { gearPosture } from './gear';
import { postureOf } from './encounters';
import { HARDEN_LAYERS, LAYERS, houseBarrier, layerTier, upgradeLayer, upgradeQuote } from './houseHardening';
import { roadHome, marketOf } from './market';
import { mulberry32 } from './rng';
import { MATERIALS } from './materials';

const game = (seed = 7): GameState => { const g = newGame(seed); g.site = { ...g.site, creek: false }; return g; };
const on = (g: GameState) => { g.utilities.grid = true; g.disaster.tracks.grid = 1; g.utilities.lit = []; };
const off = (g: GameState) => { g.utilities.grid = true; g.disaster.tracks.grid = 0; g.utilities.lit = []; };
const lawless = (g: GameState) => { g.disaster.tracks.law = 0; };

describe('the gate kit', () => {
  it('every good is for sale (a real price) and none is fitted at the start', () => {
    const g = game();
    for (const m of ['gate_intercom', 'gate_motor', 'sally_gate', 'trellis_gates'] as const) expect(MATERIALS[m].price).toBeGreaterThan(0);
    expect(hasIntercom(g) || hasGateMotor(g) || hasSallyGate(g)).toBe(false);
    expect(gatePosture(g)).toEqual({ detection: 0, barrier: 0, parley: 0, ambushK: 1 });
  });

  it('the intercom and the motor need power; the double gate and the cage do not', () => {
    const g = game(); g.stock.gate_intercom = 1; g.stock.gate_motor = 1; g.stock.sally_gate = 1;
    on(g);
    const live = gatePosture(g);
    off(g);
    const dark = gatePosture(g);
    expect(live.detection).toBe(GATE_SEC.INTERCOM.detection); expect(dark.detection).toBe(0);
    expect(live.parley).toBeGreaterThan(0); expect(dark.parley).toBe(0);
    expect(live.ambushK).toBeLessThan(dark.ambushK);
    expect(dark.ambushK).toBe(GATE_SEC.SALLY.ambush);       // only the double gate still works
    expect(dark.barrier).toBe(GATE_SEC.SALLY.barrier + GATE_SEC.MOTOR.barrier);   // the cage holds either way
    expect(intercomLive(g)).toBe(false);
  });

  it('every piece only ever lowers the arrival-ambush chance and only ever adds to warning and wall strength, in any combination', () => {
    const goods = ['gate_intercom', 'gate_motor', 'sally_gate'] as const;
    for (const grid of [true, false]) for (let mask = 0; mask < 8; mask++) for (let add = 0; add < 3; add++) {
      const a = game(); (grid ? on : off)(a);
      goods.forEach((m, i) => { if (mask & (1 << i)) a.stock[m] = 1; });
      const b = structuredClone(a); b.stock[goods[add]] = 1;
      const pa = gatePosture(a), pb = gatePosture(b);
      expect(pb.ambushK).toBeLessThanOrEqual(pa.ambushK + 1e-12);
      expect(pb.detection).toBeGreaterThanOrEqual(pa.detection); expect(pb.barrier).toBeGreaterThanOrEqual(pa.barrier); expect(pb.parley).toBeGreaterThanOrEqual(pa.parley);
      expect(arrivalAmbushP(b, { carried: 500, armed: false })).toBeLessThanOrEqual(arrivalAmbushP(a, { carried: 500, armed: false }) + 1e-12);
    }
  });

  it('the posture at the gate reads it: warning and wall strength rise, nothing falls', () => {
    const g = game(); on(g);
    const bare = gearPosture(g, 2), p0 = postureOf(g);
    g.stock.gate_intercom = 1; g.stock.sally_gate = 1; g.stock.gate_motor = 1;
    const kit = gearPosture(g, 2), p1 = postureOf(g);
    expect(kit.detection).toBe(bare.detection + GATE_SEC.INTERCOM.detection);
    expect(kit.barrier).toBe(bare.barrier + GATE_SEC.SALLY.barrier + GATE_SEC.MOTOR.barrier);
    expect(p1.detection).toBeGreaterThan(p0.detection); expect(p1.barrier).toBeGreaterThanOrEqual(p0.barrier);
  });

  it('can be fitted from the stores while they are open, once each', () => {
    const g = game(); g.money = 50000;
    expect(fitGate(g, 'gate_intercom', MATERIALS.gate_intercom.price!)).toBeNull();
    expect(hasIntercom(g)).toBe(true);
    expect(fitGateProblem(g, 'gate_intercom', 100)).toMatch(/already/);
    g.disaster.tracks.stores = 0;
    expect(fitGateProblem(g, 'sally_gate', 100)).toMatch(/closed/);
    g.disaster.tracks.stores = 1; g.money = 5;
    expect(fitGateProblem(g, 'sally_gate', 16000)).toMatch(/money/);
  });

  it('says what each piece does, and says so when there is no power', () => {
    const g = game(); g.stock.gate_intercom = 1; g.stock.gate_motor = 1; g.stock.sally_gate = 1; on(g);
    expect(gateLines(g).length).toBe(3);
    off(g);
    expect(gateLines(g).join(' ')).toMatch(/no power/);
    expect(gateLines(g).join(' ')).toMatch(/by hand/);
  });
});

describe('the ambush at the drive', () => {
  it('is rare while the law works, common when it does not, and worse for a rich haul and an unarmed driver', () => {
    const g = game();
    const calm = arrivalAmbushP(g, { carried: 100, armed: false });
    lawless(g);
    const wild = arrivalAmbushP(g, { carried: 100, armed: false });
    expect(wild).toBeGreaterThan(calm * 3);
    expect(arrivalAmbushP(g, { carried: 500, armed: false })).toBeGreaterThan(wild);
    expect(arrivalAmbushP(g, { carried: 100, armed: true })).toBeLessThan(wild);
  });

  it('a sally port, the intercom, the motor and a guard together cut it to about a tenth of the bare gate', () => {
    const g = game(); lawless(g); on(g);
    const bare = arrivalAmbushP(g, { carried: 300, armed: false });
    g.stock.sally_gate = 1; g.stock.gate_intercom = 1; g.stock.gate_motor = 1; g.stock.gate_house = 1;
    expect(arrivalAmbushP(g, { carried: 300, armed: false })).toBeLessThan(bare * 0.15);
  });

  it('is rolled on its own generator, the same for the same day, and over many days the gate kit ambushes fewer drivers', () => {
    const a = game(), b = game(); lawless(a); lawless(b); on(a); on(b);
    b.stock.sally_gate = 1; b.stock.gate_intercom = 1;
    expect(arrivalAmbush(a, { carried: 300, armed: false }, 3)).toBe(arrivalAmbush(a, { carried: 300, armed: false }, 3));
    let na = 0, nb = 0;
    for (let d = 0; d < 600; d++) { a.clock.t = b.clock.t = d; if (arrivalAmbush(a, { carried: 300, armed: false })) na++; if (arrivalAmbush(b, { carried: 300, armed: false })) nb++; }
    expect(na).toBeGreaterThan(20);
    expect(nb).toBeLessThan(na);
  });

  it('comes home robbed at the drive from the market by vehicle, less often behind a double gate; never when nothing was bought', () => {
    const trip = (kit: boolean, seed: number): string[] => {
      const g = game(seed); lawless(g); on(g);
      if (kit) { g.stock.sally_gate = 1; g.stock.gate_intercom = 1; }
      const m = marketOf(g); const p = g.people[0];
      m.trip = { day: 0, pid: p.id, carried: 400, armed: false, vehicle: 'v1' } as never;
      return roadHome(g, mulberry32(seed));
    };
    let bare = 0, kit = 0;
    for (let seed = 1; seed <= 300; seed++) { if (trip(false, seed).some(l => /came out of the ditch/.test(l))) bare++; if (trip(true, seed).some(l => /came out of the ditch/.test(l))) kit++; }
    expect(bare).toBeGreaterThan(0);
    expect(kit).toBeLessThan(bare);
  });
});

describe('inner security gates (the house)', () => {
  it('are a layer of the hardening chain: +wall strength, fitted from the stores, once', () => {
    expect(HARDEN_LAYERS).toContain('gates');
    expect(LAYERS.gates.tiers[0].good).toBe('trellis_gates');
    const g = game(); g.money = 50000;
    const b0 = houseBarrier(g);
    expect(upgradeQuote(g, 'gates')!.problem).toBeNull();
    expect(upgradeLayer(g, 'gates')).toBeNull();
    expect(layerTier(g, 'gates')).toBe(1);
    expect(houseBarrier(g)).toBe(b0 + LAYERS.gates.tiers[0].barrier);
    expect(upgradeLayer(g, 'gates')).toMatch(/top tier/);
  });

  it('stack with doors and bars (a second door in front of the first)', () => {
    const g = game(); g.stock.steel_door = 2; g.stock.window_bars = 1;
    const before = houseBarrier(g); g.stock.trellis_gates = 1;
    expect(houseBarrier(g)).toBeGreaterThan(before);
  });
});
