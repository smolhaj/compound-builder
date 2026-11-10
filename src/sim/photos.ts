/**
 * Photos (GDS §8 photo mode; docs/GDS_AUDIT.md "photo capture"): the family takes a picture of the place, gives it a caption, and it is kept
 * in the chronicle. The picture itself (a small JPEG data URL) lives OUTSIDE the game state, in the photo vault (sim/save/photoVault.ts, its own
 * IndexedDB store), because the state is cloned on every tick; the state keeps only this small record. Bounded three ways: at most
 * `MAX_PHOTOS` photos (the oldest is let go to make room), each at most `MAX_PHOTO_CHARS` characters of JPEG data URL, captions at most
 * `MAX_CAPTION` characters. Imported files are cleaned by `cleanPhotoData`. Pure (tested).
 */
import { chronicle } from './lineage';
import { calendarOf, type GameState } from './state';

export const MAX_PHOTOS = 16;
/** A 384 x 216 JPEG at quality 0.62 is 12-30 KB; this is roughly 45 KB of base64, so the vault never passes ~0.75 MB. */
export const MAX_PHOTO_CHARS = 60_000;
export const MAX_CAPTION = 100;
export const PHOTO_W = 384, PHOTO_H = 216;
const PREFIX = 'data:image/jpeg;base64,';

/** What the game state keeps: the pixels are in the vault under the same id. */
export interface PhotoMeta { id: string; /** Game day (clock.t). */ t: number; year: number; caption: string; /** Size of the data URL, characters. */ size: number }

export const validPhotoData = (d: unknown): d is string => typeof d === 'string' && d.startsWith(PREFIX) && d.length > PREFIX.length && d.length <= MAX_PHOTO_CHARS && /^[A-Za-z0-9+/=]+$/.test(d.slice(PREFIX.length));

export const cleanCaption = (c: string): string => [...c].map(ch => (ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127 ? ' ' : ch)).join('').replace(/\s+/g, ' ').trim().slice(0, MAX_CAPTION);

const SEASON = (doy: number): string => (doy < 60 || doy >= 335 ? 'Winter' : doy < 152 ? 'Spring' : doy < 244 ? 'Summer' : 'Fall');

/** "Spring 2029, day 112" for a photo with no caption of its own. */
export function defaultCaption(s: Pick<GameState, 'clock'>): string {
  const c = calendarOf(s.clock);
  return `${SEASON(c.doy)} ${c.year}, day ${c.doy}`;
}

export const photosOf = (s: GameState): PhotoMeta[] => s.photos ?? [];

export interface TakeResult { ok: true; photo: PhotoMeta; dropped: string[] }
export interface TakeFail { ok: false; why: string }

/**
 * Keep a photo: the record goes in the state, a line in the chronicle. Returns the ids to delete from the vault (the oldest, when the
 * album was full). Mutates `s`.
 */
export function takePhoto(s: GameState, data: string, caption: string, id: string): TakeResult | TakeFail {
  if (!validPhotoData(data)) return { ok: false, why: (data as string).length > MAX_PHOTO_CHARS ? 'That picture is too big to keep.' : 'That is not a picture the album can keep.' };
  const list = (s.photos ??= []);
  if (list.some(p => p.id === id)) return { ok: false, why: 'Already kept.' };
  const cap = cleanCaption(caption) || defaultCaption(s);
  const photo: PhotoMeta = { id, t: s.clock.t, year: calendarOf(s.clock).year, caption: cap, size: data.length };
  list.push(photo);
  const dropped: string[] = [];
  while (list.length > MAX_PHOTOS) { const d = list.shift(); if (d) dropped.push(d.id); }
  chronicle(s, 'photo', cap, photo.id);
  return { ok: true, photo, dropped };
}

/** Throw a photo away (album and vault; the chronicle keeps the caption line). */
export function dropPhoto(s: GameState, id: string): boolean {
  const list = s.photos ?? [], i = list.findIndex(p => p.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}

/** Fix the album records of a loaded or imported state (mutates): shapes, caption length, count, duplicates. Returns whether anything changed. */
export function cleanPhotoMeta(s: GameState): boolean {
  if (s.photos === undefined) return false;
  const before = JSON.stringify(s.photos);
  const seen = new Set<string>();
  const ok = (Array.isArray(s.photos) ? s.photos : []).filter(p => p && typeof p.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(p.id) && Number.isFinite(p.t) && !seen.has(p.id) && !!seen.add(p.id))
    .map(p => ({ id: p.id, t: p.t, year: Number.isFinite(p.year) ? p.year : 0, caption: cleanCaption(String(p.caption ?? '')), size: Number.isFinite(p.size) ? p.size : 0 }));
  s.photos = ok.slice(-MAX_PHOTOS);
  return JSON.stringify(s.photos) !== before;
}

/** Keep only pixels that belong to a record and look like a small JPEG; records without good pixels are removed from the state. */
export function cleanPhotoData(s: GameState, data: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  const src = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const known = new Set((s.photos ?? []).map(p => p.id));
  for (const [id, d] of Object.entries(src)) if (known.has(id) && validPhotoData(d)) out[id] = d;
  if (s.photos) s.photos = s.photos.filter(p => p.id in out);
  return out;
}

/** The scale an off-screen copy of the view is cut to: 16:9 from the middle of the picture, never up. */
export function cropTo16x9(w: number, h: number): { sx: number; sy: number; sw: number; sh: number } {
  const want = PHOTO_W / PHOTO_H;
  if (w / h > want) { const sw = Math.round(h * want); return { sx: Math.round((w - sw) / 2), sy: 0, sw, sh: h }; }
  const sh = Math.round(w / want);
  return { sx: 0, sy: Math.round((h - sh) / 2), sw: w, sh };
}
