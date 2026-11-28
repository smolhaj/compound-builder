import { UTILITY, WATER_CARRIED, WATER_PLUMBED, FUEL_L_PER_KWH, GRID_USD_PER_KWH, GRID_USD_PER_DAY } from '../../sim/utilities';
import { KIT } from '../../game/buildkit/kit';
import { gallons } from '../../sim/units';
import { table } from '../md';
import { usd } from './common';

const gal = (l: number) => `${gallons(l)} gal`;
/** The water and power buildings: what each delivers or stores. */
export function utilityBuildings(): string {
  const rows = Object.entries(UTILITY).map(([k, u]) => {
    const parts: string[] = [];
    if (u.water) parts.push(`${gal(u.water.lpd)} a day${u.water.pressure ? ', piped' : ', carried by hand'}`);
    if (u.store) parts.push(`stores ${gal(u.store)}${u.filtered ? ' (filter it)' : ''}${u.gravity ? ', gives pressure by gravity' : ''}`);
    if (u.irrigation) parts.push(`${gal(u.irrigation)} for the garden, fields and fire (not for drinking)`);
    if (u.solarKw) parts.push(`${u.solarKw} kW of sun at peak`);
    if (u.genKw) parts.push(`${u.genKw} kW generator`);
    if (u.batteryKwh) parts.push(`${u.batteryKwh} kWh of battery`);
    if (u.renew) parts.push(u.renew === 'hydro' ? 'falling water, up to 3 kW round the clock' : 'wind, up to 5 kW');
    if (u.septic) parts.push('lets the toilets flush');
    return [KIT[k]?.name ?? k.replace(/_/g, ' '), parts.join('; ')];
  });
  return table(['Building', 'What it does'], rows);
}
export function utilityFacts(): string {
  return [
    `- A family draws about ${gallons(WATER_CARRIED)} gallons per person a day with carried water, and about ${gallons(WATER_PLUMBED)} when the house is plumbed.`,
    `- A small gas generator burns about ${(FUEL_L_PER_KWH * 0.264172).toFixed(2)} gallon of fuel for each kWh.`,
    `- Grid power, while there is a grid, costs about ${Math.round(GRID_USD_PER_KWH * 100)} cents a kWh plus about ${usd(GRID_USD_PER_DAY)} a day to be connected.`,
  ].join('\n');
}
