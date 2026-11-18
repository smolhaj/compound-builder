// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { catalogEntries } from '../../sim/buildCatalog';
import { DOME_KINDS } from '../../sim/dome/tiers';
import { CatIcon } from './catalogIcons';

describe('catalog pictograms', () => {
  it('every Build card renders an svg with drawn shapes (no blank squares)', () => {
    const all = catalogEntries();
    expect(all.length).toBeGreaterThan(50);
    for (const e of all) {
      const html = renderToStaticMarkup(<CatIcon cat={e.cat} kind={e.key} />);
      expect(html, `${e.key} (${e.cat})`).toMatch(/<svg[^>]*>\s*<(rect|path|circle|ellipse)/);
    }
  });
  it('the dome kinds are in the catalog and each tier has its own picture', () => {
    const keys = new Set(catalogEntries().map(e => e.key));
    const pics = new Set<string>();
    for (const k of DOME_KINDS) { expect(keys.has(k)).toBe(true); pics.add(renderToStaticMarkup(<CatIcon cat="enclosure" kind={k} />)); }
    expect(pics.size).toBe(DOME_KINDS.length);
  });
});
