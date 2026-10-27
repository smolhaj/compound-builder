/**
 * Where each dog is and what it is doing, from the sim (pure; tested). The
 * renderer walks it there.
 *
 *  guard      on the post by the gate (alert, facing the road); barks when
 *             somebody is at the gate; at night it stays up
 *  inside     kept in: at the family's feet by day, curled by the house door at night
 *  bonded     follows its person when they are out, sits when they stop
 *  otherwise  lies in the yard near the house or the camp
 */
import { bondOf, ageYears, temperOf, type Dog } from '../../sim/pets';

export type Stance = 'stand' | 'sit' | 'lie' | 'alert' | 'bark';
export interface DogGoal {
  x: number; z: number;
  stance: Stance;
  /** Face this heading (radians, figure faces +z at 0) once there, or null = keep. */
  face: number | null;
  /** Wanders about the spot (puppies, restless dogs). */
  frisky: boolean;
  /** Follows a moving person: run to keep up. */
  follow: boolean;
}

export interface DogCtx {
  /** The house the family lives in (center, rot, size), or null (camp). */
  home: { x: number; z: number; rot: number; w: number; d: number } | null;
  camp: { x: number; z: number };
  /** The gate on the property line, and the yard the drive runs to. */
  gate: { x: number; z: number };
  yard: { x: number; z: number };
  /** Someone is at the gate. */
  atGate: boolean;
  /** People drawn outdoors (id → pose). */
  person: (id: string) => { x: number; z: number; rot: number } | null;
}

const hash = (s: string, k: number): number => { let h = 2166136261 ^ k; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return ((h >>> 0) % 10000) / 10000; };
const faceTo = (fx: number, fz: number, tx: number, tz: number) => Math.atan2(tx - fx, tz - fz);

/** The post by the gate: a little inside the line toward the yard, spread by dog. */
export function postSpot(ctx: DogCtx, index: number): { x: number; z: number; face: number } {
  const dx = ctx.yard.x - ctx.gate.x, dz = ctx.yard.z - ctx.gate.z, d = Math.hypot(dx, dz) || 1;
  const ux = dx / d, uz = dz / d;
  const side = (index % 2 ? 1 : -1) * (0.18 + 0.12 * Math.floor(index / 2));
  const x = ctx.gate.x + ux * 0.9 - uz * side, z = ctx.gate.z + uz * 0.9 + ux * side;
  return { x, z, face: faceTo(x, z, ctx.gate.x, ctx.gate.z) };
}

/** Beside the house, at the door side. */
function doorSpot(ctx: DogCtx, d: Dog, r: number): { x: number; z: number } {
  const h = ctx.home;
  if (!h) return { x: ctx.camp.x + 0.5, z: ctx.camp.z + 0.4 };
  const c = Math.cos(h.rot), s = Math.sin(h.rot);
  const lx = (h.w / 2 + r) * (hash(d.id, 1) < 0.5 ? 1 : -1), lz = (hash(d.id, 2) - 0.5) * h.d * 0.8;
  return { x: h.x + lx * c + lz * s, z: h.z - lx * s + lz * c };
}

export function dogGoal(d: Dog, index: number, hour: number, day: number, ctx: DogCtx, clock: number): DogGoal {
  const night = hour >= 21 || hour < 6;
  const pup = ageYears(d, day) < 0.5;
  const temper = temperOf(d);
  const lazy = d.health < 40 || d.hunger > 70 || temper === 'withdrawn';
  const post = d.guard && !pup;
  if (post) {
    const p = postSpot(ctx, index);
    if (ctx.atGate) return { x: p.x, z: p.z, stance: 'bark', face: p.face, frisky: false, follow: false };
    if (lazy && !night) return { x: p.x, z: p.z, stance: 'lie', face: p.face, frisky: false, follow: false };
    return { x: p.x, z: p.z, stance: night ? 'alert' : 'stand', face: p.face, frisky: false, follow: false };
  }
  const bond = bondOf(d).id;
  const who = bond ? ctx.person(bond) : null;
  if (!night && who) {
    // trot along behind-and-to-the-side of its person
    const a = who.rot + Math.PI + (hash(d.id, 3) < 0.5 ? 0.7 : -0.7), r = 0.11 + 0.04 * index;
    return { x: who.x + Math.sin(a) * r, z: who.z + Math.cos(a) * r, stance: lazy ? 'lie' : 'sit', face: faceTo(who.x, who.z, who.x + Math.sin(who.rot), who.z + Math.cos(who.rot)), frisky: pup || d.play < 15, follow: !lazy };
  }
  if (night) {
    const s = doorSpot(ctx, d, 0.1);
    return { x: s.x, z: s.z, stance: 'lie', face: null, frisky: false, follow: false };
  }
  // out in the yard: wander to a new lying spot every few game hours
  const around = ctx.home ? { x: ctx.home.x, z: ctx.home.z } : ctx.camp;
  const k = Math.floor(clock / 0.1) + hash(d.id, 4) * 50;
  const a = hash(d.id, 5) * 6.28 + Math.floor(k) * 1.7, r = (ctx.home ? Math.max(ctx.home.w, ctx.home.d) / 2 : 0.4) + 0.3 + 0.35 * hash(d.id + k, 6);
  return { x: around.x + Math.cos(a) * r, z: around.z + Math.sin(a) * r, stance: pup ? 'stand' : 'lie', face: null, frisky: pup, follow: false };
}
