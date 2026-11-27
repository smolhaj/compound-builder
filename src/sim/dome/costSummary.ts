/**
 * One call that says what a dome costs, itemized, and what it costs to run: for the placing card, the Projects panel, the docs table and the branches that
 * add tunnels and bunkers under domes (they call `domeCostSummary(tier, cells)` and add their own lines to `extras`). Pure; tested in pricing.test.ts.
 *
 * The lines add up to `domeCost(...).totalUsd` (shell + skirt and earthwork + airlocks + plant + yard + finish + permit + the crew's wages), so what the
 * card shows is what the bill charges. Plant spares, filtering and the closed ecology are optional upgrades and are listed apart (`options`).
 */
import { CREW_RATE, billUsd, domeCost } from './cost';
import { portBill, portVestibule, vehicleFits } from './vehiclePort';
import { TIER, shellFt, type DomeTier } from './tiers';
import { domeGeometry } from './geometry';
import { yardBill, hasYard } from './plantYard';
import { MATERIALS } from '../materials';
import { advancedFilterUsd, closedEcologyUsd, scrubberUsd } from './air';
import { domeLoad, nightKwhPerDay } from './climate';
import { auxKwhDay } from './live';
import { spareUsd } from './plantUnits';
import { geoLines, geoOptions, type GeoSpec } from './geothermal';
import { runningCost, type Running } from './pricing';

export interface CostLine { id: string; label: string; usd: number }
export interface DomeSummary {
  tier: DomeTier; cells: number; diameterFt: number; floorSf: number;
  /** The bill, itemized: shell, skirt and earthwork (its own lines in `earthwork`), airlocks, plant, yard, finish, permit, crew wages. Adds up to `totalUsd`. */
  lines: CostLine[];
  earthwork: CostLine[];
  totalUsd: number; usdPerSqFt: number;
  /** Optional: the second chiller and transformer, the filtering levels, the closed ecology. Not in the total. */
  options: CostLine[];
  /** Added by other branches (tunnels, bunkers under the dome) and counted in `grandUsd`. */
  extras: CostLine[]; grandUsd: number;
  running: Running;
}

const good = (n: number, g: keyof typeof MATERIALS): number => n * (MATERIALS[g].price ?? 0);

/** `geo` (save v107): the geothermal and heat-rejection choices the dome has or the card shows; their itemized prices join `extras` and so the grand total. Every offer is also listed in `options` (not in the total). */
export function domeCostSummary(tier: DomeTier, cells: number = TIER[tier].cells, extras: CostLine[] = [], geo: GeoSpec = {}): DomeSummary {
  const c = domeCost(tier, cells), g = domeGeometry(tier, shellFt(tier, cells)), b = c.bill, ew = c.earthwork;
  const earth = ew.lines.map(l => ({ id: l.id, label: l.label, usd: l.usd }));
  const earthUsd = ew.usd;
  const yard = hasYard(tier) ? billUsd(yardBill(tier, g.radiusFt / 20).bill) : 0;
  const shell = c.stages.frame && c.stages.roof ? billUsd(c.stages.frame) + billUsd(c.stages.roof) : 0;
  const airlocks = good(b.dome_airlock ?? 0, 'dome_airlock') - (hasYard(tier) ? good(1, 'dome_airlock') : 0);
  const plant = good(b.dome_air_plant ?? 0, 'dome_air_plant'), fit = good(b.dome_fitout ?? 0, 'dome_fitout');
  const skirtMat = good(b.concrete ?? 0, 'concrete') + good(b.rebar ?? 0, 'rebar') - 0;
  // the yard's own concrete, steel, hardware, cable and pipe are inside the bill's totals: take them out of the skirt line and show them as the yard
  const yb = hasYard(tier) ? yardBill(tier, g.radiusFt / 20).bill : {};
  const yardConcrete = good(yb.concrete ?? 0, 'concrete') + good(yb.rebar ?? 0, 'rebar');
  const skirt = skirtMat - yardConcrete;
  const lines: CostLine[] = [
    { id: 'shell', label: 'Shell, frame and glazing, erected', usd: shell },
    { id: 'skirt', label: `Buried skirt, ${TIER[tier].skirtFt} ft deep: concrete and steel`, usd: skirt },
    { id: 'earthwork', label: 'Earthwork: crater, rock, shoring, dewatering, skirt forms', usd: earthUsd },
    { id: 'airlocks', label: TIER[tier].airlocks ? `${TIER[tier].airlocks} person airlock${TIER[tier].airlocks > 1 ? 's' : ''} (the main entrance${TIER[tier].airlocks > 1 ? ' and a second' : ''})` : 'No airlocks', usd: airlocks },
    { id: 'plant', label: 'Air and climate plant (chillers, air handlers, controls)', usd: plant },
    { id: 'yard', label: 'Hardened plant yard, service airlock and passage', usd: yard },
    { id: 'finish', label: 'Finish: paths, drainage, beds, lighting', usd: fit },
    { id: 'permit', label: 'County permit', usd: c.permitUsd },
    { id: 'labor', label: 'Crew wages on site', usd: c.laborUsd },
  ].filter(l => l.usd > 0 || l.id === 'shell');
  // anything the lines did not catch (the earthen dome's hardware, rounding) goes to the shell line so the lines always add to the bill
  const gap = c.totalUsd - lines.reduce((a, l) => a + l.usd, 0);
  lines[0].usd += gap;
  // the vehicle sally port (PROPOSED, docs/DECISIONS.md 2026-11-19): its kits, bollards, camera, paving and crew, itemized and counted in the grand total (the blueprint charges the same goods)
  const pb = portBill(tier, g.radiusFt / 20), pv = portVestibule(tier, g.radiusFt / 20);
  const portExtras: CostLine[] = pv ? [{ id: 'vehicle_port', label: `Vehicle sally port (two interlocked gates, ${Math.round(pv.len * 20)} ft lock chamber${vehicleFits(pv) ? '' : ', handcart size'}), bollards, camera, apron${vehicleFits(pv) ? ' and inside lane' : ''}`, usd: billUsd(pb.bill) + Math.round(pb.hours * CREW_RATE / 100) * 100 }] : [];
  extras = [...portExtras, ...extras, ...geoLines(tier, cells, geo)];
  const opts: CostLine[] = [];
  if (tier !== 'earthen') {
    opts.push({ id: 'spare_chiller', label: 'Second chiller plant (N+1)', usd: spareUsd(tier, cells, 'chiller', 'none') ?? 0 });
    opts.push({ id: 'spare_sub', label: 'Second transformer (N+1)', usd: spareUsd(tier, cells, 'substation', 'none') ?? 0 });
    opts.push({ id: 'scrubber', label: 'CO2 scrubber bank', usd: scrubberUsd(tier, cells) });
    opts.push({ id: 'advanced', label: 'Advanced filtering (HEPA, carbon)', usd: advancedFilterUsd(tier, cells) });
    opts.push({ id: 'closed', label: 'Closed ecology', usd: closedEcologyUsd(tier, cells) });
    for (const o of geoOptions(tier, cells)) opts.push({ id: `geo_${o.id}`, label: o.label, usd: o.usd });
  }
  // the design day is the worse of a 20 F night kept frost-free and a 100 F day in full sun held in the temperate band, plus the always-on house load
  const kwh = Math.max(nightKwhPerDay(tier, cells, 20, 'frost'), domeLoad(tier, cells, 100, 1, 'temperate').kwhPerDay) + auxKwhDay(tier, cells);
  return {
    tier, cells, diameterFt: c.diameterFt, floorSf: Math.round(g.footprintSf), lines, earthwork: earth, totalUsd: c.totalUsd, usdPerSqFt: Math.round(c.totalUsd / g.footprintSf),
    options: opts, extras, grandUsd: c.totalUsd + extras.reduce((a, l) => a + l.usd, 0), running: runningCost(tier, kwh, c.totalUsd - c.permitUsd - c.laborUsd),
  };
}
