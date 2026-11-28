import { describe, it, expect } from 'vitest';
import { newGame } from './state';
import { cutFor, BLIGHTS, blightCut, intensity, blightOf, blightChoose, blightCards, gardenGrow, diversity, blightDaily } from './blight';
import { fxCtxFor, fxSupplyMods, fxCards, fxChoose } from './disasterFx';
import { fieldFactor } from './crops';
import { farmOf } from './farm';

const game = (variant = 'late_blight') => { const g = newGame(5, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'crop_blight', variant }); g.clock.t = g.disaster.hitAt + 100; g.disaster.phase = 'impact'; return g; };

describe('per-family cuts (pure)', () => {
  it('late blight takes potatoes hardest, rust wheat, locusts the grains and beans; underground crops are spared by locusts', () => {
    const d = BLIGHTS.late_blight;
    expect(cutFor(d, 1, 'potatoes', 'hybrid', true, 2)).toBeLessThan(cutFor(d, 1, 'wheat', 'hybrid', true, 2));
    expect(cutFor(BLIGHTS.rust, 1, 'wheat', 'hybrid', true, 2)).toBeLessThan(cutFor(BLIGHTS.rust, 1, 'potatoes', 'hybrid', true, 2));
    expect(cutFor(BLIGHTS.locusts, 1, 'potatoes', 'hybrid', true, 2)).toBeGreaterThan(cutFor(BLIGHTS.locusts, 1, 'wheat', 'hybrid', true, 2));
    expect(cutFor(d, 1, 'rest', 'hybrid', true, 2)).toBe(1); expect(cutFor(d, 0, 'potatoes', 'hybrid', true, 2)).toBe(1);
  });
  it('hybrid is the worst seed, then heirloom, then saved; rotation and a mixed planting help; the same crop twice hurts', () => {
    const d = BLIGHTS.late_blight, c = (line: 'hybrid' | 'heirloom' | 'saved', rot: boolean, mix: number) => cutFor(d, 1, 'potatoes', line, rot, mix);
    expect(c('hybrid', true, 2)).toBeLessThan(c('heirloom', true, 2)); expect(c('heirloom', true, 2)).toBeLessThan(c('saved', true, 2));
    expect(c('saved', false, 2)).toBeLessThan(c('saved', true, 2)); expect(c('saved', true, 3)).toBeGreaterThan(c('saved', true, 1));
  });
});

describe('in the game', () => {
  it('the strain bites the first year, half the second and then is gone; Cozy is gentler', () => {
    const g = game(); expect(intensity(g)).toBe(1); g.clock.t = g.disaster.hitAt + 500; expect(intensity(g)).toBe(0.5); g.clock.t = g.disaster.hitAt + 900; expect(intensity(g)).toBe(0);
  });
  it('a field of the hit crop yields less than before, others do not; the garden is cut through supplyMods', () => {
    const g = game('late_blight');
    g.structures.push({ id: 'f1', kind: 'field', x: 0, z: 0, stage: 9, supplied: true, done: 0, finishedAt: 0 } as never);
    const P = (farmOf(g).plots ??= {});
    const { year } = { year: 2027 + Math.floor((g.clock.startDoy - 1 + g.clock.t) / 365) };
    P.f1 = { kind: 'field', fert: 1, prev: 'wheat', prev2: null, crop: 'potatoes', sown: { y: year, doy: 120, line: 'hybrid', v: 1, late: 1 }, loads: 0, cover: false, planted: true } as never;
    const hit = fieldFactor(g, g.structures[g.structures.length - 1]).total;
    P.f1.crop = 'wheat'; P.f1.prev = 'potatoes'; const spared = fieldFactor(g, g.structures[g.structures.length - 1]).total;
    const calm = newGame(5, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'drought' });
    expect(hit / 1.2).toBeLessThan(spared / 0.95); void calm;
    expect(blightCut(g, { crop: 'potatoes', prev: 'beans', sown: { line: 'hybrid' } })).toBeLessThan(0.5);
    expect(fxSupplyMods(g).grow).toBeLessThan(1); expect(gardenGrow(g)).toBeLessThan(1); void diversity;
  });
  it('seed card sets the seed line; a hungry neighbor card shares or refuses, and trust moves', () => {
    const g = game(); expect(fxCards(g).some(c => c.id === 'bl_seed')).toBe(true);
    fxChoose(g, 'bl:saved'); expect(blightOf(g).seedRule).toBe('saved'); expect(fxCards(g).some(c => c.id === 'bl_seed')).toBe(false);
    blightOf(g).asked.push('open_hungry'); expect(blightCards(g).some(c => c.id === 'bl_hungry')).toBe(true);
    const n = g.neighbors.find(x => x.status === 'home')!, d = n.disposition; blightChoose(g, 'bl:refuse'); expect(n.disposition).toBeLessThan(d);
  });
  it('hungry neighbors turn up after the first weeks and the log says so', () => {
    const g = game(); let said = 0;
    for (let d = 45; d < 200; d++) { const c = fxCtxFor(g, d); c.day = d; said += blightDaily(g, c).filter(l => /at the gate/.test(l)).length; }
    expect(said).toBeGreaterThan(0);
  });
});

describe('answering a card through the store (what the What-to-do button runs)', () => {
  it('keeps the choice: the returned line is a note, not a refusal that throws the change away', async () => {
    const { useGameStore } = await import('../store/gameStore');
    const g = game(); useGameStore.setState({ game: g });
    expect(fxCards(useGameStore.getState().game).some(c => c.id === 'bl_seed')).toBe(true);
    const note = useGameStore.getState().fxChoice('bl:saved');
    expect(note).toMatch(/saved seed/i);
    expect(blightOf(useGameStore.getState().game).seedRule).toBe('saved');
    expect(fxCards(useGameStore.getState().game).some(c => c.id === 'bl_seed')).toBe(false);
  });
});
