import { describe, expect, it } from 'vitest';
import { bannerFor, type NewsItem } from './tickerPlan';

const n = (t: number, text: string, tone: NewsItem['tone']): NewsItem => ({ t, text, tone });
describe('breaking banner', () => {
  it('ignores ordinary news', () => expect(bannerFor([n(1, 'The clinic is open.', 1)], 1.1, null)).toBeNull());
  it('shows the newest breaking line while fresh', () => {
    expect(bannerFor([n(1, 'Grid down.', 3), n(1.1, 'Calm.', 0)], 1.2, null)?.text).toBe('Grid down.');
  });
  it('goes when stale or dismissed', () => {
    expect(bannerFor([n(1, 'Grid down.', 3)], 3, null)).toBeNull();
    expect(bannerFor([n(1, 'Grid down.', 3)], 1.1, 1)).toBeNull();
  });
  it('never repeats what a chip or card already says', () => {
    expect(bannerFor([n(1, 'Out of food in 3 days', 2)], 1.1, null, ['Out of food in 3 days'])).toBeNull();
  });
});
