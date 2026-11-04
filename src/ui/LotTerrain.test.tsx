// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { LotTerrain, ProfileSvg } from './LotTerrain';
import { makeLotSite } from '../sim/lotListing';
import { LOT_KINDS, LOT_NAME } from '../sim/lots';
import { ANY_WISH, CLASSIC, listings } from '../sim/site';
import { REGION_IDS } from '../sim/regions';

const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('the listing terrain block (server-rendered)', () => {
  it('a lot card shows the cross-section, the facts and a canvas for the preview; the classic place shows nothing', () => {
    for (const kind of LOT_KINDS) {
      const html = renderToStaticMarkup(<LotTerrain site={makeLotSite({ kind, relief: 8, seed: 5 })} />), t = text(html);
      expect(html, kind).toContain('<svg');
      expect(html, kind).toContain('<canvas');
      expect(t, kind).toContain(LOT_NAME[kind]);
      for (const row of ['Relief', 'Flat ground', 'Road in', 'Sun', 'Water head', 'High ground', 'Approaches']) expect(t, `${kind} ${row}`).toContain(row);
      expect(t).not.toMatch(/NaN|undefined|Infinity/);
    }
    expect(renderToStaticMarkup(<LotTerrain site={CLASSIC} />)).toBe('');
  });

  it('no listing draws a rect of negative height (the browser logs an error for each)', () => {
    for (const region of REGION_IDS) for (let seed = 1; seed <= 40; seed++) for (const site of listings(seed, region, ANY_WISH, 6, 5_000_000)) {
      const html = renderToStaticMarkup(<ProfileSvg site={site} />);
      for (const m of html.matchAll(/<rect[^>]*height="(-?[\d.]+)"/g)) expect(Number(m[1]), `${region} ${seed} ${site.id}`).toBeGreaterThanOrEqual(0);
    }
  });

  it('the profile chart has the road end labeled along the fall and north / south across a valley', () => {
    expect(text(renderToStaticMarkup(<ProfileSvg site={makeLotSite({ kind: 'hillside', seed: 3 })} />))).toContain('county road');
    expect(text(renderToStaticMarkup(<ProfileSvg site={makeLotSite({ kind: 'gorge', seed: 3 })} />))).toMatch(/south.*north/);
  });
});
