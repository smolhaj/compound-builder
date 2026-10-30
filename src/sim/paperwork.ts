/**
 * The paperwork (decided with the user: "Legal & paperwork"; permits "real
 * but light"; after the collapse it "fades with the tracks"). Pure.
 *
 *  Closing costs  about 3 % of the price at purchase (title, escrow, survey, recording).
 *  Property tax   a rate on the assessed value (land + what's built), billed in
 *                 halves on May 1 and November 1. Two finished fields get the
 *                 ag rate on the land. While the county isn't working it piles
 *                 up as back taxes, billed if it comes back.
 *  Insurance      a yearly premium paid monthly (dearer far from a fire station,
 *                 a wood stove adds a little). While the banks work, a building
 *                 lost to fire or ash is paid out at its materials; drop it to save.
 *  Permits        homes, shops, barns, wells, septic, solar and bunker rooms
 *                 need one: a fee and the county's review before work starts.
 *                 Build without and an inspector may notice (a fine, a
 *                 stop-work order, then the permit at double). Counties vary.
 *
 * 2025 figures: rural property tax 0.5–1.5 % by state; rural homeowners
 * insurance $1,500–3,000 a year; residential building permits $1,000–4,000.
 */
import { log } from './economy';
import { blueprintOf, isFinished } from './construction';
import { isHome, totalBill } from './blueprints';
import { MATERIALS, type MaterialId } from './materials';
import { calendarOf, dayIndex, type GameState, type Structure } from './state';
import type { RegionId } from './regions';
import { townTaxHalf } from './weekender';
import { mulberry32 } from './rng';
import { diffOf } from './difficulty';

export const CLOSING_COSTS = 0.03;

/** Property tax rate (of assessed value, a year) and how strict the county is about permits, by region. */
export const COUNTY: Record<RegionId, { tax: number; strict: number }> = {
  mountain_west: { tax: 0.0055, strict: 1 }, appalachia: { tax: 0.005, strict: 0.6 }, desert: { tax: 0.006, strict: 0.6 },
  north_woods: { tax: 0.012, strict: 0.8 },
  // Vermont's Act 250 and NH's high property tax; most Missouri / Arkansas counties have no building code; unincorporated Texas almost none
  new_england: { tax: 0.019, strict: 1.4 }, ozarks: { tax: 0.009, strict: 0.35 }, hill_country: { tax: 0.018, strict: 0.3 }, rust_belt: { tax: 0.016, strict: 1.1 },
  plains: { tax: 0.013, strict: 0.5 }, pnw: { tax: 0.009, strict: 1.6 }, upper_midwest: { tax: 0.015, strict: 1.3 },
};

/** Permit fee by kind (none = no permit needed); review days for homes are longer. */
export const PERMIT_FEE: Record<string, number> = {
  timber_cabin: 2500, log_house: 4000, lodge: 6000, lodge_solar: 7000, stone_house: 4000, timber_frame: 4000, container_house: 2500, adobe_house: 3000, cottage: 2000, guest_house: 1500, moms_house: 2500, workshop: 900, metal_garage: 700, garage_solar: 1000, barn: 800, root_cellar: 300, greenhouse: 150, well_drilled: 450, septic: 900, solar_array: 500, solar_farm: 1500, battery_bank: 600, greenhouse_heated: 600, pond: 700, reservoir: 700, sheep_barn: 500, equipment_yard: 200,
  watchtower_wood: 350, watchtower_octagon: 450, watchtower_concrete: 800, watchtower_hex: 900, watchtower_flood: 900, watchtower_mount: 1200, watchtower_turret: 1500,
  concrete_wall: 1200, container_stack: 900, stone_wall: 800, tunnel_bridge: 2500, slope_tunnel: 1500, rock_tunnel: 3500, micro_hydro: 1800, cabin_village: 4000, helipad: 1800, tower_pod: 900, stilted_house: 3000, boat_dock: 600, marina: 2500, high_tunnel: 300, aquaponics: 900, wind_turbine: 900, gate_garage: 1500, sugar_shack: 500, barnyard: 600,
  bunker_hatch: 600, bunker_floorhatch: 600, bunker_stairs: 600, bunker_corridor: 300, bunker_container: 600, bunker_dorm: 600, bunker_galley: 600, bunker_stores: 600, bunker_plant: 600, bunker_medical: 600, bunker_comms: 300,
};
export const needsPermit = (kind: string) => (PERMIT_FEE[kind] ?? 0) > 0;
export const permitFee = (s: GameState, kind: string) => Math.round((PERMIT_FEE[kind] ?? 0) * (0.6 + 0.4 * COUNTY[s.site.region].strict) / 10) * 10;
export const reviewDays = (s: GameState, kind: string) => Math.max(1, Math.round((isHome(kind) || kind === 'log_house' ? 21 : 7) * COUNTY[s.site.region].strict * diffOf(s.disaster).permits));

export interface Paper {
  /** Pull permits for new builds (fees and the wait), or build without and take the chance. */
  permits: boolean;
  insured: boolean;
  /** Taxes that piled up while the county wasn't working. */
  backTax: number;
  /** Day of the last insurance month paid. */
  paidMonth: number;
  /** Fines paid so far. */
  fines: number;
}
export const newPaper = (): Paper => ({ permits: true, insured: true, backTax: 0, paidMonth: 0, fines: 0 });

/** The county and the banks are working (paperwork is a thing). */
export const countyWorks = (s: GameState) => s.disaster.tracks.banks >= 0.5 && s.disaster.tracks.law >= 0.5;

/** What a structure's materials cost at list price. */
export function materialsValue(kind: string): number {
  const bill = totalBill(blueprintOf({ kind } as Structure));
  return (Object.entries(bill) as Array<[MaterialId, number]>).reduce((a, [m, n]) => a + (MATERIALS[m].price ?? 0) * n, 0);
}

/** Assessed value: the land, the land bought since, what's built (old houses at their listing value). */
export function assessed(s: GameState): { land: number; built: number } {
  const bought = s.land.parcels.filter(p => p.owner === 'you').reduce((a, p) => a + (p.paid ?? 0), 0);
  const fields = s.structures.filter(x => x.kind === 'field' && isFinished(x)).length;
  const land = (s.site.price + bought) * (fields >= 2 ? 0.4 : 1);
  const built = s.structures.filter(x => isFinished(x) && !x.pre).reduce((a, x) => a + materialsValue(x.kind) * 1.6, 0);
  return { land, built };
}
export const yearlyTax = (s: GameState) => { const a = assessed(s); return Math.round((a.land + a.built) * COUNTY[s.site.region].tax); };

/** The home's insured value and the year's premium (0 with no home). */
export function premium(s: GameState): number {
  const homes = s.structures.filter(x => isFinished(x) && isHome(x.kind));
  if (!homes.length) return 0;
  const dwelling = homes.reduce((a, h) => a + (h.pre ? 150_000 : materialsValue(h.kind) * 2.2), 0);
  return Math.round((1200 + dwelling * 0.006) * (s.site.miles > 8 ? 1.3 : 1) + 250);
}

/** Can a structure be built under a permit now? Planning applies for one (fee, review) when permits are on. */
export function applyForPermit(s: GameState, st: Structure): void {
  if (!needsPermit(st.kind) || st.pre) return;
  if (!countyWorks(s)) { st.permit = 'none'; return; }   // nobody at the counter
  if (!s.paper.permits) { st.permit = 'none'; return; }
  const fee = permitFee(s, st.kind);
  s.money -= fee;
  st.permit = 'review';
  st.permitAt = s.clock.t + reviewDays(s, st.kind);
  log(s, `Applied for a permit for the ${st.kind.replace(/_/g, ' ')}: $${fee.toLocaleString('en-US')}, about ${reviewDays(s, st.kind)} days for the county to review it.`);
}

/** Why a permit holds up work (null = it doesn't). */
export function permitHold(s: GameState, st: Structure): string | null {
  if (st.permit === 'review' && s.clock.t < (st.permitAt ?? 0)) return `Waiting on the county permit (${Math.ceil((st.permitAt ?? 0) - s.clock.t)} days)`;
  if (st.permit === 'stopped' && s.clock.t < (st.permitAt ?? 0)) return `Stop-work order: the permit comes through in ${Math.ceil((st.permitAt ?? 0) - s.clock.t)} days`;
  return null;
}

/** Once a day: permits come through, the inspector, taxes, insurance, back taxes. Returns log lines. */
export function paperworkDay(s: GameState): string[] {
  const out: string[] = [];
  const day = dayIndex(s.clock.t), { doy } = calendarOf(s.clock);
  const works = countyWorks(s);
  const r = mulberry32(s.seed * 4111 + day * 7 + 5);
  const strict = COUNTY[s.site.region].strict;
  for (const st of s.structures) {
    if ((st.permit === 'review' || st.permit === 'stopped') && s.clock.t >= (st.permitAt ?? 0)) { st.permit = 'ok'; out.push(`The county approved the permit for the ${st.kind.replace(/_/g, ' ')}.`); }
    // the inspector drives by: unpermitted work under way or finished this past year
    if (works && st.permit === 'none' && (!isFinished(st) || s.clock.t - (st.finishedAt ?? 0) < 365) && (st.stage > 0 || st.done > 0) && r() < 0.0025 * strict) {
      const fee = permitFee(s, st.kind), fine = fee * 3 + 500;
      s.money -= fine + fee * 2;
      s.paper.fines += fine;
      st.permit = isFinished(st) ? 'ok' : 'stopped';
      st.permitAt = s.clock.t + (isFinished(st) ? 0 : 14);
      out.push(`A county inspector saw the ${st.kind.replace(/_/g, ' ')} from the road: a $${fine.toLocaleString('en-US')} fine and the permit at double ($${(fee * 2).toLocaleString('en-US')})${isFinished(st) ? '' : ', and a stop-work order for two weeks'}.`);
    }
  }
  // property tax, in halves on May 1 and November 1
  if (doy === 121 || doy === 305) {
    const half = Math.round(yearlyTax(s) / 2);
    if (works) { s.money -= half; out.push(`Property tax: $${half.toLocaleString('en-US')} (half the year's bill).`); }
    else s.paper.backTax += half;
    // two homes while the family splits its week (sim/weekender.ts): the town house's bill comes in the same halves
    if (s.weekend && s.weekend.town.status !== 'sold') {
      const town = townTaxHalf(s.weekend.town);
      if (works) { s.money -= town; s.weekend.tally.spent += town; out.push(`Property tax on the town house: $${town.toLocaleString('en-US')}.`); }
      else s.paper.backTax += town;
    }
  }
  // back taxes, once the county is properly back
  if (s.paper.backTax > 0 && s.disaster.tracks.banks >= 0.9 && s.disaster.tracks.law >= 0.9) {
    s.money -= s.paper.backTax;
    out.push(`The county is back, and so is the tax bill: $${s.paper.backTax.toLocaleString('en-US')} in back taxes.`);
    s.paper.backTax = 0;
  }
  // insurance, monthly while the banks work
  if (s.paper.insured && day - s.paper.paidMonth >= 30) {
    s.paper.paidMonth = day;
    if (s.disaster.tracks.banks >= 0.5) s.money -= Math.round(premium(s) / 12);
  }
  return out;
}

/** A building was lost (fire, ash): the insurer pays its materials while the banks work. */
export function insuranceClaim(s: GameState, st: Structure, lostShare: number): string | null {
  if (!s.paper.insured || s.disaster.tracks.banks < 0.5 || premium(s) === 0) return null;
  const pay = Math.round(materialsValue(st.kind) * lostShare);
  if (pay <= 0) return null;
  s.money += pay;
  return `The insurance paid $${pay.toLocaleString('en-US')} toward the ${st.kind.replace(/_/g, ' ')}.`;
}
