/**
 * Headless DOM stub for geometry audits: just enough `document.createElement('canvas')` for the procedural textures the world
 * makes at build time (they only need a surface to exist; the audits read geometry, not pixels).
 */
function ctx2d(c: { width: number; height: number }): unknown {
  const img = (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w * h * 4)) });
  const base: Record<string, unknown> = {
    createImageData: img, getImageData: (_x: number, _y: number, w: number, h: number) => img(w, h),
    createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    createPattern: () => ({}), measureText: () => ({ width: 8 }), canvas: c,
  };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k as string] : () => undefined), set: (t, k, v) => { t[k as string] = v; return true; } });
}
export function installFakeDom(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (g.document) return;
  g.document = {
    createElement: (tag: string) => {
      const el: Record<string, unknown> = { tagName: tag.toUpperCase(), width: 300, height: 150, style: {}, addEventListener() {}, removeEventListener() {} };
      el.getContext = () => ctx2d(el as { width: number; height: number });
      el.toDataURL = () => 'data:,';
      return el;
    },
    createElementNS: (_n: string, tag: string) => (g.document as { createElement: (t: string) => unknown }).createElement(tag),
  };
}
