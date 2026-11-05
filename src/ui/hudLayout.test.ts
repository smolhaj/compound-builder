import { describe, expect, it } from 'vitest';
import { hudLayout } from './hudLayout';

describe('hud layout', () => {
  it('keeps the panels beside a bar that fits between them', () => {
    const l = hudLayout(1920, 800, 40);
    expect(l.panelTop).toBe(10);
    expect(l.narrow).toBe(false);
  });
  it('drops the panels below a bar that would sit under one (1280 px with the owe chip)', () => {
    const l = hudLayout(1280, 760, 40);
    expect(l.panelTop).toBeGreaterThanOrEqual(10 + 40);
  });
  it('shows one panel at a time at phone widths, under the bar and the switch', () => {
    const l = hudLayout(420, 400, 90);
    expect(l.narrow).toBe(true);
    expect(l.panelTop).toBeGreaterThan(10 + 90);
    expect(l.leftW).toBeLessThanOrEqual(400);
    expect(l.rightW).toBeLessThanOrEqual(400);
  });
});
