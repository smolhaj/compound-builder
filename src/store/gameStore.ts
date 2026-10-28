import { planProblem } from '../sim/construction';
import { AFTERMATH_TEXT, joinPrisoner, releasePrisoner, resolveAftermath, type AftermathChoice } from '../sim/aftermath';
import { dismissCrew, hireCrew } from '../sim/crews';
import { orderHookup, placeImprovements } from '../sim/improvements';
import { applyForPermit } from '../sim/paperwork';
import { sweepChimney } from '../sim/upkeep';
import { stockUpRx } from '../sim/body';
import { askRansom, giveUp, startRescue, startTrip } from '../sim/rescue';
import { hasCutscene, promptNarration } from '../sim/siege';
import { commitRaid, restageRaid, stageRaid, type RaidReport, type StagedRaid } from '../sim/raidCutscene';
import type { SiegePlan } from '../sim/siege';
import type { Battle } from '../sim/battleTypes';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { newGame, SECONDS_PER_DAY, dayIndex, hourOf, type GameState, type OrderLine, type Speed } from '../sim/state';
import { step } from '../sim/engine';
import { placeOrder } from '../sim/economy';
import { planStructure } from '../sim/construction';
import { markTree, unmarkTree, isMarked, type TreeRef } from '../sim/forestry';
import { lightsOf, type LightMode } from '../sim/lights';
import { stampHighGround, upgradeTower } from '../sim/towers';
import { planRun, upgradeRun, type Gate, type PerimeterKind, type Pt } from '../sim/perimeter';
import { layPropertyWall, planPropertyWall, type PropertyGeometry } from '../sim/propertyWall';
import { fitProblem, orderFit, plant, repairPump, replaceFried } from '../sim/utilities';

/** Reconnection fee to get back on the grid after leaving it. */
const GRID_RECONNECT = 250;
import { triggerDisaster, type DisasterKind } from '../sim/disaster';
import { resolve, type Stance } from '../sim/encounters';
import { buyLand, type LandKind } from '../sim/land';
import { log } from '../sim/economy';
import { opsecOf } from '../sim/opsec';
import { hardenProblem, orderHarden, orderHardenAll, tierOf, type HardenId } from '../sim/hardening';
import { saveGame, AUTOSAVE } from '../sim/save/saveSystem';

/**
 * A raid played as a cutscene (sim/siege.ts, sim/raidCutscene.ts). While one is up, everything that
 * builds, plans, buys, hires or opens a menu is refused (`locked`): you decide your stance, then watch.
 *  prompt     the clock is stopped at the hour the raid arrived; the gate card takes the stance, then Watch
 *  playing    the scenes play; the visible game is untouched and the clock reads off the siege timeline
 *  aftermath  the result is committed (the clock advanced once); the report card, then control returns
 */
export interface CutsceneState {
  phase: 'prompt' | 'playing' | 'aftermath';
  /** The hour of day the raid arrived, and one line of what you can see and hear. */
  hour: number;
  narration: string;
  /** The stance picked on the gate card (null: not yet). */
  stance: Stance | null;
  plan?: SiegePlan;
  battles?: Battle[];
  /** The staged result, held back until the cutscene commits. */
  staged?: GameState;
  report?: RaidReport;
  /** Game time (days) of the arrival. */
  t0?: number;
  /** The staged raid the fields above mirror (kept whole so a mid-siege change of stance can restage it). */
  raid?: StagedRaid;
  /** Between scenes: the index of the scene just played while the "change your stance?" card is up (null: no card). */
  offer?: number | null;
  /** The one change of stance has been used. */
  changed?: boolean;
}

/** The mirrored fields of a staged raid. */
const fromRaid = (st: StagedRaid) => ({ plan: st.plan, battles: st.battles, staged: st.staged, report: st.report, t0: st.t0, raid: st });

const LOCKED_WHY = 'not while the raid is on';
/** Whether a cutscene is holding the controls. */
const locked = (): boolean => useGameStore.getState().cutscene !== null;

/** The prompt for a raid that has just reached the gate (null for anything else). */
function promptFor(g: GameState): CutsceneState | null {
  const e = g.gate.pending;
  if (!hasCutscene(e)) return null;
  const hour = hourOf(g.clock.t);
  return { phase: 'prompt', hour, narration: promptNarration(g, e!, hour), stance: null };
}

/** Game state (the simulation) + transient UI state for the build tool. */
export interface GameStore {
  game: GameState;
  /** Build tool: the kit piece being placed, 'fell' for marking trees (null = no tool). */
  tool: string | null;
  /** Placement feedback for the HUD (null = valid or no tool). */
  toolProblem: string | null;
  /** Selected structure (construction panel). */
  selected: string | null;
  /** The raid cutscene, or null. */
  cutscene: CutsceneState | null;
  /** Pick the stance on the gate card (the cutscene's prompt); Watch then plays it. */
  chooseStance: (s: Stance | null) => void;
  watchRaid: () => void;
  /** The player (or the siege timeline) reached the gap after scene `scene`: put the stance card up. */
  offerChange: (scene: number) => void;
  /** Answer the card between scenes: a new stance (once), or null to carry on as you are. */
  midStance: (s: Stance | null) => void;
  /** The scenes are over (or skipped): commit the result to the clock and show the report. */
  commitCutscene: () => void;
  /** Done with the report: control returns (the aftermath choices, if any, are next). */
  endCutscene: () => void;
  /** Advance by real seconds at the current speed; autosaves when a new day starts. */
  tick: (realDt: number) => void;
  setSpeed: (s: Speed) => void;
  /** Jump ahead by game days (debug / QA). */
  advance: (days: number) => void;
  order: (lines: OrderLine[]) => boolean;
  plan: (kind: string, x: number, z: number, rot: number) => void;
  load: (g: GameState) => void;
  /** Lay out a fence / hedge / wall run for the family to build. */
  planRun: (kind: PerimeterKind, pts: Pt[], gates: Gate[], offLen?: number) => void;
  /** "Wall my property": lay out the whole closed property line in one wall type (creek bars, a road gate, existing runs kept). Returns how many runs. */
  wallProperty: (kind: PerimeterKind, geo: PropertyGeometry) => number;
  /** Upgrade a finished fence or wall to the next tier, in place (null = laid out; else why not). */
  upgradeRun: (id: string) => string | null;
  /** Upgrade a finished watch tower in place: the next tier rises beside it. */
  upgradeTower: (id: string) => string | null;
  /** Floodlight discipline (sim/lights.ts): the default for every light, one light's override (null clears it), or set all (clears the overrides). */
  setLightDefault: (mode: LightMode) => void;
  setLightMode: (id: string, mode: LightMode | null) => void;
  setAllLights: (mode: LightMode) => void;
  /** Plumb or wire a building (a fitting job for the family). */
  fit: (buildingId: string, kind: 'plumb' | 'wire') => string | null;
  /** Order the next tier of a hardening upgrade for one bunker room, or (all) for every room of the bunker up to that tier. */
  harden: (buildingId: string, upgrade: HardenId, all?: boolean) => string | null;
  repairPump: (id: string) => boolean;
  /** Hire a crew for a building, or send one home. */
  hire: (buildingId: string) => string | null;
  dismiss: (crewId: string) => void;
  /** Mark a tree to fell, or unmark it if it is marked and not yet cut. */
  toggleMark: (t: TreeRef, haulDist: number) => void;
  setTool: (kind: string | null) => void;
  setToolProblem: (t: string | null) => void;
  select: (id: string | null) => void;
  /** Answer whoever is at the gate. */
  answer: (stance: Stance) => void;
  dismissCard: () => void;
  decideAftermath: (choice: AftermathChoice) => void;
  releasePrisoner: (id: string) => void;
  joinPrisoner: (id: string) => void;
  /** The taken (sim/rescue.ts): send armed adults to the camp, send word you'll pay, stop looking. Return why not, or null. */
  rescue: (pid: string, team: string[], allies?: boolean) => string | null;
  /** A long trip by truck after a child traded on (a far rumor). */
  trip: (pid: string, team: string[]) => string | null;
  askRansom: (pid: string) => string | null;
  giveUp: (pid: string) => string | null;
  /** Wildfire: the world's count of trees round each building. */
  setFuel: (fuel: Record<string, number>) => void;
  /** Buy a neighbor parcel. */
  buy: (parcelId: string) => string | null;
  /** The world measured what each parcel is (timber, creek bottom, hay, grazing). */
  survey: (kinds: Record<string, LandKind>) => void;
  /** Lay in what came with the land at the spots the world picked. */
  placeImprovements: (spots: Record<string, { x: number; z: number; rot: number }>) => void;
  /** Pay the co-op for the line, or a contractor for the drive. */
  hookup: (what: 'power' | 'drive') => string | null;
  /** Paperwork switches: pull permits for new builds; keep the insurance. */
  setPaper: (k: 'permits' | 'insured', on: boolean) => void;
  /** Sweep the chimney. */
  sweep: () => void;
  /** Eat what you store (rotate the pantry). */
  setRotate: (on: boolean) => void;
  /** OPSEC choices: pick deliveries up in town; blackout curtains. */
  setOpsec: (k: 'quietDeliveries' | 'blackout', on: boolean) => void;
  /** Fill everyone's prescriptions 90 days ahead. */
  stockUpRx: () => void;
  /** After the report card: play on (endless). */
  playOn: () => void;
  /** Put a spare into an EMP-fried building. */
  fixFried: (id: string) => string | null;
  /** Leave the county grid, or get back on it (a reconnection fee). */
  setGrid: (on: boolean) => void;
  /** A building's breaker. */
  setBreaker: (id: string, on: boolean) => void;
  /** Keep or quit an adult's day job (peacetime only). */
  setEmployed: (personId: string, on: boolean) => void;
  /** Free build: start a disaster now, after `warnDays` of warning signs. */
  trigger: (kind: DisasterKind, warnDays: number) => void;
  /** Whether the new-game screen is up. */
  setupOpen: boolean;
  /** The shop & money window. */
  shopOpen: boolean;
  openShop: (open: boolean) => void;
  /** Run a money operation on a draft (transfer, buy / sell / move metal); returns why not, or null. */
  money: (op: (g: GameState) => string | null) => string | null;
  /** The setup screen offers "Back to my game" (opened from the New button, not at boot). */
  setupCanClose: boolean;
  openSetup: (open: boolean, canClose?: boolean) => void;
}

/** Longest real-time step taken in one frame (a background tab does not jump a week). */
const MAX_DT = 0.25;

export const useGameStore = create<GameStore>()(subscribeWithSelector((set, get) => ({
  game: newGame(1),
  tool: null,
  toolProblem: null,
  selected: null,
  cutscene: null,
  chooseStance: (stance) => { const c = get().cutscene; if (c?.phase === 'prompt') set({ cutscene: { ...c, stance } }); },
  watchRaid: () => {
    const c = get().cutscene, g = get().game;
    if (c?.phase !== 'prompt' || !g.gate.pending) return;
    const stance = c.stance ?? g.gate.pending.stances[0];
    const st = stageRaid(g, stance);
    set({ tool: null, toolProblem: null, shopOpen: false, selected: null, cutscene: { ...c, phase: 'playing', stance, ...fromRaid(st), offer: null, changed: false } });
  },
  offerChange: (scene) => { const c = get().cutscene; if (c?.phase === 'playing' && !c.changed) set({ cutscene: { ...c, offer: scene } }); },
  midStance: (stance) => {
    const c = get().cutscene, g = get().game;
    if (c?.phase !== 'playing' || c.offer == null || !c.raid) return;
    if (!stance || stance === c.stance || c.changed) { set({ cutscene: { ...c, offer: null } }); return; }
    const next = restageRaid(g, c.raid, c.offer + 1, stance);
    set({ cutscene: { ...c, ...fromRaid(next), stance, changed: true, offer: null } });
  },
  commitCutscene: () => {
    const c = get().cutscene;
    if (c?.phase !== 'playing' || !c.staged || !c.plan) return;
    const g = commitRaid({ staged: c.staged, plan: c.plan });
    set({ game: g, cutscene: { ...c, phase: 'aftermath', staged: undefined, raid: undefined, offer: null } });
    void saveGame(AUTOSAVE, g);
  },
  endCutscene: () => {
    if (get().cutscene?.phase !== 'aftermath') return;
    const g = structuredClone(get().game);
    g.gate.card = null;
    set({ game: g, cutscene: null });
    void saveGame(AUTOSAVE, g);
  },
  tick: (realDt) => {
    const g = get().game;
    if (get().cutscene || g.clock.speed === 0 || g.gate.pending || g.gate.aftermath || (g.ending && !g.ending.continued)) return;
    const days = Math.min(realDt, MAX_DT) / SECONDS_PER_DAY[g.clock.speed];
    const next = step(g, days);
    // someone at the gate: stop the clock until the player decides
    // (and when news of a rescue comes in: the card)
    if ((next.gate.pending && !g.gate.pending) || (next.gate.card && !g.gate.card) || (next.ending && !g.ending)) next.clock = { ...next.clock, speed: 0 };
    set({ game: next, ...(next.gate.pending && !g.gate.pending ? { cutscene: promptFor(next), tool: null } : {}) });
    if (dayIndex(next.clock.t) !== dayIndex(g.clock.t)) void saveGame(AUTOSAVE, next);
  },
  advance: (days) => set(s => { const game = step(s.game, days); return { game, cutscene: s.cutscene ?? promptFor(game) }; }),
  setSpeed: (speed) => locked() ? undefined : set(s => ({ game: { ...s.game, clock: { ...s.game.clock, speed } } })),
  order: (lines) => {
    if (locked()) return false;
    const g = structuredClone(get().game);
    const ok = placeOrder(g, lines) !== null;
    if (ok) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return ok;
  },
  plan: (kind, x, z, rot) => {
    if (locked()) return;
    if (planProblem(get().game, kind)) return;
    const g = structuredClone(get().game);
    const st = planStructure(g, kind, x, z, rot);
    stampHighGround(st);
    applyForPermit(g, st);
    set({ game: g, selected: st.id });
    void saveGame(AUTOSAVE, g);
  },
  load: (game) => set({ game, selected: null, tool: null, cutscene: promptFor(game) }),
  planRun: (kind, pts, gates, offLen = 0) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    planRun(g, kind, pts, gates, offLen);
    set({ game: g });
    void saveGame(AUTOSAVE, g);
  },
  wallProperty: (kind, geo) => {
    if (locked()) return 0;
    const g = structuredClone(get().game);
    const n = layPropertyWall(g, planPropertyWall(g, kind, geo));
    if (n) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return n;
  },
  upgradeRun: (id) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = upgradeRun(g, id);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  setLightDefault: (mode) => { const g = structuredClone(get().game); lightsOf(g).mode = mode; set({ game: g }); },
  setLightMode: (id, mode) => { const g = structuredClone(get().game); const l = lightsOf(g); if (mode) l.per[id] = mode; else delete l.per[id]; set({ game: g }); },
  setAllLights: (mode) => { const g = structuredClone(get().game); const l = lightsOf(g); l.mode = mode; l.per = {}; set({ game: g }); },
  upgradeTower: (id) => {
    const g = structuredClone(get().game);
    const why = upgradeTower(g, id);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  fit: (id, kind) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const st = g.structures.find(x => x.id === id);
    if (!st) return 'no such building';
    const why = fitProblem(g, plant(g), st, kind);
    if (why) return why;
    orderFit(g, id, kind);
    set({ game: g });
    return null;
  },
  harden: (id, upgrade, all = false) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const st = g.structures.find(x => x.id === id);
    if (!st) return 'no such building';
    const why = hardenProblem(g, st, upgrade);
    if (why) return why;
    if (all) orderHardenAll(g, upgrade, (tierOf(st, upgrade) + 1) as 1 | 2 | 3);
    else orderHarden(g, st, upgrade);
    set({ game: g });
    return null;
  },
  repairPump: (id) => {
    if (locked()) return false;
    const g = structuredClone(get().game);
    const ok = repairPump(g, id);
    if (ok) set({ game: g });
    return ok;
  },
  toggleMark: (t, haulDist) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    const changed = isMarked(g, t.id) ? unmarkTree(g, t.id) : markTree(g, t, haulDist) !== null;
    if (changed) set({ game: g });
  },
  setTool: (tool) => { if (!locked()) set({ tool, toolProblem: null }); },
  setToolProblem: (toolProblem) => set({ toolProblem }),
  select: (selected) => { if (!locked()) set({ selected }); },
  hire: (id) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = hireCrew(g, id);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  dismiss: (crewId) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    dismissCrew(g, crewId);
    set({ game: g });
  },
  answer: (stance) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    resolve(g, stance);
    set({ game: g });
    void saveGame(AUTOSAVE, g);
  },
  setFuel: (fuel) => {
    const g = structuredClone(get().game);
    g.disaster.fuel = fuel;
    set({ game: g });
  },
  buy: (id) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = buyLand(g, id);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  placeImprovements: (spots) => {
    const g = structuredClone(get().game);
    placeImprovements(g, spots);
    // anything with no spot (no room for it) is dropped rather than left floating
    const lost = g.structures.filter(x => x.unplaced);
    if (lost.length) { g.structures = g.structures.filter(x => !x.unplaced); }
    set({ game: g });
  },
  stockUpRx: () => {
    if (locked()) return;
    const g = structuredClone(get().game);
    const cost = stockUpRx(g);
    if (cost > 0) { log(g, `Filled everyone's prescriptions three months ahead ($${cost.toLocaleString('en-US')}).`); set({ game: g }); }
  },
  setOpsec: (k, on) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    opsecOf(g)[k] = on;
    log(g, k === 'quietDeliveries' ? (on ? 'Picking deliveries up in town from now on: fewer people see the truck.' : 'Deliveries come to the place again.') : (on ? 'Blackout curtains up: the lights don\'t show from the road.' : 'Blackout curtains down.'));
    set({ game: g });
  },
  setRotate: (on) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    g.shelf.rotate = on;
    log(g, on ? 'Eating what we store: the oldest off the shelf first, the grocery run replaces it.' : 'Stopped rotating the pantry.');
    set({ game: g });
  },
  sweep: () => {
    if (locked()) return;
    const g = structuredClone(get().game);
    log(g, sweepChimney(g));
    set({ game: g });
  },
  setPaper: (k, on) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    g.paper[k] = on;
    log(g, k === 'permits' ? (on ? 'From now on: permits for everything that needs one.' : 'From now on: no permits. Hope the inspector doesn\'t drive by.') : (on ? 'Took out insurance on the place.' : 'Dropped the insurance.'));
    set({ game: g });
  },
  hookup: (what) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = orderHookup(g, what);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  survey: (kinds) => {
    const g = structuredClone(get().game);
    for (const p of g.land.parcels) if (kinds[p.id]) p.kind = kinds[p.id];
    g.land.surveyed = true;
    set({ game: g });
  },
  playOn: () => {
    const g = structuredClone(get().game);
    if (g.ending) g.ending.continued = true;
    set({ game: g });
  },
  fixFried: (id) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = replaceFried(g, id);
    if (!why) set({ game: g });
    return why;
  },
  dismissCard: () => {
    if (locked()) return;
    const g = structuredClone(get().game);
    g.gate.card = null;
    set({ game: g });
  },
  decideAftermath: (choice) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    const onlyDead = !g.gate.aftermath?.wounded;
    const lines = resolveAftermath(g, choice);
    g.gate.card = { title: onlyDead ? 'Buried' : AFTERMATH_TEXT[choice][0], text: lines[0] ?? '', tone: choice === 'treat_release' ? 'good' : choice === 'finish' ? 'bad' : 'mixed', lines: lines.slice(1) };
    set({ game: g });
    void saveGame(AUTOSAVE, g);
  },
  releasePrisoner: (id) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    if (!releasePrisoner(g, id)) set({ game: g });
  },
  trip: (pid, team) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = startTrip(g, pid, team);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  rescue: (pid, team, allies) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = startRescue(g, pid, team, allies);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  askRansom: (pid) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = askRansom(g, pid);
    if (!why) set({ game: g });
    return why;
  },
  giveUp: (pid) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = giveUp(g, pid);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  joinPrisoner: (id) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    if (!joinPrisoner(g, id)) set({ game: g });
  },
  setGrid: (on) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    if (g.utilities.grid === on) return;
    if (on) {
      if (!g.site.improvements.power || g.disaster.tracks.grid < 0.5 || g.money < GRID_RECONNECT) return;
      g.money -= GRID_RECONNECT;
      log(g, `Back on the county grid ($${GRID_RECONNECT} to reconnect).`);
    } else log(g, 'The co-op pulled the meter: the place is off the grid.');
    g.utilities.grid = on;
    set({ game: g });
  },
  setBreaker: (id, on) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    g.utilities.off = on ? g.utilities.off.filter(x => x !== id) : [...new Set([...g.utilities.off, id])];
    set({ game: g });
  },
  setEmployed: (personId, on) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    const ps = g.personState.find(x => x.id === personId), p = g.people.find(x => x.id === personId);
    if (!ps || !p?.job || g.disaster.phase === 'impact' || g.disaster.phase === 'survival') return;
    ps.employed = on;
    log(g, on ? `${p.first} is back at work as a ${p.job.title.toLowerCase()}.` : `${p.first} quit the job to work on the place full time.`);
    set({ game: g });
  },
  trigger: (kind, warnDays) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    if (g.disaster.mode !== 'sandbox' || (g.disaster.kind && g.disaster.phase !== 'peace')) return;
    triggerDisaster(g.disaster, g.clock.t, kind, g.seed, warnDays);
    set({ game: g });
  },
  setupOpen: false,
  shopOpen: false,
  openShop: (shopOpen) => { if (!locked() || !shopOpen) set({ shopOpen }); },
  money: (op) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = op(g);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  setupCanClose: false,
  openSetup: (setupOpen, setupCanClose = false) => set({ setupOpen, setupCanClose }),
})));
