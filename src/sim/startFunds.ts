/**
 * Where a new game's money comes from (docs/DECISIONS.md: "vary it by background
 * and job"). Not a flat number per lifestyle: the family's jobs and ages, the
 * sale of the town house, savings, a retirement account, sometimes an
 * inheritance, and the debts a household like theirs carries. The lifestyle
 * sets the range; each family rolls inside it. Pure and seeded, so a reroll or
 * a changed occupation on the setup screen moves the number predictably.
 */
import { mulberry32 } from './rng';
import type { Person } from './family';
import { jobDef } from './family';
import type { Lifestyle } from './site';

export interface FundLine { label: string; usd: number }
export interface StartFunds {
  /** Cash to spend on land and building (the sum of the lines). */
  budget: number;
  /** Investment income a year (Financially independent only). */
  passive: number;
  lines: FundLine[];
}

/** What each lifestyle can start with, whatever the family. */
export const FUNDS_RANGE: Record<Lifestyle, [number, number]> = {
  weekend: [250_000, 650_000],
  fulltime: [450_000, 1_100_000],
  independent: [1_000_000, 2_000_000],
};

const k = (n: number) => Math.round(n / 1000) * 1000;
const YEAR_DAYS = 260;

/** Deterministic: same seed, roll, family and lifestyle give the same money. */
export function startFunds(people: readonly Person[], life: Lifestyle, seed: number, roll = 0): StartFunds {
  const r = mulberry32(seed * 4409 + roll * 1237 + (life === 'weekend' ? 1 : life === 'fulltime' ? 2 : 3) * 31 + 5);
  // a fixed set of draws, so changing one adult's job never reshuffles the luck
  const luck = Array.from({ length: 16 }, () => r());
  const adults = people.filter(p => !p.kid && !p.elder);
  const elders = people.filter(p => p.elder);
  const pay = adults.reduce((a, p) => a + (p.job?.wage ?? 200) * YEAR_DAYS, 0); // household take-home a year
  const age = adults.length ? adults.reduce((a, p) => a + p.age, 0) / adults.length : 40;
  const seasoned = Math.min(1.35, Math.max(0.55, (age - 22) / 20)); // years of saving, capped
  const kids = people.filter(p => p.kid).length;
  const lines: FundLine[] = [];
  const add = (label: string, usd: number) => { if (usd !== 0) lines.push({ label, usd: k(usd) }); };
  let passive = 0;

  if (life !== 'weekend') add('Town house sold (after the mortgage)', (150_000 + 3.1 * pay * Math.min(1.2, 0.7 + seasoned * 0.4)) * (0.75 + 0.6 * luck[0]) * (life === 'independent' ? 1.25 : 1));
  add('Savings', pay * 0.8 * seasoned * (0.4 + 1.2 * luck[1]) * (life === 'independent' ? 3.4 : 1) - kids * 6_000);
  add('401(k) / IRA cashed out (after penalty and tax)', pay * 0.65 * seasoned * (0.3 + 1.1 * luck[2]) * (life === 'independent' ? 2 : 1));
  if (life === 'independent') {
    add('Stocks and funds sold', pay * 3 * seasoned * (0.4 + 1.4 * luck[3]));
    if (luck[4] < 0.35) add('Sale of a small business', 120_000 + 380_000 * luck[5]);
    passive = k(22_000 + 40_000 * luck[6] + pay * 0.1);
  }
  if (elders.length) add(elders.length > 1 ? 'Grandparents’ savings and house' : 'Grandparent’s savings and house', elders.length * (50_000 + 140_000 * luck[7]));
  if (luck[8] < 0.17) add('Inheritance', 45_000 + 190_000 * luck[9]);
  if (life !== 'weekend' && luck[10] < 0.22) add('Sale of a second vehicle, tools and extras', 12_000 + 22_000 * luck[11]);
  // debts a household like this carries, paid off at closing
  const degrees = adults.filter(p => jobDef(p.job?.id)?.degree).length;
  if (degrees) add('Student loans', -(degrees * (18_000 + 55_000 * luck[12]) * (0.5 + 0.5 * (1 - seasoned / 1.35))));
  if (luck[13] < 0.16) add('Medical debt', -(9_000 + 38_000 * luck[14]));
  if (luck[15] < 0.2) add('Credit cards and a truck loan', -(6_000 + 22_000 * luck[0]));

  // bring the total inside the lifestyle's range: scale the assets, never the debts
  const [lo, hi] = FUNDS_RANGE[life];
  const sum = () => lines.reduce((a, l) => a + l.usd, 0);
  const total = sum();
  if (total < lo || total > hi) {
    const debt = lines.filter(l => l.usd < 0).reduce((a, l) => a + l.usd, 0);
    const assets = total - debt;
    const f = ((total < lo ? lo : hi) - debt) / assets;
    for (const l of lines) if (l.usd > 0) l.usd = k(l.usd * f);
  }
  // rounding: settle the last few thousand on the biggest asset
  const big = lines.reduce((a, l) => (l.usd > a.usd ? l : a), lines[0]);
  const off = Math.min(hi, Math.max(lo, sum())) - sum();
  big.usd += off;
  return { budget: sum(), passive, lines: lines.sort((a, b) => b.usd - a.usd) };
}
