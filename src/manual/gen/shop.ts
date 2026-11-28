import { MATERIALS, type MaterialId } from '../../sim/materials';
import { SHELF_TABS, SHELVES } from '../../sim/shelves';
import { PRESETS, ruleOf, type Rule } from '../../sim/shopQuickBuy';
import { FOOD } from '../../sim/pantry';
import { bullets, table } from '../md';
import { usd } from './common';

/** What the Shop's quick-buy says about a good, in words. */
export function adviceOf(r: Rule): string {
  const alt = r.alt ? ` Never added by "everything": ${r.alt}.` : '';
  switch (r.kind) {
    case 'single': return `One is enough.${alt}`;
    case 'person': return `${r.of === 'fighters' ? 'One per fighter' : r.per && r.per > 1 ? `One per ${r.per} people` : 'One per person'}.${r.when === 'kids' ? ' Only worth it with kids.' : ''}${alt}`;
    case 'capped': return `Up to ${r.max}.${alt}`;
    case 'stack': return `${r.rec ? 'Quick-buy keeps a recommended stock.' : 'Buy as much as the plans need.'}${alt}`;
  }
}

/** Every shelf of the Shop, its goods with the unit they are sold in, the price and the quick-buy advice. */
export function shopGoods(): string {
  const out: string[] = [];
  for (const [tab, label] of SHELF_TABS) {
    const ids = [...new Set(SHELVES[tab])].filter(id => MATERIALS[id]?.price != null);
    if (!ids.length) continue;
    out.push(`### ${label}`, '', table(['Good', 'Sold as', 'Price', 'Quick-buy advice'], ids.map(id => {
      const m = MATERIALS[id as MaterialId];
      return [m.name, m.unit, usd(m.price!), adviceOf(ruleOf(id as MaterialId))];
    })), '');
  }
  return out.join('\n').trim();
}

/** Pantry stock rows: sold item by item in the food table. */
const FOOD_STOCKS: ReadonlySet<string> = new Set(['frozen', 'canned', 'staples', 'fresh']);

/** Goods with a price that sit on no shelf (bought through another screen): listed so nothing for sale is missing from the manual. */
export function unshelvedGoods(): MaterialId[] {
  const shelved = new Set(Object.values(SHELVES).flat());
  return (Object.keys(MATERIALS) as MaterialId[]).filter(id => MATERIALS[id].price != null && !shelved.has(id) && !FOOD_STOCKS.has(id));
}

export function shopOther(): string {
  const ids = unshelvedGoods();
  if (!ids.length) return 'Every good for sale sits on a shelf above.';
  return table(['Good', 'Sold as', 'Price'], ids.map(id => [MATERIALS[id].name, MATERIALS[id].unit, usd(MATERIALS[id].price!)]));
}

export function shopFood(): string {
  const foods = Object.values(FOOD);
  return table(['Food', 'Sold as', 'Price', 'Calories', 'Keeps (years)'], foods.map(f => [f.name, f.unit, f.price == null ? 'not sold' : usd(f.price), f.kcal.toLocaleString('en-US'), String(f.life)]));
}

export function shopPresets(): string {
  return bullets(PRESETS.map(p => `**${p.name}**: ${p.text}`));
}
