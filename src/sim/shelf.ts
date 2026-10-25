/**
 * Shelf life and pests (decided with the user: "Shelf life & pests"). Pure.
 *
 * Each stored good carries an average age (days). New stock comes in fresh
 * and pulls the average down; past its shelf life a good slowly spoils
 * (cans rust and lose quality, frozen meat gets freezer burn, medicine loses
 * potency, gas goes stale and gums the carburetor, seed stops sprouting).
 *
 *  Rotation   "eat what you store": while the stores are open the family
 *             eats from the pantry and the grocery run replaces it, so the
 *             stock stays young (a bit of time, no extra money).
 *  Stabilizer a bottle treats about ten cans of gas: two years instead of six months.
 *  Mice       get into staples, seed and fresh food; pack rats chew wiring.
 *             Traps and bait stations keep them down (a box lasts a couple of months).
 *
 * Shelf lives: medicine ~3 years, field seed ~3, gasoline ~6 months (2
 * years stabilized). Food keeps item by item (sim/pantry.ts: rice and beans
 * sealed in buckets 30 years, in bags a few; flour a year; oil one to two;
 * cans two to five; honey, sugar and salt forever); the canned / staples /
 * frozen rows here are their kcal-weighted averages.
 */
import type { GameState } from './state';
import type { MaterialId } from './materials';
import { mulberry32 } from './rng';
import type { Fix } from './improvements';
import { catKeeping, pantryDay, syncPantry, type FoodCat } from './pantry';

const isFood = (k: Kept): k is FoodCat => k === 'canned' || k === 'staples' || k === 'frozen';

export type Kept = 'canned' | 'staples' | 'frozen' | 'meds' | 'seed' | 'fuel';
export const KEPT: readonly Kept[] = ['canned', 'staples', 'frozen', 'meds', 'seed', 'fuel'];
/** Shelf life (days) and the share lost a day past it. */
export const LIFE: Record<Kept, { days: number; loss: number; what: string }> = {
  canned: { days: 1460, loss: 0.0003, what: 'rusting cans, going soft' },
  staples: { days: 3650, loss: 0.0001, what: 'stale' },
  frozen: { days: 365, loss: 0.001, what: 'freezer burn' },
  meds: { days: 1095, loss: 0.0005, what: 'past its date, losing potency' },
  seed: { days: 1095, loss: 0.0006, what: 'old seed, poor germination' },
  fuel: { days: 180, loss: 0.0025, what: 'stale gas, gumming up the generator' },
};
export const STABILIZED_FUEL_DAYS = 730;

export interface Shelf {
  /** Average age (days) of each kept good, and the quantity it was measured on. */
  age: Partial<Record<Kept, number>>;
  qty: Partial<Record<Kept, number>>;
  /** Eat what you store (rotate the pantry while town is open). */
  rotate: boolean;
  /** Days of trap coverage left. */
  traps: number;
}
export const newShelf = (): Shelf => ({ age: {}, qty: {}, rotate: false, traps: 0 });

export const lifeOf = (s: GameState, k: Kept) => k === 'fuel' && s.stock.stabilizer >= Math.ceil(s.stock.fuel / 10) && s.stock.fuel > 0 ? STABILIZED_FUEL_DAYS : LIFE[k].days;

/** Once a day: age the stores (new stock comes in fresh), spoil what's past it, the mice and pack rats. Returns log lines. */
export function shelfDay(s: GameState): string[] {
  const out: string[] = [];
  const sh = s.shelf;
  const day = Math.floor(s.clock.t + 0.25);
  const r = mulberry32(s.seed * 2903 + day * 5 + 9);
  const townOpen = s.disaster.tracks.stores >= 0.5;
  // food, item by item (mice get into the sacks when no traps are set and there's no concrete storeroom)
  const vault = s.structures.some(x => x.kind === 'bunker_stores' && x.stage >= 5);
  syncPantry(s);
  const before = s.stock.staples + s.stock.seed;
  out.push(...pantryDay(s, { rotate: sh.rotate && townOpen, mice: sh.traps <= 0 && !vault && s.stock.traps < 1, townOpen: townOpen && s.disaster.tracks.deliveries > 0.25 }));
  for (const k of KEPT) {
    if (isFood(k)) { const c = catKeeping(s, k); sh.age[k] = c.age; sh.qty[k] = s.stock[k]; continue; }
    const q = s.stock[k as MaterialId], q0 = sh.qty[k] ?? q;
    let age = sh.age[k] ?? 0;
    // new stock in: blend it in at age 0
    if (q > q0 + 1e-9) age = age * q0 / q;
    if (q <= 1e-9) age = 0;
    age += 1;
    // rotation: eat the oldest and buy it back (food and fuel), about every three months
    if (sh.rotate && townOpen && k !== 'seed') age *= 1 - 1 / 90;
    const life = lifeOf(s, k);
    if (age > life && q > 0) {
      s.stock[k as MaterialId] = q * (1 - LIFE[k].loss);
      if (Math.floor(age) === life + 1) out.push(`The oldest ${k === 'fuel' ? 'gas' : k} is past its shelf life: ${LIFE[k].what}.`);
    }
    sh.age[k] = age;
    sh.qty[k] = s.stock[k as MaterialId];
  }
  // stabilizer goes into the gas as it's bought
  // traps: a box covers about two months
  if (sh.traps <= 0 && s.stock.traps >= 1) { s.stock.traps--; sh.traps = 60; }
  if (sh.traps > 0) sh.traps--;
  else {
    // mice in the stores (the sacks of staples above; buckets keep them out, and a concrete storeroom underground)
    s.stock.seed *= 0.999; s.stock.fresh *= 0.995;
    if (before > 1 && r() < 1 / 30) out.push('Mice in the stores: chewed sacks and droppings in the staples. Set some traps.');
    // pack rats chew the wiring in a wired building, now and then
    if (r() < 1 / 120) {
      const wired = s.utilities.fittings.filter(f => f.kind === 'wire' && f.finishedAt !== null);
      const f = wired.length ? wired[Math.floor(r() * wired.length)] : null;
      const st = f ? s.structures.find(x => x.id === f.building) : null;
      if (f && st) {
        s.utilities.fittings = s.utilities.fittings.filter(x => x !== f);
        const fix: Fix = { part: 'wiring', cond: 'fair', done: 0, hours: 24, supplied: false };
        (st.fixes ??= []).push(fix);
        out.push(`Pack rats chewed through the wiring in the ${st.kind.replace(/_/g, ' ')}: it's dead until it's fixed.`);
      }
    }
  }
  return out;
}

/** How a good is keeping, for the HUD. */
export function keeping(s: GameState, k: Kept): { age: number; life: number; tone: 'good' | 'warn' | 'bad' } {
  const age = s.shelf.age[k] ?? 0, life = isFood(k) ? catKeeping(s, k).life : lifeOf(s, k);
  return { age, life, tone: age > life ? 'bad' : age > life * 0.75 ? 'warn' : 'good' };
}
