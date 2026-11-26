/**
 * Pure, seeded wear for the dome interior's dressing (drawn by DomeInterior.ts): the stains and moss patches on a footpath slab and the dark contact patch under a
 * prop. Deterministic (a hash of the piece's index), tier-aware (High full, Medium and Low thinner). No THREE, no clock, no Math.random.
 */
export type WearTier = 'low' | 'medium' | 'high';
export interface SlabMark { /** Along the slab, -0.5..0.5 of its length. */ u: number; /** Across the slab, -0.5..0.5 of its width. */ v: number; /** Half size along and across (world units). */ hl: number; hw: number; kind: 'moss' | 'stain' | 'crack'; /** 0..1 per-mark variation. */ k: number }

const hash = (n: number): number => { let h = (n | 0) * 374761393 + 668265263; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** The marks on one footpath slab: moss creeping in from the edges, darker stains, a hairline crack. */
export function slabMarks(index: number, width: number, len: number, tier: WearTier): SlabMark[] {
  const out: SlabMark[] = [], h = (k: number): number => hash(index * 31 + k * 977 + 5);
  const nMoss = tier === 'high' ? (h(1) < 0.4 ? 2 : 1) : tier === 'medium' ? (h(1) < 0.5 ? 1 : 0) : 0;
  for (let i = 0; i < nMoss; i++) {
    const side = h(2 + i) < 0.5 ? -1 : 1, hl = 0.012 + h(4 + i) * 0.03, hw = 0.006 + h(6 + i) * 0.012;
    out.push({ u: (h(8 + i) - 0.5) * 0.8, v: side * (0.5 - hw / width * 0.8), hl: Math.min(hl, len * 0.3), hw, kind: 'moss', k: h(10 + i) });
  }
  if (tier !== 'low' && h(12) < 0.5) out.push({ u: (h(13) - 0.5) * 0.7, v: (h(14) - 0.5) * 0.6, hl: 0.015 + h(15) * 0.025, hw: 0.01 + h(16) * 0.015, kind: 'stain', k: h(17) });
  if (tier === 'high' && h(18) < 0.3) out.push({ u: (h(19) - 0.5) * 0.6, v: (h(20) - 0.5) * 0.5, hl: 0.05 + h(21) * 0.04, hw: 0.002, kind: 'crack', k: h(22) });
  return out;
}

/** The dark contact patch under a prop: its half sizes grow a little past the footing, a seeded squash so no two read the same. */
export function contactPatch(index: number, hx: number, hz: number): { hx: number; hz: number; rot: number } {
  return { hx: hx + 0.012 + hash(index * 7 + 1) * 0.012, hz: hz + 0.012 + hash(index * 7 + 2) * 0.012, rot: (hash(index * 7 + 3) - 0.5) * 0.4 };
}
