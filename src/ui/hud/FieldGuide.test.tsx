// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { FieldGuide } from './FieldGuide';
import { PROSE } from '../../manual/prose';

describe('Field Guide drawer', () => {
  it('shows the search box, a chip for every manual section and the first section', () => {
    const html = renderToStaticMarkup(<FieldGuide />);
    expect(html).toContain('data-testid="guide-search"');
    for (const s of PROSE) expect(html, s.id).toContain(`data-testid="guide-chip-${s.id}"`);
    expect(html).toContain('Welcome');
  });
});
