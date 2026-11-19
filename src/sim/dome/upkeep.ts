/**
 * Dome upkeep billing (owner decision 2026-11-19, dome pricing audit item 2). `runningCost()` (pricing.ts) says what a dome costs to keep a year: power,
 * maintenance, insurance and staff. Power was always billed through the utilities; the rest was only shown. This bills the other three, a 365th a day,
 * from the dome's daily step (live.ts `domeDayOne`). PROPOSED. Pure (tested in upkeep.test.ts); it imports nothing from live.ts.
 *
 * If the cash cannot cover it, the unpaid part is carried (`DomeState.upkeepOwed`) and the dome slips, using the wear it already has:
 *   behind 1+ days     a warning on the Dome panel and the briefing; nothing breaks yet.
 *   behind 7+ days     deferred maintenance: the air media, the closed ecology and the shell take wear a day (the same `filterHealth`, `ecoHealth`, `dust`).
 *   behind 14+ days    the building engineers quit (a glass dome's two, an arcology's twelve): they stop being billed, and the wear doubles.
 *   behind 30+ days    the insurance lapses: its premium stops, and a loss is the family's own.
 * Paying the arrears (cash returns) restores it all; staff and cover come back at the next payment once the dome is under 14 and 30 days behind.
 */
import { domeCost } from './cost';
import { RUNNING, runningCost } from './pricing';
import type { DomeTier } from './tiers';
import type { DomeRef, DomeState } from './live';
import type { GameState } from '../state';

export const UPKEEP = {
  /** PROPOSED. Days behind at which each step of the failure path begins. */
  lateDays: 1, wearDays: 7, staffQuitDays: 14, insuranceLapseDays: 30,
  /** PROPOSED. Wear a day (0..1 scale of the media, the ecology and the dust) from deferred maintenance; twice that with no staff. */
  wearPerDay: 0.02,
} as const;

export type UpkeepStage = 'paid' | 'late' | 'deferred' | 'unstaffed' | 'uninsured';

/** What the dome is worth installed (goods and kits; not the permit or the crew's wages): what the maintenance and the premium follow. */
const memo = new Map<string, number>();
export function installedUsd(tier: DomeTier, cells: number): number {
  const k = `${tier}:${cells}`;
  let v = memo.get(k);
  if (v === undefined) { const c = domeCost(tier, cells); v = c.totalUsd - c.permitUsd - c.laborUsd; memo.set(k, v); }
  return v;
}

export interface UpkeepYear { maintenanceUsd: number; insuranceUsd: number; staffUsd: number; staff: number; totalUsd: number }
/** The yearly bill the sim charges (the part of `runningCost` that is not power). Never smaller for a bigger dome of a tier. */
export function upkeepYear(tier: DomeTier, cells: number): UpkeepYear {
  const r = runningCost(tier, 0, installedUsd(tier, cells));
  return { maintenanceUsd: r.maintenanceUsd, insuranceUsd: r.insuranceUsd, staffUsd: r.staffUsd, staff: RUNNING.staff[tier], totalUsd: r.maintenanceUsd + r.insuranceUsd + r.staffUsd };
}

export const stageOf = (behindDays: number, staff: number): UpkeepStage => behindDays >= UPKEEP.insuranceLapseDays ? 'uninsured' : behindDays >= UPKEEP.staffQuitDays && staff > 0 ? 'unstaffed' : behindDays >= UPKEEP.wearDays ? 'deferred' : behindDays >= UPKEEP.lateDays ? 'late' : 'paid';

export interface UpkeepDay {
  /** What accrued today (staff and cover that are gone are not billed). */
  chargeUsd: number;
  /** What was paid out of cash today (arrears first), and what is still owed after. */
  paidUsd: number; owedUsd: number;
  behindDays: number; stage: UpkeepStage;
  /** Wear to put on the air media and the ecology today (0 while the bills are met or only late). */
  wear: number;
}

/**
 * One day's upkeep for a dome: accrue the day's charge, pay as much as `cash` allows (arrears first, never past zero cash), and read how far behind it
 * is. `owed` is what was left unpaid before today. `free` (God Mode) pays everything.
 */
export function upkeepDay(tier: DomeTier, cells: number, owed: number, cash: number, free = false): UpkeepDay {
  const y = upkeepYear(tier, cells), full = y.totalUsd / 365;
  if (y.totalUsd <= 0) return { chargeUsd: 0, paidUsd: 0, owedUsd: 0, behindDays: 0, stage: 'paid', wear: 0 };
  const before = full > 0 ? owed / full : 0;
  const unstaffed = before >= UPKEEP.staffQuitDays && y.staff > 0, lapsed = before >= UPKEEP.insuranceLapseDays;
  const charge = (y.maintenanceUsd + (lapsed ? 0 : y.insuranceUsd) + (unstaffed ? 0 : y.staffUsd)) / 365;
  const due = owed + charge, pay = free ? due : Math.min(due, Math.max(0, Math.floor(cash)));
  const left = Math.max(0, due - pay), behind = left / full, stage = stageOf(behind, y.staff);
  const wear = behind >= UPKEEP.wearDays ? UPKEEP.wearPerDay * (stage === 'unstaffed' || stage === 'uninsured' ? 2 : 1) : 0;
  return { chargeUsd: charge, paidUsd: pay, owedUsd: left < 1 ? 0 : left, behindDays: behind, stage, wear };
}

/** What the family must hold to cover the next `days` of upkeep (for the "cash will not cover it" warning). */
export const upkeepCover = (tier: DomeTier, cells: number, days = 30): number => Math.round(upkeepYear(tier, cells).totalUsd * days / 365);

/** The words for a stage, for the Dome panel and the log (US units, plain). */
export function stageWord(stage: UpkeepStage, staff: number): string | null {
  switch (stage) {
    case 'paid': return null;
    case 'late': return 'Behind on upkeep: maintenance, insurance and wages are being carried unpaid.';
    case 'deferred': return 'Upkeep deferred: seals, filters and beds are wearing faster every day.';
    case 'unstaffed': return `The ${staff === 1 ? 'engineer has' : 'building engineers have'} quit for want of wages: wear is doubled until the bills are paid.`;
    case 'uninsured': return 'The insurance has lapsed: a loss is the family\'s own until the premium is caught up.';
  }
}

const RANK: Record<UpkeepStage, number> = { paid: 0, late: 1, deferred: 2, unstaffed: 3, uninsured: 4 };

/**
 * Once a day for one dome (called from live.ts `domeDayOne`): pay the day's upkeep out of cash, carry what cannot be paid, put the wear on the dome's
 * media, ecology and dust, and say so when it slips a step. Returns log lines. The day's cash and the owed total are the only state it touches.
 */
export function billUpkeep(s: GameState, d: Pick<DomeRef, 'tier' | 'cells'>, st: DomeState, name: string): string[] {
  const owed = st.upkeepOwed ?? 0, y = upkeepYear(d.tier, d.cells);
  if (y.totalUsd <= 0) return [];
  const before = stageOf(owed / (y.totalUsd / 365), y.staff);
  const r = upkeepDay(d.tier, d.cells, owed, s.money, s.disaster.mode === 'god');
  s.money -= r.paidUsd;
  if (r.owedUsd > 0 || owed > 0) st.upkeepOwed = Math.round(r.owedUsd);
  if (r.wear > 0) {
    if (st.filtering !== 'none') st.filterHealth = Math.max(0, st.filterHealth - r.wear);
    if (st.filtering === 'closed') st.ecoHealth = Math.max(0, st.ecoHealth - r.wear);
    st.dust = Math.min(1, st.dust + r.wear * 0.5);
  }
  const out: string[] = [];
  if (RANK[r.stage] > RANK[before]) { const w = stageWord(r.stage, y.staff); if (w) out.push(`${name}: ${w}`); }
  else if (RANK[before] > 0 && r.stage === 'paid') out.push(`${name}'s upkeep is paid up again.`);
  return out;
}
