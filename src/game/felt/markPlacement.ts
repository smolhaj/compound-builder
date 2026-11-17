/**
 * FL2: where each mark goes (docs/FELT_LAYER.md 5.2). Pure over a small `PlaceHost` (ground height, county road, creek, farmsteads, building
 * boxes, a blocked test), so the placement is tested without a canvas and the scene audit can run it over the corpus. It resolves anchors to
 * coordinates, never inside a building footprint or a neighbor yard (unless the mark is about that building), never on water except the flood
 * and the mud, and never on the drive. The output is plain lists the renderers turn into one decal mesh, one prop mesh and a fire source list.
 */
import type { FireSource } from '../../engine/world/fx/FireFx';
import type { Anchor, WorldMark } from '../../sim/felt/types';
import { FT_PER_UNIT, farmLooks, type FarmLook } from '../../sim/felt/marks';
import { mulberry32 } from '../../sim/rng';
import type { GameState } from '../../sim/state';

export interface Box { cx: number; cz: number; w: number; d: number; y0: number; h: number }
export interface PlaceHost {
  /** Side of the square parcel (world units). */
  size: number;
  camp: { x: number; z: number };
  groundAt(x: number, z: number): number;
  /** Center line of the county road at z, the half width of its carriageway, and the z of the gate. */
  roadX(z: number): number;
  roadHalf: number;
  gateZ: number;
  creekZ(x: number): number;
  creekWaterY(x: number): number;
  farms: ReadonlyArray<{ x: number; z: number; rot: number }>;
  boxOf(structureId: string): Box | undefined;
  /** Inside a building, the drive, a neighbor yard or a fence line: nothing is laid there. */
  blocked(x: number, z: number): boolean;
  /** Open water (the pond, the creek channel, the lake). */
  water(x: number, z: number): boolean;
}

export type DecalCell = 0 | 1 | 2 | 3;   // crack, soft dark, ash patch, dried-mud polygons
export interface Decal { x: number; y: number; z: number; rot: number; size: number; cell: DecalCell; r: number; g: number; b: number; a: number; markId: string }
export type PropType = 'barrier' | 'sandbags' | 'sign' | 'flag' | 'tent' | 'post' | 'figure' | 'tarp' | 'tag' | 'plank' | 'cone' | 'log' | 'tape' | 'slot';
export interface Prop { type: PropType; x: number; y: number; z: number; rot: number; scale: number; color: number; markId: string }
export interface Placed { flood: { feet: number; sev: number } | null; decals: Decal[]; props: Prop[]; fires: FireSource[]; farms: FarmLook[]; dropped: number }

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const ROAD_FAR = 128;

/** Cells of the decal atlas used by each decal kind, with its tint and size range (world units). */
const DECAL: Record<string, { cell: DecalCell; rgb: [number, number, number]; size: [number, number]; a: number }> = {
  crack: { cell: 0, rgb: [0.1, 0.08, 0.07], size: [1.2, 3.4], a: 0.95 },
  slump: { cell: 1, rgb: [0.16, 0.12, 0.09], size: [1.4, 2.8], a: 0.85 },
  ash_drift: { cell: 2, rgb: [0.66, 0.65, 0.63], size: [1.6, 4.2], a: 0.85 },
  burn_scar: { cell: 1, rgb: [0.05, 0.045, 0.04], size: [1.5, 4.5], a: 0.9 },
  mud_line: { cell: 1, rgb: [0.26, 0.19, 0.11], size: [2, 5], a: 0.8 },
  dead_field: { cell: 1, rgb: [0.42, 0.35, 0.19], size: [3, 8], a: 0.7 },
  dry_bed: { cell: 3, rgb: [0.72, 0.62, 0.45], size: [1.6, 4], a: 0.9 },
};

export function placeMarks(s: GameState, marks: readonly WorldMark[], h: PlaceHost, flat = false): Placed {
  const out: Placed = { flood: null, decals: [], props: [], fires: [], farms: farmLooks(s, marks, h.farms.length || 3), dropped: 0 };
  const farmBlock = (x: number, z: number): boolean => h.farms.some(f => Math.abs(x - f.x) < 10.5 && Math.abs(z - f.z) < 10.5);
  const ok = (x: number, z: number, allowWater = false): boolean =>
    x > 2 && z > 2 && x < h.size + ROAD_FAR && z < h.size + ROAD_FAR && !h.blocked(x, z) && (allowWater || !h.water(x, z));
  const nearRoad = (x: number, z: number): boolean => Math.abs(x - h.roadX(z)) < h.roadHalf + 0.15;

  const around = (cx: number, cz: number, r0: number, r1: number, r: () => number, allowWater = false, tries = 8): [number, number] | null => {
    for (let k = 0; k < tries; k++) {
      const a = r() * Math.PI * 2, d = r0 + (r1 - r0) * Math.sqrt(r());
      const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
      if (ok(x, z, allowWater) && !nearRoad(x, z) && !farmBlock(x, z)) return [x, z];
    }
    return null;
  };
  /** A point on the road (lat across it, in units from the center line) at `s` units from the gate. */
  const onRoad = (sRoad: number, lat: number): [number, number] => { const z = h.gateZ + sRoad; return [h.roadX(z) + lat, z]; };
  const shoulder = (sRoad: number, side: 1 | -1): [number, number] => onRoad(sRoad, side * (h.roadHalf + 0.35));

  /** The highest ground under a decal of this size (the quad is flat, so on a slope it must clear the high side). */
  const topOf = (x: number, z: number, size: number): number => { const q = size * 0.45; return Math.max(h.groundAt(x, z), h.groundAt(x + q, z), h.groundAt(x - q, z), h.groundAt(x, z + q), h.groundAt(x, z - q)); };
  const decal = (m: WorldMark, x: number, z: number, r: () => number, scale = 1): void => {
    const d = DECAL[m.kind]; if (!d) return;
    const size = (d.size[0] + (d.size[1] - d.size[0]) * r()) * scale * (0.6 + 0.4 * m.sev);
    out.decals.push({ x, y: topOf(x, z, size) + 0.03, z, rot: r() * Math.PI * 2, size, cell: d.cell, r: d.rgb[0] * (0.9 + 0.2 * r()), g: d.rgb[1] * (0.9 + 0.2 * r()), b: d.rgb[2] * (0.9 + 0.2 * r()), a: d.a * (0.5 + 0.5 * m.sev), markId: m.id });
  };
  const prop = (m: WorldMark, type: PropType, x: number, z: number, rot: number, scale = 1, color = 0xffffff, dy = 0): void => {
    out.props.push({ type, x, y: h.groundAt(x, z) + dy, z, rot, scale, color, markId: m.id });
  };
  const fire = (x: number, z: number, o: Partial<FireSource>): void => {
    out.fires.push({ x, y: h.groundAt(x, z) + 0.2, z, radius: 0.4, height: 1.0, intensity: 0, smolder: 0.9, ...o });
  };
  const people = (m: WorldMark, x: number, z: number, along: number, n: number, r: () => number, color = 0x5a5448): void => {
    for (let i = 0; i < n; i++) prop(m, 'figure', x + Math.cos(along) * i * 0.5 + (r() - 0.5) * 0.2, z + Math.sin(along) * i * 0.5 + (r() - 0.5) * 0.2, r() * 6.28, 0.78 + 0.14 * r(), color);
  };

  /** The center of the anchor: where a decal or prop cluster goes, or null if it cannot be resolved. */
  const center = (a: Anchor, r: () => number): [number, number] | null => {
    switch (a.at) {
      case 'compound': return [h.camp.x, h.camp.z];
      case 'structure': { const b = h.boxOf(a.id); return b ? [b.cx, b.cz] : null; }
      case 'neighbor': case 'field': { const f = h.farms[a.at === 'neighbor' ? a.i : a.i % Math.max(1, h.farms.length)]; return f ? [f.x, f.z] : null; }
      case 'road': return onRoad(a.s, 0);
      case 'creek': { const x = 8 + r() * (h.size - 16); return [x, h.creekZ(x)]; }
      case 'town': return onRoad(-ROAD_FAR + 8, 0);
      case 'lowland': return [h.camp.x, h.creekZ(h.camp.x)];
      case 'sky': return [h.camp.x + Math.sin(a.bearing) * 190, h.camp.z + Math.cos(a.bearing) * 190];
    }
  };

  for (const m of marks) {
    const r = mulberry32(m.seed);
    const a = m.anchor;
    switch (m.kind) {
      case 'flood': if (a.at === 'lowland') out.flood = { feet: a.level, sev: m.sev }; break;
      case 'crack': case 'slump': case 'ash_drift': case 'burn_scar': case 'dead_field': case 'mud_line': case 'dry_bed': {
        if (flat && m.kind !== 'crack' && m.kind !== 'ash_drift') break;
        let p: [number, number] | null = null;
        const c = center(a, r);
        if (!c) { out.dropped++; break; }
        if (a.at === 'structure') {
          const b = h.boxOf(a.id)!; const side = Math.floor(r() * 4), t = r() - 0.5;
          const x = side < 2 ? b.cx + (side === 0 ? -1 : 1) * (b.w / 2 + 0.3) : b.cx + t * b.w, z = side < 2 ? b.cz + t * b.d : b.cz + (side === 2 ? -1 : 1) * (b.d / 2 + 0.3);
          p = ok(x, z) ? [x, z] : null;
        } else if (a.at === 'compound') p = around(c[0], c[1], 2.5, m.kind === 'ash_drift' || m.kind === 'dead_field' ? 20 : 15, r, false, 10);
        else if (a.at === 'creek') {
          const x = 6 + r() * (h.size - 12), dz = (r() - 0.5) * (m.kind === 'dry_bed' ? 2 : 7);
          const z = h.creekZ(x) + dz;
          p = ok(x, z, m.kind === 'mud_line' || m.kind === 'dry_bed') && !farmBlock(x, z) ? [x, z] : null;
        } else p = around(c[0], c[1], 12, m.kind === 'dead_field' ? 38 : 28, r, false, 10);
        if (p) decal(m, p[0], p[1], r); else out.dropped++;
        break;
      }
      case 'road_cut': {
        if (a.at !== 'road') break;
        const [x, z] = onRoad(a.s, 0);
        out.decals.push({ x, y: topOf(x, z, h.roadHalf * 2.6) + 0.035, z, rot: Math.PI / 2 + (r() - 0.5) * 0.3, size: h.roadHalf * 2.6, cell: 0, r: 0.09, g: 0.075, b: 0.065, a: 0.95, markId: m.id });
        out.decals.push({ x: x + 0.2, y: topOf(x, z, h.roadHalf * 1.6) + 0.034, z: z + 0.1, rot: r() * 3, size: h.roadHalf * 1.6, cell: 1, r: 0.14, g: 0.11, b: 0.08, a: 0.85, markId: m.id });
        break;
      }
      case 'barricade': {
        if (a.at === 'road') {
          const side: 1 | -1 = r() < 0.5 ? 1 : -1;
          const [x, z] = onRoad(a.s + (r() - 0.5) * 2, side * h.roadHalf * 0.45);
          prop(m, 'barrier', x, z, Math.PI / 2 + (r() - 0.5) * 0.25, 1, 0xd9d4c6);
          prop(m, 'cone', x + side * 0.3, z - 0.5, 0, 1, 0xe5651c); prop(m, 'cone', x + side * 0.3, z + 0.5, 0, 1, 0xe5651c);
          if (m.sev > 0.6) prop(m, 'sandbags', x - side * 0.25, z, Math.PI / 2, 1, 0xb59a6a);
        } else if (a.at === 'creek') { const c = around(h.size * 0.5, h.creekZ(h.size * 0.5), 2, 12, r, true); if (c) { prop(m, 'plank', c[0], c[1], r() * 3, 1, 0x7a5c3a); prop(m, 'sign', c[0] + 0.4, c[1], 0, 1, 0xb8472f); } }
        break;
      }
      case 'checkpoint': {
        if (a.at !== 'road') break;
        for (const side of [1, -1] as const) { const [x, z] = onRoad(a.s, side * h.roadHalf * 0.5); prop(m, 'barrier', x, z, Math.PI / 2, 1.1, 0xc9c3b2); }
        const [px, pz] = shoulder(a.s, 1);
        prop(m, 'sandbags', px, pz, 0, 1.2, 0xa8935f); prop(m, 'sandbags', px + 0.1, pz + 0.7, 0.4, 1, 0xa8935f);
        prop(m, 'flag', px + 0.4, pz - 0.6, 0, 1, 0x3c5a85);
        prop(m, 'sign', ...shoulder(a.s + 3, -1), Math.PI, 1, 0xc0392b);
        people(m, px - 0.3, pz + 0.3, 0.9, 3, r, 0x4c5640);
        break;
      }
      case 'queue': {
        if (a.at !== 'road') break;
        const side: 1 | -1 = r() < 0.5 ? 1 : -1;
        const n = Math.round(4 + 6 * m.sev);
        for (let i = 0; i < n; i++) { const [x, z] = shoulder(a.s + i * 0.55, side); prop(m, 'figure', x + (r() - 0.5) * 0.12, z, side * 1.57, 0.8 + 0.12 * r(), [0x6a5f52, 0x44503f, 0x5a4a44, 0x4a5568][i % 4]); if (i % 3 === 0) prop(m, 'post', x - side * 0.3, z, 0, 1, 0x8a7f6c); }
        break;
      }
      case 'column': {
        if (a.at !== 'road') break;
        const n = Math.round(6 + 10 * m.sev), dir = r() < 0.5 ? 1 : -1;
        for (let i = 0; i < n; i++) { const [x, z] = onRoad(a.s + dir * i * 0.7 + (r() - 0.5) * 0.3, (r() < 0.5 ? -1 : 1) * h.roadHalf * 0.3 + (r() - 0.5) * 0.15); prop(m, 'figure', x, z, dir > 0 ? 0 : Math.PI, 0.78 + 0.14 * r(), [0x5b5148, 0x3f4650, 0x6b5b4a, 0x4a4238][i % 4]); }
        break;
      }
      case 'camp': {
        let c: [number, number] | null = null;
        if (a.at === 'road') c = shoulder(a.s, 1);
        else { const f = center(a, r); c = f ? around(f[0], f[1], 7, 14, r) : null; }
        if (!c) { out.dropped++; break; }
        for (let i = 0; i < 3; i++) prop(m, 'tent', c[0] + (i % 2) * 1.0 - 0.5, c[1] + i * 0.8, r() * 3, 1, [0x6f7a4c, 0x8a6a3a, 0x47627a][i]);
        people(m, c[0] + 1, c[1] + 0.4, 1.2, 2, r);
        break;
      }
      case 'banner': { if (a.at === 'road') { const [x, z] = shoulder(a.s + 1.5 * (m.id.endsWith('.1') ? -1 : 1), m.id.endsWith('.1') ? -1 : 1); prop(m, 'flag', x, z, 0, 1.3, m.id.endsWith('.1') ? 0x2f4f8f : 0x9b2d2d); } break; }
      case 'sign': { if (a.at === 'road') { const [x, z] = shoulder(a.s, 1); prop(m, 'sign', x, z, Math.PI * 0.5 + (r() - 0.5) * 0.4, 1, 0xd8d2c0); } break; }
      case 'zone': {
        if (a.at !== 'road') break;
        const [x0, z0] = onRoad(a.s, -h.roadHalf - 0.15), [x1, z1] = onRoad(a.s, h.roadHalf + 0.15);
        prop(m, 'post', x0, z0, 0, 1, 0xe8e2d0); prop(m, 'post', x1, z1, 0, 1, 0xe8e2d0);
        prop(m, 'tape', (x0 + x1) / 2, (z0 + z1) / 2, Math.atan2(z1 - z0, x1 - x0), Math.hypot(x1 - x0, z1 - z0), 0xe0b030, 0.38);
        break;
      }
      case 'debris': {
        const c = center(a, r);
        if (!c) break;
        const n = a.at === 'compound' ? 1 : 1;
        for (let k = 0; k < n; k++) {
          const p = a.at === 'creek' ? ((): [number, number] | null => { const x = 6 + r() * (h.size - 12), z = h.creekZ(x) + (r() - 0.5) * 8; return ok(x, z, true) && !farmBlock(x, z) ? [x, z] : null; })()
            : a.at === 'road' ? onRoad(a.s + (r() - 0.5) * 4, (r() - 0.5) * h.roadHalf * 1.4) : around(c[0], c[1], 3, 15, r);
          if (p) { prop(m, r() < 0.5 ? 'log' : 'plank', p[0], p[1], r() * 3.14, 0.8 + 0.6 * r(), r() < 0.5 ? 0x6e5238 : 0x8a7452); } else out.dropped++;
        }
        break;
      }
      case 'tarp': case 'red_tag': {
        if (a.at !== 'structure') break;
        const b = h.boxOf(a.id);
        if (!b) { out.dropped++; break; }
        // a tarp lies on a roof: not on a tower, a long wall or a mast (their box is tall or long, which hung a slab in the air), and never bigger than a roof
        if (m.kind === 'tarp') {
          if (b.h > 1.6 || Math.max(b.w, b.d) > 3.5) { out.dropped++; break; }
          prop(m, 'tarp', b.cx, b.cz, r() * 0.4, Math.min(1.3, Math.max(b.w, b.d) * 0.7), r() < 0.5 ? 0x3d6fb0 : 0x8a8f94, b.y0 + Math.min(b.h * 0.92, 1.1) - h.groundAt(b.cx, b.cz));
        }
        else prop(m, 'tag', b.cx, b.cz + b.d / 2 + 0.06, 0, 1, 0xd8432b, b.y0 + 0.28 - h.groundAt(b.cx, b.cz));
        break;
      }
      case 'ruin': {
        const c = center(a, r); if (!c) break;
        if (a.at === 'structure') { const b = h.boxOf(a.id); if (b) { out.decals.push({ x: b.cx, y: b.y0 + 0.05, z: b.cz, rot: r() * 3, size: Math.max(b.w, b.d) * 1.6, cell: 1, r: 0.05, g: 0.045, b: 0.04, a: 0.85, markId: m.id }); fire(b.cx, b.cz, { radius: Math.min(b.w, b.d) * 0.3, height: 0.5, smolder: 0.8 * m.sev }); } }
        else { out.decals.push({ x: c[0] - 2, y: h.groundAt(c[0], c[1]) + 0.03, z: c[1] - 2, rot: r() * 3, size: 6, cell: 1, r: 0.05, g: 0.045, b: 0.04, a: 0.85, markId: m.id }); fire(c[0] - 2, c[1] - 2, { radius: 0.9, height: 1.2, smolder: 0.8 * m.sev, intensity: 0 }); }
        break;
      }
      case 'pyre': {
        const c = center(a, r); if (!c) break;
        const p = a.at === 'neighbor' ? [c[0] - 2, c[1] - 2] as [number, number] : around(c[0], c[1], 4, 18, r) ?? null;
        if (p) fire(p[0], p[1], { radius: 0.5, height: 1.1, intensity: 0.5 + 0.5 * m.sev, smolder: 0 }); else out.dropped++;
        break;
      }
      case 'smoke': {
        const c = center(a, r); if (!c) break;
        if (a.at === 'sky') fire(c[0], c[1], { y: h.groundAt(c[0], c[1]) + 0.4, radius: 2.4, height: 7, intensity: 0, smolder: clamp01(m.sev) });
        else { const p = around(c[0], c[1], 6, 22, r); if (p) fire(p[0], p[1], { radius: 0.8, height: 1.6, intensity: 0.35 * m.sev, smolder: clamp01(0.6 + 0.4 * m.sev) }); else out.dropped++; }
        break;
      }
      default: break;   // ash (the look's ground cover), stalled (RoadTraffic), open_door / boarded / dark_house (farm looks), dead_lights
    }
  }
  // the fire list: flames first, then nearest the compound, at most what FireFx can hold
  out.fires.sort((p, q) => (q.intensity - p.intensity) || (Math.hypot(p.x - h.camp.x, p.z - h.camp.z) - Math.hypot(q.x - h.camp.x, q.z - h.camp.z)));
  out.fires.length = Math.min(out.fires.length, 6);
  return out;
}

/** Feet to world units. */
export const feetToUnits = (ft: number): number => ft / FT_PER_UNIT;
