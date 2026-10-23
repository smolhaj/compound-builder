import { describe, expect, it } from 'vitest';
import { posHash } from './lotHash';
import { antlerMount, ARCH, COURT, courtGate, doorX, entryCourt, gateTop, houseBays, loggiaArcade, rockingChair, spanishBalcony, spanishBlockWidth, spanishFreeBays, spanishMassing, timberDeck, woodPile } from './houseExtras';
import { lotQuad, quadsOverlap } from './lotFootprints';

describe('Spanish balcony', () => {
  it('bays match the facade shader (≈ 0.42 u, at least one)', () => {
    expect(houseBays(0.3)).toHaveLength(1);
    expect(houseBays(2.1)).toHaveLength(5);
    const b = houseBays(1.7);
    expect(b[0]).toBeCloseTo(-1.7 / 2 + 1.7 / b.length / 2);
  });
  it('stands on the street side of the face, within its width, slab under the rail', () => {
    const b = spanishBalcony(0.4, 0.56, -1, 0.27);
    const all = [...b.slab, ...b.iron, ...b.corbels];
    for (const [x, y, z, w, h, d] of all) {
      expect(z + d / 2).toBeLessThanOrEqual(-1 + 1e-9);
      expect(z - d / 2).toBeGreaterThanOrEqual(-1 - 0.13 - 1e-9);
      expect(Math.abs(x - 0.4) + w / 2).toBeLessThanOrEqual(0.27 / 2 + 1e-9);
      expect(y - h / 2).toBeGreaterThan(0.4);
      expect(y + h / 2).toBeLessThan(0.75);
    }
    expect(b.iron.length).toBeGreaterThan(10);
    expect(b.corbels).toHaveLength(6);
  });
});

describe('NW contemporary deck', () => {
  for (const rail of ['glass', 'cable'] as const) {
    it(`stays off the wall plane and inside its footprint (${rail})`, () => {
      const d = timberDeck(0.8, 0.26, 0.5, rail);
      const all = [...d.boards, ...d.framing, ...d.rail, ...d.glass, ...d.cable];
      for (const [x, y, z, w, h, dd] of all) {
        expect(z - dd / 2).toBeGreaterThanOrEqual(-1e-9);
        expect(z + dd / 2).toBeLessThanOrEqual(0.26 + 0.011);
        expect(Math.abs(x) + w / 2).toBeLessThanOrEqual(0.4 + 0.011);
        expect(y + h / 2).toBeLessThanOrEqual(0.5 + 0.17 + 1e-9);
      }
      expect(rail === 'glass' ? d.glass.length : d.cable.length).toBeGreaterThan(0);
    });
  }
});

describe('Mountain West porch details', () => {
  it('a rocking chair sits on the deck at true scale (≈ 0.55 m wide, seat ≈ 45 cm)', () => {
    const c = rockingChair(0, -1, 0.2);
    for (const [, y, , w, h, d] of c) {
      expect(y - h / 2).toBeGreaterThanOrEqual(0.2 - 1e-9);
      expect(y + h / 2).toBeLessThan(0.2 + 0.26);
      expect(Math.max(w, d)).toBeLessThan(0.11);
    }
  });
  it('the wood pile stands off the wall, inside its length', () => {
    const p = woodPile(0.3);
    for (const [x, y, z, w, h, d] of [...p.logs, ...p.ends]) {
      expect(z - d / 2).toBeGreaterThanOrEqual(0);
      expect(Math.abs(x) + w / 2).toBeLessThanOrEqual(0.15 + 1e-9);
      expect(y - h / 2).toBeGreaterThanOrEqual(0);
    }
    expect(p.ends.length).toBeGreaterThan(5);
  });
  it('the antler rack is symmetric and in front of the wall', () => {
    const a = antlerMount(0.2, 0.4, -1);
    const xs = a.map(b => b[0] - 0.2).sort((p, q) => p - q);
    expect(xs[0]).toBeCloseTo(-xs[xs.length - 1]);
    for (const [, , z, , , d] of a) expect(z + d / 2).toBeLessThanOrEqual(-1 + 1e-9);
  });
});

describe('Spanish entry-court gate', () => {
  const walk = lotQuad(0, 0, 0, 0.3, -2, 0.14, 2.5);   // walk at x = 0.3 running to the street, ending at the court opening
  it('arches up toward the meeting stiles', () => {
    expect(gateTop(1)).toBeGreaterThan(gateTop(0));
    expect(gateTop(0.5)).toBeGreaterThan(gateTop(0.25));
  });
  for (const room of [[0.6, 0.6], [0.05, 0.6], [0.6, 0.02], [0, 0]] as Array<[number, number]>) {
    it(`open leaves stay clear of the walk (room ${room.join(', ')})`, () => {
      const g = courtGate(0.3, 0.11, -0.8, true, room);
      expect(g.leaves).toHaveLength(2);
      const walkThrough = lotQuad(0, 0, 0, 0.3, -0.4, 0.14, 1.2);   // and its run through the court to the door
      for (const [x, z, w, d] of g.leaves) {
        expect(quadsOverlap(lotQuad(0, 0, 0, x, z, w, d), walk)).toBe(false);
        expect(quadsOverlap(lotQuad(0, 0, 0, x, z, w, d), walkThrough)).toBe(false);
      }
      g.parts.forEach(([x, , z, w, , d], i) => expect(quadsOverlap(lotQuad(x, z, g.rotY[i], 0, 0, w, d), walkThrough)).toBe(false));
    });
  }
  it('closed leaves fill the opening between the piers', () => {
    const g = courtGate(0.3, 0.11, -0.8, false, [0.6, 0.6]);
    for (const [x, , z, w, h] of g.parts) {
      expect(Math.abs(x - 0.3) + w / 2).toBeLessThanOrEqual(0.11 + 0.007);
      expect(Math.abs(z - (-0.8 + 0.016))).toBeLessThan(0.006);
      expect(h).toBeGreaterThan(0);
    }
  });
  it('open leaves never pass through the piers', () => {
    const g = courtGate(0.3, 0.11, -0.8, true, [0.6, 0.6]);
    g.parts.forEach(([x, , z, w, h, d], i) => {
      if (w === 0.008 && h === 0.016) return;   // the hinge pins sit on the pier face
      for (const pxc of [0.3 - 0.11 - COURT.pier / 2, 0.3 + 0.11 + COURT.pier / 2]) {
        expect(quadsOverlap(lotQuad(x, z, g.rotY[i], 0, 0, w, d), lotQuad(pxc, -0.8, 0, 0, 0, COURT.pier, COURT.pier))).toBe(false);
      }
    });
    // and it turns into the court (z > the wall line), not out toward the street
    for (const [, z] of g.leaves) expect(z).toBeGreaterThan(-0.8);
  });
});

describe('Spanish entry court', () => {
  const c = entryCourt(0.3, 0.11, -0.9, 0.9, -1.55, -1.0, 0.08);
  it('walls stand on the ground with a footing and share one top; piers a little taller', () => {
    const tops = c.walls.map(([, y, , , h]) => +(y + h / 2).toFixed(6));
    for (const [, y, , , h] of c.walls) expect(y - h / 2).toBeCloseTo(-0.08);
    expect(new Set(tops.filter(t => t < COURT.pierH - 1e-6))).toEqual(new Set([COURT.h]));
    expect(tops.filter(t => Math.abs(t - COURT.pierH) < 1e-6)).toHaveLength(2);
  });
  it('coping sits on top of the walls, never doubled at a corner', () => {
    for (const [, y, , , h] of c.caps) expect(y - h / 2).toBeGreaterThanOrEqual(COURT.h - 1e-9);
    const wallCaps = c.caps.filter(([, y]) => y < COURT.pierH);
    for (let i = 0; i < wallCaps.length; i++) for (let j = i + 1; j < wallCaps.length; j++) {
      const [ax, , az, aw, , ad] = wallCaps[i], [bx, , bz, bw, , bd] = wallCaps[j];
      const ox = Math.min(ax + aw / 2, bx + bw / 2) - Math.max(ax - aw / 2, bx - bw / 2);
      const oz = Math.min(az + ad / 2, bz + bd / 2) - Math.max(az - ad / 2, bz - bd / 2);
      expect(ox > 1e-6 && oz > 1e-6).toBe(false);
    }
  });
  it('the paving stays inside the walls', () => {
    const [x, z, w, d] = c.paving;
    expect(x - w / 2).toBeGreaterThanOrEqual(-0.9 + COURT.t / 2 - 1e-9);
    expect(x + w / 2).toBeLessThanOrEqual(0.9 - COURT.t / 2 + 1e-9);
    expect(z - d / 2).toBeGreaterThanOrEqual(-1.55 + COURT.t / 2 - 1e-9);
    expect(z + d / 2).toBeLessThanOrEqual(-1.0 + 1e-9);
  });
  it('the opening between the piers is clear for the walk', () => {
    for (const [x, , z, w, , d] of c.walls) {
      if (Math.abs(z + 1.55) < 0.05 && d < 0.1) expect(Math.abs(x - 0.3) - w / 2).toBeGreaterThanOrEqual(0.11 - 1e-9);
    }
  });
});

describe('r19 Spanish revival massing', () => {
  it('towers on wider houses, wings and plain blocks on the rest', () => {
    expect(spanishMassing(1.6, 0.1)).toBe('tower');
    expect(spanishMassing(1.35, 0.1)).toBe('wing');
    expect(spanishMassing(1.6, 0.5)).toBe('wing');
    expect(spanishMassing(1.6, 0.9)).toBe('block');
    expect(spanishMassing(1.2, 0.5)).toBe('block');
  });

  it('r20: about a fifth to a quarter of two-storey houses get a tower (the per-lot hash, many lots)', () => {
    // lots on street grids (the renderer's hash: posHash(x, z, 251)), house widths 1.3–2.2 u
    const n: Record<string, number> = { tower: 0, wing: 0, block: 0 };
    let k = 0;
    for (const sp of [2.6, 2.9, 3.3]) for (let i = 0; i < 40; i++) for (let j = 0; j < 25; j++) {
      const x = -60 + i * sp + 0.25, z = -80 + j * 6.4 + (i % 2) * 0.5;
      const hw = 1.3 + ((k++ * 0.37) % 1) * 0.9;
      n[spanishMassing(hw, posHash(x, z, 251))]++;
    }
    const tot = n.tower + n.wing + n.block;
    expect(n.tower / tot).toBeGreaterThan(0.17);
    expect(n.tower / tot).toBeLessThan(0.26);
    // the wing stays common, the plain block the rest
    expect(n.wing / tot).toBeGreaterThan(0.3);
    expect(n.block / tot).toBeGreaterThan(0.3);
    for (const hw of [1.3, 1.5, 1.8, 2.2]) {
      const b = spanishBlockWidth(hw);
      expect(b).toBeGreaterThanOrEqual(0.8);
      expect(hw - b).toBeGreaterThanOrEqual(0.5 - 1e-9);   // a wing at least ≈ 3 m wide
    }
  });
  it('doorX matches the facade shader door (by the walk-side edge)', () => {
    expect(doorX(-0.8, 1.6, -1)).toBeCloseTo(-0.8 + 0.25 + 0.04);
    expect(doorX(0.8, 1.0, 1)).toBeCloseTo(0.8 - 0.19 - 0.04);
  });
  it('free bays keep a balcony clear of the excluded spans', () => {
    const all = spanishFreeBays(1.6, 0);
    expect(all).toHaveLength(houseBays(1.6).length);
    const some = spanishFreeBays(1.6, 0, [-0.8, 0.2]);
    for (const c of some) expect(c - 0.15 - 0.03).toBeGreaterThan(0.2);
    expect(some.length).toBeLessThan(all.length);
  });
});

describe('r19 loggia arcade', () => {
  const o = { lo: -0.8, hi: 0.5, faceZ: -1, depth: 0.26, floorY: 0, top: 0.42, groundY: -0.094 };
  it('3–4 round arches on piers, all in front of the face inside the span', () => {
    const a = loggiaArcade(o)!;
    expect(a.n).toBeGreaterThanOrEqual(3);
    expect(a.n).toBeLessThanOrEqual(4);
    expect(a.pitch).toBeGreaterThanOrEqual(0.24 - 1e-9);
    for (const [x, , z, w, , d] of [...a.stucco, ...a.tile, ...a.timber]) {
      expect(x - w / 2).toBeGreaterThanOrEqual(o.lo - 1e-9);
      expect(x + w / 2).toBeLessThanOrEqual(o.hi + 1e-9);
      expect(z + d / 2).toBeLessThanOrEqual(o.faceZ + 1e-9);
      expect(z - d / 2).toBeGreaterThanOrEqual(o.faceZ - o.depth - 0.01);
    }
    for (const [, y, , p, s] of a.heads) {
      expect(p).toBeCloseTo(a.pitch); expect(s).toBeCloseTo(a.pitch);   // uniform scale: round arches
      expect(y + ARCH.head * p).toBeLessThanOrEqual(o.top + 1e-9);      // under the band
      expect(y - o.floorY).toBeGreaterThan(0.18);                       // piers ≥ ≈ 1.1 m
    }
  });
  it('centres an arch on the door when asked, else null when 3 arches do not fit', () => {
    const a = loggiaArcade({ ...o, align: -0.51 })!;
    expect(a.centres.some(c => Math.abs(c + 0.51) < 1e-6)).toBe(true);
    expect(loggiaArcade({ ...o, hi: -0.1 })).toBeNull();
  });
  it('the opening clears the walk-up steps (opening ≥ ≈ 0.85 m)', () => {
    const a = loggiaArcade(o)!;
    expect(2 * ARCH.r * a.pitch).toBeGreaterThan(0.14);
  });
});
