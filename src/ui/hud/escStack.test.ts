import { describe, expect, it } from 'vitest';
import { ESC_ORDER, NO_ESC, escOwns, escTop } from './escStack';

describe('esc stack', () => {
  it('is empty when nothing is up', () => expect(escTop(NO_ESC)).toBeNull());
  it('closes one thing per press, in order', () => {
    const all = { tool: true, overlay: true, window: true, camera: true, view: true, drawer: true };
    const seen: string[] = [];
    let s = { ...all };
    for (let i = 0; i < 8; i++) { const l = escTop(s); if (!l) break; seen.push(l); s = { ...s, [l]: false }; }
    expect(seen).toEqual([...ESC_ORDER]);
    expect(seen).toEqual(['tool', 'overlay', 'window', 'camera', 'view', 'drawer']);
  });
  it('a tool, a window or a decision keeps the drawer open', () => {
    for (const l of ['tool', 'overlay', 'window', 'camera'] as const) expect(escTop({ ...NO_ESC, drawer: true, [l]: true })).toBe(l);
    expect(escTop({ ...NO_ESC, drawer: true })).toBe('drawer');
  });
  it('the stack owns the drawer and the View box only', () => {
    expect(ESC_ORDER.filter(escOwns)).toEqual(['view', 'drawer']);
  });
});
