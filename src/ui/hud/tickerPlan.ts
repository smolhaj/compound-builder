/**
 * Layout A breaking-news banner (docs/UX_AUDIT.md 11.4), pure. The bottom strip of headlines is gone; a headline shows only when it is a
 * true emergency, only while it is fresh, one at a time, and never when something else on screen already says it (a chip, a card, a row).
 *   breaking = tone 2 or 3 (the sim's warning and danger tones)
 * Everything else is in the Board's Feed, Radio and Log.
 */
import { isRepeat } from './toastQueue';

export interface NewsItem { t: number; text: string; tone: 0 | 1 | 2 | 3 }
/** Days of game time a headline stays fresh, and real ms it stays on screen. */
export const BANNER_FRESH_DAYS = 0.75;
export const BANNER_MS = 12000;

export const isBreaking = (n: NewsItem): boolean => n.tone >= 2;

/** The headline to show now, or null. `dismissed` is the `t` of the last one the player closed (or that already had its time). */
export function bannerFor(news: readonly NewsItem[], now: number, dismissedT: number | null, onScreen: readonly string[] = []): NewsItem | null {
  for (let i = news.length - 1; i >= 0; i--) {
    const n = news[i];
    if (!isBreaking(n)) continue;
    if (dismissedT !== null && n.t <= dismissedT) return null;   // (newest breaking one was already seen)
    if (now - n.t > BANNER_FRESH_DAYS) return null;
    if (isRepeat(n.text, onScreen)) return null;
    return n;
  }
  return null;
}
