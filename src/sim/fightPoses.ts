/**
 * Two things a real gunfight shows that the battle sim only implies (pure, seeded; presentation only, on copies of the staged battles).
 *
 *   dragging the wounded   a defender hit hard (an `out` wound) and still alive is not left where he fell: the nearest mate still on his feet crosses
 *                          to him, takes him up and carries him back toward the house, out of the line of fire, and puts him down behind it. The sim
 *                          already carries the wounded in when the line falls back (`carry`); this shows it the moment the man is hit, not only
 *                          in the quiet after. At most two such carries a fight, and a mate with nobody else to cover him does not leave his post.
 *   the family does not change who hits whom: the mate's own shots still come from where he stood.
 */
import type { Battle, BattleEvent } from './battleTypes';

const r2 = (n: number) => Math.round(n * 100) / 100;
const WALK = 0.8;
/** A wound this bad puts a man out of the fight (the sim's own line: hp under 45 for the family). */
export const DRAG_SEV = 50;

const place = (b: Battle, id: string, t: number): { x: number; z: number } => {
  const u = b.units.find(x => x.id === id);
  let p = { x: u?.x ?? 0, z: u?.z ?? 0 };
  for (const e of b.events) if (e.t <= t && (e.kind === 'move' || e.kind === 'cover') && e.unit === id && !e.near) p = { x: e.x, z: e.z };
  return p;
};

export function dragTheWounded(b: Battle, house: { x: number; z: number }): Battle {
  const events: BattleEvent[] = [...b.events];
  const homes = b.units.filter(u => u.side === 'home' && !u.machine && !u.bystander && !u.civilian && u.personId);
  const gone = (id: string, t: number) => b.events.some(e => e.t <= t && (e.kind === 'death' || e.kind === 'taken') && e.unit === id);
  const hit = b.events.filter(e => e.kind === 'wound' && !e.stopped && e.sev >= DRAG_SEV && homes.some(h => h.id === e.unit));
  const busy = new Set<string>();
  let n = 0, lastT = -99;
  for (const w of hit) {
    if (w.kind !== 'wound' || n >= 2 || w.t - lastT < 12) continue;
    // a man who dies of it within a few seconds is not dragged: the fall is the picture
    if (b.events.some(e => e.kind === 'death' && e.unit === w.unit && e.t < w.t + 10)) continue;
    if (b.events.some(e => e.kind === 'carry' && e.unit === w.unit)) continue;
    const at = place(b, w.unit, w.t);
    const mate = homes.filter(h => h.id !== w.unit && !busy.has(h.id) && !gone(h.id, w.t) && !b.events.some(e => e.t <= w.t && e.kind === 'wound' && e.unit === h.id && e.kind === 'wound' && e.sev >= DRAG_SEV))
      .map(h => ({ h, d: Math.hypot(place(b, h.id, w.t).x - at.x, place(b, h.id, w.t).z - at.z) }))
      .filter(x => x.d <= 3).sort((a, c) => a.d - c.d)[0];
    if (!mate || homes.filter(h => !gone(h.id, w.t)).length < 3) continue;
    busy.add(mate.h.id); n++; lastT = w.t;
    const dx = house.x - at.x, dz = house.z - at.z, dl = Math.hypot(dx, dz) || 1, stop = Math.max(0, Math.min(dl - 3, 3.5));
    const to = { x: r2(at.x + dx / dl * stop), z: r2(at.z + dz / dl * stop) };
    const t0 = w.t + 1.4;
    events.push({ t: r2(t0), kind: 'move', unit: mate.h.id, x: at.x, z: at.z, walk: true, near: { unit: w.unit, r: 0.12, a: 0.8 } });
    events.push({ t: r2(t0 + mate.d / WALK + 0.5), kind: 'lift', unit: w.unit, by: mate.h.id });
    events.push({ t: r2(t0 + mate.d / WALK + 0.6), kind: 'move', unit: mate.h.id, x: to.x, z: to.z, walk: true });
    const done = t0 + mate.d / WALK + 0.6 + stop / WALK;
    events.push({ t: r2(done), kind: 'lower', unit: w.unit });
    // back to the post once the man is down
    events.push({ t: r2(done + 0.4), kind: 'move', unit: mate.h.id, x: r2(at.x), z: r2(at.z) });
  }
  if (!n) return b;
  events.sort((a, c) => a.t - c.t);
  return { ...b, events };
}
