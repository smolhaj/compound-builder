/**
 * What the domes on the place cost to run a year, for the Dome panel and the report card: the upkeep the sim now bills (maintenance, insurance, staff;
 * `upkeep.ts`) plus the power the utilities already billed (the design-day estimate of `domeCostSummary`). Pure reads; nothing is saved.
 */
import type { GameState } from '../state';
import { domesOf, stateOf } from './live';
import { domeCostSummary } from './costSummary';
import { stageOf, stageWord, upkeepCover, upkeepYear, type UpkeepStage } from './upkeep';

export interface DomeRunning {
  id: string; tier: DomeRefTier; cells: number;
  upkeepUsd: number; powerUsd: number; totalUsd: number;
  owedUsd: number; behindDays: number; stage: UpkeepStage; stageText: string | null;
  /** About a month of upkeep, and whether the cash on hand covers it. */
  monthUsd: number; cashShort: boolean;
}
type DomeRefTier = import('./tiers').DomeTier;

export function domeRunning(s: GameState): DomeRunning[] {
  return domesOf(s).map(d => {
    const { tier, cells } = d;
    const y = upkeepYear(tier, cells), power = domeCostSummary(tier, cells).running.powerUsd, owed = stateOf(s, d).upkeepOwed ?? 0;
    const behind = y.totalUsd > 0 ? owed / (y.totalUsd / 365) : 0, stage = stageOf(behind, y.staff), month = upkeepCover(tier, cells, 30);
    return { id: d.st.id, tier, cells, upkeepUsd: y.totalUsd, powerUsd: power, totalUsd: y.totalUsd + power, owedUsd: owed, behindDays: behind, stage, stageText: stageWord(stage, y.staff), monthUsd: month, cashShort: y.totalUsd > 0 && s.money < month };
  });
}
