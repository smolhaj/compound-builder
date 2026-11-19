/**
 * Staging a raid on a dome (owner request 2026-11-19: "show some raider attempts on the domes, with dialogue and frustration"). The fight sim decides
 * what happens (siege.ts: the shell, the odds, the sally port); this pass only decides how the crew's time at the shell is SHOWN, as presentation events:
 * raiders walking up to the shell and working at it (`probe`: rifles, a sledge, a saw, a torch, a bar at the airlock), a ram or charge that failed and
 * what is said about it, a circuit of the shell, a scout's report, an argument, a leader's order to pull back, a crew member who panics, a vow to come
 * back, and the family watching through the glass. It adds no shots, wounds or deaths and never moves anyone through the shell: people walk only on
 * the open side of it (the nav colliders do the rest). Pure and seeded; every dialogue key it uses is in raidLinesDome.ts.
 */
import type { Battle, BattleEvent, BattleUnit } from '../battleTypes';
import type { LineDirector, Ctx } from '../raidDialogue';
import type { RaiderTemper } from '../battle';
import { mulberry32 } from '../rng';
import { phasesOf, profileOfUnit } from '../raidDialogue';
import type { Dome } from './standing';
import { isShellKind } from './siege';

export interface DomeBeatInput {
  dome: Pick<Dome, 'id' | 'tier' | 'x' | 'z' | 'r' | 'airlocks'>;
  seed: number;
  temper: RaiderTemper;
  dir: LineDirector;
  /** A crew that already dug at this place and was turned back at the skirt (kind `tunnelers`). */
  skirtCrew?: boolean;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
/** How close the crew starts to the shell (world units, 1 = 6 m), and how fast it walks to it. */
const APPROACH = 5, WALK_SPEED = 1.0;
/** Every dialogue key the planner can use (a test holds raidLinesDome.ts to it). */
export const BEAT_CTX_USED: readonly string[] = ['dome_scout', 'dome_shots', 'dome_tool', 'dome_cut', 'dome_airlock', 'dome_ram', 'dome_blast', 'dome_skirt', 'dome_argue', 'dome_order', 'dome_panic', 'dome_vow', 'dome_watch', 'dome_fire', 'dome_holds', 'dome_gone', 'dome_angry', 'dome_bounce', 'dome_taunt'];

/** Does this fight's own timeline break the shell (a gap or a breach on a shell run)? Then the crew's tool work before it is real. */
export const shellBroken = (b: Battle): boolean => b.events.some(e => (e.kind === 'breach' && !!e.where && isShellKind(e.where.kind)) || (e.kind === 'gap' && e.runId.startsWith('dome:')));

/** The word a crew uses for the shell of each tier, so the lines never name glass at a geodesic's panels or an arcology's wall. */
const MATERIAL: Record<string, { glass: string; panes: string; Glass: string }> = {
  glass: { glass: 'glass', panes: 'pane of glass', Glass: 'Glass' },
  geodesic: { glass: 'panels', panes: 'panel', Glass: 'Panels' },
  arcology: { glass: 'shell', panes: 'wall panel', Glass: 'Shell' },
  earthen: { glass: 'earth', panes: 'patch of dirt', Glass: 'Earth' },
};
/** Tier-correct wording for a line written about the glass dome (pure; a test holds it). */
export function shellWording(text: string, tier: string): string {
  const m = MATERIAL[tier];
  if (!m || tier === 'glass') return text;
  return text.replace(/Glass breaks\. Glass always breaks\./, `${m.Glass} cracks. ${m.Glass} always cracks.`).replace(/pane of glass/g, m.panes).replace(/\bGlass\b/g, m.Glass).replace(/\bglass\b/g, m.glass);
}
/** The strongest a dome caption may be is "damn": a line the generic pools wrote with stronger language is softened (pure). */
export function mildWording(text: string): string {
  return text
    .replace(/\bgoddamn(ed|it)?\b/gi, m => (m[0] === 'G' ? 'Damn' : 'damn'))
    .replace(/\bson of a bitch\b/gi, 'damn it')
    .replace(/\bjesus christ\b/gi, 'Good Lord')
    .replace(/\bjesus\b(?!,? please)/gi, 'Good Lord')
    .replace(/\bf+u+c+k\w*/gi, m => (/^F/.test(m) ? 'Damn' : 'damn'))
    .replace(/\bbull?shit\b/gi, 'nonsense')
    .replace(/\bshit\w*/gi, m => (/^S/.test(m) ? 'Damn' : 'damn'));
}

export function domeBeats(b: Battle, o: DomeBeatInput): Battle {
  const d = o.dome, tier = d.tier, rnd = mulberry32(o.seed * 4909 + 17);
  const dead = new Map<string, number>();
  for (const e of b.events) if (e.kind === 'death') dead.set(e.unit, e.t);
  const alive = (u: BattleUnit, t: number) => (dead.get(u.id) ?? Infinity) > t;
  const raiders = b.units.filter(u => u.side === 'raider' && !u.machine && !u.civilian && !u.bystander);
  const home = b.units.filter(u => u.side === 'home' && !u.machine && !u.civilian && !u.bystander);
  if (!raiders.length || b.duration < 8) return b;
  const n = raiders.length, size = n <= 4 ? 'small' : n >= 10 ? 'large' : 'mid';
  const ph = phasesOf(b);
  const broke = shellBroken(b), breakT = b.events.find(e => (e.kind === 'breach' && !!e.where && isShellKind(e.where.kind)) || (e.kind === 'gap' && e.runId.startsWith('dome:')))?.t ?? Infinity;
  const tStart = 2.5, endCap = Math.min(b.duration - 1.5, ph.firstFlee - 0.5, broke ? breakT - 1.2 : Infinity);
  const tEnd = Math.max(tStart + 7, Math.min(endCap, b.duration - 1.5));
  if (tEnd - tStart < 6) return b;
  // where the crew is at the shell: toward its own side, and the airlock nearest that side
  const mx = raiders.reduce((a, u) => a + u.x, 0) / n, mz = raiders.reduce((a, u) => a + u.z, 0) / n;
  const a0 = Math.atan2(mx - d.x, mz - d.z);
  const angDiff = (a: number, c: number) => Math.atan2(Math.sin(a - c), Math.cos(a - c));
  const person = d.airlocks.filter(l => l.role !== 'link');
  const lock = [...person].sort((p, q) => Math.abs(angDiff(p.angle, a0)) - Math.abs(angDiff(q.angle, a0)))[0] ?? null;
  const onShell = (a: number, off = 0): { x: number; z: number } => ({ x: d.x + Math.sin(a) * (d.r + off), z: d.z + Math.cos(a) * (d.r + off) });
  const leader = raiders.find(u => u.leader) ?? raiders[0];
  const crewOrder = raiders.filter(u => u.id !== leader.id && !u.job);
  const drivers = new Set(b.events.flatMap(e => (e.kind === 'ram' && e.driver ? [e.driver] : e.kind === 'charge' && e.carrier ? [e.carrier] : [])));
  const workers = crewOrder.filter(u => !drivers.has(u.id));
  const out: BattleEvent[] = [];
  // The crew starts at the edge of the lot, a hundred and fifty metres from a dome in the middle of it, and the fight lasts only about forty seconds: walking
  // up would use all of it. So the crew's start is brought in to a short run from the shell (the whole crew moves by one vector, its shape kept), and the
  // sim's own advance orders for the men who work the shell are dropped (they would walk them back out to the old line between probes).
  const dn = Math.min(...raiders.map(u => Math.hypot(u.x - d.x, u.z - d.z)));
  const pull = Math.max(0, dn - (d.r + APPROACH));
  const sx = -Math.sin(a0) * pull, sz = -Math.cos(a0) * pull;
  const start = new Map<string, { x: number; z: number }>(raiders.map(u => [u.id, { x: r2(u.x + sx), z: r2(u.z + sz) }]));
  const pos = new Map(start), worked = new Set<string>();
  for (const h of b.units) if (h.side === 'home' && !pos.has(h.id)) pos.set(h.id, { x: h.x, z: h.z });
  const crewIds = new Set([...workers.map(u => u.id), leader.id]);
  // where a man is, and how long it takes him to walk to the shell from there: he is sent early enough to arrive when the probe lands
  const goTo = (u: BattleUnit | undefined, tArrive: number, a: number, off: number): void => {
    if (!u || !alive(u, tArrive)) return;
    const p = onShell(a, off), from = pos.get(u.id) ?? { x: u.x, z: u.z };
    const travel = Math.hypot(p.x - from.x, p.z - from.z) / WALK_SPEED;
    const t = Math.max(0.2, tArrive - travel - 0.3);
    out.push({ t: r2(t), kind: 'move', unit: u.id, x: r2(p.x), z: r2(p.z) });
    pos.set(u.id, p); worked.add(u.id);
  };
  const spoke = new Map<string, number[]>();
  for (const e of b.events) if (e.kind === 'say' && e.who) spoke.set(e.who, [...(spoke.get(e.who) ?? []), e.t]);
  const say = (t: number, u: BattleUnit | undefined, ctx: Ctx, extra: string[] = []): void => {
    if (!u || !alive(u, t) || t >= b.duration - 0.3) return;
    if ((spoke.get(u.id) ?? []).some(x => Math.abs(x - t) < 2.2)) return;
    const role = u.side === 'home' ? 'defender' : 'raider';
    const variants = role === 'raider' ? [o.temper, size === 'mid' ? 'any' : size, ...(u.id === leader.id ? ['leader'] : []), ...extra] : [];
    const text = o.dir.pick(role, ctx, { speaker: u.id, variants });
    if (!text) return;
    spoke.set(u.id, [...(spoke.get(u.id) ?? []), t]);
    out.push({ t: r2(t), kind: 'say', text: shellWording(text, tier), who: u.id, ctx });
  };
  const pickWorker = (i: number): BattleUnit | undefined => { const pool = workers.length ? workers : crewOrder.length ? crewOrder : [leader]; return pool[(i + Math.floor(rnd() * 3)) % pool.length]; };
  /** Send a man to a spot on the shell, to be there at `t` (his walk starts early enough). */
  const stand = (u: BattleUnit | undefined, t: number, a: number, off: number): void => goTo(u, t + 2.5, a, off);
  const homeAt = (i: number, t: number): BattleUnit | undefined => { const up = home.filter(h => alive(h, t)); return up.length ? up[(i + Math.floor(o.seed)) % up.length] : undefined; };
  const span = tEnd - tStart, at = (f: number) => tStart + span * f;
  const probe = (t: number, u: BattleUnit | undefined, what: Extract<BattleEvent, { kind: 'probe' }>['what'], a: number, holds: boolean, secs?: number): void => {
    if (!u || !alive(u, t)) return;
    const p = onShell(a, 0);
    out.push({ t: r2(t), kind: 'probe', unit: u.id, what, x: r2(p.x), z: r2(p.z), ox: r2(Math.sin(a)), oz: r2(Math.cos(a)), tier, holds, ...(secs ? { secs } : {}) });
  };

  // 1. a scout's report
  say(0.6, pickWorker(0), 'dome_scout');   // (a voice in the first second: the director cuts to the crew, not to the family's yard)
  if (o.skirtCrew) say(at(0.08), pickWorker(1), 'dome_skirt');
  say(at(0.1), leader, 'dome_scout');
  // 2. rifles at the shell
  const shooters = [pickWorker(2), pickWorker(3), pickWorker(4)].filter((u, i, all) => u && all.indexOf(u) === i).slice(0, Math.min(3, Math.max(1, n - 1)));
  const volleyT = at(0.2);
  shooters.forEach((u, i) => {
    const a = a0 + (i - 1) * 0.12;
    stand(u, volleyT - 2.5, a, 0.3);
    for (let k = 0; k < 3; k++) probe(volleyT + i * 0.35 + k * 0.7, u, 'rifle', a + k * 0.01, tier !== 'geodesic');
  });
  say(volleyT + 3.2, shooters[0], 'dome_shots');
  say(volleyT + 4.4, shooters[1] ?? leader, 'dome_shots');
  say(volleyT + 3.8, homeAt(0, volleyT + 3.8), tier === 'arcology' ? 'dome_holds' : 'dome_watch');
  // 3. tools at the shell
  const toolT = at(0.38);
  const tool = tier === 'geodesic' ? 'saw' : tier === 'arcology' ? 'saw' : 'sledge';
  const hands = [pickWorker(5), pickWorker(6)].filter((u, i, all) => u && all.indexOf(u) === i);
  hands.forEach((u, i) => {
    const a = a0 + 0.35 + i * 0.1;
    stand(u, toolT - 2.5, a, 0.16);
    if (u) out.push({ t: r2(toolT), kind: 'tool', unit: u.id, what: tool, secs: Math.min(8, tEnd - toolT) });
    for (let k = 0; k < 4; k++) probe(toolT + k * (tier === 'geodesic' ? 1.1 : 1.4) + i * 0.5, u, tool, a, !(tier === 'geodesic' && broke));
  });
  const tooling = tier === 'geodesic' && broke;
  say(toolT + 4.2, hands[0], tooling ? 'dome_cut' : 'dome_tool');
  if (n >= 5 && (tier === 'arcology' || tier === 'glass')) {
    const u = pickWorker(7), a = a0 - 0.4;
    stand(u, at(0.5) - 2.5, a, 0.16);
    if (u) out.push({ t: r2(at(0.5)), kind: 'tool', unit: u.id, what: 'torch', secs: 5 });
    for (let k = 0; k < 3; k++) probe(at(0.5) + k * 1.6, u, 'torch', a, true, 1.4);
    say(at(0.5) + 5, u, 'dome_tool');
  }
  say(toolT + 6, homeAt(1, toolT + 6), 'dome_fire');
  // 4. the airlock
  if (lock) {
    const lt = at(0.6), pair = [pickWorker(8), pickWorker(9)].filter((u, i, all) => u && all.indexOf(u) === i);
    pair.forEach((u, i) => { stand(u, lt - 2.5, lock.angle + (i ? 1 : -1) * 0.05, 0.22); for (let k = 0; k < 3; k++) probe(lt + k * 1.3 + i * 0.4, u, 'pry', lock.angle, true); });
    say(lt + 3.5, pair[0], 'dome_airlock');
    say(lt + 5, pair[1] ?? leader, 'dome_airlock');
  }
  // 5. a circuit of the shell
  const circler = workers.find(u => !worked.has(u.id)) ?? crewOrder.find(u => !worked.has(u.id));
  if (circler && n >= 3) { for (let k = 0; k < 4; k++) stand(circler, at(0.45) + k * 2.2, a0 + 0.5 + k * 0.42, 0.5); }
  const moved = new Map<BattleEvent, BattleEvent>();
  // 8. tempers: some of the crew get angry and shoot at the dome. The round sparks and glances off, and now and then it comes straight back at the man who fired it, who is rocked
  //    and says so (a flinch and a drop to a knee: never a wound, never a death, and the shell is untouched: `holds` is always true on a `dome_shot`'s tier)
  const mad = [...workers, ...crewOrder].filter((u, i, all) => all.indexOf(u) === i && !worked.has(u.id));
  const nMad = Math.min(mad.length, o.temper === 'desperate' ? 1 : 2);
  const kickback = rnd() < 0.85, kickIdx = Math.floor(rnd() * Math.max(1, nMad));
  for (let i = 0; i < nMad; i++) {
    const u = mad[i], a = a0 - 0.3 - i * 0.55, bt = at(0.26 + i * 0.24);
    goTo(u, bt, a, 1.9);
    const sp = onShell(a, 0), burst = 4;
    for (let k = 0; k < burst; k++) {
      const back = kickback && i === kickIdx && k === burst - 1;
      out.push({ t: r2(bt + k * 0.34), kind: 'dome_shot', unit: u.id, x: r2(sp.x), z: r2(sp.z), ox: r2(Math.sin(a)), oz: r2(Math.cos(a)), tier, bounce: back ? 'back' : 'glance', ...(back ? { down: 2.2 } : {}) });
    }
    say(bt - 0.6, u, 'dome_angry');
    if (kickback && i === kickIdx) { say(bt + burst * 0.34 + 0.7, u, 'dome_bounce'); say(bt + burst * 0.34 + 2.8, homeAt(5, bt + 4), 'dome_holds'); }
  }
  // 9. the household comes to the inside of the shell and taunts the crew through it (a kid, a parent, a guard: each in his own voice), with a sign
  const people = home.concat(b.units.filter(u => u.side === 'home' && u.civilian && !u.bystander && !u.machine));
  const byProf = (p: string) => people.find(h => profileOfUnit(h) === p || (p === 'elder' && h.traits?.history.includes('elder')));
  const taunters = ['kid', 'civ', 'vet'].map(byProf).filter((u, i, all): u is BattleUnit => !!u && all.indexOf(u) === i);
  for (const u of people) if (taunters.length < 3 && !taunters.includes(u)) taunters.push(u);
  const SIGNS = ['wave', 'point', 'fist'] as const;
  const tauntBase = at(0.44), muted = new Map<string, [number, number]>();
  taunters.slice(0, 3).forEach((u, i) => {
    const tt = tauntBase + i * 1.9, a = a0 + 0.25 * (i - 1);
    goTo(u, tt, a, -0.55);
    muted.set(u.id, [tt - 4, tt + 5]);
    const face = onShell(a, 4);
    out.push({ t: r2(tt + 0.2), kind: 'gesture', unit: u.id, what: SIGNS[(i + Math.floor(o.seed)) % 3], x: r2(face.x), z: r2(face.z), secs: 1.8 });
    say(tt + 0.5, u, 'dome_taunt');
  });
  // 6. what the truck and the satchel did, from the fight's own failed attempts
  for (const e of b.events) {
    if (e.kind === 'ram' && e.ok === false) { const driver = b.units.find(u => u.id === e.driver); say(e.t + e.secs + 1.1, driver, 'dome_ram'); say(e.t + e.secs + 3, homeAt(2, e.t + e.secs + 3), 'dome_holds'); }
    if (e.kind === 'charge' && e.ok === false && e.why === 'wall_held') {
      const carrier = b.units.find(u => u.id === e.carrier);
      // the bag is set on the shell itself, by a man who walked up to it (the sim's own spot is wherever its wall point was)
      const ang = Math.atan2(e.x - d.x, e.z - d.z), sp = onShell(ang, 0.12);
      moved.set(e, { ...e, x: r2(sp.x), z: r2(sp.z) });
      if (carrier && alive(carrier, e.t)) { out.push({ t: r2(Math.max(0.2, e.t - Math.hypot(sp.x - carrier.x, sp.z - carrier.z) / WALK_SPEED - 0.3)), kind: 'move', unit: carrier.id, x: r2(onShell(ang, 0.4).x), z: r2(onShell(ang, 0.4).z) }); worked.add(carrier.id); }
      probe(e.t + e.fuse + 0.1, carrier, 'torch', Math.atan2(e.x - d.x, e.z - d.z), true, 0.4);
      say(e.t + e.fuse + 1.4, carrier ?? leader, 'dome_blast'); say(e.t + e.fuse + 3.2, homeAt(3, e.t + e.fuse + 3.2), 'dome_holds');
    }
  }
  // 7. the crew gives up
  const pan = pickWorker(11);
  say(at(0.72), pan, 'dome_panic');
  say(at(0.8), pickWorker(12), 'dome_argue');
  say(at(0.86), leader, 'dome_argue');
  if (!broke) {
    say(at(0.93), leader, 'dome_order');
    say(Math.min(b.duration - 1, tEnd + 1.2), pickWorker(13) ?? leader, 'dome_vow');
    say(Math.min(b.duration - 0.6, tEnd + 2.6), homeAt(4, tEnd + 2.6), 'dome_gone');
  }
  // the rest of the crew mills about near the shell, in sight of it (nobody stands out in the dark where the sim left him)
  [...crewOrder, leader].filter(u => !worked.has(u.id) && !drivers.has(u.id)).forEach((u, i) => goTo(u, 2 + i * 0.7, a0 + (i % 2 ? 1 : -1) * (0.55 + i * 0.12), 1.6 + (i % 3) * 0.5));
  if (!out.length) return b;
  const carriers = new Set([...moved.keys()].flatMap(e => (e.kind === 'charge' && e.carrier ? [e.carrier] : [])));
  const dropped = (e: BattleEvent): boolean => {
    if (e.kind !== 'move' && e.kind !== 'cover') return false;
    const w = muted.get(e.unit);
    if (w && e.t >= w[0] && e.t <= w[1]) return true;   // (a household member who came to the shell is not called back to his post mid-sentence)
    return (crewIds.has(e.unit) && !drivers.has(e.unit) && e.t < tEnd) || (carriers.has(e.unit) && e.t < tEnd);
  };
  const keep = b.events.map(e => moved.get(e) ?? e).filter(e => !dropped(e));
  const units = b.units.map(u => (start.has(u.id) && pull > 0 && !u.job ? { ...u, ...start.get(u.id)! } : u));
  const soft = keep.map(e => (e.kind === 'say' && mildWording(e.text) !== e.text ? { ...e, text: mildWording(e.text) } : e));
  return { ...b, units, events: [...soft, ...out].sort((p, q) => p.t - q.t) };
}
