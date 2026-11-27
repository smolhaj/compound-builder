/**
 * The layout A toast stack (docs/UX_AUDIT.md 11.5, tier "toast"), pure: at most `TOAST_CAP` lines at once, newest last, a repeat of a
 * line already up only refreshes it, and the oldest goes when a new one needs room. A toast that repeats the one-line text of a
 * card on screen is dropped by the caller via `skip`.
 */
export type ToastTone = 'good' | 'warn' | 'info';
export interface Toast { id: string; text: string; tone: ToastTone; /** ms it stays. */ ttl: number; /** ms timestamp it was added or refreshed. */ at: number }
export const TOAST_CAP = 3;
export const TOAST_TTL = { fine: 4000, long: 7000 } as const;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Add a toast: a repeat refreshes, more than the cap drops the oldest. */
export function pushToast(list: readonly Toast[], t: Omit<Toast, 'at'> & { at: number }, cap: number = TOAST_CAP): Toast[] {
  const same = list.findIndex(x => norm(x.text) === norm(t.text));
  const next = same >= 0 ? list.map((x, i) => (i === same ? { ...x, at: t.at, ttl: Math.max(x.ttl, t.ttl) } : x)) : [...list, t];
  return next.length > cap ? next.slice(next.length - cap) : next;
}
/** What is still up at `now`. */
export const liveToasts = (list: readonly Toast[], now: number): Toast[] => list.filter(t => now - t.at < t.ttl);
/** Is `text` already said by something else on screen? */
export const isRepeat = (text: string, others: readonly string[]): boolean => { const n = norm(text); return !!n && others.some(o => { const m = norm(o); return m === n || (m.length > 12 && n.includes(m)) || (n.length > 12 && m.includes(n)); }); };

/**
 * A purchase result replaces the purchase result already up (one purchase line at a time: a run of buys on a page does not pile lines over the view). `prefix` is the id
 * prefix of that kind of toast; other toasts stay.
 */
export const replaceKind = (list: readonly Toast[], prefix: string): Toast[] => list.filter(x => !x.id.startsWith(prefix));
