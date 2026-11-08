/**
 * The death and the quiet after it (user: "a death scene that hits hard", then grief, tending the injured, and the raider left behind).
 * Pure and seeded; presentation only. The battle sim already decided who falls (`death` events, applied by `applyCasualties`) and who is
 * left on the drive (`leftBehind`); this lays the camera's beats and the family's grief on COPIES of the staged battles. It adds no
 * mechanic: no morale, no loyalty, no choice. (A mourning effect would be a mechanic; it is listed as a question in DECISIONS.md.)
 *
 *   the fall   the first named defender who really dies (not a Cozy "badly wounded", not one taken): the camera finds the shooter
 *              and the shot, the playback slows, the hit lands and the figure staggers and goes down; the two nearest defenders drop
 *              to a knee and one runs to them.
 *   the wake   after the fight: the family comes out of the house and gathers round the fallen, kneeling; the one closest to them
 *              (partner, parent, child) says what they would say; the injured are bandaged where they sit; two carry the fallen to the
 *              house; and, only if the sim left a raider alive on the drive, two armed defenders walk up to him.
 * Lines come from the same `LineDirector` as the fight, so nobody repeats a line.
 */
import type { Battle, BattleEvent, BattleUnit } from './battleTypes';
import type { GameState } from './state';
import type { Person } from './family';
import type { RaiderTemper } from './battle';
import type { CrewStyle } from './raiderKinds';
import { LineDirector, prisonerVariants, type Role } from './raidDialogue';

const r2 = (n: number) => Math.round(n * 100) / 100;
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const WALK = 0.8;   // world units a second at a walk (the renderer's RUN is 1.1)

export interface Victim { unit: string; personId: string; name: string; age: number; kid: boolean; elder: boolean; guard: boolean; scene: number; t: number }
export interface DramaInfo {
  victim: Victim;
  /** The scene whose tail the wake plays in, and how long (battle seconds) it runs. */
  scene: number; wake: number;
  injured: string[];
  /** The raider left alive on the drive, if the sim left one. */
  raider?: string;
  mourners: string[];
}

/** Where a unit stands at time `t`: its start, then the last move or cover before then. */
export function unitAt(b: Battle, id: string, t: number): { x: number; z: number } {
  const u = b.units.find(x => x.id === id);
  let p = { x: u?.x ?? 0, z: u?.z ?? 0 };
  for (const e of b.events) if (e.t <= t && (e.kind === 'move' || e.kind === 'cover') && e.unit === id && !e.near) p = { x: e.x, z: e.z };
  return p;
}

/** Who the dead person was to this one: 1 partner, 2 parent or child, 3 sibling, 9 anyone. */
export function kinRank(victim: Person, other: Person): { rank: number; as: 'partner' | 'family' | 'ofChild' | 'kid' | 'any' } {
  if (victim.partner === other.id || other.partner === victim.id) return { rank: 1, as: 'partner' };
  const parentOf = (a: Person, b: Person) => !!b.parents?.includes(a.id);
  if (parentOf(victim, other)) return { rank: 2, as: other.kid ? 'kid' : 'family' };
  if (parentOf(other, victim)) return { rank: 2, as: victim.kid ? 'ofChild' : 'family' };
  if (victim.parents?.length && other.parents?.some(p => victim.parents!.includes(p))) return { rank: 3, as: other.kid ? 'kid' : 'family' };
  return { rank: 9, as: other.kid ? 'kid' : 'any' };
}

/** The first named defender who really dies in the staged fights (the sim's `death` event, for a person the game also lost). */
export function findVictim(before: GameState, after: GameState, battles: readonly Battle[]): Victim | null {
  let best: Victim | null = null;
  battles.forEach((b, scene) => {
    for (const e of b.events) {
      if (e.kind !== 'death') continue;
      const u = b.units.find(x => x.id === e.unit);
      if (!u || u.side !== 'home' || !u.personId) continue;
      const i = after.people.findIndex(p => p.id === u.personId);
      if (i < 0) continue;
      const a = after.personState[i]?.needs, was = before.personState.find(x => x.id === u.personId)?.needs;
      if (!a || !was || a.died == null || was.died != null || a.taken) continue;   // (a Cozy "badly wounded" lives; a taken one is gone, not dead)
      const p = after.people[i];
      if (!best || scene < best.scene || (scene === best.scene && e.t < best.t)) best = { unit: u.id, personId: p.id, name: p.first, age: p.age, kid: p.kid || p.age < 15, elder: !!p.elder || p.age >= 70, guard: !!p.guard, scene, t: e.t };
    }
  });
  return best;
}

/** Raiders the sim left alive on the drive: hit, not dead, not run off, not surrendered. */
export function leftBehindRaiders(b: Battle): string[] {
  const hurt = new Set<string>(), gone = new Set<string>(b.surrendered?.raiders ?? []);
  for (const e of b.events) {
    if (e.kind === 'wound' && !e.stopped) hurt.add(e.unit);
    if (e.kind === 'death' || e.kind === 'flee' || e.kind === 'taken' || e.kind === 'surrender') gone.add(e.unit);   // (a man who gave up is held, not left on the drive)
    if (e.kind === 'withdraw') for (const id of e.carrying) gone.add(id);   // (a man his own side carried off is not left on the drive either)
  }
  return b.units.filter(u => u.side === 'raider' && !u.machine && hurt.has(u.id) && !gone.has(u.id)).map(u => u.id);
}

export interface DramaInput {
  before: GameState; after: GameState; battles: readonly Battle[];
  house: { x: number; z: number };
  /** Whether the report says raiders are left alive on the drive. */
  raidersWounded: number;
  temper: RaiderTemper; style?: CrewStyle;
  dir: LineDirector; seed: number;
  /** The crew won the line (breached / overrun): the fall is shown, but the family is held at gunpoint, not mourning (sim/raidEnding.ts plays that scene). */
  skipWake?: boolean;
}

/** Lay the fall and the wake on the staged battles. Returns new battles (the input is untouched) and what was staged, or null for a raid with no death. */
export function dramatize(inp: DramaInput): { battles: Battle[]; info: DramaInfo | null } {
  const victim = findVictim(inp.before, inp.after, inp.battles);
  if (!victim) return { battles: [...inp.battles], info: null };
  const out = [...inp.battles];
  const b = inp.battles[victim.scene];
  const person = (u: BattleUnit | undefined) => inp.after.people.find(p => p.id === u?.personId);
  const vPerson = inp.after.people.find(p => p.id === victim.personId)!;
  const events: BattleEvent[] = [...b.events];
  const units: BattleUnit[] = [...b.units];

  // ── the fall ──
  const deathEv = b.events.find(e => e.kind === 'death' && e.unit === victim.unit)!;
  const dT = deathEv.t;
  const shot = [...b.events].reverse().find(e => e.kind === 'shot' && e.to === victim.unit && e.hit && e.t <= dT + 0.01 && e.t >= dT - 0.4);
  const t0 = shot ? shot.t : Math.max(0, dT - 0.05);
  if (shot && shot.kind === 'shot') events.push({ t: r2(Math.max(0, t0 - 0.5)), kind: 'beat', role: 'aim', unit: shot.from, rate: 0.3, secs: 0.78 });
  events.push({ t: r2(t0 + (shot ? 0.28 : 0)), kind: 'beat', role: 'fall', unit: victim.unit, rate: 0.3, secs: shot ? 1.4 : 1.8 });
  // the two nearest defenders still on their feet
  const ups = (t: number) => b.units.filter(u => u.side === 'home' && !u.machine && !u.bystander && !u.civilian && u.id !== victim.unit
    && !b.events.some(e => e.t <= t && (e.kind === 'death' || e.kind === 'taken') && e.unit === u.id));
  const vp = unitAt(b, victim.unit, dT);
  const near = ups(dT).sort((a, c) => dist(unitAt(b, a.id, dT), vp) - dist(unitAt(b, c.id, dT), vp));
  if (near[0]) { events.push({ t: r2(dT + 1.0), kind: 'move', unit: near[0].id, x: vp.x, z: vp.z, near: { unit: victim.unit, r: 0.16, a: 0.6 } }); events.push({ t: r2(dT + 2.4), kind: 'cover', unit: near[0].id, x: vp.x, z: vp.z, near: { unit: victim.unit, r: 0.14, a: 0.6 } }); }
  if (near[1]) events.push({ t: r2(dT + 0.8), kind: 'cover', unit: near[1].id, x: unitAt(b, near[1].id, dT).x, z: unitAt(b, near[1].id, dT).z });
  const alreadyCried = b.events.some(e => e.kind === 'say' && e.who?.startsWith('h_') && e.t >= dT && e.t <= dT + 2.5 && e.text.includes(victim.name));
  if (near[0] && !alreadyCried) {
    const line = inp.dir.pick('defender', 'mate_down', { speaker: near[0].id, vars: { n: victim.name } });
    if (line) events.push({ t: r2(dT + 0.9), kind: 'say', text: line, who: near[0].id, ctx: 'mate_down' });
  }

  if (inp.skipWake) {
    const kept: BattleEvent[] = [...events].sort((a, c) => a.t - c.t);
    out[victim.scene] = { ...b, units, events: kept };
    return { battles: out, info: null };
  }
  // ── the wake ──
  const W0 = Math.max(b.duration, ...b.events.filter(e => e.kind === 'end').map(e => e.t));
  const say = (t: number, text: string | null, who: string | undefined, ctx: string) => { if (text) events.push({ t: r2(t), kind: 'say', text, ...(who ? { who } : {}), ctx }); };
  const sayLine = (t: number, role: Role, ctx: Parameters<LineDirector['pick']>[1], who: string, variants: string[] = [], n = victim.name) => say(t, inp.dir.pick(role, ctx, { speaker: who, variants, vars: { n } }), who, ctx);
  const caption = (t: number, text: string) => events.push({ t: r2(t), kind: 'say', text, ctx: 'aftermath' });

  const living = b.units.filter(u => u.side === 'home' && !u.machine && !u.bystander && u.id !== victim.unit && !b.events.some(e => (e.kind === 'death' || e.kind === 'taken') && e.unit === u.id));
  const kinOf = (u: BattleUnit) => { const p = person(u); return p ? kinRank(vPerson, p) : { rank: 9, as: 'any' as const }; };
  // the children of the place who are alive come out too (they were indoors)
  const present = (p: Person) => { const i = inp.after.people.findIndex(x => x.id === p.id); const n = inp.after.personState[i]?.needs; return !!n && n.died == null && !n.taken; };
  const onField = new Set(units.map(u => u.personId));
  const kids = inp.after.people.filter(p => (p.kid || p.age < 15) && p.id !== victim.personId && present(p) && !onField.has(p.id)).slice(0, 3);
  kids.forEach((k, i) => {
    const id = `h_${k.id}`;
    const u: BattleUnit = { id, side: 'home', personId: k.id, x: r2(inp.house.x + (i - 1) * 0.3), z: r2(inp.house.z + 0.3), post: 'open', civilian: true, bystander: true };
    units.push(u); living.push(u);
  });
  const injuredIds = [...new Set(b.events.filter(e => e.kind === 'wound' && !e.stopped && e.sev >= 12).map(e => (e as { unit: string }).unit))]
    .filter(id => living.some(u => u.id === id) && !living.find(u => u.id === id)!.civilian);
  const sorted = [...living].sort((a, c) => kinOf(a).rank - kinOf(c).rank || dist(unitAt(b, a.id, W0), vp) - dist(unitAt(b, c.id, W0), vp));
  const kin = sorted.find(u => kinOf(u).rank < 9) ?? sorted.find(u => !injuredIds.includes(u.id) && !u.civilian) ?? sorted[0];
  // a helper for the injured: the nearest healthy adult who is not the nearest of kin
  const healthy = living.filter(u => !injuredIds.includes(u.id) && !u.civilian && u !== kin);
  const helper = healthy.sort((a, c) => dist(unitAt(b, a.id, W0), vp) - dist(unitAt(b, c.id, W0), vp))[0];
  const tended = injuredIds.slice(0, 2);
  const mourners = sorted.filter(u => !tended.includes(u.id) && u !== helper).slice(0, 6);
  if (kin && !mourners.includes(kin)) mourners.unshift(kin);

  let T = W0 + 0.8;
  const ex = (sc: string) => sc;
  void ex;
  // 1. hush, then everyone comes to the fallen and goes down on a knee
  caption(T, victim.kid ? `${victim.name}, ${victim.age}, does not get up. Nobody can say a word.` : victim.elder ? `${victim.name} was the eldest on the place. The yard is very quiet.` : victim.guard ? `${victim.name} held the post to the end. The shooting is over, and nobody moves.` : `${victim.name} does not get up. The shooting is over, and the yard is very quiet.`);
  events.push({ t: r2(T), kind: 'beat', role: 'vigil', unit: victim.unit, with: mourners.map(m => m.id) });
  const order = [...mourners].sort((a, c) => dist(unitAt(b, a.id, W0), vp) - dist(unitAt(b, c.id, W0), vp));
  let arrive = T;
  order.forEach((m, i) => {
    const slot = (i / Math.max(3, order.length)) * Math.PI * 2 + 0.4;
    const from = m.civilian ? inp.house : unitAt(b, m.id, W0);
    const dur = dist(from, vp) / WALK;
    const at = T + 0.4 + i * 0.35;
    events.push({ t: r2(at), kind: 'cover', unit: m.id, x: vp.x, z: vp.z, walk: true, near: { unit: victim.unit, r: m === kin ? 0.1 : 0.2 + 0.03 * (i % 3), a: m === kin ? 1.6 : slot } });
    arrive = Math.max(arrive, at + dur);
  });
  arrive = Math.min(arrive, T + 8);
  // once they have come, the camera cuts again to the gathered people
  events.push({ t: r2(arrive + 0.3), kind: 'beat', role: 'vigil', unit: victim.unit, with: mourners.map(m => m.id) });
  // 2. the injured are seen to where they sit, bandaged
  if (helper && tended[0]) {
    const inj = tended[0];
    events.push({ t: r2(T + 0.6), kind: 'cover', unit: inj, x: unitAt(b, inj, W0).x, z: unitAt(b, inj, W0).z });
    const ta = Math.min(arrive, T + 5) + 0.4;
    events.push({ t: r2(ta), kind: 'beat', role: 'tend', unit: inj, with: [helper.id] });
    events.push({ t: r2(ta + 0.4), kind: 'aid', unit: inj, by: helper.id, what: 'pressure' });
    sayLine(ta + 1.0, 'defender', 'tend', helper.id);
    sayLine(ta + 2.8, 'defender', 'tended', inj, [], victim.name);
    caption(ta + 4, 'Somebody is already on their knees beside the wounded, pressing a cloth to the wound.');
    if (tended[1]) {
      events.push({ t: r2(ta + 4.4), kind: 'cover', unit: tended[1], x: unitAt(b, tended[1], W0).x, z: unitAt(b, tended[1], W0).z });
      events.push({ t: r2(ta + 4.8), kind: 'aid', unit: tended[1], by: helper.id, what: 'pressure' });
    }
    T = Math.max(T, ta + 5);
    // the worse hurt is helped inside, an arm round the shoulders (at a walk)
    const sev = Math.max(0, ...b.events.filter(e => e.kind === 'wound' && e.unit === inj).map(e => (e as { sev: number }).sev));
    const door = { x: r2(inp.house.x), z: r2(inp.house.z) };
    if (sev >= 45) {
      events.push({ t: r2(ta + 7), kind: 'lift', unit: inj, by: helper.id });
      events.push({ t: r2(ta + 7.2), kind: 'move', unit: helper.id, x: door.x, z: door.z, walk: true });
      events.push({ t: r2(ta + 7.2 + dist(unitAt(b, inj, W0), door) / WALK), kind: 'lower', unit: inj });
    } else {
      events.push({ t: r2(ta + 7), kind: 'move', unit: inj, x: door.x, z: door.z, walk: true });
      events.push({ t: r2(ta + 7.2), kind: 'move', unit: helper.id, x: door.x, z: door.z, walk: true });
    }
  }
  // 3. what the closest of them says, and one more voice
  const mt = Math.max(arrive + 0.5, W0 + 3);
  if (kin) {
    const as = kinOf(kin).as;
    const variants = victim.guard && as === 'any' ? ['guard'] : victim.elder && as === 'any' ? ['elder'] : [as];
    sayLine(mt, 'defender', 'grief', kin.id, variants);
    const other = order.find(m => m !== kin);
    if (other) sayLine(mt + 2.2, 'defender', 'grief', other.id, [kinOf(other).as === 'kid' ? 'kid' : 'any']);
  }
  let end = mt + 3.6;
  let carryAt = -1;
  // 4. two carry the fallen to the house, the rest follow
  const carriers = [kin, ...order.filter(m => m !== kin && !m.civilian)].filter((u): u is BattleUnit => !!u && !u.civilian).slice(0, 2);
  if (carriers.length) {
    const dx = inp.house.x - vp.x, dz = inp.house.z - vp.z, dl = Math.hypot(dx, dz) || 1;
    const stop = Math.max(0, Math.min(dl - 3.2, dl * 0.8, 3.5));
    const to = { x: r2(vp.x + dx / dl * stop), z: r2(vp.z + dz / dl * stop) };
    caption(end, `They carry ${victim.name} to the house.`);
    events.push({ t: r2(end), kind: 'beat', role: 'carry', unit: carriers[0].id, with: carriers.slice(1).map(c => c.id) });
    events.push({ t: r2(end + 0.4), kind: 'lift', unit: victim.unit, by: carriers[0].id });
    carriers.forEach((c, i) => events.push({ t: r2(end + 0.5), kind: 'move', unit: c.id, x: r2(to.x + i * 0.12), z: to.z, walk: true }));
    for (const m of order.filter(x => !carriers.includes(x))) events.push({ t: r2(end + 1.5), kind: 'move', unit: m.id, x: r2(to.x - dx / dl * 0.6), z: r2(to.z - dz / dl * 0.6), walk: true });
    const carryStart = end;
    end += 0.6 + stop / WALK;
    events.push({ t: r2(end), kind: 'lower', unit: victim.unit });
    end += 1;
    carryAt = carryStart + 1.5;
  }
  // 5. the raider left on the drive, only if the sim left one
  let raider: string | undefined;
  if (inp.raidersWounded > 0) {
    raider = leftBehindRaiders(b)[0];
    const squad = order.filter(m => !m.civilian && m !== kin && !tended.includes(m.id) && m !== helper).slice(0, 2);
    const guards = squad.length ? squad : order.filter(m => !m.civilian && !tended.includes(m.id)).slice(0, 2);
    if (raider && guards.length) {
      const rp = unitAt(b, raider, W0);
      if (!b.events.some(e => e.kind === 'lay' && e.unit === raider)) events.push({ t: r2(W0 + 0.3), kind: 'lay', unit: raider });
      const t1 = carryAt > 0 ? carryAt : end;
      caption(t1, 'One of them was left on the drive, alive. Two of the family walk out to him, rifles up.');
      events.push({ t: r2(Math.max(end, t1 + 4)), kind: 'beat', role: 'prisoner', unit: raider, with: guards.map(g => g.id) });
      let ar = t1;
      guards.forEach((g, i) => {
        const d = dist(unitAt(b, g.id, t1), rp);
        events.push({ t: r2(t1 + 0.3 + i * 0.5), kind: 'move', unit: g.id, x: rp.x, z: rp.z, walk: true, near: { unit: raider!, r: 0.6 + i * 0.12, a: 0.5 + i * 1.3 } });
        ar = Math.max(ar, t1 + 0.3 + d / WALK);
      });
      ar = Math.min(ar, t1 + 5);
      events.push({ t: r2(ar + 0.2), kind: 'cover', unit: guards[0].id, x: rp.x, z: rp.z, walk: true, near: { unit: raider, r: 0.3, a: 0.5 } });
      const gs = guards[0].id;
      sayLine(ar + 0.6, 'defender', 'prisoner', gs);
      say(ar + 2.2, inp.dir.pick('raider', 'prisoner_reply', { speaker: raider, variants: prisonerVariants(inp.temper, inp.style) }), raider, 'prisoner_reply');
      sayLine(ar + 4, 'defender', 'prisoner', guards[1]?.id ?? gs);
      caption(ar + 5, 'What happens to him is the family\'s call.');
      end = Math.max(end, ar + 6.5);
    }
  }
  // the end of the scene moves to the end of the wake
  const wake = r2(end - W0 + 1);
  const kept: BattleEvent[] = events.filter(e => e.kind !== 'end');
  kept.push({ t: r2(W0 + wake), kind: 'end', result: (b.events.find(e => e.kind === 'end') as { result: 'repelled' | 'fled' | 'breached' | 'overrun' } | undefined)?.result ?? 'repelled' });
  kept.sort((a, c) => a.t - c.t);
  out[victim.scene] = { ...b, units, events: kept, duration: r2(W0 + wake) };
  return { battles: out, info: { victim, scene: victim.scene, wake, injured: tended, ...(raider ? { raider } : {}), mourners: mourners.map(m => m.id) } };
}
