/**
 * How a fight ends on screen (user: "every cutscene and aftermath must make logical sense for the situation, the escalation and the hostility").
 * Pure and seeded; presentation only, on copies of the staged battles. The sim already decided the outcome (`end` result, who is down, who ran,
 * `leftBehind`); this makes the last frames agree with it:
 *
 *   the family held   (breached / overrun: the crew won the line) no one stands idle in a cluster: the crew spreads to the house and the stores,
 *                     the defenders still up put their hands up, both sides talk like it, and the crew takes what it can carry and goes.
 *   the crew beaten   (repelled / fled) a raider the sim left out of the fight (hit, not dead, not run off) is never drawn standing: he goes down where
 *                     he was hit (lay), or, for a crew that is not ruthless and a hurt that is light, drops the gun and puts his hands up (surrender,
 *                     two at most, spread apart). A savage crew never surrenders; a desperate one often does; a hard one rarely.
 *   the rest          raiders who ran are off the field (the sim's `flee`); the dead stay down.
 * The sim has no surrender state of its own: a "left behind" raider is wounded and on the ground; a hands-up man is how the same outcome looks.
 */
import type { Battle, BattleEvent } from './battleTypes';
import type { RaiderTemper } from './battle';
import type { CrewStyle } from './raiderKinds';
import { LineDirector } from './raidDialogue';
import { mulberry32 } from './rng';

const r2 = (n: number) => Math.round(n * 100) / 100;
export type Ending = 'repelled' | 'fled' | 'breached' | 'overrun';

export const endingOf = (b: Battle): Ending | null => { const e = b.events.find(x => x.kind === 'end'); return e && e.kind === 'end' ? e.result : null; };

/** Raiders still on the field at the end and not in the fight: hit, not dead, not run off, not taken. With when they went out (their last wound) and how hard. */
export function downRaiders(b: Battle): Array<{ id: string; t: number; sev: number }> {
  const hurt = new Map<string, { t: number; sev: number }>(), gone = new Set<string>();
  for (const e of b.events) {
    if (e.kind === 'wound' && !e.stopped) { const h = hurt.get(e.unit); hurt.set(e.unit, { t: e.t, sev: (h?.sev ?? 0) + e.sev }); }
    if (e.kind === 'death' || e.kind === 'flee' || e.kind === 'taken') gone.add(e.unit);
  }
  return b.units.filter(u => u.side === 'raider' && !u.machine && hurt.has(u.id) && !gone.has(u.id)).map(u => ({ id: u.id, ...hurt.get(u.id)! }));
}

/** Raiders standing and fighting when the last shot is fired (not down, dead or run off): what the crew has left. */
export function standingRaiders(b: Battle): string[] {
  const down = new Set(downRaiders(b).map(d => d.id)), gone = new Set(b.events.filter(e => e.kind === 'death' || e.kind === 'flee' || e.kind === 'taken').map(e => (e as { unit: string }).unit));
  return b.units.filter(u => u.side === 'raider' && !u.machine && !down.has(u.id) && !gone.has(u.id)).map(u => u.id);
}

/** The chance a hurt raider drops the gun and puts his hands up instead of lying where he fell, by how ruthless the crew is and how bad he is hurt. */
export function surrenderChance(temper: RaiderTemper, style: CrewStyle | undefined, sev: number): number {
  const base = temper === 'savage' ? 0 : temper === 'hard' ? 0.25 : 0.6;
  const k = style === 'families' ? 1.4 : style === 'crew' ? 0.7 : 1;
  return Math.min(0.9, base * k * (sev < 55 ? 1 : 0.35));
}

export interface EndInput { battle: Battle; temper: RaiderTemper; style?: CrewStyle; dir: LineDirector; seed: number; house: { x: number; z: number } }

/** Poses and words for the end of one fight. Returns the new battle and how many battle seconds to add to the scene's tail for it (0 for none). */
export function endPoses(inp: EndInput): { battle: Battle; wake: number; ending: Ending | null } {
  const b = inp.battle, ending = endingOf(b);
  if (!ending) return { battle: b, wake: 0, ending };
  const r = mulberry32(inp.seed * 5821 + 7);
  const events: BattleEvent[] = [...b.events];
  const W0 = Math.max(b.duration, ...b.events.filter(e => e.kind === 'end').map(e => e.t));
  const say = (t: number, text: string | null, who: string | undefined, ctx: string) => { if (text) events.push({ t: r2(t), kind: 'say', text, ...(who ? { who } : {}), ctx }); };
  const caption = (t: number, text: string) => events.push({ t: r2(t), kind: 'say', text, ctx: 'aftermath' });
  const homes = b.units.filter(u => u.side === 'home' && !u.machine && !u.bystander && !u.civilian);
  const dead = new Set(b.events.filter(e => e.kind === 'death' || e.kind === 'taken').map(e => (e as { unit: string }).unit));
  const standingHome = homes.filter(u => !dead.has(u.id) && !b.events.some(e => e.kind === 'move' && e.unit === u.id && e.x === inp.house.x && e.z === inp.house.z));
  const crew = standingRaiders(b);
  let wake = 0;

  if (ending === 'repelled' || ending === 'fled') {
    // the crew that was beaten: no one left standing in a cluster; the hurt are down or have given up
    const down = downRaiders(b);
    let hands = 0;
    const handsAt: Array<{ x: number; z: number }> = [];
    for (const d of down) {
      const at = (() => { let p = { x: b.units.find(u => u.id === d.id)!.x, z: b.units.find(u => u.id === d.id)!.z }; for (const e of b.events) if (e.t <= d.t + 1 && (e.kind === 'move' || e.kind === 'cover') && e.unit === d.id && !e.near) p = { x: e.x, z: e.z }; return p; })();
      const apart = handsAt.every(h => Math.hypot(h.x - at.x, h.z - at.z) > 0.6);
      if (hands < 2 && apart && r() < surrenderChance(inp.temper, inp.style, d.sev)) {
        hands++; handsAt.push(at);
        events.push({ t: r2(Math.min(W0 - 0.5, d.t + 1.4)), kind: 'surrender', unit: d.id });
      } else if (!b.events.some(e => e.kind === 'lay' && e.unit === d.id)) {
        events.push({ t: r2(Math.min(W0 - 0.3, d.t + 0.9)), kind: 'lay', unit: d.id });
      }
    }
    if (down.length) {
      const first = down.find(d => events.some(e => e.kind === 'surrender' && e.unit === d.id));
      const word = hands ? (hands === 1 ? 'One of them drops his rifle and puts his hands up.' : 'Two of them drop their rifles and put their hands up.') : down.length === 1 ? 'One of them is down and not getting up.' : 'The ones who were hit are down where they fell.';
      caption(Math.max(0, W0 - 2.2), `${word} Nobody on the wall relaxes.`);
      if (first) {
        const cover = homes.filter(u => !dead.has(u.id)).sort((a, c) => Math.hypot(a.x - 0, a.z - 0) - Math.hypot(c.x - 0, c.z - 0))[0];
        if (cover) say(Math.max(0, W0 - 1.6), inp.dir.pick('defender', 'prisoner', { speaker: cover.id }), cover.id, 'prisoner');
        say(Math.max(0, W0 - 0.8), inp.dir.pick('raider', 'prisoner_reply', { speaker: first.id, variants: [inp.temper, ...(inp.style === 'families' ? ['families'] : [])] }), first.id, 'prisoner_reply');
      }
    }
  } else {
    // the crew won the line: they spread through the place, the family stands with its hands up, then the crew takes what it can carry and goes
    const hx = inp.house.x, hz = inp.house.z;
    const away = (() => { const c = b.units.filter(u => u.side === 'raider' && !u.machine); const cx = c.reduce((a, u) => a + u.x, 0) / Math.max(1, c.length), cz = c.reduce((a, u) => a + u.z, 0) / Math.max(1, c.length), l = Math.hypot(cx - hx, cz - hz) || 1; return { x: (cx - hx) / l, z: (cz - hz) / l }; })();
    crew.forEach((id, i) => {
      const lat = (i - (crew.length - 1) / 2) * 0.5, a = i % 2 ? 1 : -1;
      events.push({ t: r2(W0 + 0.4 + i * 0.3), kind: 'move', unit: id, x: r2(hx + away.x * (1.6 + (i % 3) * 0.7) - away.z * lat), z: r2(hz + away.z * (1.6 + (i % 3) * 0.7) + away.x * lat), walk: true });
      void a;
    });
    standingHome.forEach((u, i) => events.push({ t: r2(W0 + 0.5 + i * 0.4), kind: 'surrender', unit: u.id }));
    caption(W0 + 0.8, standingHome.length ? 'They are inside the wire. The ones still on their feet put their hands up while the crew takes what it came for.' : 'They are inside the wire, and there is no one left on the line to stop them.');
    const speaker = crew[0], held = standingHome[0];
    if (speaker) say(W0 + 2.6, inp.dir.pick('raider', 'looting', { speaker }), speaker, 'looting');
    if (held) say(W0 + 4.6, inp.dir.pick('defender', 'held', { speaker: held.id }), held.id, 'held');
    if (crew[1]) say(W0 + 7, inp.dir.pick('raider', 'looting', { speaker: crew[1] }), crew[1], 'looting');
    // then they go, loaded, the way they came
    crew.forEach((id, i) => events.push({ t: r2(W0 + 9.5 + i * 0.35), kind: 'move', unit: id, x: r2(hx + away.x * 40), z: r2(hz + away.z * 40) }));
    caption(W0 + 9.5, inp.temper === 'savage' ? 'They leave the way they came, and nobody follows them.' : 'They load what they can carry and go. The family is left standing in the yard.');
    wake = r2(13 + crew.length * 0.35);
  }
  events.sort((a, c) => a.t - c.t);
  if (wake > 0) {
    const kept: BattleEvent[] = events.filter(e => e.kind !== 'end');
    kept.push({ t: r2(W0 + wake), kind: 'end', result: ending });
    kept.sort((a, c) => a.t - c.t);
    return { battle: { ...b, events: kept, duration: r2(W0 + wake) }, wake, ending };
  }
  return { battle: { ...b, events }, wake, ending };
}
