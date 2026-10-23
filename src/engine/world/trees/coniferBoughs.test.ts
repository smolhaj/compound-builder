import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildConiferTree, CARD_BOUGH } from './treeGeometry';

/**
 * r21: close-up conifer boughs are their own card kind (a soft needle-tuft
 * spray with snow along the twig), not the palm-frond cut-out whose 30 even
 * leaflets per card read as white comb stripes on snowy pines.
 */
describe('conifer bough cards', () => {
  const kinds = (lod: 0 | 1 | 2): number[] => {
    const a = buildConiferTree('high', 5, lod).getAttribute('aCard') as THREE.BufferAttribute;
    const out: number[] = [];
    for (let i = 0; i < a.count; i++) out.push(a.getZ(i));
    return out;
  };

  it('near conifers use bough cards, never the frond kind', () => {
    const k = kinds(0);
    const boughs = k.filter(z => z >= CARD_BOUGH && z < CARD_BOUGH + 1);
    expect(boughs.length).toBeGreaterThan(100);
    expect(k.some(z => z >= 3 && z < 4)).toBe(false);
  });

  it('each bough gets its own random seed (no identical repeating sprigs)', () => {
    const seeds = new Set(kinds(0).filter(z => z >= CARD_BOUGH && z < CARD_BOUGH + 1).map(z => z.toFixed(4)));
    expect(seeds.size).toBeGreaterThan(20);
  });

  it('far conifers stay solid (no cut-out cards)', () => {
    expect(kinds(2).every(z => Math.abs(z) < 0.25)).toBe(true);
  });
});
