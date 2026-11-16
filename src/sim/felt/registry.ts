/** The felt layer's per-kind specs (docs/FELT_LAYER.md section 4.2). One module per kind; the FL7 to FL11 content packages fill their own files. */
import type { FeltKind, FeltSpec } from './types';
import { felt as gridDown } from './kinds/grid_down';
import { felt as financial } from './kinds/financial';
import { felt as lawless } from './kinds/lawless';
import { felt as drought } from './kinds/drought';
import { felt as pandemic } from './kinds/pandemic';
import { felt as nuclear } from './kinds/nuclear';
import { felt as solarFlare } from './kinds/solar_flare';
import { felt as wildfire } from './kinds/wildfire';
import { felt as ashWinter } from './kinds/ash_winter';
import { felt as cyberattack } from './kinds/cyberattack';
import { felt as zombies } from './kinds/zombies';
import { felt as invasion } from './kinds/invasion';
import { felt as civilWar } from './kinds/civil_war';
import { felt as bioweapon } from './kinds/bioweapon';
import { felt as asteroid } from './kinds/asteroid';
import { felt as unknown } from './kinds/unknown';
import { felt as emp } from './kinds/emp';
import { felt as megaQuake } from './kinds/mega_quake';
import { felt as cropBlight } from './kinds/crop_blight';
import { felt as damFlood } from './kinds/dam_flood';
import { felt as supervolcano } from './kinds/supervolcano';
import { felt as livestockPlague } from './kinds/livestock_plague';
import { felt as satelliteLoss } from './kinds/satellite_loss';
import { felt as oilShock } from './kinds/oil_shock';
import { felt as reactorMeltdown } from './kinds/reactor_meltdown';
import { felt as globalFamine } from './kinds/global_famine';
import { felt as waterWar } from './kinds/water_war';
import { felt as cultTakeover } from './kinds/cult_takeover';
import { felt as massExodus } from './kinds/mass_exodus';

export const FELT: Record<FeltKind, FeltSpec> = {
  grid_down: gridDown,
  financial: financial,
  lawless: lawless,
  drought: drought,
  pandemic: pandemic,
  nuclear: nuclear,
  solar_flare: solarFlare,
  wildfire: wildfire,
  ash_winter: ashWinter,
  cyberattack: cyberattack,
  zombies: zombies,
  invasion: invasion,
  civil_war: civilWar,
  bioweapon: bioweapon,
  asteroid: asteroid,
  unknown: unknown,
  emp: emp,
  mega_quake: megaQuake,
  crop_blight: cropBlight,
  dam_flood: damFlood,
  supervolcano: supervolcano,
  livestock_plague: livestockPlague,
  satellite_loss: satelliteLoss,
  oil_shock: oilShock,
  reactor_meltdown: reactorMeltdown,
  global_famine: globalFamine,
  water_war: waterWar,
  cult_takeover: cultTakeover,
  mass_exodus: massExodus,
};

export const FELT_KINDS = Object.keys(FELT) as FeltKind[];
/** The spec for a kind (a kind the registry does not know has none). */
export const feltSpec = (kind: string | null | undefined): FeltSpec | null => (kind ? (FELT as Record<string, FeltSpec | undefined>)[kind] ?? null : null);
