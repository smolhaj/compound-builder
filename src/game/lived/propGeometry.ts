/**
 * The small things of a lived-in place, built from primitives in the local
 * frame of each prop (+z = the way it faces, y up, sizes in meters; one meter
 * is 1/6 world unit, so a person is 1.7). Every piece is vertex-colored and
 * goes into one of five groups that the renderer merges into one mesh each:
 *
 *   matte   wood, paint, straw, soil, rope, rubber
 *   metal   galvanized steel, iron, tin
 *   cloth   flat cloth, a flag, double-sided
 *   leaf    plants and flowers, double-sided
 *   lamp    lantern glass (lit at night, a plain dull glass by day)
 *
 * Pure THREE geometry: no scene, tested for sizes and that every piece stays
 * inside its own footprint.
 */
import * as THREE from 'three';

export const M = 1 / 6;

export type Grp = 'matte' | 'metal' | 'cloth' | 'leaf' | 'lamp';
export type Season = 'spring' | 'summer' | 'fall' | 'winter';

export type PropKind =
  | 'doormat' | 'boots' | 'flowerpot' | 'rainbarrel' | 'woodstack' | 'chopblock' | 'birdfeeder' | 'lantern' | 'yardlight' | 'flagpole' | 'sign' | 'mailbox'
  | 'swingset' | 'sandbox' | 'wagon' | 'ball' | 'kidbike' | 'dogbed' | 'doghouse'
  | 'haybales' | 'trough' | 'wheelbarrow' | 'tools' | 'sawhorses' | 'lumber' | 'drum' | 'tires' | 'fuelcans'
  | 'bench' | 'chairs' | 'trellis' | 'gardengate' | 'scarecrow' | 'pottingbench' | 'wellapron' | 'hosereel' | 'leafpile' | 'snowman' | 'shovel' | 'eggcrate';

/** Footprint radius of each prop (meters), for the placer: nothing comes nearer another than the sum. */
export const PROP_R: Record<PropKind, number> = {
  doormat: 0.5, boots: 0.25, flowerpot: 0.3, rainbarrel: 0.5, woodstack: 0.85, chopblock: 0.7, birdfeeder: 0.3, lantern: 0.2, yardlight: 0.25, flagpole: 0.3, sign: 0.9, mailbox: 0.4,
  swingset: 1.6, sandbox: 1.0, wagon: 0.5, ball: 0.15, kidbike: 0.5, dogbed: 0.55, doghouse: 0.7,
  haybales: 1.1, trough: 1.0, wheelbarrow: 0.8, tools: 0.5, sawhorses: 1.0, lumber: 1.6, drum: 0.5, tires: 0.5, fuelcans: 0.45,
  bench: 1.0, chairs: 1.2, trellis: 1.0, gardengate: 0.7, scarecrow: 0.4, pottingbench: 1.1, wellapron: 0.8, hosereel: 0.3, leafpile: 0.8, snowman: 0.5, shovel: 0.25, eggcrate: 0.3,
};

export interface BuildOpts {
  season: Season;
  /** Which of several looks (colors, how many). */
  variant: number;
  /** Seeded 0-1 (stable for the prop). */
  rnd: () => number;
  /** How many (bales, pots...) */
  count: number;
}

const C = {
  wood: 0x8a6a48, woodDark: 0x5a4632, woodPale: 0xc8a46a, white: 0xe8e4d8, red: 0x9a3b30, green: 0x4d6b45, blue: 0x3f5f8a, terra: 0xb5653f,
  steel: 0x9aa0a4, iron: 0x3a3d40, rubber: 0x24262a, straw: 0xc9ad62, rope: 0xb09a70, soil: 0x4a3a2a, sand: 0xd8c48a, stone: 0x8e8a80, cream: 0xd8cfb0,
  leaf: 0x4f7a3a, leafDark: 0x3c6030, snow: 0xf1f4f7,
};

function paint(g: THREE.BufferGeometry, color: number | THREE.Color): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g;
  if (src !== g) g.dispose();
  src.deleteAttribute('uv');
  const n = src.attributes.position.count, a = new Float32Array(n * 3), c = new THREE.Color(color);
  for (let i = 0; i < n; i++) c.toArray(a, i * 3);
  src.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return src;
}

/** Collects the pieces of one or many props under a transform. */
export class P {
  readonly out: Record<Grp, THREE.BufferGeometry[]> = { matte: [], metal: [], cloth: [], leaf: [], lamp: [] };
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _e = new THREE.Euler();

  /** Start a prop: its place (world units), heading (radians, 0 faces +z) and size. */
  begin(x: number, y: number, z: number, rot = 0, s = 1): void {
    this._m.compose(new THREE.Vector3(x, y, z), this._q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot), new THREE.Vector3(s, s, s));
  }

  private _push(grp: Grp, g: THREE.BufferGeometry, color: number | THREE.Color): void {
    const p = paint(g, color);
    p.applyMatrix4(this._m);
    this.out[grp].push(p);
  }

  /** A box w × h × d (meters), its base center at (x, y, z), turned by the angles about that base. */
  box(grp: Grp, color: number, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): void {
    const g = new THREE.BoxGeometry(w * M, h * M, d * M).translate(0, h * M / 2, 0);
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(this._e.set(rx, ry, rz, 'YXZ')));
    this._push(grp, g.translate(x * M, y * M, z * M), color);
  }

  /** A box centered on (x, y, z) (a bar laid across, a plank). */
  bar(grp: Grp, color: number, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rx = 0, rz = 0): void {
    const g = new THREE.BoxGeometry(w * M, h * M, d * M);
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(this._e.set(rx, ry, rz, 'YXZ')));
    this._push(grp, g.translate(x * M, y * M, z * M), color);
  }

  /** An upright cylinder (or cone frustum): base radius r0, top radius r1, height h, base center at (x, y, z). */
  cyl(grp: Grp, color: number, r0: number, r1: number, h: number, x: number, y: number, z: number, seg = 8, rx = 0, rz = 0): void {
    const g = new THREE.CylinderGeometry(r1 * M, r0 * M, h * M, seg).translate(0, h * M / 2, 0);
    if (rx || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(this._e.set(rx, 0, rz, 'YXZ')));
    this._push(grp, g.translate(x * M, y * M, z * M), color);
  }

  /** A cylinder lying on its side along x or z, centered on (x, y, z). */
  roll(grp: Grp, color: number, r: number, len: number, x: number, y: number, z: number, along: 'x' | 'z' = 'x', seg = 10): void {
    const g = new THREE.CylinderGeometry(r * M, r * M, len * M, seg);
    g.rotateZ(along === 'x' ? Math.PI / 2 : 0);
    if (along === 'z') g.rotateX(Math.PI / 2);
    this._push(grp, g.translate(x * M, y * M, z * M), color);
  }

  sph(grp: Grp, color: number, r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, seg = 7): void {
    const g = new THREE.SphereGeometry(r * M, seg, Math.max(4, seg - 2)).scale(sx, sy, sz);
    this._push(grp, g.translate(x * M, y * M, z * M), color);
  }

  /** A torus ring of radius R and tube r, flat (axis up) unless stood on edge by `rx`. */
  ring(grp: Grp, color: number, R: number, r: number, x: number, y: number, z: number, rx = Math.PI / 2, ry = 0, seg = 12): void {
    const g = new THREE.TorusGeometry(R * M, r * M, 5, seg);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(this._e.set(rx, ry, 0, 'YXZ')));
    this._push(grp, g.translate(x * M, y * M, z * M), color);
  }

  /** A flat double-sided panel w × h facing +z, its middle at (x, y, z). */
  panel(grp: Grp, color: number, w: number, h: number, x: number, y: number, z: number, ry = 0, rx = 0): void {
    const g = new THREE.PlaneGeometry(w * M, h * M);
    if (rx || ry) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(this._e.set(rx, ry, 0, 'YXZ')));
    this._push(grp, g.translate(x * M, y * M, z * M), color);
  }
}

type Build = (p: P, o: BuildOpts) => void;

/** Terracotta pot with soil and plants; flowers by season. */
const flowerpot: Build = (p, o) => {
  const col = [C.terra, 0xa0583a, 0x7a8a8e, 0xc9b79a][o.variant % 4];
  p.cyl('matte', col, 0.12, 0.17, 0.3, 0, 0, 0, 10);
  p.cyl('matte', col, 0.18, 0.18, 0.04, 0, 0.3, 0, 10);
  p.cyl('matte', C.soil, 0.15, 0.15, 0.02, 0, 0.32, 0, 9);
  const bloom = o.season === 'summer' ? [0xd84a52, 0xf0c040, 0xe88aa8, 0xf2eee2][o.variant % 4] : o.season === 'spring' ? [0xf0c040, 0xe88aa8, 0xb48ad8, 0xf2eee2][o.variant % 4] : o.season === 'fall' ? [0xd8782a, 0xe0b030, 0xa83a2a, 0xd8782a][o.variant % 4] : 0;
  if (o.season === 'winter') {
    for (let i = 0; i < 5; i++) { const a = i * 1.3; p.box('matte', 0x6a5a3a, 0.02, 0.35 + 0.1 * (i % 3), 0.02, Math.cos(a) * 0.05, 0.32, Math.sin(a) * 0.05, 0, Math.cos(a) * 0.35, Math.sin(a) * 0.35); }
    return;
  }
  for (let i = 0; i < 7; i++) { const a = i * 0.9, r = 0.07 + 0.03 * (i % 2); p.sph('leaf', i % 2 ? C.leafDark : C.leaf, 0.09, Math.cos(a) * r, 0.42 + 0.04 * (i % 3), Math.sin(a) * r, 1.2, 0.8, 1.2, 5); }
  for (let i = 0; i < 6; i++) { const a = i * 1.05 + 0.4, r = 0.06 + 0.04 * (i % 2); p.sph('leaf', bloom, 0.045, Math.cos(a) * r, 0.52 + 0.05 * (i % 3), Math.sin(a) * r, 1, 1, 1, 5); }
};

const doormat: Build = (p, o) => {
  const col = [0x6b4f35, 0x7a3a30, 0x4f5a3a][o.variant % 3];
  p.box('matte', col, 0.85, 0.018, 0.5, 0, 0, 0);
  p.box('matte', 0xc9b79a, 0.85, 0.02, 0.05, 0, 0, 0.14);
  p.box('matte', 0xc9b79a, 0.85, 0.02, 0.05, 0, 0, -0.14);
};

const boots: Build = (p, o) => {
  for (const [dx, c, r] of [[-0.1, 0x2f3a2a, 0.1], [0.12, o.variant % 2 ? 0x6a3a28 : 0x2f3a2a, -0.2]] as const) {
    p.box('matte', c, 0.11, 0.22, 0.12, dx, 0, 0, r);
    p.box('matte', c, 0.11, 0.07, 0.28, dx, 0, 0.1, r);
  }
};

const rainbarrel: Build = (p, o) => {
  const col = o.variant % 2 ? 0x6a4a30 : C.blue;
  p.cyl('matte', col, 0.3, 0.3, 0.9, 0, 0, 0, 12);
  p.cyl('matte', 0x2c3a52, 0.31, 0.31, 0.04, 0, 0.86, 0, 12);
  for (const y of [0.18, 0.62]) p.ring('metal', C.iron, 0.305, 0.012, 0, y, 0, Math.PI / 2, 0, 14);
  p.box('metal', C.steel, 0.05, 0.05, 0.12, 0, 0.12, 0.3);
  // the downspout from the eave, with its elbow into the lid, against the wall behind (-z)
  p.box('metal', 0xb8b8b0, 0.08, 2.5, 0.08, 0, 0.86, -0.43);
  p.box('metal', 0xb8b8b0, 0.08, 0.08, 0.46, 0, 0.9, -0.2);
};

const woodstack: Build = (p, o) => {
  const w = 1.3, d = 0.42, h = 0.95;
  for (const s of [-1, 1]) p.box('matte', C.woodDark, 0.07, h + 0.1, 0.07, s * (w / 2 + 0.03), 0, 0);
  p.box('matte', 0x5a4028, w, h, d - 0.05, 0, 0, -0.03);
  const nx = 9, ny = 7;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const c = new THREE.Color(0xb08a58).offsetHSL(0, 0, (o.rnd() - 0.5) * 0.12);
    p.cyl('matte', c.getHex(), 0.075, 0.075, 0.4, -w / 2 + 0.09 + i * 0.138 + (j % 2) * 0.065, 0.06 + j * 0.128, -0.03, 6, Math.PI / 2);
  }
  p.box('metal', 0x7a7a74, 1.45, 0.03, d + 0.2, 0, h, -0.03, 0, 0.05);       // a sheet of tin over the top
};

const chopblock: Build = (p, o) => {
  p.cyl('matte', 0x8a6a48, 0.24, 0.26, 0.5, 0, 0, 0, 11);
  p.cyl('matte', 0xb08a58, 0.23, 0.23, 0.02, 0, 0.5, 0, 11);
  // the axe in the block
  p.box('matte', 0x7a5a38, 0.045, 0.8, 0.045, 0.07, 0.5, 0, 0, 0, 0.55);
  p.box('metal', 0x6a6e72, 0.16, 0.1, 0.03, -0.04, 0.55, 0);
  for (let i = 0; i < 5; i++) { const a = o.rnd() * 6.28, r = 0.5 + o.rnd() * 0.35; p.box('matte', 0xb08a58, 0.1, 0.09, 0.3, Math.cos(a) * r, 0, Math.sin(a) * r, o.rnd() * 3); }
};

const birdfeeder: Build = (p) => {
  p.cyl('matte', C.woodDark, 0.025, 0.025, 1.7, 0, 0, 0, 5);
  p.box('matte', 0xb08a58, 0.26, 0.16, 0.2, 0, 1.55, 0);
  p.box('matte', 0x8a3b2e, 0.34, 0.04, 0.28, 0, 1.69, 0, 0, 0, 0.0);
  p.box('matte', 0x8a3b2e, 0.32, 0.12, 0.05, 0, 1.69, 0.1, 0, -0.5);
  p.box('matte', 0x8a3b2e, 0.32, 0.12, 0.05, 0, 1.69, -0.1, 0, 0.5);
  p.box('matte', C.straw, 0.22, 0.03, 0.16, 0, 1.55, 0);
  p.box('matte', C.woodDark, 0.3, 0.015, 0.02, 0, 1.5, 0);
};

/** A lantern on a post: cap, glass (lit at night), a bracket. Faces +z. */
const lantern: Build = (p, o) => {
  p.box('matte', o.variant % 2 ? C.woodDark : C.iron, 0.07, 1.75, 0.07, 0, 0, 0);
  p.box('matte', o.variant % 2 ? C.woodDark : C.iron, 0.3, 0.05, 0.05, 0.1, 1.62, 0);
  p.box('metal', C.iron, 0.2, 0.04, 0.2, 0.22, 1.66, 0);
  p.cyl('metal', C.iron, 0.0, 0.14, 0.09, 0.22, 1.7, 0, 4);
  p.box('lamp', 0xffd890, 0.14, 0.2, 0.14, 0.22, 1.46, 0);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.box('metal', C.iron, 0.015, 0.2, 0.015, 0.22 + x * 0.07, 1.46, z * 0.07);
  p.box('metal', C.iron, 0.16, 0.025, 0.16, 0.22, 1.43, 0);
};

/** A barn light: a tall pole, an arm, a shade over a bulb. */
const yardlight: Build = (p) => {
  p.box('matte', C.woodDark, 0.12, 4.2, 0.12, 0, 0, 0);
  p.box('matte', C.woodDark, 0.8, 0.07, 0.07, 0.3, 3.9, 0, 0, 0, 0.12);
  p.cyl('metal', 0x4a5a48, 0.0, 0.32, 0.16, 0.62, 3.78, 0, 8);
  p.sph('lamp', 0xfff0c0, 0.09, 0.62, 3.76, 0);
};

const flagpole: Build = (p) => {
  p.cyl('metal', 0xd8d8d0, 0.035, 0.05, 6.4, 0, 0, 0, 6);
  p.sph('metal', 0xc8a030, 0.07, 0, 6.45, 0);
  // thirteen stripes would be much; seven read at this size
  const w = 1.1, h = 0.72, top = 6.2;
  for (let i = 0; i < 7; i++) p.panel('cloth', i % 2 ? 0xe8e4d8 : 0xa8322e, w, h / 7, 0.62, top - h / 7 * (i + 0.5), 0, Math.PI / 2);
  p.panel('cloth', 0x2e3f6a, 0.45, h * 4 / 7, 0.35, top - h * 2 / 7, 0, Math.PI / 2);
  // a rope on a cleat
  p.box('matte', C.rope, 0.012, 3, 0.012, 0.05, 1.2, 0);
};

const sign: Build = (p, o) => {
  for (const s of [-1, 1]) p.box('matte', C.woodDark, 0.12, 2.0, 0.12, s * 0.7, 0, 0);
  p.box('matte', 0xe6e0cc, 1.6, 0.6, 0.06, 0, 1.15, 0);
  p.box('matte', C.woodDark, 1.68, 0.04, 0.08, 0, 1.75, 0);
  p.box('matte', C.woodDark, 1.68, 0.04, 0.08, 0, 1.11, 0);
  // hand-painted: a row of letters that read as writing, and a little rule under
  let x = -0.62;
  for (let i = 0; i < 8; i++) { const w = 0.1 + o.rnd() * 0.1; p.box('matte', o.variant % 2 ? 0x2f4a2e : 0x8a2e2a, w * 0.8, 0.2 + o.rnd() * 0.04, 0.012, x + w / 2, 1.36, 0.035); x += w + 0.035; if (x > 0.6) break; }
  p.box('matte', o.variant % 2 ? 0x2f4a2e : 0x8a2e2a, 1.1, 0.025, 0.012, 0, 1.28, 0.035);
  p.box('matte', 0x6a5a3a, 0.5, 0.05, 0.012, 0, 1.2, 0.035);
};

const mailbox: Build = (p, o) => {
  p.box('matte', C.woodDark, 0.1, 1.15, 0.1, 0, 0, 0);
  p.box('matte', C.woodDark, 0.1, 0.07, 0.5, 0, 1.03, 0.2);
  p.box('metal', 0x2e3236, 0.2, 0.18, 0.46, 0, 1.1, 0.1);
  p.cyl('metal', 0x2e3236, 0.1, 0.1, 0.46, 0, 1.28, 0.1, 8, Math.PI / 2);
  p.box('matte', 0xc03a2a, 0.02, 0.2, 0.06, 0.12, 1.14, 0.0, 0, 0, o.variant % 2 ? 0 : 1.4);
  p.box('matte', 0xf0ece0, 0.16, 0.08, 0.012, 0, 0.88, 0.04);
  p.box('matte', 0x2a2a2a, 0.04, 0.05, 0.014, -0.04, 0.895, 0.04);
  p.box('matte', 0x2a2a2a, 0.04, 0.05, 0.014, 0.04, 0.895, 0.04);
};

const swingset: Build = (p, o) => {
  const w = 2.6, h = 2.2, tire = o.variant % 2 === 1;
  for (const s of [-1, 1]) for (const z of [-0.6, 0.6]) p.box('matte', C.wood, 0.1, h + 0.1, 0.1, s * w / 2, 0, z * 0.55, 0, -z * 0.28);
  p.bar('matte', C.woodDark, w + 0.3, 0.1, 0.1, 0, h, 0);
  const seats: Array<[number, number]> = tire ? [[-0.55, 0], [0.7, 1]] : [[-0.6, 0], [0.5, 0], [-9, 9]];
  for (const [x, kind] of seats) {
    if (x < -8) continue;
    for (const dx of [-0.18, 0.18]) p.box('matte', C.rope, 0.015, 1.55, 0.015, x + dx * (kind ? 0.5 : 1), 0.52, 0);
    if (kind) p.ring('matte', C.rubber, 0.25, 0.07, x, 0.55, 0, 0, Math.PI / 2 - 0.1, 12);
    else p.box('matte', 0x6a4a30, 0.42, 0.04, 0.18, x, 0.5, 0);
  }
};

const sandbox: Build = (p, o) => {
  const s = 1.5;
  for (const [w, d, x, z] of [[s, 0.08, 0, s / 2], [s, 0.08, 0, -s / 2], [0.08, s, s / 2, 0], [0.08, s, -s / 2, 0]] as const) p.box('matte', C.woodPale, w, 0.2, d, x, 0, z);
  p.box('matte', C.sand, s - 0.1, 0.16, s - 0.1, 0, 0, 0);
  p.cyl('matte', 0xd0b878, 0.2, 0.12, 0.16, 0.2, 0.16, 0.1, 8);
  p.cyl('matte', o.variant % 2 ? 0xd8483a : 0x3a78c8, 0.07, 0.09, 0.1, -0.3, 0.16, -0.2, 7);
  p.box('matte', 0xd8c038, 0.05, 0.22, 0.015, -0.1, 0.16, 0.3, 0, 0, 0.9);
};

/** A little red wagon: box body, a pull handle, four wheels. */
const wagon: Build = (p) => {
  p.box('matte', 0xc0392b, 0.4, 0.14, 0.7, 0, 0.1, 0);
  p.box('matte', 0xe8e4d8, 0.4, 0.02, 0.7, 0, 0.24, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.roll('matte', C.rubber, 0.09, 0.04, sx * 0.23, 0.09, sz * 0.24, 'x', 8);
  p.box('metal', C.steel, 0.02, 0.02, 0.6, 0, 0.18, 0.62, 0, -0.2);
  p.sph('matte', 0x6a8ac8, 0.1, 0.05, 0.3, -0.1);
};
const ball: Build = (p, o) => { p.sph('matte', [0xd8483a, 0x3a78c8, 0xe0c030][o.variant % 3], 0.11, 0, 0.11, 0, 1, 1, 1, 8); };

const kidbike: Build = (p) => {
  for (const z of [-0.32, 0.32]) p.ring('matte', C.rubber, 0.22, 0.025, 0, 0.22, z, 0, Math.PI / 2, 14);
  p.box('matte', 0x2e7ac8, 0.035, 0.035, 0.66, 0, 0.36, 0, 0, 0.08);
  p.box('matte', 0x2e7ac8, 0.03, 0.26, 0.03, 0, 0.2, -0.12);
  p.box('metal', C.iron, 0.36, 0.03, 0.03, 0, 0.58, 0.3);
  p.box('matte', C.iron, 0.1, 0.04, 0.2, 0, 0.46, -0.14);
};

const dogbed: Build = (p, o) => {
  p.cyl('cloth', [0x7a4a3a, 0x4a5a7a, 0x6a6a4a][o.variant % 3], 0.38, 0.4, 0.1, 0, 0, 0, 14);
  p.cyl('cloth', 0xd8cdb4, 0.28, 0.28, 0.115, 0, 0, 0, 14);
  p.cyl('metal', C.steel, 0.1, 0.09, 0.05, 0.55, 0, 0.15, 10);
  p.cyl('metal', 0x4a7ab0, 0.1, 0.09, 0.05, 0.55, 0, -0.12, 10);
  p.box('matte', 0xe8e0c8, 0.2, 0.04, 0.05, -0.1, 0.1, 0.1, 0.6);
};

const doghouse: Build = (p, o) => {
  const c = o.variant % 2 ? 0x5a7a9a : 0x8a3b2e;
  p.box('matte', c, 0.8, 0.62, 0.95, 0, 0, 0);
  for (const s of [-1, 1]) p.box('matte', 0x4a4a46, 0.6, 0.03, 1.05, s * 0.2, 0.7, 0, 0, 0, s * -0.55);
  p.box('matte', 0x1c1a18, 0.32, 0.4, 0.02, 0, 0.0, 0.48);
  p.cyl('matte', 0x1c1a18, 0.16, 0.16, 0.02, 0, 0.36, 0.48, 10, Math.PI / 2);
};

/** Bales stacked: `count` of them, a pyramid. */
const haybales: Build = (p, o) => {
  const n = Math.max(1, Math.min(14, o.count));
  const rows: Array<Array<[number, number, number]>> = [];
  // base row of up to 4 side by side, then 3, 2, 1; a second column behind when there are lots
  let left = n, level = 0;
  while (left > 0 && level < 4) {
    const k = Math.min(left, level === 0 ? Math.min(5, Math.ceil(n / 2.4)) : 3 - level + 1);
    rows.push(Array.from({ length: k }, (_, i) => [(i - (k - 1) / 2) * 0.95, level * 0.4, 0]));
    left -= k; level++;
  }
  let col = 0;
  while (left > 0 && col < 6) { rows.push([[0.0, 0, -0.5 - 0.05 * col]]); left--; col++; }
  let b = 0;
  for (const r of rows) for (const [x, y, z] of r) {
    const j = (o.rnd() - 0.5) * 0.06;
    p.box('matte', b % 3 === 0 ? 0xc0a45c : C.straw, 0.9, 0.4, 0.45, x + j, y, z + j, (o.rnd() - 0.5) * 0.12);
    for (const t of [-0.25, 0.25]) p.box('matte', 0x4a4030, 0.01, 0.405, 0.455, x + t + j, y, z + j, 0);
    b++;
  }
};

const trough: Build = (p) => {
  p.box('matte', C.wood, 1.8, 0.1, 0.5, 0, 0.3, 0);
  for (const [w, d, x, z] of [[1.8, 0.05, 0, 0.23], [1.8, 0.05, 0, -0.23], [0.05, 0.5, 0.88, 0], [0.05, 0.5, -0.88, 0]] as const) p.box('matte', C.wood, w, 0.22, d, x, 0.35, z);
  p.box('matte', 0x6a5a3a, 1.7, 0.1, 0.4, 0, 0.4, 0);
  for (const x of [-0.7, 0.7]) for (const z of [-0.18, 0.18]) p.box('matte', C.woodDark, 0.07, 0.32, 0.07, x, 0, z);
};

const wheelbarrow: Build = (p, o) => {
  const c = o.variant % 2 ? C.red : C.green;
  p.box('metal', c, 0.62, 0.3, 0.8, 0, 0.32, 0.0, 0, 0.0);
  p.box('matte', C.soil, 0.52, 0.04, 0.68, 0, 0.58, 0.02);
  p.roll('matte', C.rubber, 0.2, 0.07, 0, 0.2, 0.52, 'x', 10);
  for (const s of [-1, 1]) {
    p.box('matte', C.wood, 0.04, 0.04, 1.3, s * 0.27, 0.45, -0.55, 0, -0.1);
    p.box('matte', C.iron, 0.03, 0.4, 0.03, s * 0.25, 0, -0.1, 0, 0, s * 0.07);
  }
};

/** Three tools leaning on a wall behind (-z): a rake, a hoe, a shovel. */
const tools: Build = (p, o) => {
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * 0.2, lean = 0.18 + 0.03 * i;
    p.box('matte', 0x8a6a48, 0.035, 1.5, 0.035, x, 0.0, -0.02, 0, -lean);
    const hx = x, hy = 0.0, hz = 0.0;
    p.box('metal', C.steel, i === 0 ? 0.3 : 0.18, 0.05, i === 0 ? 0.03 : 0.2, hx, hy, hz + 0.02, 0, 0, 0);
    if (i === 0) for (let k = -2; k <= 2; k++) p.box('metal', C.steel, 0.012, 0.07, 0.012, hx + k * 0.06, hy + 0.03, hz);
  }
  if (o.variant % 2) p.cyl('metal', C.steel, 0.14, 0.11, 0.3, 0.6, 0, -0.1, 9);
};

const sawhorses: Build = (p, o) => {
  for (const s of [-1, 1]) {
    p.box('matte', C.wood, 0.07, 0.07, 0.6, s * 0.55, 0.74, 0);
    for (const z of [-1, 1]) p.box('matte', C.wood, 0.06, 0.78, 0.06, s * 0.55, 0, z * 0.22, 0, z * 0.22);
  }
  p.box('matte', C.woodPale, 1.7, 0.045, 0.3, 0, 0.78, 0);
  p.box('matte', 0xb89a5a, 0.5, 0.04, 0.4, 0.3, 0.83, 0.02, 0.15);
  p.box('metal', C.steel, 0.38, 0.015, 0.1, -0.3, 0.83, 0.0, 0.3);
  p.box('matte', 0xe8d8a0, 0.7, 0.01, 0.55, 0, 0, 0.45, o.rnd());
};

const lumber: Build = (p, o) => {
  const L = 3.0;
  for (const x of [-1.2, 0, 1.2]) p.box('matte', C.woodDark, 0.08, 0.08, 0.7, x, 0, 0);
  for (let j = 0; j < 6; j++) for (let i = 0; i < 4; i++) {
    const c = new THREE.Color(C.woodPale).offsetHSL(0, 0, (o.rnd() - 0.5) * 0.14);
    p.box('matte', c.getHex(), L + (o.rnd() - 0.5) * 0.1, 0.07, 0.15, 0, 0.08 + j * 0.085, -0.28 + i * 0.19 + (o.rnd() - 0.5) * 0.02);
    if (j % 2 === 1 && i === 0) p.box('matte', C.woodDark, 0.04, 0.03, 0.78, -1.2 + (j % 3) * 1.2, 0.08 + j * 0.085 - 0.015, 0);
  }
  p.box('cloth', 0x3a5a8a, L * 0.6, 0.02, 0.8, L * 0.2, 0.08 + 6 * 0.085, 0);
};

const drum: Build = (p, o) => {
  for (const [x, z, c] of [[-0.3, 0, o.variant % 2 ? 0x3a5a8a : 0x8a3b2e], [0.35, 0.12, 0x4a4e52]] as const) {
    p.cyl('metal', c, 0.29, 0.29, 0.88, x, 0, z, 12);
    for (const y of [0.2, 0.6]) p.ring('metal', 0x2a2c2e, 0.295, 0.012, x, y, z, Math.PI / 2, 0, 14);
    p.cyl('metal', 0x2a2c2e, 0.1, 0.1, 0.025, x + 0.1, 0.88, z, 6);
  }
};

const tires: Build = (p) => {
  for (let i = 0; i < 4; i++) p.ring('matte', C.rubber, 0.33, 0.11, 0, 0.11 + i * 0.2, 0.0, Math.PI / 2, 0, 12);
  p.ring('matte', C.rubber, 0.33, 0.11, 0.7, 0.11, 0.35, Math.PI / 2, 0, 12);
  p.ring('matte', C.rubber, 0.33, 0.11, 0.6, 0.31, 0.3, Math.PI / 2 - 0.4, 0.3, 12);
};

const fuelcans: Build = (p) => {
  for (let i = 0; i < 3; i++) {
    const x = -0.3 + i * 0.34, c = i === 1 ? 0xc89a28 : 0xb83a2e;
    p.box('metal', c, 0.32, 0.46, 0.15, x, 0, 0);
    p.box('metal', C.iron, 0.1, 0.07, 0.05, x - 0.09, 0.46, 0);
    p.box('metal', C.iron, 0.07, 0.04, 0.04, x + 0.08, 0.46, 0);
  }
};

const bench: Build = (p, o) => {
  const w = 1.6;
  p.box('matte', C.wood, w, 0.05, 0.4, 0, 0.45, 0);
  p.box('matte', C.wood, w, 0.3, 0.04, 0, 0.62, -0.18, 0, -0.18);
  for (const s of [-1, 1]) { p.box('matte', C.woodDark, 0.06, 0.45, 0.4, s * (w / 2 - 0.1), 0, 0); p.box('matte', C.woodDark, 0.05, 0.45, 0.05, s * (w / 2 - 0.1), 0.45, -0.18, 0, -0.18); }
  // a fishing rod propped on it, a bucket by it
  if (o.variant % 2 === 0) { p.box('matte', 0x6a5a3a, 0.015, 1.9, 0.015, w / 2 + 0.2, 0, 0.2, 0, -0.25, 0.1); p.cyl('metal', C.steel, 0.14, 0.11, 0.28, -w / 2 - 0.3, 0, 0.1, 9); }
};

/** Two Adirondack chairs and a round table. */
const chairs: Build = (p, o) => {
  const chair = (x: number, z: number, r: number, c: number) => {
    const cx = Math.cos(r), sx = Math.sin(r);
    const at = (lx: number, lz: number): [number, number] => [x + lx * cx + lz * sx, z - lx * sx + lz * cx];
    const put = (lx: number, lz: number, w: number, h: number, d: number, y: number, rx = 0) => { const [px, pz] = at(lx, lz); p.box('matte', c, w, h, d, px, y, pz, r, rx); };
    put(0, 0.05, 0.62, 0.04, 0.55, 0.38, 0.12);
    put(0, -0.22, 0.6, 0.62, 0.04, 0.35, -0.38);
    for (const s of [-1, 1]) { put(s * 0.34, 0.08, 0.06, 0.04, 0.55, 0.52); put(s * 0.31, 0.25, 0.05, 0.4, 0.05, 0); }
  };
  const [a, b] = o.variant % 2 ? [0x4a78a8, 0xe8e4d8] : [0xe8e4d8, 0x8a3b2e];
  chair(-0.55, 0, 0.35, a);
  chair(0.55, 0, -0.35, b);
  p.cyl('matte', C.woodPale, 0.3, 0.3, 0.04, 0, 0.5, 0.35, 12);
  p.cyl('matte', C.woodDark, 0.04, 0.04, 0.5, 0, 0, 0.35, 6);
  p.cyl('matte', 0xe8d8b0, 0.06, 0.05, 0.1, 0.03, 0.54, 0.33, 8);
};

const trellis: Build = (p, o) => {
  for (const s of [-1, 1]) p.box('matte', C.woodDark, 0.07, 2.3, 0.07, s * 0.55, 0, 0);
  for (const y of [0.4, 0.9, 1.4, 1.9, 2.25]) p.box('matte', C.wood, 1.2, 0.035, 0.035, 0, y, 0);
  for (const x of [-0.3, 0, 0.3]) p.box('matte', C.wood, 0.03, 2.2, 0.03, x, 0.05, 0);
  if (o.season === 'summer' || o.season === 'fall') {
    const n = o.season === 'summer' ? 16 : 6;
    for (let i = 0; i < n; i++) p.sph('leaf', o.season === 'fall' ? 0x8a7a3a : i % 3 ? C.leaf : C.leafDark, 0.1, (o.rnd() - 0.5) * 1.1, 0.4 + o.rnd() * 1.9, 0.02 + (o.rnd() - 0.5) * 0.06, 1.2, 1, 0.6, 5);
    if (o.season === 'summer') for (let i = 0; i < 4; i++) p.sph('leaf', 0xd85a3a, 0.05, (o.rnd() - 0.5) * 1.0, 0.6 + o.rnd() * 1.2, 0.07, 1, 1, 1, 5);
  }
};

/** The garden gate, hung open on its hinge post (+x side of the gap, swung back toward -z). */
const gardengate: Build = (p) => {
  p.box('matte', C.woodDark, 0.09, 1.7, 0.09, 0, 0, 0);
  // a leaf, 1 m, swung open about 70 degrees
  const a = 1.15, cx = Math.sin(a) * 0.5, cz = -Math.cos(a) * 0.5;
  p.box('matte', C.woodPale, 0.06, 1.2, 0.05, cx, 0, cz, a);
  p.box('matte', C.woodPale, 1.0, 0.07, 0.05, cx, 0.2, cz, a - Math.PI / 2);
  p.box('matte', C.woodPale, 1.0, 0.07, 0.05, cx, 0.85, cz, a - Math.PI / 2);
  p.bar('matte', C.woodPale, 1.1, 0.06, 0.03, cx, 0.55, cz, a - Math.PI / 2, 0, 0.55);
  p.box('metal', C.iron, 0.2, 0.04, 0.03, 0.04, 0.8, 0.0);
};

const scarecrow: Build = (p, o) => {
  p.box('matte', C.woodDark, 0.06, 1.9, 0.06, 0, 0, 0);
  p.box('matte', C.woodDark, 1.3, 0.05, 0.05, 0, 1.35, 0);
  p.box('cloth', o.variant % 2 ? 0x4a6a8a : 0x8a3b2e, 0.5, 0.6, 0.18, 0, 0.9, 0);
  p.box('cloth', 0x4a6a8a, 1.2, 0.2, 0.06, 0, 1.2, 0);
  p.sph('matte', C.straw, 0.14, 0, 1.72, 0);
  p.cyl('matte', 0x5a4632, 0.28, 0.14, 0.04, 0, 1.78, 0, 8);
  p.cyl('matte', 0x5a4632, 0.15, 0.13, 0.18, 0, 1.8, 0, 8);
  for (const s of [-1, 1]) p.box('matte', C.straw, 0.05, 0.2, 0.03, s * 0.65, 1.12, 0);
};

const pottingbench: Build = (p, o) => {
  p.box('matte', C.woodPale, 1.6, 0.05, 0.6, 0, 0.85, 0);
  for (const s of [-1, 1]) for (const z of [-1, 1]) p.box('matte', C.wood, 0.06, 0.85, 0.06, s * 0.74, 0, z * 0.25);
  p.box('matte', C.wood, 1.5, 0.03, 0.5, 0, 0.3, 0);
  for (let i = 0; i < 5; i++) {
    const x = -0.6 + i * 0.3 + (o.rnd() - 0.5) * 0.05;
    p.cyl('matte', C.terra, 0.07, 0.1, 0.14, x, 0.9, (o.rnd() - 0.5) * 0.2, 8);
    p.sph('leaf', C.leaf, 0.08, x, 1.08, 0, 1, 0.9, 1, 5);
  }
  p.box('matte', 0x2a2a2a, 0.44, 0.04, 0.3, 0.5, 0.35, 0.0);
  p.box('matte', C.soil, 0.4, 0.04, 0.26, 0.5, 0.39, 0.0);
};

const wellapron: Build = (p, o) => {
  p.box('matte', C.stone, 1.4, 0.06, 1.2, 0, 0, 0, 0.1);
  for (let i = 0; i < 6; i++) p.box('matte', new THREE.Color(C.stone).offsetHSL(0, 0, (o.rnd() - 0.5) * 0.12).getHex(), 0.42, 0.075, 0.38, -0.45 + (i % 3) * 0.45, 0, -0.3 + Math.floor(i / 3) * 0.5, o.rnd());
  p.cyl('metal', C.steel, 0.14, 0.11, 0.3, 0.4, 0.07, 0.3, 9);
  p.cyl('metal', 0x6a8a9a, 0.14, 0.11, 0.3, -0.3, 0.07, 0.4, 9);
  p.cyl('lamp', 0x6a8a9a, 0.1, 0.1, 0.01, 0.4, 0.29, 0.3, 9);
};

const hosereel: Build = (p) => {
  p.box('metal', 0x4a4e52, 0.3, 0.06, 0.12, 0, 0.7, 0);
  p.ring('matte', 0x3a7a4a, 0.14, 0.035, 0, 0.82, 0.12, 0, 0, 12);
  p.cyl('matte', 0x3a7a4a, 0.14, 0.14, 0.08, 0, 0.78, 0.13, 10, Math.PI / 2);
  p.box('matte', 0x3a7a4a, 0.03, 0.03, 0.5, 0.2, 0.0, 0.3, 0.5);
};

const leafpile: Build = (p, o) => {
  const cols = [0xc8782a, 0xa8522a, 0xd0a030, 0x8a6a2a];
  for (let i = 0; i < 9; i++) { const a = o.rnd() * 6.28, r = o.rnd() * 0.45; p.sph('leaf', cols[i % 4], 0.3 - r * 0.3, Math.cos(a) * r, 0.12, Math.sin(a) * r, 1.2, 0.5, 1.2, 5); }
  p.box('matte', 0x8a6a48, 0.035, 1.4, 0.035, 0.75, 0, 0.1, 0, -0.55);
  p.box('metal', C.steel, 0.38, 0.03, 0.12, 0.5, 0.02, 0.1, 0.2);
};

const snowman: Build = (p) => {
  p.sph('cloth', C.snow, 0.36, 0, 0.34, 0, 1, 0.9, 1, 9);
  p.sph('cloth', C.snow, 0.27, 0, 0.9, 0, 1, 0.9, 1, 9);
  p.sph('cloth', C.snow, 0.19, 0, 1.3, 0, 1, 0.95, 1, 9);
  p.cyl('matte', 0x2a2a2e, 0.2, 0.15, 0.2, 0, 1.42, 0, 8);
  p.box('matte', 0xe07a28, 0.035, 0.035, 0.18, 0, 1.3, 0.2, 0, 0.1);
  for (const s of [-1, 1]) p.box('matte', 0x5a4632, 0.03, 0.55, 0.03, s * 0.32, 0.95, 0, 0, 0, s * -0.9);
  p.box('cloth', 0xa8322e, 0.3, 0.05, 0.3, 0, 1.13, 0);
};

/** A snow shovel leaning at the door. */
const shovel: Build = (p) => {
  p.box('matte', 0x8a6a48, 0.035, 1.3, 0.035, 0, 0, 0, 0, -0.2);
  p.box('metal', 0x8a2e2a, 0.32, 0.3, 0.025, 0, 0.0, 0.07, 0, 0.12);
  p.box('matte', 0x8a6a48, 0.18, 0.03, 0.03, 0, 1.26, -0.26);
};
const eggcrate: Build = (p, o) => {
  p.box('matte', C.wood, 0.45, 0.22, 0.32, 0, 0, 0);
  p.box('matte', 0x6a5a3a, 0.4, 0.02, 0.28, 0, 0.2, 0);
  for (let i = 0; i < 6; i++) p.sph('matte', i % 3 ? 0xe8d8b8 : 0xb88a5a, 0.035, -0.15 + (i % 3) * 0.14, 0.22, -0.06 + Math.floor(i / 3) * 0.12, 0.8, 1, 0.8, 5);
  p.cyl('metal', C.steel, 0.14, 0.11, 0.28, 0.55, 0, 0.1, 9);
  void o;
};

export const BUILD: Record<PropKind, Build> = {
  doormat, boots, flowerpot, rainbarrel, woodstack, chopblock, birdfeeder, lantern, yardlight, flagpole, sign, mailbox,
  swingset, sandbox, wagon, ball, kidbike, dogbed, doghouse,
  haybales, trough, wheelbarrow, tools, sawhorses, lumber, drum, tires, fuelcans,
  bench, chairs, trellis, gardengate, scarecrow, pottingbench, wellapron, hosereel, leafpile, snowman, shovel, eggcrate,
};
