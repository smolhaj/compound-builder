/**
 * Automatic graphics quality (pure: no THREE, no DOM; the canvas feeds it).
 *
 * Start: `pickStartTier` guesses a tier from what the browser tells us about the device (cores, memory, the WebGL renderer string).
 * It is deliberately conservative: only a known-strong GPU starts on High, anything unknown starts on Medium, a software renderer on Low.
 * Run: `FrameBudget` watches the frame time and says "step down" when it stays over budget; it never says "step up" (the player does that,
 * from Settings), so the picture never gets better and worse again by itself.
 */
export type Tier = 'high' | 'medium' | 'low';

export interface DeviceInfo {
  /** navigator.hardwareConcurrency (0 / undefined when unknown). */
  cores?: number;
  /** navigator.deviceMemory in GB (Chromium only; capped at 8 by the browser). */
  memoryGB?: number;
  /** UNMASKED_RENDERER_WEBGL, or '' when hidden. */
  gpu?: string;
  /** window.devicePixelRatio. */
  dpr?: number;
}

const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic|mesa offscreen/i;
const STRONG = /apple (m\d|gpu)|nvidia|geforce|rtx|radeon (rx|pro)|\bamd radeon rx|arc a\d/i;
const WEAK = /intel.*(hd|uhd|iris(?! xe max))|mali|adreno|powervr|videocore|vivante|apple a\d/i;

export function pickStartTier(d: DeviceInfo): Tier {
  const gpu = d.gpu ?? '';
  if (SOFTWARE.test(gpu)) return 'low';
  if ((d.memoryGB ?? 8) <= 2 || (d.cores ?? 8) <= 2) return 'low';
  if (WEAK.test(gpu) || (d.memoryGB ?? 8) <= 4 || (d.cores ?? 8) <= 4) return 'medium';
  if (STRONG.test(gpu) && (d.cores ?? 0) >= 8) return 'high';
  return 'medium';
}

export const TIER_ORDER: readonly Tier[] = ['high', 'medium', 'low'];
/** The next tier down, or null at the bottom. */
export function lowerTier(t: Tier): Tier | null { const i = TIER_ORDER.indexOf(t); return i >= 0 && i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null; }

export interface BudgetOptions {
  /** A frame slower than this counts against the budget (ms). */
  slowMs?: number;
  /** ...for this long (seconds of play, not counting a frame longer than `ignoreMs`: a tab switch or a load hitch). */
  holdSeconds?: number;
  ignoreMs?: number;
}

/**
 * Rolling frame-time watcher. `push(dtMs)` per rendered frame; returns true once when the frames have been over budget long enough.
 * Time over budget builds at the frame's length and drains at twice that when the frame is fine, so a brief hitch never trips it.
 */
export class FrameBudget {
  private readonly slowMs: number; private readonly hold: number; private readonly ignore: number;
  private over = 0;
  /** Smoothed frame time (ms) for the readout. */
  avgMs = 0;
  constructor(o: BudgetOptions = {}) { this.slowMs = o.slowMs ?? 40; this.hold = (o.holdSeconds ?? 3) * 1000; this.ignore = o.ignoreMs ?? 1000; }
  push(dtMs: number): boolean {
    if (dtMs > this.ignore) return false;
    this.avgMs = this.avgMs === 0 ? dtMs : this.avgMs + (dtMs - this.avgMs) * 0.05;
    this.over = dtMs > this.slowMs ? this.over + dtMs : Math.max(0, this.over - dtMs * 2);
    if (this.over >= this.hold) { this.over = 0; return true; }
    return false;
  }
  reset(): void { this.over = 0; this.avgMs = 0; }
}

/** The frame-rate cap's minimum frame gap in ms (0 = uncapped). A little under the target so a 60 Hz display is never skipped. */
export function capGapMs(fps: number): number { return fps > 0 ? 1000 / fps - 1.5 : 0; }
