/**
 * The family and the dogs in the cutscene (raid depth, user decision 3). Pure and seeded.
 *
 * The battle sim decides who stands where and who is hit. This adds what a household does around that, as extra units and events laid
 * on a copy of the scene's battle, with real names:
 *
 *   a watch       the first adult at a post calls out what they see
 *   the dogs      a line naming the dog that will not stop barking (the dog models themselves bark when the place is raided)
 *   the children  every child on the place is pulled indoors by a parent: they start in the yard and run for the door
 *   guards        a guard on shift stands at the gate post with a name on the caption
 *   a warning shot  at the gate, a stance of "warn" fires one over their heads
 *   the wounded   a carried man or woman gets a line naming who carries whom
 *
 * Nothing here changes any outcome. A scene that is not a raid on the place (a break-in) is left alone.
 */
import type { Battle, BattleEvent, BattleUnit } from './battleTypes';
import type { Stance } from './encounters';
import { onDuty } from './guards';
import { hourOf, type GameState } from './state';

const r2 = (n: number) => Math.round(n * 100) / 100;
const KID_AGE = 15;

export function decorateDefenders(b: Battle, g: GameState, stance: Stance | null, seed: number): Battle {
  const homes = b.units.filter(u => u.side === 'home' && !u.machine);
  const raiders = b.units.filter(u => u.side === 'raider' && !u.machine);
  if (!raiders.length) return b;
  const nameOf = (u: BattleUnit | undefined): string => (u?.personId && g.people.find(p => p.id === u.personId)?.first) || 'Someone';
  const units: BattleUnit[] = [...b.units];
  const ev: BattleEvent[] = [...b.events];
  const say = (t: number, text: string, who?: string) => ev.push({ t: r2(t), kind: 'say', text, ...(who ? { who } : {}) });
  const cx = homes.length ? homes.reduce((a, u) => a + u.x, 0) / homes.length : 0, cz = homes.length ? homes.reduce((a, u) => a + u.z, 0) / homes.length : 0;
  const rx = raiders.reduce((a, u) => a + u.x, 0) / raiders.length - cx, rz = raiders.reduce((a, u) => a + u.z, 0) / raiders.length - cz, rl = Math.hypot(rx, rz) || 1;
  const ax = rx / rl, az = rz / rl, lx = -az, lz = ax;
  const at = (d: number, lat: number) => ({ x: r2(cx + ax * d + lx * lat), z: r2(cz + az * d + lz * lat) });
  const present = (i: number) => g.personState[i]?.needs.died == null && !g.personState[i]?.needs.taken;
  const alive = g.people.filter((_, i) => present(i));
  const used = new Set(units.map(u => u.personId).filter(Boolean));

  // the watch
  const watch = homes.find(u => u.post === 'tower' || u.post === 'building' || u.post === 'wall') ?? homes[0];
  if (watch) say(1.5, ['Somebody on the drive. Wake everyone.', 'Headlights at the mailbox.', 'Movement at the gate, more than one.'][(seed >>> 0) % 3], watch.id);
  // the dogs, by name
  const dogs = (g.dogs ?? []).filter(d => d.health > 20);
  if (dogs.length) say(0.6, dogs.length === 1 ? `${dogs[0].name} will not stop barking at the gate.` : `${dogs[0].name} and ${dogs[1].name} are at the fence, barking at the dark.`);
  // the children are pulled indoors
  const kids = alive.filter(p => p.kid || p.age < KID_AGE).filter(p => !used.has(p.id)).slice(0, 4);
  const parent = homes.find(u => u.personId && g.people.find(p => p.id === u.personId && !p.kid));
  kids.forEach((k, i) => {
    const id = `h_${k.id}`;
    const p = at(-1.2 - i * 0.5, (i - 1.5) * 0.7);
    units.push({ id, side: 'home', personId: k.id, x: p.x, z: p.z, post: 'open', civilian: true });
    const door = at(-2.4, (i - 1.5) * 0.2);
    ev.push({ t: r2(2.5 + i * 0.7), kind: 'move', unit: id, x: door.x, z: door.z });
  });
  if (kids.length) say(3, `${kids.length > 1 ? 'Kids, inside, now!' : `${kids[0].first}, inside. Now!`}`, parent?.id);
  // guards on shift at the gate post
  let gi = 0;
  for (const guard of onDuty(g).slice(0, 2)) {
    if (hourOf(g.clock.t) < 0) break;
    const id = `h_${guard.person.id}`;
    if (units.some(u => u.id === id)) continue;
    const p = at(4.2, 1.4 + gi * 1.2);
    units.push({ id, side: 'home', personId: guard.person.id, x: r2(p.x - ax * 3), z: r2(p.z - az * 3), post: 'open' });
    ev.push({ t: 1 + gi, kind: 'move', unit: id, x: p.x, z: p.z });
    if (gi === 0) say(5, `${guard.name} is at the gate post, rifle ready.`);
    gi++;
  }
  // a warning shot over their heads
  if (stance === 'warn' && watch && raiders[0]) {
    ev.push({ t: 14, kind: 'shot', from: watch.id, to: raiders[0].id, hit: false });
    say(14.5, 'That one was over your heads. Turn around.', watch.id);
  }
  // wounded carried in: name both
  for (const e of b.events) if (e.kind === 'carry' && e.by) {
    const w = b.units.find(u => u.id === e.unit), c = b.units.find(u => u.id === e.by);
    say(e.t + 0.3, `${nameOf(c)} is carrying ${nameOf(w)} inside.`);
  }
  ev.sort((a, c) => a.t - c.t);
  void nameOf;
  return { ...b, units, events: ev };
}
