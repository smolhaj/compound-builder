/**
 * How the wall comes down: a raiders' truck rams it, or a charge blows it (the "invasion" look of a raid that gets through).
 *
 * WHAT IS REAL AND WHAT IS NOT. The battle sim (sim/battle.ts) already decides that a crew breaks the line, when (its `breach` event) and
 * where, and it already lets them in and fights them for the house; `sim/raidDamage.ts` already leaves the gap in the nearest wall run. None of
 * that changes. This module only decides how the break is SHOWN: it adds cinematic events (`ram`, `charge`, `gap`, the callouts) in front of the
 * sim's own `breach` event, and a pass that keeps the crew out of the truck's path. It adds no shots, no wounds and no deaths. Pure and seeded.
 *
 * The method follows the crew (a loud crowd or men with a truck ram; a disciplined crew plants a charge), unless the sim's own crew already
 * carries a rocket or grenades (then it is a charge).
 */
import type { Battle, BattleEvent, BattleUnit } from './battleTypes';
import { PERIMETER, runFinished, type PerimeterRun, type Pt } from './perimeter';
import type { CrewStyle } from './raiderKinds';
import { mulberry32 } from './rng';

export type BreachMethod = 'ram' | 'charge';

/** The stretch of wall that comes down. */
export interface BreachSpot { runId: string; /** Where the break is (the wall's nearest point to the sim's breach). */ x: number; z: number; /** Distance along the run. */ at: number; /** Width of the opening (world units). */ w: number; /** Direction of the wall there. */ heading: number; /** Unit vector pointing from inside the compound out, across the wall. */ out: { x: number; z: number } }

/** QA override: force a method (the movie script sets it; never saved). */
export const breachOptions: { force: BreachMethod | null } = { force: null };

const WIDTH: Record<BreachMethod, number> = { ram: 0.78, charge: 0.62 };

/** The wall run nearest a point and where along it, or null when no finished wall is within `maxD`. `home` points the "out" side away from the house. */
export function breachSpot(runs: readonly PerimeterRun[], x: number, z: number, home: { x: number; z: number }, method: BreachMethod, maxD = 4): BreachSpot | null {
  let best: { run: PerimeterRun; d: number; px: number; pz: number; at: number; hx: number; hz: number } | null = null;
  for (const run of runs) {
    const def = PERIMETER[run.kind];
    if (!def || !runFinished(run) || def.blocks.people < 0.5 || def.height < 0.3 || run.pts.length < 2) continue;
    let acc = 0;
    for (let i = 1; i < run.pts.length; i++) {
      const [ax, az] = run.pts[i - 1] as Pt, [bx, bz] = run.pts[i] as Pt;
      const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, len = Math.sqrt(l2);
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
      const px = ax + dx * t, pz = az + dz * t, d = Math.hypot(x - px, z - pz);
      if (!best || d < best.d) best = { run, d, px, pz, at: acc + t * len, hx: dx / len, hz: dz / len };
      acc += len;
    }
  }
  if (!best || best.d > maxD) return null;
  // keep the opening clear of the run's ends and of a gate (a gate span is already open)
  const w = WIDTH[method];
  let total = 0;
  for (let i = 1; i < best.run.pts.length; i++) total += Math.hypot(best.run.pts[i][0] - best.run.pts[i - 1][0], best.run.pts[i][1] - best.run.pts[i - 1][1]);
  const at = Math.max(w / 2 + 0.05, Math.min(total - w / 2 - 0.05, best.at));
  if (best.run.gates.some(g => Math.abs(g.at - at) < (g.w + w) / 2 + 0.05)) return null;
  // the side of the wall away from the house
  let nx = -best.hz, nz = best.hx;
  if ((best.px - home.x) * nx + (best.pz - home.z) * nz < 0) { nx = -nx; nz = -nz; }
  return { runId: best.run.id, x: best.px, z: best.pz, at, w, heading: Math.atan2(best.hx, best.hz), out: { x: nx, z: nz } };
}

/** How the crew takes the wall. */
export function breachMethod(units: readonly Pick<BattleUnit, 'side' | 'look'>[], seed: number, carriesCharges = false): BreachMethod {
  if (breachOptions.force) return breachOptions.force;
  if (carriesCharges) return 'charge';
  const style = units.find(u => u.side === 'raider' && u.look)?.look?.style as CrewStyle | undefined;
  if (style === 'crew') return 'charge';
  if (style === 'crowd' || style === 'opportunists') return 'ram';
  return mulberry32(seed * 313 + 5)() < 0.5 ? 'ram' : 'charge';
}

// ─────────────────────────────────────────────────────────────────────────
// The words (plain American, short; no line is used twice in one scene)
// ─────────────────────────────────────────────────────────────────────────
const RAM_RAIDER = ['Floor it! Through the wall!', 'Hit it! Hit the wall, go, go!', 'Take it down — put the truck right through it!', 'Don\'t slow down! Straight in!'];
const RAM_HOME = ['Truck! They\'re driving at the wall — GET BACK!', 'That\'s a truck — it\'s not stopping — move, MOVE!', 'Headlights — they\'re coming through the wall!', 'Everybody off the fence line — NOW!'];
const POUR_RAID = ['Go, go, go! Inside!', 'It\'s open — push through, push!', 'Through the gap! Spread out!', 'Move up! Take the yard!', 'Fan out — cover the house!'];
const POUR_HOME = ['They\'re in the yard! Fall back to the house!', 'The wall\'s gone — everybody inside, inside!', 'Back to the porch — cover each other!', 'They\'re through! Get the kids down!'];
const CHARGE_SET = ['Cover me. Setting the charge.', 'Stay low — I\'m planting it now.', 'Give me ten seconds on the wall.'];
const CHARGE_CALL = ['Fire in the hole! Get back!', 'Charge is set — everybody back, back!', 'Down! Cover your ears!'];
const CHARGE_HOME = ['What was that — they\'re at the wall!', 'Somebody\'s at the wall with a bag — DOWN!', 'Get away from the fence — they\'re going to blow it!'];

function pickLines(r: () => number, list: readonly string[], n = 1): string[] {
  const pool = [...list], out: string[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
}

/** Add the break to a battle that has a sim `breach` event. Returns the battle untouched when there is nothing to show (no breach, no wall near it). */
export function decorateBreach(b: Battle, runs: readonly PerimeterRun[], home: { x: number; z: number }, seed: number, carriesCharges = false): Battle {
  const br = b.events.find(e => e.kind === 'breach') as Extract<BattleEvent, { kind: 'breach' }> | undefined;
  if (!br || b.invasion) return b;
  const method = breachMethod(b.units, seed, carriesCharges);
  const spot = breachSpot(runs, br.x, br.z, home, method);
  if (!spot) return b;
  const r = mulberry32(seed * 8191 + 41);
  const tb = br.t;
  const raiders = b.units.filter(u => u.side === 'raider' && !u.machine);
  const defenders = b.units.filter(u => u.side === 'home' && !u.machine && !u.civilian && !u.bystander);
  const drop = (m: number) => ({ x: spot.x + spot.out.x * m, z: spot.z + spot.out.z * m });
  const ev: BattleEvent[] = [];
  const say = (t: number, text: string, who?: BattleUnit) => ev.push({ t: Math.round(t * 100) / 100, kind: 'say', text, ...(who ? { who: who.id } : {}) });
  const nearest = (p: { x: number; z: number }, list: readonly BattleUnit[]) => [...list].sort((a, c) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(c.x - p.x, c.z - p.z))[0];
  const lead = raiders[0], guard = nearest(spot, defenders) ?? defenders[0];
  let kept = b.events;
  if (method === 'ram') {
    const secs = 3.4;
    const from = drop(7.5);
    const t0 = tb - secs;
    // the crew keeps clear of the lane the truck takes (nobody steps into it during the run-in)
    const lane = (x: number, z: number) => { const dx = x - spot.x, dz = z - spot.z, along = dx * spot.out.x + dz * spot.out.z, side = Math.abs(dx * -spot.out.z + dz * spot.out.x); return along > -0.2 && along < 8.2 && side < 0.55; };
    const aside = (x: number, z: number) => { const side = (x - spot.x) * -spot.out.z + (z - spot.z) * spot.out.x, k = (side >= 0 ? 1 : -1) * 0.9; return { x: Math.round((x + -spot.out.z * k) * 100) / 100, z: Math.round((z + spot.out.x * k) * 100) / 100 }; };
    kept = kept.map(e => (e.kind === 'move' || e.kind === 'cover') && e.t > t0 - 3 && e.t < tb + 0.3 && b.units.find(u => u.id === e.unit)?.side === 'raider' && lane(e.x, e.z) ? { ...e, ...aside(e.x, e.z) } : e);
    const standing = new Map<string, { x: number; z: number }>();
    for (const e of b.events) if (e.t <= t0 && (e.kind === 'move' || e.kind === 'cover')) standing.set(e.unit, { x: e.x, z: e.z });
    for (const u of raiders) { const p = standing.get(u.id) ?? u; if (lane(p.x, p.z)) ev.push({ t: Math.round((t0 - 0.8) * 100) / 100, kind: 'move', unit: u.id, ...aside(p.x, p.z) }); }
    if (lead) say(t0 - 1.6, pickLines(r, RAM_RAIDER)[0], lead);
    ev.push({ t: t0, kind: 'ram', fromX: Math.round(from.x * 100) / 100, fromZ: Math.round(from.z * 100) / 100, x: Math.round(spot.x * 100) / 100, z: Math.round(spot.z * 100) / 100, secs });
    if (guard) say(t0 + 0.7, pickLines(r, RAM_HOME)[0], guard);
    ev.push({ t: tb, kind: 'gap', runId: spot.runId, at: spot.at, w: spot.w, x: spot.x, z: spot.z });
    if (lead) say(tb + 0.9, pickLines(r, POUR_RAID)[0], nearest(spot, raiders) ?? lead);
    if (guard) say(tb + 2.2, pickLines(r, POUR_HOME)[0], guard);
  } else {
    const fuse = 4.2;
    const sapper = nearest(spot, raiders) ?? lead;
    const tp = tb - fuse - 3.2;
    const pad = drop(0.12), back = drop(1.4);
    if (sapper) {
      ev.push({ t: Math.round(tp * 100) / 100, kind: 'move', unit: sapper.id, x: Math.round(pad.x * 100) / 100, z: Math.round(pad.z * 100) / 100 });
      say(tp + 0.4, pickLines(r, CHARGE_SET)[0], sapper);
    }
    ev.push({ t: Math.round((tb - fuse) * 100) / 100, kind: 'charge', x: Math.round(pad.x * 100) / 100, z: Math.round(pad.z * 100) / 100, fuse });
    if (sapper) { say(tb - fuse + 0.3, pickLines(r, CHARGE_CALL)[0], sapper); ev.push({ t: Math.round((tb - fuse + 0.6) * 100) / 100, kind: 'cover', unit: sapper.id, x: Math.round(back.x * 100) / 100, z: Math.round(back.z * 100) / 100 }); }
    // the others back off the wall for the blast
    raiders.filter(u => u !== sapper).slice(0, 5).forEach((u, i) => { const p = drop(2.2 + i * 0.35); ev.push({ t: Math.round((tb - fuse + 0.9 + i * 0.15) * 100) / 100, kind: 'cover', unit: u.id, x: Math.round((p.x + -spot.out.z * (i - 2) * 0.35) * 100) / 100, z: Math.round((p.z + spot.out.x * (i - 2) * 0.35) * 100) / 100 }); });
    if (guard) say(tb - fuse + 1.4, pickLines(r, CHARGE_HOME)[0], guard);
    ev.push({ t: tb, kind: 'explosion', x: Math.round(spot.x * 100) / 100, z: Math.round(spot.z * 100) / 100, radius: 0.8, hits: [], wrecks: 'wall' });
    ev.push({ t: tb, kind: 'gap', runId: spot.runId, at: spot.at, w: spot.w, x: spot.x, z: spot.z });
    if (lead) say(tb + 1.2, pickLines(r, POUR_RAID)[0], nearest(spot, raiders) ?? lead);
    if (guard) say(tb + 2.6, pickLines(r, POUR_HOME)[0], guard);
  }
  // through the gap the crew bounds: after each advance a man drops to a knee (the next advance is a different man's), nobody walks upright into the yard
  const bound: BattleEvent[] = [];
  const lastMove = new Map<string, number>();
  for (const e of kept) {
    if (e.kind === 'move' && e.t > tb && e.t < tb + 9 && b.units.find(u => u.id === e.unit)?.side === 'raider') {
      const prev = lastMove.get(e.unit) ?? -9;
      if (e.t - prev >= 1.4 && Math.floor(e.t) % 2 === (e.unit.charCodeAt(e.unit.length - 1) % 2)) bound.push({ t: Math.round((e.t + 1.1) * 100) / 100, kind: 'cover', unit: e.unit, x: e.x, z: e.z });
      lastMove.set(e.unit, e.t);
    }
  }
  const events = [...kept, ...ev, ...bound].sort((a, c) => a.t - c.t);
  return { ...b, events, invasion: { method } };
}
