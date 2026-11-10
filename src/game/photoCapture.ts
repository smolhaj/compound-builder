/** Taking a photo: the canvas, drawn once more, cut to 16:9 and stored as a small JPEG data URL (sim/photos.ts sets the bounds). */
import { PHOTO_H, PHOTO_W, MAX_PHOTO_CHARS, cropTo16x9 } from '../sim/photos';

let capturer: (() => string | null) | null = null;
export function setPhotoCapturer(f: (() => string | null) | null): void { capturer = f; }
/** A JPEG data URL of what the camera sees now, or null when there is no scene (or the picture would be too big). */
export function capturePhoto(): string | null { try { return capturer?.() ?? null; } catch { return null; } }

/** Cut a canvas down to the album size. Steps the JPEG quality down until it fits. */
export function encodePhoto(src: HTMLCanvasElement): string | null {
  if (!src.width || !src.height) return null;
  const { sx, sy, sw, sh } = cropTo16x9(src.width, src.height);
  const out = document.createElement('canvas');
  out.width = PHOTO_W; out.height = PHOTO_H;
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, PHOTO_W, PHOTO_H);
  for (const q of [0.62, 0.5, 0.38, 0.28]) {
    const d = out.toDataURL('image/jpeg', q);
    if (d.length <= MAX_PHOTO_CHARS) return d;
  }
  return null;
}
