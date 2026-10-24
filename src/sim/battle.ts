/**
 * A fight at the compound, simulated second by second into a timeline the
 * world plays back (battleTypes.ts is the contract). Pure and seeded.
 *
 *  Detection  dogs, sensors, tripwires, cameras or the watch: how early the alarm goes.
 *  Lights     motion floodlights at night (with power) take away the dark.
 *  Posts      fighters (adults, teens 15+) take posts by value: tower > sandbags >
 *             wall > window > open; the rest go to the bunker / safe room / house.
 *  Defenders  shoot the most dangerous raider they can see (close, carrying an
 *             explosive, caught in the open); fall back when a post is under heavy
 *             fire or is wrecked; a medic drags the wounded inside.
 *  Raiders    advance in bounds from cover to cover (half suppress, half move),
 *             drift to the weaker flank, throw grenades inside ~30 m, fire rockets
 *             at the best post; mines go off as they cross the mined band; they
 *             break off at ~40% losses or when the leader goes down.
 *  Breach     at the line with the defense down or outnumbered (or a wall blown):
 *             they pour in, and anyone not in a shelter can be hurt or killed.
 *
 * Distances are world units (1 ≈ 6 m).
 */
import type { Battle, BattleEvent, BattleUnit } from './battleTypes';
import { GUN, skillOf, type Caliber } from './armory';
import { gearPosture } from './gear';
import { backgroundOf } from './family';
import { isHome } from './blueprints';
import { isFinished } from './construction';
import { PERIMETER, runFinished } from './perimeter';
import { mulberry32 } from './rng';
import { leaveAftermath } from './aftermath';
import { hourOf, type GameState } from './state';

type Post = NonNullable<BattleUnit['post']>;
interface PostSpot { kind: Post; x: number; z: number; y: number; cover: number; value: number; cap: number; wrecked: boolean; fire: number }
interface Arm { range: number; rate: number; acc: number; auto: boolean; cal: Caliber | null; mag: number; feed: 'mag' | 'tube' }

/** Range (units), shots a second, accuracy factor, full auto. Types a branch may not have still work. */
/** Magazine (or tube / cylinder / internal box) capacity: a tube or cylinder is loaded a round at a time. */
const ARMS: Record<string, Omit<Arm, 'cal'>> = {
  rimfire: { range: 15, rate: 0.5, acc: 0.6, auto: false, mag: 10, feed: 'mag' },
  bolt: { range: 60, rate: 0.25, acc: 1.3, auto: false, mag: 5, feed: 'tube' },
  lever: { range: 30, rate: 0.35, acc: 1, auto: false, mag: 7, feed: 'tube' },
  semi_rifle: { range: 50, rate: 0.5, acc: 1.1, auto: false, mag: 30, feed: 'mag' },
  auto_rifle: { range: 45, rate: 0.45, acc: 1, auto: true, mag: 30, feed: 'mag' },
  smg: { range: 15, rate: 0.5, acc: 0.8, auto: true, mag: 30, feed: 'mag' },
  pump: { range: 7, rate: 0.3, acc: 1.4, auto: false, mag: 6, feed: 'tube' },
  pistol: { range: 5, rate: 0.4, acc: 0.8, auto: false, mag: 15, feed: 'mag' },
  revolver: { range: 5, rate: 0.3, acc: 0.8, auto: false, mag: 6, feed: 'tube' },
};
const FISTS: Arm = { range: 0.6, rate: 0.5, acc: 0.8, auto: false, cal: null, mag: 0, feed: 'mag' };
const MOVE = 0.6;          // ≈ 3.6 m/s running
const GRENADE_RANGE = 5;   // ≈ 30 m
const ROCKET_RANGE = 50;

export interface BattleOptions {
  /** Raiders armed with guns (false: clubs, the dead). Default true. */
  armed?: boolean;
  /** Override the explosives they carry (otherwise from how long since the collapse). */
  grenades?: number;
  rockets?: number;
  /**
   * A peacetime break-in while the law works (sim/breakins.ts): the intruders
   * are already at the house, carry a pistol at most, no armor or explosives;
   * they run at the first shot from the family (or after a few seconds facing
   * them), and someone shouts that the police are coming. No breach of a line.
   */
  peacetime?: boolean;
}
/** A planned battle plus what applyBattle needs (still a Battle for the playback). */
export interface PlannedBattle extends Battle {
  spent: Partial<Record<Caliber, number>>;
  minesUsed: number;
  /** Explosives left on raiders who went down (recoverable after a repelled raid). */
  dropped: { grenades: number; rpg_rounds: number };
  result: 'repelled' | 'fled' | 'breached' | 'overrun';
  /** Raiders who went down and couldn't get away: wounded, dead. */
  leftBehind?: { wounded: number; dead: number };
}

interface Fighter {
  id: string; side: 'home' | 'raider'; pid?: string; x: number; z: number; y: number;
  hp: number; out: boolean; dead: boolean; arm: Arm; skill: number; readyAt: number;
  post: PostSpot | null; cover: number; moving: boolean; nextMove: number; shelter: boolean;
  grenades: number; rockets: number; leader?: boolean; medic?: boolean; fled?: boolean; rescued?: boolean; escaped?: boolean; kid?: boolean;
  /** Body armor: rifle plates, a soft (pistol-rated) vest, a ballistic helmet. */
  armor: { plate: boolean; soft: boolean; helmet: boolean };
  /** Served (military or police): no freezing at the alarm, steadier under fire. */
  vet?: boolean;
  /** Rounds in the gun; spare magazines (or handfuls of loose rounds) on them; out of both. */
  inGun: number; spare: number; dry?: boolean;
  /** Blood lost a second from an open wound (a tourniquet or pressure stops it). */
  bleed: number;
  /** How much fire is coming their way (it spoils their aim and pins them down). */
  supp: number;
  /** Night vision (or a thermal scope): the dark isn't dark. */
  nvg: boolean;
  /** The gun's condition (a worn gun jams more). */
  wear: number;
  movedAt?: number; bleedAt?: number; bleedPart?: 'head' | 'torso' | 'arm' | 'leg' | 'frag'; saidAt?: number;
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Mines can be rigged only once the law is gone (they're never sold). */
export const canRigMines = (s: GameState) => s.disaster.tracks.law < 0.5;
/** Rig four mines from a hardware kit and a can of fuel. */
export function rigMines(s: GameState): string | null {
  if (!canRigMines(s)) return 'not while the law still works';
  if ((s.stock.hardware ?? 0) < 1 || (s.stock.fuel ?? 0) < 1) return 'needs a hardware kit and a can of fuel';
  s.stock.hardware -= 1; s.stock.fuel -= 1;
  s.stock.mines = (s.stock.mines ?? 0) + 4;
  return null;
}

/**
 * Mines don't know who's walking: once a day, buried charges can go off under
 * a deer, a stranger coming up the road for help, or one of your own (the
 * kids most of all). The more there are, the likelier.
 */
export function minesDay(s: GameState): string[] {
  const m = Math.floor(s.stock.mines ?? 0);
  if (m <= 0) return [];
  const day = Math.floor(s.clock.t + 0.25), r = mulberry32(s.seed * 7121 + day * 13 + 1);
  if (r() >= 0.003 * Math.sqrt(m)) return [];
  s.stock.mines = m - 1;
  const u = r();
  if (u < 0.6) return ['A mine went off in the night: a deer, by the look of it. Venison, at least.'];
  if (u < 0.85) {
    s.gate.humanity = Math.max(0, s.gate.humanity - 6);
    return [r() < 0.5 ? 'A mine went off on the drive. A stranger, walking up for help. They didn\'t make it.' : 'A mine went off on the drive. A stranger, badly hurt, dragged themselves back to the road.'];
  }
  const living = s.people.map((p, i) => ({ p, i })).filter(({ i }) => s.personState[i]?.needs.died == null);
  const kids = living.filter(({ p }) => p.kid);
  const who = (kids.length && r() < 0.6 ? kids : living)[Math.floor(r() * (kids.length && r() < 0.6 ? kids : living).length)];
  if (!who) return [];
  const n = s.personState[who.i].needs;
  n.hurt.push({ what: 'blast injuries from a mine', sev: 55 + Math.round(r() * 30), trauma: true });
  n.health = Math.max(s.disaster.difficulty === 'cozy' ? 5 : 1, n.health - 40);
  return [`${who.p.first} stepped on one of the mines. They're alive, badly hurt.`];
}

export function planBattle(s: GameState, raiders: number, seed: number, opts: BattleOptions = {}): PlannedBattle {
  const r = mulberry32(seed * 2654435 + 977);
  const hr = hourOf(s.clock.t), night = hr < 6 || hr >= 20;
  const fin = s.structures.filter(isFinished);
  const home = fin.find(st => isHome(st.kind)) ?? fin[0] ?? { x: 0, z: 0 };
  const C = { x: home.x, z: home.z };
  // the road side: raiders come up from +z, give or take
  const ang = Math.PI / 2 + (r() - 0.5) * 0.8;
  const ax = Math.cos(ang), az = Math.sin(ang);       // unit vector from the house toward the raiders
  const lx = -az, lz = ax;                            // lateral
  const at = (d: number, lat: number) => ({ x: C.x + ax * d + lx * lat, z: C.z + az * d + lz * lat });
  const alive = s.people.map((p, i) => ({ p, i })).filter(({ i }) => s.personState[i]?.needs.died == null && s.personState[i]?.task !== 'gone');
  // the adults fight; kids hide (and get out through the tunnel if it comes to that); a teenager picks up a gun only if there aren't two adults who can
  const adultsN = alive.filter(({ p }) => !p.kid).length;
  const canFight = (p: { kid: boolean; age: number }) => !p.kid || (p.age >= 15 && adultsN < 2);
  const fightersP = alive.filter(({ p }) => canFight(p));
  const g = gearPosture(s, fightersP.length);
  const n = (k: string) => Math.floor((s.stock as Record<string, number>)[k] ?? 0);
  const powered = s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5);
  const lightsOn = night && powered && n('floodlights') > 0;

  // ── posts ──
  const posts: PostSpot[] = [];
  for (const st of fin) if (st.kind.includes('tower')) posts.push({ kind: 'tower', x: st.x, z: st.z, y: 0.9, cover: 0.35, value: 4, cap: 1, wrecked: false, fire: 0 });
  for (let i = 0; i < Math.min(3, n('sandbags')); i++) { const p = at(3, (i - 1) * 2.5); posts.push({ kind: 'sandbags', ...p, y: 0, cover: 0.4, value: 3, cap: 1, wrecked: false, fire: 0 }); }
  let wallR = 0;
  for (const run of s.perimeter) {
    if (!runFinished(run) || PERIMETER[run.kind].blocks.people <= 0 || !run.pts.length) continue;
    const pts = run.pts.map(([x, z]) => ({ x, z })).sort((a, b) => ((b.x - C.x) * ax + (b.z - C.z) * az) - ((a.x - C.x) * ax + (a.z - C.z) * az));
    wallR = Math.max(wallR, Math.max(4, Math.min(30, dist(pts[0], C))));
  }
  if (wallR) for (let i = 0; i < 3; i++) { const p = at(wallR, (i - 1) * 4); posts.push({ kind: 'wall', ...p, y: 0, cover: 0.55, value: 2, cap: 1, wrecked: false, fire: 0 }); }
  const bars = n('window_bars') > 0 ? 0.5 : 0.6;
  for (const st of fin) if (!st.kind.startsWith('bunker_') && !st.kind.includes('tower') && dist(st, C) < 25) posts.push({ kind: 'building', x: st.x + ax * 0.5, z: st.z + az * 0.5, y: 0.3, cover: bars, value: 1, cap: isHome(st.kind) ? 2 : 1, wrecked: false, fire: 0 });
  posts.push({ kind: 'open', x: C.x + ax * 1.5, z: C.z + az * 1.5, y: 0, cover: 1, value: 0, cap: 99, wrecked: false, fire: 0 });
  posts.sort((a, b) => b.value - a.value);
  const lineR = wallR || 2;

  const shelterAt = fin.find(st => st.kind === 'bunker_hatch' || st.kind === 'bunker_stairs') ?? home;
  const hardShelter = shelterAt !== home || g.safeRoom;

  // ── units ──
  const units: BattleUnit[] = [];
  const ev: BattleEvent[] = [];
  const F: Fighter[] = [];
  const ammo: Partial<Record<Caliber, number>> = { ...s.armory.ammo };
  const spent: Partial<Record<Caliber, number>> = {};
  const free = s.armory.guns.filter(x => (ammo[GUN[x.model].cal] ?? 0) >= 1).sort((a, b) => (ARMS[GUN[b.model].type].acc * ARMS[GUN[b.model].type].range) - (ARMS[GUN[a.model].type].acc * ARMS[GUN[a.model].type].range));
  const medicId = fightersP.filter(({ p }) => p.skills.medic >= 3).sort((a, b) => b.p.skills.medic - a.p.skills.medic)[0]?.p.id;
  for (const { p } of alive) {
    const x = C.x + (r() - 0.5) * 2, z = C.z + (r() - 0.5) * 2;
    const fights = canFight(p);
    let arm = FISTS, wear = 1;
    if (fights) {
      const gun = free.find(x => x.carrier === p.id) ?? free.find(x => !x.carrier);
      if (gun) { free.splice(free.indexOf(gun), 1); const m = GUN[gun.model]; arm = { ...(ARMS[m.type] ?? ARMS.pistol), cal: m.cal }; if (m.capacity) arm.mag = m.capacity; if (gun.condition < 0.5) arm.acc *= 0.7; wear = gun.condition; }
    }
    const vet = backgroundOf(p) !== null;
    const hp0 = Math.max(20, s.personState.find(q => q.id === p.id)?.needs.health ?? 100);   // already hurt or sick: weaker from the start
    const f: Fighter = { id: `h_${p.id}`, side: 'home', pid: p.id, x, z, y: 0, hp: hp0, out: false, dead: false, arm, skill: skillOf(s, p.id), readyAt: Infinity, post: null, cover: 0.8, moving: false, nextMove: 0, shelter: !fights, grenades: n('grenades') && fights ? 1 : 0, rockets: 0, medic: p.id === medicId, kid: p.kid, armor: { plate: false, soft: false, helmet: false }, vet, inGun: arm.mag, spare: arm.feed === 'tube' ? 4 : 2, bleed: 0, supp: 0, nvg: false, wear };
    F.push(f); units.push({ id: f.id, side: 'home', personId: p.id, x: r2(x), z: r2(z), post: 'open' });
  }
  const daysAfter = s.disaster.kind ? Math.max(0, s.clock.t - s.disaster.hitAt) : 0;
  const late = Math.min(1, daysAfter / 365);
  const armedR = opts.armed !== false;
  const peace = !!opts.peacetime;
  let gLeft = opts.grenades ?? (armedR && !peace ? Math.round(raiders * late * 0.6 * r()) : 0);
  let rLeft = opts.rockets ?? (armedR && !peace && daysAfter > 120 && r() < late * 0.5 ? 1 : 0);
  for (let i = 0; i < raiders; i++) {
    const p = peace ? at(1.5 + r() * 2, (r() - 0.5) * 3) : at(30 + r() * 4, (r() - 0.5) * 8);
    const autoR = armedR && late > 0.5 && r() < 0.3;
    const arm: Arm = !armedR ? FISTS : peace ? { ...ARMS.pistol, cal: null } : { ...(autoR ? ARMS.auto_rifle : r() < 0.55 ? ARMS.semi_rifle : r() < 0.6 ? ARMS.pump : ARMS.pistol), cal: null };
    const gr = gLeft > 0 ? 1 : 0; gLeft -= gr;
    const rk = rLeft > 0 && i > 0 ? 1 : 0; rLeft -= rk;
    const f: Fighter = { id: `r${i}`, side: 'raider', ...p, y: 0, hp: 100, out: false, dead: false, arm, skill: 3 + Math.floor(r() * 4), readyAt: 0, post: null, cover: 1, moving: true, nextMove: 0, shelter: false, grenades: gr, rockets: rk, leader: i === 0, armor: { plate: armedR && !peace && r() < late * 0.35, soft: armedR && !peace && r() < 0.15 + late * 0.2, helmet: armedR && !peace && r() < late * 0.3 }, inGun: arm.mag, spare: 2 + Math.round(late * 3), bleed: 0, supp: 0, nvg: armedR && !peace && late > 0.6 && r() < 0.25, wear: 0.5 + r() * 0.4 };
    F.push(f); units.push({ id: f.id, side: 'raider', x: r2(p.x), z: r2(p.z), post: 'open' });
  }
  const H = F.filter(f => f.side === 'home'), R = F.filter(f => f.side === 'raider');
  // the family's armor goes to the fighters, those who served first
  {
    let plates = n('plate_carrier'), soft = n('soft_armor'), helmets = n('helmet'), nvgs = n('nvg') + n('thermal');
    for (const f of [...H].filter(h => !h.shelter).sort((a, b) => Number(!!b.vet) - Number(!!a.vet))) {
      if (plates > 0) { f.armor.plate = true; plates--; if (f.arm.feed === 'mag') f.spare = 6; } else if (soft > 0) { f.armor.soft = true; soft--; }   // a plate carrier has mag pouches
      if (helmets > 0) { f.armor.helmet = true; helmets--; }
      if (nvgs > 0) { f.nvg = true; nvgs--; }
    }
    // the playback draws it
    for (const f of F) if (f.armor.plate || f.armor.soft || f.armor.helmet) { const u = units.find(x => x.id === f.id); if (u) u.armor = { ...f.armor }; }
  }
  // who's talking (the ticker shows the speaker), and how much a wound takes out of a fighter
  const pick = <T,>(xs: T[]): T => xs[Math.floor(r() * xs.length)];
  const nameOf = (f: Fighter) => (f.pid ? s.people.find(p => p.id === f.pid)?.first ?? 'They' : 'Raider');
  const say = (t: number, text: string, who?: Fighter) => { ev.push({ t: r2(t), kind: 'say', text, ...(who ? { who: who.id } : {}) }); };
  const eff = (f: Fighter) => Math.max(0.15, Math.min(1, f.hp / 100));
  const lead = () => H.find(h => !h.out && !h.shelter);
  /** Civilians under fire swear and panic; those who served keep it short. */
  const v = (f: Fighter | undefined, civ: string[], vet: string[]) => pick(f?.vet ? vet : civ);
  /** A fighter's own line, not more than one every few seconds (nobody narrates every reload). */
  const sayF = (f: Fighter, t: number, civ: string[], vet: string[], gap = 6) => {
    if (f.side === 'home' && f.saidAt != null && t - f.saidAt < gap) return;
    f.saidAt = t; say(t, v(f, civ, vet), f);
  };
  let ifaks = n('ifak');

  // ── detection, alarm, lights ──
  const detection = Math.min(100, 25 + (s.gate.forewarned ? 20 : 0) + g.detection + Math.max(0, ...fightersP.map(({ p }) => p.skills.hunter)) * 4);
  // by day, people on watch see a group coming up the drive a couple of hundred meters out; at night it's what the gear hears and sees
  const darkBlind = night && !lightsOn && !n('nvg') && !n('thermal') && !n('thermal_cam');
  const detectAt = Math.max(lineR + 2, (6 + detection * 0.24) * (darkBlind ? 0.7 : 1), night ? 0 : 18 + detection * 0.06);
  const what: 'dog' | 'sensor' | 'tripwire' | 'camera' | 'watch' = n('dog') ? 'dog' : n('driveway_alarm') ? 'sensor' : n('tripwire') ? 'tripwire' : powered && (n('cameras') || n('thermal_cam')) ? 'camera' : 'watch';
  let alarmed = false;
  const mines = Math.min(n('mines'), 12);
  let minesLeft = mines;
  const mineR = lineR + 4;

  const assignPost = (f: Fighter, t: number, exclude?: PostSpot) => {
    const used = (p: PostSpot) => H.filter(h => h.post === p && !h.out).length;
    const p = posts.find(p => p !== exclude && !p.wrecked && used(p) < p.cap) ?? posts[posts.length - 1];
    f.post = p;
    const tr = Math.max(1, dist(f, p) / MOVE) / (0.4 + 0.6 * eff(f));
    f.x = p.x; f.z = p.z; f.y = p.y; f.cover = p.cover; f.readyAt = t + tr; f.movedAt = t;
    ev.push({ t: r2(t + 0.2), kind: 'move', unit: f.id, x: r2(p.x), z: r2(p.z), ...(p.y ? { y: p.y } : {}) });
  };
  const toShelter = (f: Fighter, t: number) => {
    f.shelter = true; f.x = shelterAt.x; f.z = shelterAt.z; f.y = 0; f.post = null;
    ev.push({ t: r2(t + 0.3), kind: 'move', unit: f.id, x: r2(shelterAt.x), z: r2(shelterAt.z) });
  };

  const hurt = (f: Fighter, sev: number, t: number, by?: Fighter, part?: 'head' | 'torso' | 'arm' | 'leg') => {
    if (f.dead) return;
    f.hp -= sev;
    const mate = () => H.find(h => h !== f && !h.out && !h.shelter);
    if (f.hp <= 0) {
      f.dead = true; f.out = true; ev.push({ t: r2(t + 0.05), kind: 'death', unit: f.id });
      const m = mate();
      if (f.side === 'home' && m) say(t + 0.4, v(m, [`No! ${nameOf(f)}! NO!`, `Oh God — ${nameOf(f)}! ${nameOf(f)}, get up!`, `They shot ${nameOf(f)} — fuck, fuck, FUCK!`], [`${nameOf(f)}'s down. Keep firing.`, `Man down — ${nameOf(f)}.`]), m);
      else if (f.side === 'raider' && by?.side === 'home' && r() < 0.5) say(t + 0.3, v(by, ['I got one — oh God, I got one.', 'He\'s down! Holy shit, he\'s down!', 'Did I — I think I hit him!'], ['One down.', 'Got him. Next.']), by);
      return;
    }
    ev.push({ t: r2(t + 0.05), kind: 'wound', unit: f.id, sev: Math.round(sev), ...(part ? { part } : {}) });
    if (f.side === 'home' && part === 'leg') say(t + 0.3, sev > 60 ? v(f, ['It\'s pumping — oh God, it\'s pumping! I need a tourniquet!', 'My leg — fuck — there\'s so much blood!'], ['Leg — arterial. Tourniquet, on me, now!']) : v(f, ['Fuck! My leg! I can\'t — I can\'t stand —', 'AHH — shit — my leg!'], ['Hit in the leg. Still in it.']), f);
    else if (f.side === 'home' && part === 'head') say(t + 0.3, v(f, ['Something hit my head — I can\'t see right —', 'My head — oh God, is it bad?'], ['Head wound. I\'m… I\'m okay.']), f);
    else if (f.side === 'home' && !part) say(t + 0.3, v(f, ['AAGH — fuck — the blast!', 'I\'m hit — I\'m hit — shit!'], ['Frag got me. Still up.']), f);
    else if (f.side === 'home') say(t + 0.3, sev < 30 ? v(f, ['Fuck! I\'m hit — I\'m okay, I\'m okay!', 'Shit — it grazed me —'], ['Grazed. I\'m good.']) : sev < 55 ? v(f, ['Ahh — fuck, my arm!', 'They got my arm — shit, shit!'], ['Hit in the arm. Still shooting.']) : v(f, ['I can\'t… can\'t breathe —', 'Help me — please — I\'m hit bad —'], ['I\'m hit bad.']), f);
    else if (by?.side === 'home' && r() < 0.3) say(t + 0.3, v(by, ['I hit him! I think I hit him!', 'He\'s hit — he\'s hit!'], ['Hit.']), by);
    // an open wound to the body or a leg bleeds until someone stops it (the femoral artery fast)
    if (part === 'torso' || (part === 'leg' && sev >= 40) || (!part && sev >= 50)) {
      f.bleed = Math.max(f.bleed, part === 'leg' && sev >= 70 ? 3 : sev / 45);
      f.bleedAt = t; f.bleedPart = part ?? 'frag';
    }
    if (f.hp < (f.side === 'raider' ? 55 : 45)) f.out = true;
  };
  /** Dying of a wound nobody got to in time. */
  const bleedOut = (f: Fighter, t: number) => {
    f.dead = true; f.out = true; f.bleed = 0;
    ev.push({ t: r2(t), kind: 'death', unit: f.id });
    const m = H.find(h => h !== f && !h.out && !h.shelter);
    if (f.side === 'home' && m) say(t + 0.4, v(m, [`${nameOf(f)}? ${nameOf(f)}! Oh God, they're not breathing — they're not breathing!`, `No no no — ${nameOf(f)}, stay with me — STAY WITH ME —`], [`${nameOf(f)}'s gone. Bled out.`]), m);
  };
  /** Stop the bleeding: a tourniquet on a limb, a chest seal or packing on the body. */
  const stopBleed = (f: Fighter, by: Fighter, t: number, medic: boolean) => {
    const kit = ifaks > 0 && f.side === 'home'; if (kit) ifaks--;
    const limb = f.bleedPart === 'leg' || f.bleedPart === 'arm';
    f.bleed = kit && (limb || medic) ? 0 : medic ? f.bleed * 0.2 : f.bleed * (kit ? 0.3 : 0.5);
    ev.push({ t: r2(t), kind: 'aid', unit: f.id, by: by.id, what: limb && kit ? 'tourniquet' : kit ? 'chest seal' : 'pressure' });
  };
  const explode = (x: number, z: number, t: number, radius: number, wreck?: PostSpot) => {
    const hits: string[] = [];
    for (const u of F) {
      if (u.dead || u.escaped || (u.side === 'home' && u.shelter && hardShelter)) continue;
      const d = Math.hypot(u.x - x, u.z - z);
      if (d > radius) continue;
      hits.push(u.id);
      hurt(u, (60 + r() * 50) * (1 - d / radius * 0.6) * (u.post === wreck ? 1 : Math.max(0.4, u.cover)) * (u.armor.plate || u.armor.soft ? 0.7 : 1) * (u.armor.helmet ? 0.85 : 1), t);   // armor takes some of the fragments
    }
    let wrecks: 'post' | 'wall' | undefined;
    if (wreck && wreck.kind !== 'open') { wreck.wrecked = true; wrecks = wreck.kind === 'wall' ? 'wall' : 'post'; if (wreck.kind === 'wall') wallDown = true; }
    ev.push({ t: r2(t), kind: 'explosion', x: r2(x), z: r2(z), radius, hits, ...(wrecks ? { wrecks } : {}) });
  };
  // how organized they are: later in the collapse, armored, more of them carry rifles
  const org = peace ? 0 : Math.min(1, late * 0.7 + R.filter(f => f.armor.plate || f.armor.soft).length / Math.max(1, raiders) * 0.4);
  let shaken = false;
  let wallDown = false, breached = false, fled = false, end: PlannedBattle['result'] | null = null, endT = 0;
  let breachT = 0, lineSince = -1;

  /**
   * A round that hits: where (cover hides the torso, so more heads and arms
   * get hit from behind a wall), what the armor does, and whether it kills.
   * Plates stop rifle rounds most of the time; a soft vest stops pistol
   * rounds and buckshot, not a rifle; a helmet turns some head shots into
   * a concussion. An unprotected chest or head can kill outright.
   */
  const strike = (b: Fighter, a: Fighter, t: number) => {
    const covered = b.cover < 0.9 || (b.post && b.post.kind !== 'open');
    const u = r();
    const part: 'head' | 'torso' | 'arm' | 'leg' = covered ? (u < 0.25 ? 'head' : u < 0.5 ? 'torso' : u < 0.8 ? 'arm' : 'leg') : (u < 0.1 ? 'head' : u < 0.55 ? 'torso' : u < 0.78 ? 'arm' : 'leg');
    const rifle = a.arm.range >= 30;
    const stop = (text: string) => {
      ev.push({ t: r2(t + 0.05), kind: 'wound', unit: b.id, sev: 5, part, stopped: true });
      b.hp -= 4;
      if (b.side === 'home') say(t + 0.3, text, b);
    };
    if (part === 'torso') {
      if (b.armor.plate && r() < 0.85) return stop(v(b, ['It hit my vest — holy shit, it held!', 'Jesus — the plate — I\'m okay, I\'m okay!'], ['Plate caught it. Good.']));
      if (b.armor.soft && !rifle && r() < 0.8) return stop(v(b, ['Oh God — the vest stopped it —', 'Something hit me — the vest — I\'m okay!'], ['Vest stopped it.']));
      if (r() < (rifle ? 0.3 : 0.18)) return hurt(b, b.hp + 1, t, a, part);
      return hurt(b, 45 + r() * 35, t, a, part);
    }
    if (part === 'head') {
      if (b.armor.helmet && r() < (rifle ? 0.35 : 0.8)) {   // the helmet holds: a concussion, not a hole
        b.hp -= 15; ev.push({ t: r2(t + 0.05), kind: 'wound', unit: b.id, sev: 15, part });
        if (b.side === 'home') say(t + 0.4, v(b, ['Jesus Christ — it hit my helmet — my ears —', 'What the — my head — the helmet, it — I\'m okay —'], ['Helmet took it. Ears ringing.']), b);
        return;
      }
      if (r() < 0.75) return hurt(b, b.hp + 1, t, a, part);
      return hurt(b, 55 + r() * 25, t, a, part);
    }
    if (part === 'leg' && r() < 0.05) return hurt(b, 70, t, a, part);   // the femoral artery
    return hurt(b, (part === 'arm' ? 20 : 25) + r() * 28, t, a, part);
  };

  /**
   * An empty gun: a fresh magazine (a few seconds; a civilian's hands shake),
   * a tube or cylinder thumbed in a round at a time; out of magazines, a run
   * to the house for more; out of ammunition, nothing.
   */
  const reload = (a: Fighter, t: number) => {
    const cal = a.arm.cal;
    if (a.spare > 0) {
      a.spare--; a.inGun = a.arm.mag;
      const secs = a.arm.feed === 'tube' ? a.arm.mag * (a.vet ? 0.5 : 0.9) : a.vet ? 2 : 3 + r() * 3;
      a.readyAt = t + secs;
      ev.push({ t: r2(t), kind: 'reload', unit: a.id, secs: r2(secs) });
      if (a.side === 'home' && r() < 0.7) sayF(a, t, ['Reloading — reloading! Cover me!', 'I\'m empty — shit — hang on —', 'Mag — where\'s my — got it, got it —', 'Out — loading — come on, come ON —'], ['Reloading!', 'Changing mags.', 'Loading.']);
      else if (a.side === 'raider' && r() < 0.15) say(t, pick(['Reloading!', 'Cover me, I\'m out!']), a);
      return;
    }
    if (a.side === 'home' && cal && (ammo[cal] ?? 0) >= a.arm.mag) {
      a.spare = 2; a.readyAt = t + 12 + r() * 6;
      sayF(a, t, ['I\'m out of mags — I need ammo! I\'m going in for more!', 'That\'s my last one — I\'ve got nothing — getting more from the house!'], ['Last mag. Getting more from the house — cover my sector.'], 0);
      ev.push({ t: r2(t + 0.3), kind: 'move', unit: a.id, x: r2(C.x), z: r2(C.z) });
      ev.push({ t: r2(a.readyAt - 2), kind: 'move', unit: a.id, x: r2(a.x), z: r2(a.z), ...(a.y ? { y: a.y } : {}) });
      return;
    }
    a.dry = true;
    if (a.side === 'home') sayF(a, t, ['I\'m out! I\'m OUT! I\'ve got nothing left!', 'No more — there\'s no more ammo — oh God —'], ['I\'m dry. Out of ammo.'], 0);
  };

  const shoot = (a: Fighter, b: Fighter, t: number) => {
    const cal = a.arm.cal;
    const cost = a.arm.auto ? 3 : 1;
    if (a.dry) return;
    if (a.arm.mag && a.inGun < cost) return reload(a, t);
    if (cal && (ammo[cal] ?? 0) < cost) { a.dry = true; return; }
    // a jam: worn guns more, cheap ammo in a hot gun; clearing it takes a vet a second or two, a civilian much longer
    if (a.arm.mag && r() < 0.002 + (1 - a.wear) * 0.015) {
      const secs = a.vet ? 2 + r() : 4 + r() * 6;
      a.readyAt = t + secs;
      ev.push({ t: r2(t), kind: 'jam', unit: a.id, secs: r2(secs) });
      if (a.side === 'home') sayF(a, t, ['It\'s jammed — it won\'t fire — fuck! FUCK!', 'Come on, come on — it\'s stuck — why won\'t it —', 'It just clicked — it\'s not working!'], ['Malfunction. Clearing.', 'Jam — tap, rack — good.'], 0);
      return;
    }
    a.inGun -= cost;
    if (cal) { ammo[cal]! -= cost; spent[cal] = (spent[cal] ?? 0) + cost; }
    const d = dist(a, b);
    const rangeF = Math.max(0.15, 1 - d / (a.arm.range * 1.2));
    const tgtCover = b.side === 'raider' ? (b.moving ? 1.3 : b.cover) : b.cover;
    // the dark: half the hits, unless they have night vision; rounds snapping past spoil the aim (less so for those who served)
    const see = night && !lightsOn ? (a.nvg ? 0.9 : 0.5) : 1;
    const steady = 1 / (1 + a.supp * (a.vet ? 0.07 : 0.16));
    let p = (0.06 + 0.025 * a.skill) * a.arm.acc * rangeF * tgtCover * see * steady * (a.side === 'home' && a.post?.kind === 'tower' ? 1.15 : 1);
    if (a.side === 'home' && a.moving) p *= 0.5;
    if (a.arm.auto) p *= 1.6;
    p *= eff(a);                                   // a wounded shooter shoots worse
    const hit = r() < Math.min(0.9, p);
    ev.push({ t: r2(t), kind: 'shot', from: a.id, to: b.id, hit, ...(a.arm.auto ? { auto: true } : {}) });
    if (b.post) b.post.fire++;
    b.supp += a.arm.auto ? 2 : 1;
    if (hit) strike(b, a, t);
  };

  for (let t = 0; t < 300 && !end; t++) {
    const hUp = H.filter(f => !f.out && !f.shelter), rUp = R.filter(f => !f.out && !f.fled);
    // alarm
    const nearest = Math.min(...rUp.map(f => dist(f, C)));
    if (!alarmed && (nearest <= detectAt || t > 0 && rUp.length === 0)) {
      alarmed = true;
      ev.push({ t, kind: 'alarm', what });
      if (lightsOn) ev.push({ t: t + 1, kind: 'lights' });
      const l0 = lead();
      say(t, peace ? v(l0, ['Who\'s there?! Someone\'s in the house — oh God —', 'I hear you down there — I have a gun!'], ['Intruder, downstairs. Everyone stay put.']) : l0?.vet ? (what === 'dog' ? 'Dog\'s alerting. Contact on the drive — everyone to your spots.' : 'Contact. Everyone up, to your spots. Now.')
        : what === 'dog' ? pick(['The dog — shit, there\'s people out there! Get up, get UP!', 'Why is the dog — oh fuck. Fuck! They\'re coming!'])
        : what === 'camera' ? pick(['There\'s people on the camera — oh shit, they\'ve got guns!', 'Fuck — look at the camera — they\'re coming up the drive!'])
        : what === 'tripwire' ? 'That\'s the tripwire — shit — they\'re in the trees!' : pick(['Shit, shit — there\'s people coming up the drive!', 'Fuck! They\'re coming! Everybody up!']), l0);
      if (H.some(h => h.shelter && h.kid)) {
        say(t + 1, v(l0, ['Kids — downstairs, NOW! Don\'t come out till I say!', 'Get the kids in the back — go, go, GO!'], ['Kids to the shelter. Stay down, stay quiet.']), l0);
        say(t + 2.2, pick(['What\'s happening?! Is that — are those guns?!', 'I\'m scared — I\'m scared —', 'Is somebody coming?']), H.find(h => h.shelter && h.kid));
      }
      if (peace) say(t + 1.5, v(l0, ['I called 911! The police are on their way! GET OUT OF MY HOUSE!', 'The sheriff\'s coming — get out, GET OUT!'], ['Sheriff\'s on the way. Leave. Now.']), l0);
      if (peace) say(t + 2, pick(['Shit — somebody\'s home!', 'Go, go — he\'s got a gun!']), R[0]); else say(t + 2, pick(['Spread out! Hit the house!', 'Go, go — flank \'em!', 'Come out and nobody gets hurt! We just want the food!', 'Light \'em up!']), R[0]);
      for (const f of H) if (f.shelter) toShelter(f, t); else { assignPost(f, t); if (!f.vet) f.readyAt += 1 + r() * 3; }   // civilians freeze a moment; those who served go straight to it
    }
    for (const p of posts) p.fire *= 0.7;
    for (const f of F) {
      f.supp *= 0.6;
      if (f.dead || f.bleed <= 0) continue;
      if (f.escaped || (f.shelter && f.rescued)) { f.bleed = 0; continue; }
      if (f.shelter) f.bleed = Math.min(f.bleed, 0.3);   // someone in there holds pressure on it
      f.hp -= f.bleed;
      if (f.hp <= 0) { bleedOut(f, t); continue; }
      // still able: put your own tourniquet on (those who served know how and do it fast)
      if (!f.out && f.side === 'home' && t - (f.bleedAt ?? t) >= (f.vet ? 2 : 6) && ifaks > 0) {
        stopBleed(f, f, t, !!f.vet);
        sayF(f, t, f.bleedPart === 'leg' || f.bleedPart === 'arm' ? ['Tourniquet — I got it on — oh God, oh God, tighter —', 'I\'m putting the tourniquet on — fuck, it hurts —'] : ['Pressing on it — I\'m pressing on it —', 'There\'s a hole in me — the seal, where\'s the seal —'], ['Tourniquet\'s on. Back in it.', 'Sealed it. I\'m good.'], 0);
      } else if (!f.out && f.side === 'raider' && t - (f.bleedAt ?? t) >= 5 && r() < 0.15) f.bleed *= 0.3;
    }

    // home side: fire, fall back, medic
    if (alarmed) for (const f of hUp) {
      if (t < f.readyAt) continue;
      // a wrecked post is left at once; one under heavy fire only now and then (moving under fire is worse than staying behind cover)
      if (f.post && f.post.kind !== 'open' && (f.post.wrecked || (f.post.fire > (f.vet ? 14 : 9) && t - (f.movedAt ?? -99) > 20 && r() < 0.15))) { const old = f.post; old.fire = 0; say(t, old.wrecked ? v(f, ['It\'s gone — the whole thing\'s gone — I\'m getting out of here!', 'Shit — it\'s on fire — moving back!'], ['Position\'s gone. Falling back.']) : v(f, ['They\'re all shooting at me — fuck — I\'m moving!', 'I can\'t stay here — I can\'t — moving back!'], ['Too hot. Moving. Cover me.']), f); assignPost(f, t, old); continue; }
      if (f.grenades > 0) {
        const tg = rUp.find(x => dist(x, f) <= GRENADE_RANGE);
        if (tg) { f.grenades--; say(t, v(f, ['Throwing it — get down, get DOWN!', 'Here goes — everybody down!'], ['Frag out!']), f); ev.push({ t, kind: 'throw', from: f.id, x: r2(tg.x), z: r2(tg.z), what: 'grenade' }); explode(tg.x + (r() - 0.5), tg.z + (r() - 0.5), t + 2, 1.5); continue; }
      }
      if (r() > f.arm.rate * (0.5 + 0.5 * eff(f))) continue;     // and slower
      // threat: close, carrying explosives, caught in the open; only those in front of the post and in range
      const seen = rUp.filter(x => dist(x, f) <= f.arm.range && (f.post?.kind !== 'building' || (x.x - f.x) * ax + (x.z - f.z) * az > -1));
      if (!seen.length) continue;
      const tg = seen.map(x => ({ x, s: -dist(x, f) + (x.grenades || x.rockets ? 15 : 0) + (x.moving ? 8 : 0) })).sort((a, b) => b.s - a.s)[0].x;
      shoot(f, tg, t + r() * 0.9);
    }
    // the medic drags the wounded in
    const down = H.find(f => f.out && !f.dead && !f.shelter && !f.rescued);
    const helpers = H.filter(f => !f.out && !f.shelter && t >= f.readyAt);
    // the medic goes; without one, whoever's closest (only if it doesn't leave the line empty)
    const med = helpers.find(f => f.medic) ?? (down && helpers.length > 1 ? helpers.sort((a, b) => dist(a, down) - dist(b, down))[0] : undefined);
    if (alarmed && med && down && !breached && !med.medic) {
      down.rescued = true;
      ev.push({ t: r2(t + 0.4), kind: 'move', unit: med.id, x: r2(down.x), z: r2(down.z) });
      say(t + 0.5, v(med, [`${nameOf(down)}!! Oh God — hold on, I'm coming! Somebody shoot!`, `I've got ${nameOf(down)} — I don't know what I'm doing — just keep them back!`], [`Cover me. Getting ${nameOf(down)}.`]), med);
      say(t + 4, v(med, [`Where's it coming from — oh God — I'm pressing, I'm pressing —`, `You're okay, you're okay — look at me — LOOK AT ME —`], [`Pressure's on. You're going to be fine.`]), med);
      stopBleed(down, med, t + 4, !!med.vet);
      toShelter(down, t + 4.5);
      med.readyAt = t + 8;
      ev.push({ t: r2(t + 4.6), kind: 'move', unit: med.id, x: r2(med.post?.x ?? med.x), z: r2(med.post?.z ?? med.z) });
    } else if (alarmed && med && down && !breached) {
      down.rescued = true;
      ev.push({ t: r2(t + 0.4), kind: 'move', unit: med.id, x: r2(down.x), z: r2(down.z) });
      say(t + 0.5, v(med, [`${nameOf(down)}! Hold on — I'm coming! Somebody cover me!`, `I'm getting ${nameOf(down)} — shoot at them, keep them down!`], [`Cover me. Getting ${nameOf(down)}.`]), med);
      say(t + 3.2, v(med, [`Stay with me, ${nameOf(down)}. Stay with me. Press here — hard — HARD.`, `I've got you — you're gonna be okay — oh God, there's so much —`], [`Got you, ${nameOf(down)}. Pressure on it. Don't move.`]), med);
      stopBleed(down, med, t + 3, true);
      toShelter(down, t + 3);
      med.readyAt = t + 6;
      ev.push({ t: r2(t + 3.3), kind: 'move', unit: med.id, x: r2(med.post?.x ?? med.x), z: r2(med.post?.z ?? med.z) });
    }

    // raiders
    // morale: desperate people with guns break at the first real resistance; an organized crew takes losses
    const losses = R.filter(f => f.out || f.dry).length;
    let firstBlood = false;
    if (!shaken && !fled && !breached && org < 0.35 && losses > 0 && t < 40) { shaken = true; firstBlood = r() < 0.4; }
    // a break-in: they run at the first shot from the family, or soon after they find someone awake and facing them
    const peaceBreak = peace && alarmed && (losses > 0 || t >= 10 || ev.some(e => e.kind === 'shot' && e.from.startsWith('h_')));
    if (!fled && !breached && rUp.length && (losses >= Math.max(1, raiders * (0.25 + 0.3 * org)) || R[0].out || firstBlood || peaceBreak)) {
      fled = true;
      const l1 = lead();
      t += 1;   // after this second's shots land
      say(t, v(l1, R[0].out ? ['Their guy\'s down — they\'re running! They\'re RUNNING!', 'They\'re leaving — oh thank God, they\'re leaving —'] : ['They\'re running — they\'re running!', 'Are they — they\'re pulling back!'], ['They\'re breaking contact. Hold your fire, stay on your spots.']), l1);
      if (!R[0].out) say(t + 0.5, pick(['Fall back! Fall back!', 'Fuck this — it\'s not worth it, go!']), R[0]);
      for (const f of rUp) { f.fled = true; const p = at(36, (r() - 0.5) * 10); ev.push({ t: r2(t + r()), kind: 'flee', unit: f.id }); ev.push({ t: r2(t + 1), kind: 'move', unit: f.id, x: r2(p.x), z: r2(p.z) }); }
      end = 'fled'; endT = t + 8; break;
    }
    if (!rUp.length) { end = 'repelled'; endT = t + 3; break; }
    // they can't get over the wall and give up
    if (!breached && wallR && !wallDown && lineSince >= 0 && t - lineSince > 40) { say(t, v(lead(), ['They can\'t get over the wall — they\'re giving up — oh my God —'], ['They can\'t breach. They\'re pulling out.']), lead()); for (const f of rUp) { f.fled = true; ev.push({ t: r2(t + r()), kind: 'flee', unit: f.id }); } end = 'fled'; endT = t + 6; break; }
    const climbing0 = wallR > 0 && !wallDown;
    // the weak side: which flank has fewer defenders
    const leftDef = hUp.filter(h => (h.x - C.x) * lx + (h.z - C.z) * lz > 0).length;
    const flank = leftDef > hUp.length / 2 ? -1 : 1;
    for (const [k, f] of rUp.entries()) {
      const d = dist(f, C);
      if (f.dry) { f.fled = true; ev.push({ t, kind: 'flee', unit: f.id }); if (r() < 0.5) say(t, pick(['I\'m dry! I\'m out!', 'No ammo — I\'m outta here!']), f); continue; }
      if (t < f.readyAt) continue;
      if (breached) {
        // inside: go for the house, shoot anyone not in a hard shelter
        if (d > 1.2) { const s2 = Math.min(MOVE, d - 1); f.x += (C.x - f.x) / d * s2; f.z += (C.z - f.z) / d * s2; if (t % 3 === 0) ev.push({ t, kind: 'move', unit: f.id, x: r2(f.x), z: r2(f.z) }); }
        const tg = H.filter(h => !h.dead && !h.escaped && !(h.shelter && hardShelter) && dist(h, f) <= f.arm.range + 3).sort((a, b) => dist(a, f) - dist(b, f))[0];
        if (tg && r() < f.arm.rate) { if (tg.shelter) tg.cover = 0.5; shoot(f, tg, t + r() * 0.9); }
        continue;
      }
      // rockets at the best post in range
      if (f.rockets > 0 && alarmed) {
        const pt = posts.find(p => !p.wrecked && p.kind !== 'open' && H.some(h => h.post === p && !h.out) && dist(p, f) <= ROCKET_RANGE);
        if (pt) {
          f.rockets--; say(t - 0.3, v(lead(), ['Is that — RPG! RPG! GET DOWN!', 'Oh shit — they\'ve got a rocket —'], ['RPG! Get off the tower!']), lead()); ev.push({ t, kind: 'rocket', from: f.id, x: r2(pt.x), z: r2(pt.z), ...(pt.y ? { y: pt.y } : {}) });
          const onTarget = r() < 0.6;
          explode(pt.x + (onTarget ? 0 : (r() - 0.5) * 3), pt.z + (onTarget ? 0 : (r() - 0.5) * 3), t + 1, 1.2, onTarget ? pt : undefined);
          continue;
        }
      }
      // grenades within ~30 m
      if (f.grenades > 0) {
        const tg = hUp.find(h => dist(h, f) <= GRENADE_RANGE);
        if (tg) { f.grenades--; say(t + 0.3, v(tg, ['GRENADE! Oh fuck — get DOWN!', 'Something landed — GRENADE!'], ['Grenade!']), tg); ev.push({ t, kind: 'throw', from: f.id, x: r2(tg.x), z: r2(tg.z), what: 'grenade' }); explode(tg.x + (r() - 0.5), tg.z + (r() - 0.5), t + 2, 1.5, tg.post && r() < 0.4 ? tg.post : undefined); continue; }
      }
      // bounding: half move while half suppress; swap each bound
      const movers = Math.floor(t / 4) % 2 === k % 2;
      const pinned = f.supp > (org > 0.5 ? 5 : 3);   // rounds snapping past: heads down, nobody moves
      if (movers && !pinned && d > lineR + 0.5 && t >= f.nextMove) {
        f.moving = true; f.cover = 1.3;
        const step = Math.min(4, d - lineR);
        const lat = (r() - 0.5) * 2 + flank * 0.8;
        f.x += (C.x - f.x) / d * step + lx * lat; f.z += (C.z - f.z) / d * step + lz * lat;
        f.nextMove = t + 4;
        ev.push({ t, kind: 'move', unit: f.id, x: r2(f.x), z: r2(f.z) });
        const nd = dist(f, C);
        // the mined band
        if (minesLeft > 0 && d > mineR && nd <= mineR && r() < Math.min(0.85, 0.2 + minesLeft * 0.1)) {
          minesLeft--;
          const hits = rUp.filter(o => dist(o, f) <= 1.5).map(o => o.id);
          ev.push({ t: r2(t + 2), kind: 'mine', x: r2(f.x), z: r2(f.z), hits });
          for (const o of rUp) if (hits.includes(o.id)) hurt(o, (70 + r() * 50) * (o === f ? 1 : 0.6), t + 2);
        }
      } else if (f.moving && t >= f.nextMove - 1) {
        f.moving = false;
        // at the wall, going over it, nobody has cover
        if (climbing0 && d <= lineR + 0.8) f.cover = 0.9;
        else { f.cover = 0.3; ev.push({ t, kind: 'cover', unit: f.id, x: r2(f.x), z: r2(f.z) }); }
      } else if (alarmed || t > 2) {
        const tg = hUp.filter(h => dist(h, f) <= f.arm.range && h.readyAt <= t + 2).sort((a, b) => a.cover - b.cover || dist(a, f) - dist(b, f))[0];
        if (tg && r() < f.arm.rate) shoot(f, tg, t + r() * 0.9);
      }
    }
    // the line: a breach when they're at it and the defense is down, outnumbered, or the wall is blown
    const atLine = rUp.filter(f => !f.out && dist(f, C) <= lineR + 0.8);
    if (atLine.length && lineSince < 0) lineSince = t;
    const hNow = H.filter(f => !f.out && !f.shelter && f.arm !== FISTS).length;
    // a wall takes time to get over (a ladder, bolt cutters, a truck): ~10 s at it, exposed, before the first are across
    const climbing = wallR > 0 && !wallDown;
    if (!breached && !peace && atLine.length && (wallDown || hNow === 0 || rUp.length > hNow * 2) && (!climbing || (t - lineSince >= 10 && r() < 0.02 * atLine.length))) {
      breached = true; breachT = t;
      const p = at(lineR, 0);
      ev.push({ t, kind: 'breach', x: r2(p.x), z: r2(p.z) });
      say(t, v(lead(), ['They\'re inside the fence — fuck! Get to the house!', 'They\'re through — they\'re through! Oh God —'], ['They\'re through the line. Fall back to the house.']), lead());
      // the escape tunnel: whoever's sheltering gets out, away from the fighting
      const tunnel = s.perimeter.find(x => x.kind === 'escape_tunnel' && runFinished(x));
      const out = tunnel?.pts[tunnel.pts.length - 1];
      const fleeing = H.filter(h => h.shelter && !h.dead);
      if (out && fleeing.length) {
        say(t + 1, v(lead(), ['Take the kids — the tunnel — go, go, GO! Don\'t look back!', 'Get them out through the tunnel — NOW!'], ['Shelter group: out through the tunnel. Go.']), lead());
        for (const h of fleeing) { h.escaped = true; h.x = out[0]; h.z = out[1]; ev.push({ t: r2(t + 2 + r()), kind: 'move', unit: h.id, x: r2(out[0]), z: r2(out[1]) }); }
      }
    }
    if (breached && t - breachT >= 20) {
      end = H.some(f => !f.out && !f.shelter) ? 'breached' : 'overrun'; endT = t + 2;
      if (H.filter(f => !f.dead && !f.shelter).length === 0 && H.every(f => f.out || f.shelter)) end = 'overrun';
    }
    if (breached && !H.some(f => !f.out && !f.shelter) && t - breachT >= 8) { end = 'overrun'; endT = t + 2; }
  }
  if (!end) { end = breached ? 'breached' : 'repelled'; endT = 300; }
  if (!alarmed) ev.push({ t: 0, kind: 'alarm', what });
  const duration = Math.max(endT, ...ev.map(e => e.t)) + 1;
  ev.push({ t: duration, kind: 'end', result: end });
  ev.sort((a, b) => a.t - b.t);
  const dropped = { grenades: R.filter(f => f.out).reduce((a, f) => a + f.grenades, 0), rpg_rounds: R.filter(f => f.out).reduce((a, f) => a + f.rockets, 0) };
  const leftBehind = { wounded: R.filter(f => f.out && !f.dead).length, dead: R.filter(f => f.dead).length };
  return { night, units, events: ev, duration, spent, minesUsed: mines - minesLeft, dropped, result: end, leftBehind };
}

/** Write a fought battle into the game: wounds, deaths, ammo, mines, loot, the tallies. */
export function applyBattle(s: GameState, b: Battle): string[] {
  const out: string[] = [];
  const pb = b as Partial<PlannedBattle>;
  const endEv = b.events.find(e => e.kind === 'end');
  const result = endEv && endEv.kind === 'end' ? endEv.result : 'repelled';
  const day = Math.floor(s.clock.t);
  const byUnit = new Map(b.units.filter(u => u.personId).map(u => [u.id, u.personId!]));
  const idx = (unit: string) => s.people.findIndex(p => p.id === byUnit.get(unit));
  for (const e of b.events) {
    if (e.kind === 'wound' && byUnit.has(e.unit)) {
      const i = idx(e.unit); if (i < 0) continue;
      const nd = s.personState[i].needs;
      if (e.stopped) { if (nd.died == null) { nd.hurt.push({ what: 'bruised ribs (the armor stopped a round)', sev: 8 }); out.push(`${s.people[i].first}'s armor stopped a round.`); } continue; }
      // a tourniquet or chest seal from an IFAK on the spot
      let sev = e.sev;
      if (s.stock.ifak >= 1) { s.stock.ifak -= 1; sev = Math.round(sev * 0.7); }
      if (nd.died != null) continue;
      nd.hurt.push({ what: !e.part ? 'hit by shrapnel' : e.part === 'head' ? 'head wound' : e.part === 'torso' ? 'shot in the body' : e.sev < 30 ? 'grazed by a bullet' : `shot in the ${e.part}`, sev, trauma: true });
      nd.health = Math.max(s.disaster.difficulty === 'cozy' ? 5 : 1, nd.health - sev * 0.5);
      out.push(`${s.people[i].first} was wounded.`);
    } else if (e.kind === 'death' && byUnit.has(e.unit)) {
      const i = idx(e.unit); if (i < 0) continue;
      const nd = s.personState[i].needs;
      if (s.disaster.difficulty === 'cozy') { nd.hurt.push({ what: 'badly wounded in the fight', sev: 80, trauma: true }); nd.health = 5; out.push(`${s.people[i].first} was badly wounded.`); continue; }
      nd.health = 0; nd.died = day;
      out.push(`${s.people[i].first} was killed.`);
    }
  }
  let rounds = 0;
  for (const [cal, nn] of Object.entries(pb.spent ?? {}) as Array<[Caliber, number]>) { s.armory.ammo[cal] = Math.max(0, (s.armory.ammo[cal] ?? 0) - nn); rounds += nn; }
  if (rounds) {
    out.push(`${rounds} rounds fired.`);
    for (const gun of s.armory.guns) { gun.fired += Math.round(rounds / Math.max(1, s.armory.guns.length)); gun.condition = Math.max(0, gun.condition - 0.01); }
  }
  if (pb.minesUsed) { s.stock.mines = Math.max(0, (s.stock.mines ?? 0) - pb.minesUsed); out.push(`${pb.minesUsed} mine${pb.minesUsed > 1 ? 's' : ''} went off.`); }
  const thrown = b.events.filter(e => e.kind === 'throw' && e.from.startsWith('h_')).length;
  if (thrown) s.stock.grenades = Math.max(0, (s.stock.grenades ?? 0) - thrown);
  if (result === 'breached' || result === 'overrun') {
    s.gate.raidsLost++;
    const share = result === 'overrun' ? 0.6 : 0.3;
    const lost: string[] = [];
    for (const k of ['canned', 'staples', 'frozen', 'fuel', 'meds'] as const) { const t = Math.floor((s.stock[k] ?? 0) * share); if (t > 0) { s.stock[k] -= t; lost.push(`${t} ${k}`); } }
    if (lost.length) out.push(`Lost: ${lost.join(', ')}`);
  } else {
    s.gate.raidsHeld++;
    if (pb.leftBehind) leaveAftermath(s, pb.leftBehind.wounded, pb.leftBehind.dead);
    const d = pb.dropped;
    if (d && (d.grenades || d.rpg_rounds)) {
      s.stock.grenades = (s.stock.grenades ?? 0) + d.grenades;
      s.stock.rpg_rounds = (s.stock.rpg_rounds ?? 0) + d.rpg_rounds;
      out.push(`Recovered from the fallen: ${[d.grenades ? `${d.grenades} grenade${d.grenades > 1 ? 's' : ''}` : '', d.rpg_rounds ? `${d.rpg_rounds} rocket${d.rpg_rounds > 1 ? 's' : ''}` : ''].filter(Boolean).join(', ')}.`);
    }
  }
  return out;
}
