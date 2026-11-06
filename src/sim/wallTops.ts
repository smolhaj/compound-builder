/**
 * Wall tops and weak spots (docs/sa_home_security.md, principles 3 and 4; docs/DECISIONS.md "Wall tops and weak spots").
 * What South African estates put on top of a wall, and what lets a climber go round it. Pure (tested). Every number is tunable and lives in `WALL_TOP`.
 *
 *  Electric fence   outriggers on a finished wall or fence carrying live wires. While it has power it shocks and slows a climber, and a cut or a
 *                   climb is an alarm (more warning). It needs the grid or on-site power; a battery backup (option) rides out `BACKUP_DAYS` of mains
 *                   outage, then it is only wires. Never on the same run as razor wire (razor cannot be electrified). Installed by a certified
 *                   person while the county works (a fee and a certificate); a self-install risks the inspector. Yellow signs come with it.
 *  Razor coils      cheap, no power: slow a climber, snag him. In a strict county in peacetime the inspector may order them down once.
 *  Weak spots       a house or outbuilding within a step of a wall, a tree within reach, brush grown up against it: a climber bypasses the wall there,
 *                   so the run stops fewer people (capped), and brush degrades the cameras and shorts the fence until it is trimmed.
 *  Brush            grows in the growing season (`runBrush`), is cut back by hand (`trimRun`, hours of work).
 *
 * The defensive parts are monotone (they only ever help a raid outcome: tests in monotone.test.ts); the weak spots are a maintenance hazard that
 * only ever takes away from the wall they stand at, never from a lot without them.
 */
import { hasAll, shortfall, waitingFor, type MaterialId, type Stock } from './materials';
import { log } from './economy';
import { PERIMETER, fenceLive, runFinished, wallLength, type PerimeterKind, type PerimeterRun, type Pt } from './perimeter';
import { calendarOf, dayIndex, type GameState } from './state';
import { isTower } from './towers';
import { NODE_R } from './utilities';
import { COUNTY, countyWorks } from './paperwork';
import { mulberry32 } from './rng';
import { lengthText } from './units';

export const WALL_TOP = {
  ELECTRIC: {
    /** Per 6 m of run: wire, cable and hardware for the outriggers, insulators and the earth return. */
    MATERIALS: { wire: 0.12, cable: 0.1, hardware: 0.06 } as Partial<Record<MaterialId, number>>,
    HOURS: 2.2,
    /** Energizer, alarm interface and the certified installer's visit (a flat fee per run). */
    ENERGIZER_USD: 650,
    /** Compliance certificate (SANS 10222-3 in the real world): paid to a certified installer while the county works. */
    CERT_USD: 250,
    /** The optional sealed battery that keeps it live in a mains outage. */
    BACKUP_USD: 400,
    BACKUP_DAYS: 2,
    /** Added to what the run stops (to CAP) while live; dark wires stop a little (DARK). */
    PEOPLE: 0.1, DARK: 0.02, CAP: 0.99,
    /** Detection added to the posture at the wall while at least `MIN_M` metres of it are live (a cut or a climb trips the alarm). */
    DETECT: 8, MIN_M: 30,
    /** Opportunists deterred by the signs on a live fence (the `deter` of a warning, never against an organized crew). */
    SIGNS_DETER: 6,
    /** A climber's chance multiplier per second at the line while live / dark. */
    CLIMB_LIVE: 0.55, CLIMB_DARK: 0.9,
    /** Battle hazard while live: the shock (chance per raider at the line per second, hp). */
    SHOCK: { p: 0.14, min: 20, max: 60 },
    /** A fence in brush: the shock and the added stop lose this share at full brush. */
    BRUSH_LOSS: 0.6,
    /** The wall tiers that can carry it (not a wall with its own wire; nothing to hold the outriggers on a hedge or a berm). */
    HOSTS: ['chain_link', 'wrought_iron', 'bar_fence', 'container_wall', 'container_stack', 'stone_wall', 'concrete_wall', 'log_palisade'] as readonly PerimeterKind[],
  },
  RAZOR: {
    CLIMB: 0.8,
    /** Battle hazard of the coil on top, on top of the wall's own: chance per raider per second, hp. */
    SNAG: { p: 0.05, min: 10, max: 30 },
    /** County inspector (peacetime only, `strict` counties): chance per day, scaled by strictness, to order a coil down once. */
    ORDER_CHANCE: 0.002, ORDER_STRICT: 1, FINE_USD: 400,
  },
  WEAK: {
    /** A building's edge or a tree's trunk this close to a wall's line (world units, 1 ≈ 6 m) lets a climber step over it. */
    REACH: 0.3,
    /** Each costs this much of what the run stops, up to MAX (0.2 of a 0.9 wall: 90 down to 70). */
    PER: 0.04, MAX: 0.2,
    /** A wall below this is climbed anyway; weak spots only matter at a wall, not a ground-level fence. */
    MIN_HEIGHT: 0.3,
    /** A climb's chance multiplier per point of penalty above 0 (1 + K × penalty: 0.2 gives 1.4). */
    CLIMB_K: 2,
  },
  BRUSH: {
    /** Fraction of full brush grown per day at the height of the growing season. */
    GROW: 0.006,
    /** Growing season (day of year): sine between START and END. */
    START: 90, END: 290,
    /** Past this the camera sees less and a tall run starts to count as a weak spot (a climber hides in it). */
    OVERGROWN: 0.5,
    /** Cameras lose this share of their reach at full brush on the average wall. */
    CAMERA_LOSS: 0.4,
    /** Hours of work to cut back a world unit (6 m) of wall, with a brush cutter. */
    TRIM_HOURS: 1.2,
  },
} as const;

// ── what a run carries ──
export const isElectricTop = (r: Pick<PerimeterRun, 'electric'>): boolean => !!r.electric;

/** Metres of finished electric fence on the place (live or not). */
export const electricMetres = (s: GameState): number => Math.round(s.perimeter.reduce((a, r) => a + (r.electric && runFinished(r) ? wallLength(r) * 6 : 0), 0));

/** Is this electric top live right now? Mains (the grid, or lit on-site power) always; the backup battery for `BACKUP_DAYS` after the mains went. */
export function topLive(s: GameState, r: Pick<PerimeterRun, 'electric' | 'backup' | 'darkSince'>): boolean {
  if (!r.electric) return false;
  if (fenceLive(s)) return true;
  return !!r.backup && r.darkSince !== undefined && s.clock.t - r.darkSince < WALL_TOP.ELECTRIC.BACKUP_DAYS;
}

/** How much brush stands against this run (0–1). */
export const brushOf = (r: Pick<PerimeterRun, 'brush'>): number => Math.max(0, Math.min(1, r.brush ?? 0));

/** What the top of a run adds to what it stops (monotone: never negative). A fence in brush gives up some of its bonus. */
export function topBonus(s: GameState, r: PerimeterRun, base: number): number {
  const E = WALL_TOP.ELECTRIC;
  if (r.electric) {
    if (base < 0.5) return 0;
    const live = topLive(s, r) ? E.PEOPLE * (1 - E.BRUSH_LOSS * brushOf(r)) : E.DARK;
    return Math.min(E.CAP, base + live) - base;
  }
  return 0;
}

// ── installing ──
export const electricBill = (len: number): Partial<Stock> => {
  const out: Partial<Stock> = {};
  for (const [k, v] of Object.entries(WALL_TOP.ELECTRIC.MATERIALS) as Array<[MaterialId, number]>) out[k] = Math.max(1, Math.ceil(v * len - 1e-9));
  return out;
};
export const electricHours = (len: number): number => WALL_TOP.ELECTRIC.HOURS * len;
/** The installer's cash bill: energizer, plus the certificate while the county works, plus the backup battery if asked. */
export function electricCash(s: GameState, backup: boolean): number {
  const E = WALL_TOP.ELECTRIC;
  return E.ENERGIZER_USD + (countyWorks(s) ? E.CERT_USD : 0) + (backup ? E.BACKUP_USD : 0);
}

/** Why a run can't take an electric fence now (null = it can). */
export function electricProblem(s: GameState, r: PerimeterRun, backup = false): string | null {
  const E = WALL_TOP.ELECTRIC;
  if (!E.HOSTS.includes(r.kind)) return PERIMETER[r.kind].blocks.people < 0.5 ? 'nothing to hang outriggers on: it stops nobody' : 'this wall already carries its own wire (or is not a wall)';
  if (!runFinished(r)) return 'it is not finished yet';
  if (r.electric) return 'it already has an electric fence';
  if (r.razor) return 'razor wire cannot be electrified: take it down first';
  if (r.replaces) return 'this wall is an upgrade in progress';
  if (!hasAll(s.stock, electricBill(wallLength(r)))) return `waiting for ${waitingFor(shortfall(s.stock, electricBill(wallLength(r))) as Partial<Record<MaterialId, number>>)}`;
  if (s.money < electricCash(s, backup)) return `needs $${electricCash(s, backup).toLocaleString('en-US')} for the energizer${countyWorks(s) ? ' and the certificate' : ''}`;
  return null;
}

/** Fit outriggers, wires, an energizer and yellow signs along a finished run. Null on success, else why not. */
export function addElectric(s: GameState, runId: string, backup = false): string | null {
  const r = s.perimeter.find(x => x.id === runId);
  if (!r) return 'no such wall';
  const why = electricProblem(s, r, backup);
  if (why) return why;
  const len = wallLength(r);
  for (const [k, v] of Object.entries(electricBill(len)) as Array<[MaterialId, number]>) s.stock[k] -= v;
  s.money -= electricCash(s, backup);
  r.electric = true;
  if (backup) r.backup = true;
  if (!countyWorks(s)) r.noCert = true;   // nobody to certify it: it is a home install
  log(s, `The family hung an electric fence on outriggers along the top of the ${PERIMETER[r.kind].name.toLowerCase()} (${lengthText(len * 6)}, about ${Math.round(electricHours(len))} h)${r.noCert ? '' : ', with the installer\'s certificate'}. Yellow warning signs go on every post.`);
  return null;
}

/** Add the battery backup to a fence that has none. */
export function addBackup(s: GameState, runId: string): string | null {
  const r = s.perimeter.find(x => x.id === runId);
  if (!r || !r.electric) return 'no electric fence there';
  if (r.backup) return 'it already has a battery backup';
  if (s.money < WALL_TOP.ELECTRIC.BACKUP_USD) return `needs $${WALL_TOP.ELECTRIC.BACKUP_USD} for the battery`;
  s.money -= WALL_TOP.ELECTRIC.BACKUP_USD;
  r.backup = true;
  log(s, 'A sealed battery went in beside the energizer: the fence rides out a power cut.');
  return null;
}

// ── the posture: detection and deterrence from the tops ──
/** Live electric metres right now. */
export function liveMetres(s: GameState): number {
  return Math.round(s.perimeter.reduce((a, r) => a + (r.electric && runFinished(r) && topLive(s, r) ? wallLength(r) * 6 : 0), 0));
}
/** What the tops add at the gate: detection (a cut or climb trips the alarm), deterrence of opportunists (the signs), and the cameras' loss to brush (negative detection). */
export function wallTopPosture(s: GameState): { detection: number; signsDeter: number; cameraLoss: number } {
  const E = WALL_TOP.ELECTRIC;
  const live = liveMetres(s) >= E.MIN_M;
  const finished = s.perimeter.filter(r => runFinished(r) && PERIMETER[r.kind].blocks.people >= 0.5 && PERIMETER[r.kind].height >= WALL_TOP.WEAK.MIN_HEIGHT);
  const len = finished.reduce((a, r) => a + wallLength(r), 0);
  const brush = len > 0 ? finished.reduce((a, r) => a + brushOf(r) * wallLength(r), 0) / len : 0;
  return { detection: live ? E.DETECT : 0, signsDeter: live ? E.SIGNS_DETER : 0, cameraLoss: Math.round(WALL_TOP.BRUSH.CAMERA_LOSS * brush * 100) / 100 };
}

/** The outermost run's top, for the battle: what bites a climber and slows him. */
export function topClimb(s: GameState, r: PerimeterRun | undefined): { climb: number; hazards: Array<{ p: number; min: number; max: number; what: string; lines: string[] }> } {
  if (!r) return { climb: 1, hazards: [] };
  const E = WALL_TOP.ELECTRIC, R = WALL_TOP.RAZOR;
  if (r.electric) {
    const live = topLive(s, r), k = 1 - E.BRUSH_LOSS * brushOf(r);
    return {
      climb: live ? E.CLIMB_LIVE + (1 - E.CLIMB_LIVE) * (1 - k) : E.CLIMB_DARK,
      hazards: live ? [{ p: E.SHOCK.p * k, min: E.SHOCK.min, max: E.SHOCK.max, what: 'live wire', lines: ['AAAGH — it\'s LIVE — the top is electrified —', 'I can\'t let go — oh God —', 'Don\'t touch the top — don\'t TOUCH it!'] }] : [],
    };
  }
  if (r.razor) return { climb: R.CLIMB, hazards: [{ p: R.SNAG.p, min: R.SNAG.min, max: R.SNAG.max, what: 'razor coils', lines: ['Razor wire — Jesus — it\'s on top —', 'The coils — my hands — AGH —'] }] };
  return { climb: 1, hazards: [] };
}

// ── weak spots ──
export interface WeakSpot { kind: 'building' | 'tree' | 'brush'; x: number; z: number; runId: string; note: string; id?: number }
export interface TreeLite { id: number; x: number; z: number; scale?: number }

function segDist(px: number, pz: number, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - (a[0] + dx * t), pz - (a[1] + dz * t));
}
/** Distance from a point to the nearest built stretch of a run (a gate gap is not wall, but the stretch is close enough: gates are checked by the gate rules). */
function runDist(r: PerimeterRun, x: number, z: number): { d: number; at: Pt } {
  let best = Infinity, at: Pt = r.pts[0];
  for (let i = 1; i < r.pts.length; i++) {
    const d = segDist(x, z, r.pts[i - 1], r.pts[i]);
    if (d < best) { best = d; at = [x, z]; }
  }
  return { d: best, at };
}
/** A run a climber has to get over, where a step-over matters: a finished wall or tall fence, not a ditch, a hedge or a fence at ground level. */
export const climbable = (r: PerimeterRun): boolean => {
  const d = PERIMETER[r.kind];
  return runFinished(r) && r.pts.length > 1 && d.blocks.people >= 0.5 && d.height >= WALL_TOP.WEAK.MIN_HEIGHT && !d.walkway && !d.wallTop && d.height > 0 && r.kind !== 'thorn_hedge' && r.kind !== 'creek_bars' && r.kind !== 'covered_bridge';
};
/** Structures that can be a way over a wall: homes and outbuildings, not the defenses themselves (towers, decks, the gate garage) or what is underground. */
export function stepStructure(kind: string): boolean {
  return !isTower(kind) && !kind.startsWith('bunker_') && kind !== 'vehicle_yard' && kind !== 'gate_garage' && kind !== 'garden' && kind !== 'field' && kind !== 'orchard' && kind in NODE_R;
}

/** The buildings (and trees, if the world gives them) within a step of each climbable run. Brush is a run-wide state, listed once per run at its midpoint when past OVERGROWN. */
export function weakSpots(s: GameState, trees: readonly TreeLite[] = []): WeakSpot[] {
  const out: WeakSpot[] = [];
  for (const r of s.perimeter) {
    if (!climbable(r)) continue;
    for (const st of s.structures) {
      if (!stepStructure(st.kind) || st.stage === 0 && st.done === 0) continue;
      const { d } = runDist(r, st.x, st.z);
      if (d - (NODE_R[st.kind] ?? 0.5) <= WALL_TOP.WEAK.REACH) out.push({ kind: 'building', x: st.x, z: st.z, runId: r.id, note: `a ${st.kind.replace(/_/g, ' ')} stands within a step of the ${PERIMETER[r.kind].name.toLowerCase()}: a climber goes from its roof onto the wall` });
    }
    for (const t of trees) {
      if (s.forestry.cleared.includes(t.id)) continue;
      if ((t.scale ?? 1) < 0.5) continue;
      const { d } = runDist(r, t.x, t.z);
      if (d <= WALL_TOP.WEAK.REACH + 0.15 * (t.scale ?? 1)) out.push({ kind: 'tree', x: t.x, z: t.z, runId: r.id, id: t.id, note: 'a tree reaches over the wall: a climber uses a branch to bypass it' });
    }
    if (brushOf(r) >= WALL_TOP.BRUSH.OVERGROWN) {
      const mid = r.pts[Math.floor(r.pts.length / 2)];
      out.push({ kind: 'brush', x: mid[0], z: mid[1], runId: r.id, note: `brush has grown up against the ${PERIMETER[r.kind].name.toLowerCase()}: it hides a climber and shades the cameras` });
    }
  }
  return out;
}

/** What weak spots take from what one run stops (0 to MAX). Buildings and overgrowth only (the sim has no trees; the world feeds them to `weakSpots` for the overlay and the felling). */
export function weakPenalty(s: GameState, r: PerimeterRun): number {
  if (!climbable(r)) return 0;
  let n = 0;
  for (const st of s.structures) {
    if (!stepStructure(st.kind) || st.stage === 0 && st.done === 0) continue;
    if (runDist(r, st.x, st.z).d - (NODE_R[st.kind] ?? 0.5) <= WALL_TOP.WEAK.REACH) n++;
  }
  const over = brushOf(r) >= WALL_TOP.BRUSH.OVERGROWN ? 1 : 0;
  return Math.min(WALL_TOP.WEAK.MAX, WALL_TOP.WEAK.PER * (n + over) + 0.1 * Math.max(0, brushOf(r) - WALL_TOP.BRUSH.OVERGROWN));
}

/** The worst penalty on the run the raid meets first, as a climbing multiplier (battle.ts). */
export const climbPenaltyK = (s: GameState, r: PerimeterRun | undefined): number => (r ? 1 + WALL_TOP.WEAK.CLIMB_K * weakPenalty(s, r) : 1);

// ── brush and the daily tick ──
/** How much of a day's growth the calendar gives (0 in winter, 1 at midsummer). */
export function growthSeason(doy: number): number {
  const { START, END } = WALL_TOP.BRUSH;
  if (doy <= START || doy >= END) return 0;
  return Math.sin(Math.PI * (doy - START) / (END - START));
}

/** Cut the brush back along a run: hours of work, logged. Null on success. */
export function trimRun(s: GameState, runId: string): string | null {
  const r = s.perimeter.find(x => x.id === runId);
  if (!r || !runFinished(r)) return 'no such wall';
  if (brushOf(r) < 0.05) return 'it is clear already';
  const len = wallLength(r);
  r.brush = 0;
  log(s, `The family cut back the brush along the ${PERIMETER[r.kind].name.toLowerCase()} (${lengthText(len * 6)}, about ${Math.round(WALL_TOP.BRUSH.TRIM_HOURS * len)} h).`);
  return null;
}
export const trimAll = (s: GameState): number => { let n = 0; for (const r of s.perimeter) if (climbable(r) && brushOf(r) >= 0.05 && !trimRun(s, r.id)) n++; return n; };
export const trimHours = (r: PerimeterRun): number => Math.round(WALL_TOP.BRUSH.TRIM_HOURS * wallLength(r));

/** Once a day: brush grows, a mains outage starts the backup's clock, the county looks at the razor and the uncertified fence. */
export function wallTopsDay(s: GameState): string[] {
  const out: string[] = [];
  const doy = calendarOf(s.clock).doy, grow = WALL_TOP.BRUSH.GROW * growthSeason(doy);
  const mains = fenceLive(s);
  const rnd = mulberry32(s.seed * 7127 + dayIndex(s.clock.t) * 13 + 5);
  const works = countyWorks(s), strict = COUNTY[s.site.region].strict;
  for (const r of s.perimeter) {
    if (!runFinished(r)) continue;
    if (climbable(r) && grow > 0) {
      const was = brushOf(r);
      r.brush = Math.min(1, was + grow);
      if (was < WALL_TOP.BRUSH.OVERGROWN && r.brush >= WALL_TOP.BRUSH.OVERGROWN) out.push(`Brush has grown up against the ${PERIMETER[r.kind].name.toLowerCase()}: it hides a climber, shades the cameras${r.electric ? ' and shorts the fence' : ''}. Cut it back.`);
    }
    if (r.electric) {
      if (mains) { if (r.darkSince !== undefined) delete r.darkSince; }
      else if (r.darkSince === undefined) {
        r.darkSince = s.clock.t;
        out.push(r.backup ? 'The power is out. The fence runs on its battery.' : 'The power is out and the electric fence is dead: it is only wires on the wall until the lights come back.');
      } else if (r.backup && s.clock.t - r.darkSince >= WALL_TOP.ELECTRIC.BACKUP_DAYS && s.clock.t - r.darkSince < WALL_TOP.ELECTRIC.BACKUP_DAYS + 1) out.push('The fence battery is flat. The wall is dark again.');
      // an uncertified fence the inspector sees while the county works: a fine and the certificate at once
      if (r.noCert && works && s.paper.permits && rnd() < 0.002 * strict) {
        const fine = 600;
        s.money -= fine + WALL_TOP.ELECTRIC.CERT_USD;
        s.paper.fines += fine;
        delete r.noCert;
        out.push(`A county inspector saw the electric fence has no compliance certificate: a $${fine} fine, and $${WALL_TOP.ELECTRIC.CERT_USD} for the certificate.`);
      }
    }
    // zoning: razor coils in a strict county while the law works; the inspector orders them down once
    if (r.razor && works && s.paper.permits && strict >= WALL_TOP.RAZOR.ORDER_STRICT && !r.razorOrdered && rnd() < WALL_TOP.RAZOR.ORDER_CHANCE * strict) {
      r.razorOrdered = true;
      s.money -= WALL_TOP.RAZOR.FINE_USD;
      s.paper.fines += WALL_TOP.RAZOR.FINE_USD;
      delete r.razor;
      out.push(`The county has no razor wire on a house wall: a $${WALL_TOP.RAZOR.FINE_USD} fine and the coils come down (the zoning allows it again if the law ever stops working).`);
    }
  }
  return out;
}
