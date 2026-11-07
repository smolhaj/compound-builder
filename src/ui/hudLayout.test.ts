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
  it('a centered bar that reaches the right panel (664 px at 1280, the QA run 6 overlap) drops the panels below it', () => {
    const l = hudLayout(1280, 664, 40);
    expect(l.panelTop).toBeGreaterThanOrEqual(10 + 40);
    expect(hudLayout(1280, 580, 40).panelTop).toBe(10);
  });
  it('shows one panel at a time at phone widths, under the bar and the switch', () => {
    const l = hudLayout(420, 400, 90, { w: 400, h: 70 }, { w: 400, h: 110 });
    expect(l.narrow).toBe(true);
    expect(l.panelTop).toBeGreaterThan(10 + 90);
    expect(l.leftW).toBeLessThanOrEqual(400);
    expect(l.rightW).toBeLessThanOrEqual(400);
  });
});

describe('hud layout, bottom panels', () => {
  it('stacks the view panel above the camera panel when the two would meet, side by side otherwise', () => {
    expect(hudLayout(420, 400, 90, { w: 400, h: 70 }, { w: 400, h: 110 }).viewBottom).toBe(34 + 70 + 6);
    expect(hudLayout(1024, 754, 40, { w: 570, h: 40 }, { w: 560, h: 110 }).viewBottom).toBe(34 + 40 + 6);
    expect(hudLayout(1920, 800, 40, { w: 570, h: 40 }, { w: 560, h: 60 }).viewBottom).toBe(34);
  });
});
