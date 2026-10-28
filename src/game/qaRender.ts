/** QA-only on-demand rendering (`?lowrender`). Pure parsing + the render-request bookkeeping; no THREE here. */
export interface LowRenderFlags {
  /** Draw only when asked (`window.__cb.qa.renderNow()`), never on every frame. */
  on: boolean;
  /** Pixel ratio for the on-demand frames (default 0.5; `?lowrender=0.75` overrides). */
  scale: number;
}

/** `?lowrender` or `?lowrender=0.6`; absent means normal play (on: false). */
export function parseLowRender(search: string): LowRenderFlags {
  const p = new URLSearchParams(search);
  if (!p.has('lowrender')) return { on: false, scale: 1 };
  const raw = Number(p.get('lowrender'));
  const scale = Number.isFinite(raw) && raw >= 0.2 && raw <= 2 ? raw : 0.5;
  return { on: true, scale };
}

export type QaQuality = 'low' | 'medium' | 'high';

/** Pending draw requests: each `request` is answered by the next draw. */
export class RenderRequests {
  private waiting: Array<{ quality: QaQuality | null; done: () => void }> = [];
  get pending(): boolean { return this.waiting.length > 0; }
  /** The quality the next draw must use (null = the normal low-render look). Highest requested wins. */
  get quality(): QaQuality | null {
    const rank: Record<QaQuality, number> = { low: 0, medium: 1, high: 2 };
    let best: QaQuality | null = null;
    for (const w of this.waiting) if (w.quality && (!best || rank[w.quality] > rank[best])) best = w.quality;
    return best;
  }
  request(quality: QaQuality | null = null): Promise<void> {
    return new Promise(done => { this.waiting.push({ quality, done }); });
  }
  /** Call after a draw: resolves every waiting request. */
  drawn(): void { const w = this.waiting; this.waiting = []; for (const r of w) r.done(); }
}
