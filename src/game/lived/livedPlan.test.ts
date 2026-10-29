import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CELL, KIT, footprint } from '../buildkit/kit';
import { planLived, type LivedBuilding, type LivedCtx, type LivedFolks, type LivedProp } from './livedPlan';
import { BUILD, M, P, PROP_R, type PropKind } from './propGeometry';
import { yardLamp } from './LivedRenderer';

const B = (id: string, kind: string, x: number, z: number, rot = 0, ageDays = 400): LivedBuilding => ({ id, kind, x, z, rot, ageDays });
const place: LivedBuilding[] = [B('h', 'farmhouse', 40, 40), B('b', 'barn', 30, 30), B('w', 'workshop', 52, 44, 3), B('c', 'chicken_coop', 28, 42), B('g', 'garden', 40, 28), B('gh', 'greenhouse', 52, 30), B('f', 'field', 20, 55), B('wl', 'well_hand', 46, 52), B('gs', 'generator_shed', 58, 36)];
const folks: LivedFolks = { kids: 2, youngKids: 2, adults: 2, dogs: 2, animals: 4, hay: 12, growing: true };

const ctxOf = (o: Partial<LivedCtx> = {}, bs: LivedBuilding[] = place): LivedCtx => ({
  seed: 7, buildings: bs, folks, season: 'summer', snow: false, mud: false, tier: 2, placeAge: Math.max(...bs.map(b => b.ageDays)),
  gate: { mail: { x: 69, z: 40, rot: Math.PI / 2 }, sign: { x: 66.5, z: 38, rot: Math.PI / 2 } }, landing: { x: 30, z: 18, face: 0 },
  // a flat world with only the other buildings' bodies in the way (the own building may be touched)
  blocked: (x, z, r, self, mode) => {
    for (const b of bs) {
      const def = KIT[b.kind], body = footprint(def, b.x, b.z, b.rot, false);
      if (b.id === self) { if (mode !== 'inside' && x > body.x0 && x < body.x1 && z > body.z0 && z < body.z1) return true; continue; }
      const f = mode === 'porch' ? body : footprint(def, b.x, b.z, b.rot, true);
      if (x > f.x0 - r && x < f.x1 + r && z > f.z0 - r && z < f.z1 + r) return true;
    }
    return false;
  },
  pathDist: () => Infinity, doors: [], ...o,
});

const kinds = (props: LivedProp[]) => new Set(props.map(p => p.kind));
const count = (props: LivedProp[], k: PropKind) => props.filter(p => p.kind === k).length;

describe('what a place has lying about', () => {
  it('is deterministic', () => {
    expect(planLived(ctxOf()).key).toBe(planLived(ctxOf()).key);
    expect(planLived(ctxOf()).props).toEqual(planLived(ctxOf()).props);
  });

  it('fills up with age: a day-old place is bare, a three-year-old place is lived in', () => {
    const at = (age: number) => planLived(ctxOf({}, place.map(b => ({ ...b, ageDays: age })))).props.length;
    const [d1, d30, d90, y1, y3] = [1, 30, 90, 365, 1100].map(at);
    expect(d1).toBeLessThanOrEqual(2);
    expect(d30).toBeGreaterThan(d1);
    expect(d90).toBeGreaterThan(d30);
    expect(y1).toBeGreaterThan(d90);
    expect(y3).toBeGreaterThanOrEqual(y1);
    expect(y3).toBeGreaterThan(25);
  });

  it('a new house gets its doormat within days, pots in a couple of months, a flagpole only after a year', () => {
    const only = (age: number) => kinds(planLived(ctxOf({}, [B('h', 'farmhouse', 40, 40, 0, age)])).props);
    expect(only(3).has('doormat')).toBe(true);
    expect(only(3).has('flowerpot')).toBe(false);
    expect(only(60).has('flowerpot')).toBe(true);
    expect(only(60).has('flagpole')).toBe(false);
    expect(only(500).has('flagpole')).toBe(true);
  });

  it('what came with the land is old on the first day', () => {
    expect(planLived(ctxOf({}, [B('h', 'farmhouse', 40, 40, 0, 365 * 30)])).props.length).toBeGreaterThan(10);
  });

  it('the quality tiers thin it: Low is a subset of Medium is a subset of High', () => {
    const [lo, md, hi] = ([0, 1, 2] as const).map(t => planLived(ctxOf({ tier: t })).props);
    expect(lo.length).toBeLessThan(md.length);
    expect(md.length).toBeLessThan(hi.length);
    expect(lo.length).toBeGreaterThan(3);               // the lanterns, the mat, the mailbox are there on Low
    for (const k of kinds(lo)) expect(kinds(md).has(k)).toBe(true);
    for (const k of kinds(md)) expect(kinds(hi).has(k)).toBe(true);
    expect(kinds(lo).has('swingset')).toBe(false);
  });

  it('kids bring the swing and the toys, dogs the bed, animals the bales and the trough', () => {
    const none = planLived(ctxOf({ folks: { ...folks, kids: 0, youngKids: 0, dogs: 0, animals: 0, hay: 0 } })).props;
    expect(count(none, 'swingset') + count(none, 'wagon') + count(none, 'dogbed') + count(none, 'trough')).toBe(0);
    expect(count(none, 'haybales')).toBe(1);                       // a couple of old bales, no more
    const all = planLived(ctxOf()).props;
    expect(count(all, 'swingset')).toBe(1);
    expect(count(all, 'dogbed')).toBe(1);
    expect(count(all, 'doghouse')).toBe(1);                         // two dogs: one lives outside
    expect(count(all, 'trough')).toBe(1);
    const grownKids = planLived(ctxOf({ folks: { ...folks, kids: 2, youngKids: 0 } })).props;
    expect(count(grownKids, 'swingset')).toBe(0);                    // teenagers do not swing
  });

  it('bales follow the hay in the barn', () => {
    const bales = (hay: number) => planLived(ctxOf({ folks: { ...folks, hay } })).props.find(p => p.kind === 'haybales')!.count;
    expect(bales(0)).toBeLessThan(bales(12));
    expect(bales(12)).toBeLessThan(bales(60));
    expect(bales(600)).toBeLessThanOrEqual(14);
  });

  it('follows the season: pots in flower in summer, bare in winter; leaves raked in fall; snowman and shovel with snow', () => {
    const w = planLived(ctxOf({ season: 'winter', snow: true })).props, s = planLived(ctxOf({ season: 'summer' })).props, f = planLived(ctxOf({ season: 'fall' })).props;
    expect(count(w, 'flowerpot')).toBeLessThan(count(s, 'flowerpot'));
    expect(count(f, 'leafpile')).toBeGreaterThan(0);
    expect(count(s, 'leafpile')).toBe(0);
    expect(count(w, 'snowman')).toBe(1);
    expect(count(w, 'shovel')).toBeGreaterThan(0);
    expect(count(s, 'snowman') + count(s, 'shovel')).toBe(0);
    expect(count(w, 'chairs') + count(w, 'sandbox')).toBe(0);
    // mud brings the boots to the door
    expect(count(planLived(ctxOf({ mud: true })).props, 'boots')).toBeGreaterThan(0);
    expect(count(planLived(ctxOf({ mud: false })).props, 'boots')).toBe(0);
  });

  it('a place with a gate has a mailbox at the road, a sign inside it, a bench at the creek', () => {
    const k = kinds(planLived(ctxOf()).props);
    expect(k.has('mailbox') && k.has('sign') && k.has('bench')).toBe(true);
    expect(kinds(planLived(ctxOf({ gate: null, landing: null })).props).has('mailbox')).toBe(false);
  });

  it('never puts anything on a building, on another prop, in front of a door or on a path', () => {
    const doors: Array<[number, number]> = place.map(b => { const d = KIT[b.kind]; const hd = d.cellsZ * CELL / 2 + d.porch + 0.08; return [b.x + (b.rot === 0 ? 0 : b.rot === 1 ? hd : b.rot === 3 ? -hd : 0), b.z + (b.rot === 0 ? hd : b.rot === 2 ? -hd : 0)]; });
    // a path along z = 36 across the yard
    const pathDist = (_x: number, z: number) => Math.abs(z - 36);
    const plan = planLived(ctxOf({ doors, pathDist }));
    const props = plan.props;
    expect(props.length).toBeGreaterThan(30);
    for (const p of props) {
      const r = PROP_R[p.kind] * M;
      for (const b of place) {
        if (b.id === p.of) continue;
        const f = footprint(KIT[b.kind], b.x, b.z, b.rot, false);
        const inside = p.x > f.x0 - r * 0.5 && p.x < f.x1 + r * 0.5 && p.z > f.z0 - r * 0.5 && p.z < f.z1 + r * 0.5;
        expect(inside, `${p.id} sits on ${b.id}`).toBe(false);
      }
      if (!p.porch) expect(pathDist(p.x, p.z), `${p.id} is on the path`).toBeGreaterThanOrEqual(r + 0.09);
    }
    for (let i = 0; i < props.length; i++) for (let j = i + 1; j < props.length; j++) {
      const a = props[i], b = props[j];
      expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} / ${b.id}`).toBeGreaterThanOrEqual(PROP_R[a.kind] * M + PROP_R[b.kind] * M - 1e-9);
    }
  });

  it('lays a gravel apron in front of the shop, once it has been a few days', () => {
    expect(planLived(ctxOf()).aprons.length).toBe(1);
    expect(planLived(ctxOf({}, [B('w', 'workshop', 52, 44, 3, 2)])).aprons.length).toBe(0);
    expect(planLived(ctxOf({ tier: 0 })).aprons.length).toBe(0);
  });
});

describe('the pieces', () => {
  const kindsAll = Object.keys(BUILD) as PropKind[];
  it('every prop builds, with finite geometry, in the size it says (a person is 0.28 tall)', () => {
    for (const k of kindsAll) {
      const p = new P();
      p.begin(0, 0, 0, 0, 1);
      let n = 1;
      BUILD[k](p, { season: 'summer', variant: 1, rnd: () => (n = (n * 16807) % 2147483647) / 2147483647, count: 6 });
      const boxes = (Object.values(p.out) as THREE.BufferGeometry[][]).flat();
      expect(boxes.length, k).toBeGreaterThan(0);
      const bb = new THREE.Box3();
      for (const g of boxes) { g.computeBoundingBox(); bb.union(g.boundingBox!); for (const v of g.attributes.position.array) expect(Number.isFinite(v)).toBe(true); }
      const reach = Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x), Math.abs(bb.min.z), Math.abs(bb.max.z)) / M;
      expect(reach, `${k} reaches ${reach.toFixed(2)} m`).toBeLessThan(PROP_R[k] * 1.5 + 0.9);
      expect(bb.max.y / M, `${k} is ${(bb.max.y / M).toFixed(1)} m tall`).toBeLessThan(k === 'flagpole' ? 7 : k === 'yardlight' ? 4.5 : k === 'rainbarrel' ? 3.5 : 3);
      expect(bb.min.y / M, k).toBeGreaterThan(-0.05);
    }
  });
  it('only lanterns, barn lights and the well bucket glow', () => {
    const lit: string[] = [];
    for (const k of kindsAll) {
      const p = new P();
      p.begin(0, 0, 0, 0, 1);
      BUILD[k](p, { season: 'summer', variant: 0, rnd: () => 0.5, count: 3 });
      if (p.out.lamp.length) lit.push(k);
    }
    expect(lit.sort()).toEqual(['lantern', 'wellapron', 'yardlight']);
  });
  it('the lanterns come on at dusk and go out with the lights', () => {
    expect(yardLamp(0, false)).toBe(0);
    expect(yardLamp(1, false)).toBe(1);
    expect(yardLamp(0.4, false)).toBeGreaterThan(0);
    expect(yardLamp(1, true)).toBe(0);
    let prev = 0;
    for (let n = 0; n <= 1; n += 0.05) { const v = yardLamp(n, false); expect(v).toBeGreaterThanOrEqual(prev); prev = v; }
  });
});
