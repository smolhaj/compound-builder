import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { MAX_CAPTION, MAX_PHOTOS, MAX_PHOTO_CHARS, cleanCaption, cleanPhotoData, cleanPhotoMeta, cropTo16x9, defaultCaption, dropPhoto, takePhoto, validPhotoData } from './photos';
import { exportJson, importJson } from './save/migrations';
import { readSaveFile } from './save/saveFile';

const jpeg = (n = 40) => 'data:image/jpeg;base64,' + 'A'.repeat(n);

describe('photo album', () => {
  it('keeps a photo with a chronicle line and a default caption', () => {
    const g = newGame(1);
    const r = takePhoto(g, jpeg(), '', 'p1');
    expect(r.ok).toBe(true);
    expect(g.photos).toHaveLength(1);
    expect(g.photos![0].caption).toBe(defaultCaption(g));
    expect(g.lineage.chronicle.at(-1)).toMatchObject({ kind: 'photo', photo: 'p1' });
  });
  it('rejects anything that is not a small jpeg data URL', () => {
    const g = newGame(1);
    for (const bad of ['', 'data:image/png;base64,AAAA', 'http://x/y.jpg', jpeg(MAX_PHOTO_CHARS), 'data:image/jpeg;base64,<script>', 'data:image/jpeg;base64,']) {
      expect(validPhotoData(bad)).toBe(false);
      expect(takePhoto(g, bad, 'x', 'p' + bad.length).ok).toBe(false);
    }
    expect(g.photos ?? []).toHaveLength(0);
    expect(takePhoto(g, jpeg(MAX_PHOTO_CHARS - 40), 'x', 'big').ok).toBe(true);
  });
  it('is bounded: the oldest goes when the album is full, and its id is returned for the vault', () => {
    const g = newGame(1), dropped: string[] = [];
    for (let i = 0; i < MAX_PHOTOS + 3; i++) { const r = takePhoto(g, jpeg(), 'n' + i, 'p' + i); if (r.ok) dropped.push(...r.dropped); }
    expect(g.photos).toHaveLength(MAX_PHOTOS);
    expect(dropped).toEqual(['p0', 'p1', 'p2']);
    expect(g.photos![0].id).toBe('p3');
  });
  it('cleans captions and refuses a duplicate id', () => {
    expect(cleanCaption('  a\n\tb \u0000 c  ')).toBe('a b c');
    expect(cleanCaption('x'.repeat(500))).toHaveLength(MAX_CAPTION);
    const g = newGame(1);
    takePhoto(g, jpeg(), 'one', 'p1');
    expect(takePhoto(g, jpeg(), 'two', 'p1').ok).toBe(false);
  });
  it('throws a photo away', () => {
    const g = newGame(1); takePhoto(g, jpeg(), 'one', 'p1');
    expect(dropPhoto(g, 'p1')).toBe(true); expect(dropPhoto(g, 'p1')).toBe(false); expect(g.photos).toHaveLength(0);
  });
  it('crops to 16:9 from the middle', () => {
    expect(cropTo16x9(1920, 1080)).toEqual({ sx: 0, sy: 0, sw: 1920, sh: 1080 });
    const w = cropTo16x9(1000, 1000); expect(w.sh).toBe(563); expect(w.sy).toBe(219);
    const n = cropTo16x9(3000, 1000); expect(n.sw).toBe(1778); expect(n.sx).toBe(611);
  });
});

describe('import and export', () => {
  it('round-trips through the JSON file with its pixels', () => {
    const g = newGame(1); takePhoto(g, jpeg(), 'sunrise', 'p1');
    const text = exportJson(g, { p1: jpeg() });
    const res = readSaveFile(text);
    expect(res.ok).toBe(true);
    if (res.ok) { expect(res.state.photos).toHaveLength(1); expect(res.photoData).toEqual({ p1: jpeg() }); }
  });
  it('drops records without good pixels and pixels without records; clamps a hostile file', () => {
    const g = newGame(1); takePhoto(g, jpeg(), 'a', 'p1'); takePhoto(g, jpeg(), 'b', 'p2');
    const evil = { p1: jpeg(), p2: 'javascript:alert(1)', p9: jpeg(), p3: 'x'.repeat(MAX_PHOTO_CHARS * 3) };
    const res = readSaveFile(exportJson(g, evil as never));
    if (!res.ok) throw new Error('should read');
    expect(Object.keys(res.photoData)).toEqual(['p1']);
    expect(res.state.photos!.map(p => p.id)).toEqual(['p1']);
  });
  it('cleanPhotoMeta bounds a hostile album', () => {
    const g = newGame(1);
    g.photos = Array.from({ length: 200 }, (_, i) => ({ id: 'q' + i, t: i, year: 1, caption: 'c'.repeat(999), size: 1 }));
    g.photos.push({ id: '../../etc', t: 1, year: 1, caption: 'x', size: 1 }, { id: 'q1', t: 1, year: 1, caption: 'dup', size: 1 }, null as never);
    expect(cleanPhotoMeta(g)).toBe(true);
    expect(g.photos!.length).toBeLessThanOrEqual(MAX_PHOTOS);
    expect(g.photos!.every(p => p.caption.length <= MAX_CAPTION && /^[A-Za-z0-9_-]+$/.test(p.id))).toBe(true);
  });
  it('a game with no album exports and imports without one', () => {
    const g = newGame(1);
    expect(exportJson(g)).not.toContain('photoData');
    expect(importJson(exportJson(g)).photos).toBeUndefined();
  });
  it('cleanPhotoData ignores non-object input', () => {
    const g = newGame(1); takePhoto(g, jpeg(), 'a', 'p1');
    expect(cleanPhotoData(g, null)).toEqual({}); expect(g.photos).toHaveLength(0);
  });
});
