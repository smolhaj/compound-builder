/**
 * First names over the defenders' heads during the raid cutscene (pure placement; `NameLabelLayer` draws them as DOM text projected from the
 * world each frame, so the picture gets no new draw call). The rules: far people fade out and are dropped, size follows distance, a label that
 * would land on a nearer one is nudged up or dropped, nothing leaves the picture area between the letterbox bars, and a fallen defender keeps a
 * dim name with a small cross instead of vanishing. Whether it shows at all is a View menu choice (Names on / off, default on), remembered.
 */
const KEY = 'cb.names';
let cached: boolean | null = null;
export function getNames(): boolean {
  if (cached == null) { try { cached = localStorage.getItem(KEY) !== 'off'; } catch { cached = true; } }
  return cached;
}
export function setNames(on: boolean): void { cached = on; try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* private mode */ } }

export interface LabelIn {
  id: string;
  name: string;
  /** The head's place on the screen (px) and its distance from the eye (world units, 1 = 6 m). */
  sx: number; sy: number; depth: number;
  /** In front of the camera (the projection's w > 0). */
  front: boolean;
  /** Something solid between the eye and the head. */
  blocked: boolean;
  dead: boolean;
  /** Seconds since the defender fell (0 if standing). */
  deadFor: number;
  gone: boolean;
  /** Room for a pip beside the name (px per unit of size); 0 = none. */
  pip?: boolean;
}
export interface LabelOut { id: string; text: string; pipW: number; x: number; y: number; opacity: number; size: number; dim: boolean }
/** The picture area in px: the letterbox bars take `top` and `bottom` rows. */
export interface LabelFrame { w: number; h: number; top: number; bottom: number }

/** The letterbox bar height the overlay uses: clamp(54px, 12vh, 120px). */
export const barHeight = (h: number): number => Math.min(120, Math.max(54, 0.12 * h));

export const NEAR_FADE = 20;   // labels start to fade past this distance (units)
export const FAR_CUT = 38;     // and are gone here
export const labelSize = (depth: number): number => Math.max(10.5, Math.min(15, 15 - 0.3 * (depth - 2)));
export const distanceFade = (depth: number): number => depth <= NEAR_FADE ? 1 : depth >= FAR_CUT ? 0 : 1 - (depth - NEAR_FADE) / (FAR_CUT - NEAR_FADE);
const MARGIN = 6, EDGE = 28;

export function placeLabels(ins: readonly LabelIn[], f: LabelFrame): LabelOut[] {
  const out: LabelOut[] = [];
  const placed: Array<{ x0: number; y0: number; x1: number; y1: number }> = [];
  const sorted = ins.filter(l => l.front && !l.blocked && !l.gone && l.depth > 0.3).sort((a, b) => a.depth - b.depth);   // the nearer one keeps its place
  for (const l of sorted) {
    let op = distanceFade(l.depth);
    if (op <= 0.02) continue;
    const size = labelSize(l.depth), text = l.dead && !l.pip ? `† ${l.name}` : l.name;
    const pipW = l.pip ? size * 0.9 : 0, w = text.length * size * 0.58 + 10 + pipW, h = size + 6;
    // the head is the anchor; the label rides just above it
    const x = l.sx, y = l.sy - 4 - h / 2;
    const top = f.top + MARGIN, bot = f.h - f.bottom - MARGIN;
    // out of the picture (or into a bar): dropped, not clamped, so a name never points at the wrong person
    if (l.sx < MARGIN + w / 2 || l.sx > f.w - MARGIN - w / 2 || y - h / 2 < top || l.sy > bot) continue;
    const edge = Math.min(1, Math.min(l.sx - w / 2, f.w - l.sx - w / 2, y - h / 2 - top, bot - l.sy) / EDGE);
    op *= Math.max(0, edge);
    if (l.dead) op *= 0.35 + 0.65 * Math.max(0, 1 - l.deadFor / 2);
    // overlap: nudge up a label's height (twice), else drop the farther one
    let yy = y, ok = false;
    for (let k = 0; k < 3 && !ok; k++, yy -= h) {
      if (yy - h / 2 < top) break;
      const r = { x0: x - w / 2, x1: x + w / 2, y0: yy - h / 2, y1: yy + h / 2 };
      if (!placed.some(p => r.x0 < p.x1 && r.x1 > p.x0 && r.y0 < p.y1 && r.y1 > p.y0)) { placed.push(r); ok = true; break; }
    }
    if (!ok || op <= 0.02) continue;
    out.push({ id: l.id, text, pipW, x, y: yy, opacity: op, size, dim: l.dead });
  }
  return out;
}

// ---- status pips ----
const PIPS_KEY = 'cb.pips';
let pipsCached: boolean | null = null;
export function getPips(): boolean {
  if (pipsCached == null) { try { pipsCached = localStorage.getItem(PIPS_KEY) !== 'off'; } catch { pipsCached = true; } }
  return pipsCached;
}
export function setPips(on: boolean): void { pipsCached = on; try { localStorage.setItem(PIPS_KEY, on ? 'on' : 'off'); } catch { /* private mode */ } }

export interface UnitStatus { wound: number; dead: boolean; lying: boolean; hands: boolean; carried: boolean }
export type PipKind = 'fine' | 'wounded' | 'down' | 'dead' | 'held';
export interface Pip { kind: PipKind; color: string; cross: boolean; label: string }
export const PIP_COLORS: Record<PipKind, string> = { fine: '#6fcf6f', wounded: '#f0b43c', down: '#e5473f', dead: '#8a8f96', held: '#a7a7a7' };
/** The sim's own state (the one that draws the wounded poses) as a pip: green fine, amber wounded, red down, dim cross dead, gray held. */
export function pipFor(s: UnitStatus): Pip {
  const kind: PipKind = s.dead ? 'dead' : s.hands ? 'held' : (s.lying || s.carried || s.wound >= 0.7) ? 'down' : s.wound > 0.05 ? 'wounded' : 'fine';
  return { kind, color: PIP_COLORS[kind], cross: kind === 'dead', label: kind };
}
