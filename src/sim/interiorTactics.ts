/**
 * The fight inside the house, room by room, with real tactics (cinematic; sim/breach.ts has the legend of what is real). Pure and seeded.
 *
 * REAL: who is wounded or killed and when (the sim's events, kept at their times), who is taken, how the fight ends. PLANNED here: where everyone
 * is and what they do. The rooms and doorways come from the house's own colliders (sim/houseRooms.ts), and the movement goes through the doors:
 *
 *   crew      a disciplined crew (crew / scouts) stacks on the wall beside the door, kicks it (it holds once), pies the corners as it steps in, clears
 *             the room in order, then stacks at the next doorway. A gang, a crowd or refugees (rush) hit the door together and pour in: the
 *             doorway is a funnel, the men the sim wounded or killed in that stretch are the first through it.
 *   family    fighters hold the first room from behind furniture and corners, not in the line of the door; when the crew is in, they fall back to the
 *             next room in stages (wounded first, carried by a buddy, while the committed fire to cover them), ending in a last stand in the deepest room.
 *   others    kids and the unarmed go to the back at once: into a closet or a corner, under a bed; some freeze, some are shielded by another.
 *             Hostile crews kick and search; merciful crews order them out.
 */
import type { BattleEvent, BattleUnit, MercyData } from './battleTypes';
import { analyzeHouse as _unused, clearOrder, doorBetween, holdSpots, hideSpots, nearestInRoom, pieSpots, stackSpot, type Doorway, type HouseRooms, type Pt } from './houseRooms';
import type { CrewStyle } from './raiderKinds';
import type { Ctx } from './raidDialogue';
import { decideFates, type Found } from './mercy';

void _unused;
const r2 = (n: number) => Math.round(n * 100) / 100;
const RUN = 1.1;

export interface InteriorArgs {
  H: HouseRooms;
  /** The outer door: the free cell just outside it and the cell just inside. */
  out: Pt; door: Pt;
  tI: number; D: number;
  adults: readonly BattleUnit[]; kids: readonly BattleUnit[]; crew: readonly BattleUnit[];
  pos: ReadonlyMap<string, Pt>;
  /** Sim wounds on the family (first time) and on the crew; the sim's kills with their times (events kept where they are). */
  hurtT: ReadonlyMap<string, number>; wounds: ReadonlyArray<Extract<BattleEvent, { kind: 'wound' }>>; deaths: ReadonlyMap<string, number>; takenIds: ReadonlySet<string>;
  style?: CrewStyle; mercy: MercyData; /** The battle carries its own mercy data (a fixture, or the sim later): fates not in the sim's events follow it. */ explicitMercy?: boolean; /** Units the sim already led off (its own `hostage` events): the scene adds none. */ realHostage?: ReadonlySet<string>; seed: number; rng: () => number;
  say: (t: number, role: 'raider' | 'defender', c: Ctx, who?: BattleUnit, vars?: Record<string, string>) => void;
  nameOf: (id: string) => string | undefined;
  ev: BattleEvent[];
}
export interface InteriorOut {
  /** Units whose sim moves after the break are replaced. */
  strip: Set<string>;
  /** When the last room is cleared and the crew is ready for the ending beats. */
  doneAt: number;
  /** Units led off as captives (they leave with the crew). */
  captives: string[];
  /** The crew inside the house at the end (for the ending beats). */
  insideCrew: BattleUnit[];
  rooms: number;
}

/** A free spot a hand's breadth from a point (to stand beside someone). */
function freeBeside(H: HouseRooms, p: Pt): Pt {
  for (const d of [0.1, 0.13, 0.16]) for (let k = 0; k < 8; k++) { const q = { x: p.x + Math.cos(k * 0.785) * d, z: p.z + Math.sin(k * 0.785) * d }; if (H.free(q.x, q.z)) return q; }
  return p;
}
const near = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.z - b.z);

export function planInterior(a: InteriorArgs): InteriorOut | null {
  const { H, ev, tI, D, rng: r } = a;
  const disc = a.style === 'crew' || a.style === 'scouts';
  const say = a.say;
  const strip = new Set<string>();
  const fighters = [...a.adults], civ = [...a.kids];
  if (!a.crew.length || (!fighters.length && !civ.length)) return null;
  // the entry room: the room nearest the cell just inside the door
  let entry = -1, ed = Infinity;
  for (const rm of H.rooms) { const d = near(nearestInRoom(H, rm.id, a.door), a.door); if (d < ed) { ed = d; entry = rm.id; } }
  if (entry < 0) return null;
  const order = clearOrder(H, entry);
  const dir = { x: a.door.x - a.out.x, z: a.door.z - a.out.z }, dl = Math.hypot(dir.x, dir.z) || 1;
  const pass = { x: dir.x / dl, z: dir.z / dl };   // into the house
  const mid = { x: (a.door.x + a.out.x) / 2, z: (a.door.z + a.out.z) / 2 };
  const outer: Doorway = { id: -1, at: mid, a: -1, b: entry, pass, width: 0.2 };
  const perp = { x: -pass.z, z: pass.x };
  // rooms to clear, each with the doorway it is entered by (from an earlier room in the order)
  const stages: Array<{ room: number; door: Doorway; from: number }> = [{ room: entry, door: outer, from: -1 }];
  for (const rm of order.slice(1)) {
    if (stages.length >= 4) break;
    const from = stages.map(s => s.room).find(ro => doorBetween(H, ro, rm));
    if (from === undefined) continue;
    stages.push({ room: rm, door: doorBetween(H, from, rm)!, from });
  }
  const m = stages.length;

  // ── 1. the family goes in, the door is shut and barred ───────────────────────────────────────
  const lead = fighters[0] ?? civ[0];
  const doorN = { x: -pass.x, z: -pass.z };   // the way out of the house through the door
  const doorAt = { x: r2(mid.x), z: r2(mid.z) };
  const doorEv = (t: number, action: 'open' | 'close' | 'kick' | 'shoot' | 'charge', ok: boolean, by?: BattleUnit) => ev.push({ t: r2(t), kind: 'house_door', x: doorAt.x, z: doorAt.z, nx: r2(doorN.x), nz: r2(doorN.z), action, ok, ...(by ? { by: by.id } : {}) });
  doorEv(tI - 3.5, 'open', true, lead);
  const holdN = Math.max(1, fighters.length);
  const dEntryHold = holdSpots(H, entry, outer, holdN);
  const inHouse: Array<{ u: BattleUnit; arrive: number }> = [];
  const deepRooms = [...stages.map(s => s.room)].reverse();
  const hiders: Array<{ u: BattleUnit; room: number; at: Pt; how: 'closet' | 'corner' | 'under_bed'; t0: number }> = [];
  civ.forEach((u, i) => {
    const room = deepRooms[i % Math.max(1, deepRooms.length)] ?? entry;
    const spots = hideSpots(H, room, civ.length + 2);
    let at = spots[Math.floor(i / Math.max(1, deepRooms.length)) % Math.max(1, spots.length)] ?? nearestInRoom(H, room, a.door);
    // (a shielded child's friend goes to ground right beside them)
    const shielding = i % 3 === 1 && !!hiders[i - 1];
    if (shielding) at = freeBeside(H, hiders[i - 1].at);
    let walls = 0; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!H.free(at.x + dx * 0.08, at.z + dz * 0.08)) walls++;
    const how = shielding ? 'corner' : walls >= 3 ? 'closet' : i % 2 ? 'under_bed' : 'corner';
    const t0 = tI - 3.6 + i * 0.35, p0 = a.pos.get(u.id) ?? u;
    const arrive = t0 + (near(p0, a.out) + near(a.door, at) + 0.3) / (RUN * (a.hurtT.has(u.id) ? 0.55 : 1)) + 0.4;
    strip.add(u.id);
    // (the router walks the path through the door; the door stands open until the last one is in)
    ev.push({ t: r2(t0), kind: 'hide', unit: u.id, x: r2(at.x), z: r2(at.z), how });
    hiders.push({ u, room, at, how, t0: arrive });
    inHouse.push({ u, arrive });
  });
  fighters.forEach((u, i) => {
    const slot = dEntryHold[i % Math.max(1, dEntryHold.length)] ?? nearestInRoom(H, entry, a.door);
    const t0 = tI - 3.0 + i * 0.4, p0 = a.pos.get(u.id) ?? u;
    strip.add(u.id);
    ev.push({ t: r2(t0), kind: 'cover', unit: u.id, x: r2(slot.x), z: r2(slot.z) });   // (they hold from a knee behind the furniture: nobody stands in the open under fire)
    inHouse.push({ u, arrive: t0 + (near(p0, a.out) + near(a.door, slot) + 0.3) / (RUN * (a.hurtT.has(u.id) ? 0.55 : 1)) + 0.4 });
  });
  const tShut = Math.max(tI - 1.2, ...inHouse.map(x => x.arrive)) + 0.5;
  if (lead) say(tI - 3.2, 'defender', 'breach', lead);
  const last = inHouse.sort((p, q) => q.arrive - p.arrive)[0]?.u;
  doorEv(tShut, 'close', true, last);
  // the quiet ones: some freeze, some are shielded by a friend
  hiders.forEach((h, i) => {
    if (i % 3 === 2) { ev.push({ t: r2(h.t0 + 0.2), kind: 'freeze', unit: h.u.id }); say(h.t0 + 0.6, 'defender', 'freeze', h.u); }
    else if (i % 3 === 1 && hiders[i - 1]) { ev.push({ t: r2(h.t0 + 0.4), kind: 'shield', unit: h.u.id, over: hiders[i - 1].u.id }); say(h.t0 + 0.8, 'defender', 'shield', h.u, { n: a.nameOf(hiders[i - 1].u.id) ?? 'sweetheart' }); }
    else if (i === 0) say(h.t0 + 0.8, 'defender', 'hide', h.u);
  });

  // ── 2. the crew at the door ────────────────────────────────────────────────────────────────
  const hurtRaider = new Map<string, number>();
  for (const w of a.wounds) if (!w.stopped && a.crew.some(c => c.id === w.unit) && w.t >= tI && !hurtRaider.has(w.unit)) hurtRaider.set(w.unit, w.t);
  for (const [id, t] of a.deaths) if (a.crew.some(c => c.id === id) && t >= tI && !hurtRaider.has(id)) hurtRaider.set(id, t);
  const crew = [...a.crew].sort((p, q) => {
    const hp = hurtRaider.has(p.id) ? 1 : 0, hq = hurtRaider.has(q.id) ? 1 : 0;
    return disc ? hp - hq : hq - hp;   // a disciplined crew keeps its hurt at the back; a rush sends them first
  });
  for (const u of crew) strip.add(u.id);
  const breacher = crew[0];
  const wallSpot = (side: -1 | 1, back: number): Pt => {
    for (const reach of [0.15, 0.12, 0.2]) {
      const p = { x: a.out.x + perp.x * side * reach - pass.x * back, z: a.out.z + perp.z * side * reach - pass.z * back };
      if (H.free(p.x, p.z)) return p;
    }
    return a.out;
  };
  const tS = tShut + 0.4;
  const s = tS + (disc ? 4.2 : 1.5);   // when the door gives
  if (disc) {
    crew.slice(0, 6).forEach((u, i) => ev.push({ t: r2(tS + i * 0.25), kind: 'move', unit: u.id, x: r2(wallSpot(i % 2 ? 1 : -1, Math.floor(i / 2) * 0.12).x), z: r2(wallSpot(i % 2 ? 1 : -1, Math.floor(i / 2) * 0.12).z) }));
    say(tS + 1.4, 'raider', 'stack_door', crew[1] ?? breacher);
    doorEv(s - 1.8, 'kick', false, breacher);
    say(s - 1.7, 'raider', 'kick_door', breacher);
    doorEv(s - 0.2, 'kick', true, breacher);
  } else {
    crew.slice(0, 6).forEach((u, i) => ev.push({ t: r2(tS + i * 0.15), kind: 'move', unit: u.id, x: r2(wallSpot(i % 2 ? 1 : -1, Math.floor(i / 2) * 0.1).x), z: r2(wallSpot(i % 2 ? 1 : -1, Math.floor(i / 2) * 0.1).z) }));
    doorEv(s - 0.4, 'kick', true, breacher);
    say(s - 1.2, 'raider', 'kick_door', breacher);
  }
  // the family waits behind the door
  if (fighters[1]) say(tS + 0.9, 'defender', 'pie_corner', fighters[1]);
  const stageLen = Math.max(disc ? 6.5 : 3.6, Math.min(disc ? 15 : 8.5, (tI + D - 14 - s) / m));
  const insideCrew = crew.slice(0, 6);

  // ── 3. room by room ──────────────────────────────────────────────────────────────────────────
  const wounded = fighters.filter(u => a.hurtT.has(u.id) && !a.deaths.has(u.id));
  let holders = [...fighters];   // who is in the room being held
  let hold = dEntryHold;
  const cell = (room: number, k: number, n: number): Pt => {
    const cells = H.rooms[room].cells; if (!cells.length) return H.rooms[room].c;
    return H.at(cells[Math.floor((k + 0.5) / n * cells.length) % cells.length]);
  };
  const shoot = (t0: number, t1: number, step: number, from: readonly BattleUnit[], to: readonly BattleUnit[], reply: boolean) => {
    if (!from.length || !to.length) return;
    for (let t = t0, k = 0; t < t1; t += step * (0.8 + r() * 0.5), k++) {
      const f = from[k % from.length], tg = to[Math.floor(r() * to.length)];
      ev.push({ t: r2(t), kind: 'shot', from: f.id, to: tg.id, hit: false, ...(r() < 0.15 ? { auto: true } : {}) });
      if (reply && r() < 0.45) ev.push({ t: r2(t + 0.3 + r() * 0.3), kind: 'shot', from: tg.id, to: f.id, hit: false });
    }
  };
  let sk = s, prevStageEnd = s;
  for (let k = 0; k < m; k++) {
    const st = stages[k], room = st.room, dk = st.door;
    const rc = H.rooms[room].c;
    if (k > 0) {
      // stack at this doorway, on the side of the room just cleared
      const fromRoom = st.from;
      sk = prevStageEnd + 0.4;
      if (disc) {
        const A = stackSpot(H, dk, fromRoom, -1), B = stackSpot(H, dk, fromRoom, 1);
        insideCrew.forEach((u, i) => ev.push({ t: r2(sk - 1.2 + i * 0.2), kind: 'move', unit: u.id, x: r2((i % 2 ? B : A).x), z: r2((i % 2 ? B : A).z) }));
        say(sk - 0.8, 'raider', 'stack_door', insideCrew[1] ?? insideCrew[0]);
      }
    }
    // entering: a disciplined crew pies the corners from the doorway then goes in; a rush pours through
    const [pA, pB] = pieSpots(H, dk, room);
    if (disc) {
      const u0 = insideCrew[0], u1 = insideCrew[1] ?? insideCrew[0];
      ev.push({ t: r2(sk + 0.4), kind: 'cover', unit: u0.id, x: r2(pA.x), z: r2(pA.z) });
      if (u1 !== u0) ev.push({ t: r2(sk + 0.9), kind: 'cover', unit: u1.id, x: r2(pB.x), z: r2(pB.z) });
      say(sk + 1.0, 'raider', 'pie_corner', u0);
      insideCrew.slice(2).forEach((u, i) => ev.push({ t: r2(sk + 2.4 + i * 0.4), kind: 'move', unit: u.id, x: r2(cell(room, i + 2, insideCrew.length).x), z: r2(cell(room, i + 2, insideCrew.length).z) }));
      ev.push({ t: r2(sk + 2.2), kind: 'move', unit: u0.id, x: r2(cell(room, 0, insideCrew.length).x), z: r2(cell(room, 0, insideCrew.length).z) });
      if (u1 !== u0) ev.push({ t: r2(sk + 2.6), kind: 'move', unit: u1.id, x: r2(cell(room, 1, insideCrew.length).x), z: r2(cell(room, 1, insideCrew.length).z) });
      shoot(sk + 0.6, sk + 3.2, 0.7, holders, insideCrew.slice(0, 2), true);
    } else {
      // (the men the sim hurt in this stretch go through the doorway first, so the funnel claims them where the sim says)
      crew.slice(0, 6).forEach((u, i) => {
        const hit = hurtRaider.get(u.id);
        if (hit !== undefined && hit >= sk - 1 && hit <= sk + stageLen) ev.push({ t: r2(Math.max(sk, hit - 1.1)), kind: 'move', unit: u.id, x: r2(dk.at.x + dk.pass.x * (Math.sign((rc.x - dk.at.x) * dk.pass.x + (rc.z - dk.at.z) * dk.pass.z) || 1) * 0.06), z: r2(dk.at.z + dk.pass.z * (Math.sign((rc.x - dk.at.x) * dk.pass.x + (rc.z - dk.at.z) * dk.pass.z) || 1) * 0.06) });
        else ev.push({ t: r2(sk + 0.2 + i * 0.4), kind: 'cover', unit: u.id, x: r2(cell(room, i, 6).x), z: r2(cell(room, i, 6).z) });   // (one at a time through the door, then down behind whatever is there)
      });
      say(sk + 0.2, 'raider', 'funnel', insideCrew[0]);
      say(sk + 0.8, 'defender', 'funnel', holders[0]);
      shoot(sk + 0.2, sk + 3.0, 0.4, holders, crew.slice(0, 6), true);
    }
    const clearAt = sk + (disc ? 3.6 : 2.4);
    say(clearAt, 'raider', 'room_clear', insideCrew[0]);
    // the family falls back to the next room: wounded first, carried, with the committed covering
    if (k + 1 < m) {
      const nxt = stages[k + 1];
      const fb = sk + (disc ? 3.0 : 1.8);
      const nextHold = holdSpots(H, nxt.room, nxt.door, Math.max(1, holders.length));
      const hurtHere = holders.filter(u => wounded.includes(u));
      const fit = holders.filter(u => !hurtHere.includes(u));
      const carriers = fit.slice(0, hurtHere.length);
      const cover = fit.filter(u => !carriers.includes(u)).slice(0, Math.max(1, Math.ceil(fit.length / 2)));
      if (fit[0]) say(fb - 0.4, 'defender', 'fallback_stage', fit[0]);
      hurtHere.forEach((w, i) => {
        const c = carriers[i]; if (!c) return;
        const wp = a.pos.get(w.id) ?? w, to = nextHold[i % nextHold.length] ?? nxt.door.at;
        const wnd = a.wounds.find(x => x.unit === w.id);
        ev.push({ t: r2(fb - 0.6), kind: 'move', unit: c.id, x: r2(dk.at.x), z: r2(dk.at.z) });
        ev.push({ t: r2(fb + 0.5), kind: 'aid', unit: w.id, by: c.id, what: 'pressure' });
        say(fb + 0.7, 'defender', 'wounded_fallback', c, { n: a.nameOf(w.id) ?? 'friend', w: wnd?.part ?? 'arm' });
        ev.push({ t: r2(fb + 1.6), kind: 'lift', unit: w.id, by: c.id });
        ev.push({ t: r2(fb + 1.7), kind: 'move', unit: c.id, x: r2(to.x), z: r2(to.z), walk: true });
        ev.push({ t: r2(fb + 1.7 + near(wp, to) / 0.8 + 1.2), kind: 'lower', unit: w.id });
        void wp;
      });
      if (cover.length) {
        shoot(fb, fb + 2.2, 0.5, cover, insideCrew, false);
        say(fb + 0.5, 'defender', 'cover_fire', cover[0]);
      }
      fit.filter(u => !cover.includes(u) && !carriers.includes(u)).forEach((u, i) => ev.push({ t: r2(fb + 0.4 + i * 0.3), kind: 'cover', unit: u.id, x: r2((nextHold[(i + hurtHere.length) % nextHold.length] ?? nxt.door.at).x), z: r2((nextHold[(i + hurtHere.length) % nextHold.length] ?? nxt.door.at).z) }));
      cover.forEach((u, i) => ev.push({ t: r2(fb + 2.3 + i * 0.4), kind: 'cover', unit: u.id, x: r2((nextHold[(i + 1) % nextHold.length] ?? nxt.door.at).x), z: r2((nextHold[(i + 1) % nextHold.length] ?? nxt.door.at).z) }));
      hold = nextHold; holders = [...fighters];
    } else if (holders[0]) {
      say(sk + 1.2, 'defender', 'last_stand', holders[0]);
      if (holders[1]) say(sk + 3.4, 'defender', 'rally', holders[1]);
    }
    // anyone hiding in this room is found now
    for (const h of hiders.filter(x => x.room === room || (k === m - 1 && !stages.some(s2 => s2.room === x.room)))) {
      const i = hiders.indexOf(h), searcher = insideCrew[(i + 1) % insideCrew.length];
      const deathT = a.deaths.get(h.u.id);
      const tf = deathT !== undefined ? Math.max(clearAt + 0.8, deathT - 2.2) : clearAt + 1.4 + i * 1.1;
      ev.push({ t: r2(tf - 1.5), kind: 'move', unit: searcher.id, x: r2(h.at.x + (a.door.x - h.at.x) * 0.12), z: r2(h.at.z + (a.door.z - h.at.z) * 0.12) });
      say(tf - 0.9, 'raider', 'found', searcher);
      ev.push({ t: r2(tf), kind: 'found', unit: h.u.id, by: searcher.id, how: a.mercy.temper === 'hostile' ? 'kick' : 'order' });
      if (a.mercy.temper === 'merciful') say(tf + 0.5, 'raider', 'order_out', searcher);
      say(tf + 1.0, 'defender', a.mercy.temper === 'merciful' ? 'come_out' : 'plead', h.u, { n: a.nameOf(searcher.id) ?? 'mister' });
      void hold;
    }
    prevStageEnd = sk + stageLen;
  }

  // ── 4. the sim's fates for the people found: killed (a round, drawn as any other death), taken (led off), spared ──
  const dragged: string[] = [];
  const mercyFound: Found[] = hiders.map(h => ({ id: h.u.id, child: !!h.u.civilian, armed: false, complies: true }));
  // (only explicit mercy data may add an outcome the sim did not write; live play follows the sim's own events)
  const fate = a.explicitMercy ? decideFates(a.mercy, mercyFound, a.seed) : new Map();
  for (const h of hiders) {
    const deathT = a.deaths.get(h.u.id);
    const searcher = insideCrew[(hiders.indexOf(h) + 1) % insideCrew.length];
    if (deathT !== undefined && deathT >= tI) {
      ev.push({ t: r2(deathT - 0.35), kind: 'shot', from: searcher.id, to: h.u.id, hit: true });
      say(deathT - 0.6, 'raider', 'kill', searcher);
      say(deathT + 0.9, 'defender', 'kill', fighters[0] ?? h.u);
    } else if (fate.get(h.u.id) === 'killed' && !a.takenIds.has(h.u.id)) {
      const tk = prevStageEnd - 4 + hiders.indexOf(h) * 0.9;
      ev.push({ t: r2(tk), kind: 'shot', from: searcher.id, to: h.u.id, hit: true });
      ev.push({ t: r2(tk + 0.1), kind: 'death', unit: h.u.id, executed: true });
      say(tk - 0.3, 'raider', 'kill', searcher);
      say(tk + 1.0, 'defender', 'kill', fighters[0] ?? h.u);
    } else if (a.takenIds.has(h.u.id) || fate.get(h.u.id) === 'captured') {
      const tc = prevStageEnd - 3;
      if (!a.realHostage?.has(h.u.id)) ev.push({ t: r2(tc), kind: 'hostage', unit: h.u.id, by: searcher.id });
      say(tc + 0.4, 'raider', 'captive', searcher);
      say(tc + 1.2, 'defender', 'captive', fighters[0] ?? h.u);
      dragged.push(h.u.id);
    }
  }
  for (const f of fighters) {
    if (a.takenIds.has(f.id) && !dragged.includes(f.id)) { dragged.push(f.id); if (!a.realHostage?.has(f.id)) ev.push({ t: r2(prevStageEnd - 2.5), kind: 'hostage', unit: f.id, by: insideCrew[0].id }); say(prevStageEnd - 2.1, 'raider', 'captive', insideCrew[0]); }
  }
  return { strip, doneAt: prevStageEnd, captives: dragged, insideCrew, rooms: m };
}
