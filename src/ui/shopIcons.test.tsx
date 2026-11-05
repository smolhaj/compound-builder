import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { SHELVES } from '../sim/shelves';
import { MATERIALS } from '../sim/materials';
import { FOOD } from '../sim/pantry';
import { GUNS } from '../sim/armory';
import { Icon } from './ShopWindow';

/** The gray placeholder is `box('#555')` in ShopWindow's `default`: a 28x22 rect filled #555. */
const placeholder = (id: string): boolean => renderToStaticMarkup(<Icon id={id} />).includes('width="28" height="22" rx="2" fill="#555"');

/** Every card in the shop has a drawn icon: nothing falls through to the gray placeholder box. */
describe('shop icons', () => {
  it('the placeholder detector works', () => expect(placeholder('no_such_good')).toBe(true));
  it('every buyable good on every shelf has an icon', () => {
    const missing: string[] = [];
    for (const [tab, ids] of Object.entries(SHELVES)) for (const id of new Set(ids)) if (MATERIALS[id].price !== null && placeholder(id)) missing.push(`${tab}:${id}`);
    expect(missing).toEqual([]);
  });
  it('every food prop, gun look and the ammo tile has an icon', () => {
    const missing: string[] = [];
    for (const f of Object.values(FOOD)) if (placeholder(`f:${f.prop}`)) missing.push(`f:${f.prop}`);
    for (const m of GUNS) { const look = m.look ?? (['pistol', 'revolver'].includes(m.type) ? 'handgun' : m.type === 'pump' ? 'shotgun' : 'rifle'); if (placeholder(look)) missing.push(look); }
    if (placeholder('ammo')) missing.push('ammo');
    expect(missing).toEqual([]);
  });
});
