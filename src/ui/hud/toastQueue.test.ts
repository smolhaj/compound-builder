import { describe, expect, it } from 'vitest';
import { TOAST_CAP, isRepeat, liveToasts, pushToast, type Toast } from './toastQueue';

const t = (id: string, text: string, at = 0, ttl = 4000): Toast => ({ id, text, tone: 'info', ttl, at });
describe('toast queue', () => {
  it('never holds more than the cap, dropping the oldest', () => {
    let l: Toast[] = [];
    for (let i = 0; i < 6; i++) l = pushToast(l, t(String(i), `line ${i}`, i));
    expect(l.length).toBe(TOAST_CAP);
    expect(l.map(x => x.id)).toEqual(['3', '4', '5']);
  });
  it('a repeat refreshes instead of stacking', () => {
    let l = pushToast([], t('a', 'Cannot build there.', 0));
    l = pushToast(l, t('b', 'cannot build there', 3000));
    expect(l.length).toBe(1);
    expect(l[0].at).toBe(3000);
  });
  it('a growing burst with one id replaces its earlier line (ids stay unique)', () => {
    let l = pushToast([], t('f2', 'Bought a well', 0));
    l = pushToast(l, t('f2', 'Bought a well and a pump', 500));
    expect(l.length).toBe(1);
    expect(l[0].text).toBe('Bought a well and a pump');
    expect(new Set(l.map(x => x.id)).size).toBe(l.length);
  });
  it('expires by time', () => {
    const l = [t('a', 'x', 0, 4000), t('b', 'y', 3000, 4000)];
    expect(liveToasts(l, 4500).map(x => x.id)).toEqual(['b']);
  });
  it('detects a repeat of a card line', () => {
    expect(isRepeat('Out of food in 3 days', ['Out of food in 3 days'])).toBe(true);
    expect(isRepeat('Bought a well', ['Out of food in 3 days'])).toBe(false);
  });
});
