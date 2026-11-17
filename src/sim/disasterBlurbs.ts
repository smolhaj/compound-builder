/**
 * One plain-language line per disaster, for the Scenario picker and the Free build / God Mode trigger menu (what it is, in a sentence a
 * newcomer understands, with the thing that makes it different from the rest). American English. Pure data.
 */
import type { DisasterKind } from './disaster';

export const BLURB: Record<DisasterKind, string> = {
  grid_down: 'The power goes out for weeks, months or years (ice storm, attack on substations, cyberattack). The baseline: easy if you make your own power.',
  nuclear: 'Missiles fly. Fallout, a long shelter-in-place, a nuclear winter and a collapsed world.',
  lawless: 'The police stop coming. Looters, gangs and checkpoints fill the gap while the lights stay on.',
  financial: 'Banks freeze or fail: cash gets dear, savings are cut, and hard goods and gold are what hold value.',
  drought: 'A years-long dry spell. Wells fail, crops scorch, refugees come from the dry towns.',
  pandemic: 'A new disease keeps the world indoors in waves. The systems hold; the people do not.',
  solar_flare: 'A huge solar storm burns out transformers and part of the electronics. Spares in a metal box win.',
  wildfire: 'A fire front sweeps the valley in days. Clear the brush or lose the buildings.',
  ash_winter: 'A supervolcano erupts. Ash on the roofs, a dim sun and a cold, short growing season for years.',
  cyberattack: 'Cards, pumps, phones and controllers fail by turns. Cash and a manual override matter.',
  zombies: 'The dead walk. A wall, a quiet camp and a clear head. (Pulpy.)',
  invasion: 'Foreign troops hold the county: checkpoints, curfews and requisition orders. (Pulpy.)',
  civil_war: 'Two armies split the country. Front lines, militias, recruiters and deserters. (Pulpy.)',
  bioweapon: 'An engineered plague worse than any natural one. Quarantine and a closed gate. (Pulpy.)',
  asteroid: 'An asteroid is coming and everyone knows the date. Move or dig in, then a long dark winter. (Pulpy.)',
  unknown: 'Lights in the sky, and then the neighbors are simply gone. What happened is a secret. (Pulpy.)',
  emp: 'A high-altitude pulse kills every modern machine at once: no fallout, no winter, just a silent world and old trucks that still run.',
  mega_quake: 'The big one: minutes of shaking, cracked roads, broken wells and aftershocks for weeks. Build tight and bolt the sill.',
  crop_blight: 'Blight, rust or locusts ruin the harvest. The grid is up and the shelves thin all year. Saved seed and mixed crops are the answer.',
  dam_flood: 'A dam fails upstream and a wall of water comes down the valley. Build above the creek; mud, mold and a washed-out road follow.',
  supervolcano: 'The caldera erupts. Ash loads the roofs day after day; filters, respirators and a good roof matter.',
  livestock_plague: 'Avian flu, foot-and-mouth or swine fever. Your flock and herd may have to be culled; eggs and meat vanish from the stores.',
  satellite_loss: 'The satellites die. The lights stay on, but cards, GPS, forecasts and trucking fail slowly. Paper maps and a ham radio win.',
  oil_shock: 'The oil stops. Pumps run dry, trucks park, food gets dear and neighbors siphon each other\'s tanks. The grid stays up.',
  reactor_meltdown: 'A nuclear plant fails. A plume paints a stripe across the map: the world works except inside the keep-out zone.',
  global_famine: 'The world\'s harvests fail. Rationing, a grain levy and seed worth more than gold. Hungry people everywhere.',
  water_war: 'A river compact breaks and a reservoir dies. Wells drop, ditch riders and tanker gangs rule, and water rights are life.',
  cult_takeover: 'A movement captures the council and tithes the valley. A nonviolent enemy: recruiters, a Common Store and a hard choice.',
  mass_exodus: 'The cities empty onto your county road under martial law. Hospitality, billeting orders and checkpoints.',
};
