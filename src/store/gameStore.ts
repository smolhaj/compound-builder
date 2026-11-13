import { takePhoto as takePhotoRecord, dropPhoto } from '../sim/photos';
import { putPhoto, removePhotos, syncVault } from '../sim/save/photoVault';
import { wipeEnded } from '../sim/wipe';
import { planProblem } from '../sim/construction';
import { unscripted } from '../sim/godMode';
import { dropBridge, routeProblem } from '../sim/terrainFx';
import { clearCollapse, strandAway } from '../sim/corridors';
import { dropRoadBridge, rebuildRoadBridge } from '../sim/roadFx';
import { interrogate, type Approach, type Question } from '../sim/interrogation';
import { AFTERMATH_TEXT, joinPrisoner, releasePrisoner, resolveAftermath, type AftermathChoice } from '../sim/aftermath';
import { dismissCrew, hireCrews } from '../sim/crews';
import { dismissGuard, hireGuard } from '../sim/guards';
import { setFocus } from '../sim/priority';
import { orderHookup, placeImprovements } from '../sim/improvements';
import { claimForWaiting, claimWaitingRig, isRig, type StayKind } from '../sim/joinerHome';
import { kinOf } from '../sim/kin';
import { setEntrance as chooseEntrance } from '../sim/roadEntrance';
import { applyForPermit } from '../sim/paperwork';
import { callVote, voteProblem } from '../sim/rules';
import { permitAffordable } from '../sim/spendGuard';
import { sweepChimney } from '../sim/upkeep';
import { stockUpRx } from '../sim/body';
import { askRansom, giveUp, startRescue, startTrip } from '../sim/rescue';
import { hasCutscene, promptNarration } from '../sim/siege';
import { commitRaid, restageRaid, stageRaid, type RaidReport, type StagedRaid } from '../sim/raidCutscene';
import type { RaidOrder } from '../sim/raidOrders';
import type { ScoutPlan } from '../sim/scoutPlans';
import { fightClock } from '../sim/siege';
import { useCutsceneView } from './cutsceneStore';
import type { RaidOrderKind } from '../sim/battleTypes';
import { setAllHands } from '../sim/raidFire';
import type { SiegePlan } from '../sim/siege';
import type { Battle } from '../sim/battleTypes';
import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { gridChanged } from '../sim/lineage';
import { newGame, SECONDS_PER_DAY, dayIndex, hourOf, type GameState, type OrderLine, type Speed } from '../sim/state';
import { step } from '../sim/engine';
import { placeOrder } from '../sim/economy';
import { planStructure } from '../sim/construction';
import { markTree, unmarkTree, isMarked, type TreeRef } from '../sim/forestry';
import { newDigs } from '../sim/tunnelers';
import { setPassageLocked } from '../sim/compounds';
import { lightsOf, setAiSensor, setAllAi, type LightMode } from '../sim/lights';
import { AUTO_NAME, type AutoLightsOut } from '../sim/blackout';
import { stampHighGround, upgradeTower } from '../sim/towers';
import { cutRoadGates } from '../sim/roadGate';
import { addSkirt, planRun, upgradeRun, type ContainerLook, type Gate, type PerimeterKind, type Pt } from '../sim/perimeter';
import { ROAD_GATE_W, layPropertyWall, planPropertyWall, type PropertyGeometry, type WallPlan } from '../sim/propertyWall';
import { addWalkway } from '../sim/walkway';
import { addRazor } from '../sim/razor';
import { addElectric, addBackup, trimAll, trimRun } from '../sim/wallTops';
import { cancelResponse, subscribe as subscribeResponse } from '../sim/armedResponse';
import { foundWatch, leaveWatch } from '../sim/watch';
import { answerHail, buildBlock, hailPass, removeBlock, setBlockPolicy, type BlockKind, type BlockPolicy, type HailAnswer } from '../sim/roadPassers';
import { prepare, type PrepKind } from '../sim/roadWarn';
import { layPaths, pickUpPath, type LaidKind, type LayEdge } from '../sim/paths';
import { compoundRegion, layFortress, planFortress, type FortressOptions } from '../sim/fortress';
import type { RingShape } from '../sim/ringShape';
import { fitProblem, orderFit, plant, repairPump, replaceFried } from '../sim/utilities';

/** Reconnection fee to get back on the grid after leaving it. */
const GRID_RECONNECT = 250;
import { triggerDisaster, type DisasterKind } from '../sim/disaster';
import { postureOf, resolve, type Stance } from '../sim/encounters';
import { defaultStance } from '../sim/raidDefault';
import { buyLand, type LandKind } from '../sim/land';
import { log } from '../sim/economy';
import { opsecOf } from '../sim/opsec';
import { hardenProblem, orderHarden, orderHardenAll, tierOf, type HardenId } from '../sim/hardening';
import { saveGame, AUTOSAVE } from '../sim/save/saveSystem';
import { decisionOpen, planningHold, resumeSpeed } from '../sim/clockResume';
import { useFeelStore } from './feelStore';
import { muteFeedback } from '../ui/feel/quiet';

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
  /** The family's orders for the fight (sim/raidOrders.ts); empty: hold the line. */
  orders?: RaidOrder[];
  /** The plan for scouts the watch spotted (sim/scoutPlans.ts); none: ignore them. */
  scoutPlan?: ScoutPlan;
  /** An order was given on the live playhead: the player swaps in the replanned battle of this scene and seeks to `t` (battle seconds), then clears it. */
  swap?: { scene: number; t: number } | null;
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
/** Where a link in the text or a Next-step card sends the HUD: a right-hand tab, and for Supplies its sub-tab. */
export interface HudFocus { right: 'family' | 'supplies' | 'utilities' | 'land' | 'defense' | 'outside' | 'chronicle'; supplies?: 'stores' | 'farm' }

export interface GameStore {
  game: GameState;
  /** Build tool: the kit piece being placed, 'fell' for marking trees (null = no tool). */
  tool: string | null;
  /** The starter-compound proposal is open (set by its card): the clock holds while it is. Not saved. */
  planOpen: boolean;
  setPlanOpen: (on: boolean) => void;
  /** Placement feedback for the HUD (null = valid or no tool). */
  toolProblem: string | null;
  /** A one-line notice that fades by itself (a refused click: why). Not saved. */
  toast: { text: string; id: number } | null;
  showToast: (text: string) => void;
  /** The new-game welcome card (the clock starts paused): shown until dismissed or the clock runs. Not saved. */
  welcome: boolean;
  setWelcome: (on: boolean) => void;
  /** A short confirmation after a building is staked and the tool put away (clears itself). */
  stakedNote: string | null;
  /** A staking the player is being asked to confirm because its county permit fee would dip under the living reserve (sim/spendGuard.stakeSpendAsk). */
  spendAsk: { kind: string; x: number; z: number; rot: number; cost: number; after: number; reserve: number; cannot?: string } | null;
  askSpend: (a: NonNullable<GameStore['spendAsk']>) => void;
  /** Answer the question: true stakes it anyway, false drops it (the tool stays armed). */
  answerSpend: (yes: boolean) => void;
  /** Selected structure (construction panel). */
  selected: string | null;
  /** A request for the HUD to open a panel (a Next-step card or a link in the text): the right-hand tab and its sub-tab. The HUD takes it and clears it. */
  hudFocus: HudFocus | null;
  /** The raid cutscene, or null. */
  cutscene: CutsceneState | null;
  /** "The day it happened": the hit day this session has put up the card for (transient, not saved), until the player continues. */
  dayCard: number | null;
  dayCardSeen: number;
  ackDayCard: () => void;
  /** Pick the stance on the gate card (the cutscene's prompt); Watch then plays it. */
  chooseStance: (s: Stance | null) => void;
  watchRaid: () => void;
  /** The family's standing order for the fight (sim/raidOrders.ts): hold the line, fall back to the house, counterattack. Taken at the gate card and between scenes. */
  setRaidOrder: (order: RaidOrderKind) => void;
  /** The plan for scouts the watch spotted (sim/scoutPlans.ts), chosen on the gate card. */
  setScoutPlan: (plan: ScoutPlan) => void;
  /** Fire fighting (sim/raidFire.ts): all hands on the fires a raid set, or back to the usual share. */
  fireAllHands: (on: boolean) => void;
  /** An order on the live playhead (sim/raidOrders.ts, sim/siege.ts `fightClock`): replans the fight from this second on with the same seeded stream. */
  giveRaidOrderNow: (order: RaidOrderKind) => void;
  clearSwap: () => void;
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
  /** The gate card: where the joiners will sleep, and whether the player picks a rig's pad (sim/joinerHome.ts). */
  setStay: (stay: StayKind, placeRig?: boolean) => void;
  /** The world checked the sim's spots for joiners' homes against the terrain (sim/joinerHome.ts). */
  respotJoiners: (spots: Record<string, { x: number; z: number; rot: number }>) => void;
  /** Stake terraced garden beds, one per spot (the Next-step card's confirm; sim/terrace.ts). Returns why not, or null. */
  stakeTerraces: (spots: Array<[number, number]>) => string | null;
  /** Stake starter-compound pieces (and the yard fence) in one go; each is an ordinary structure afterwards. Returns how many went in. */
  layStarter: (pieces: ReadonlyArray<{ kind: string; x: number; z: number; rot: number }>, yard: WallPlan | null, geo: PropertyGeometry) => number;
  load: (g: GameState) => void;
  /** Keep a picture of the place in the album with a caption (sim/photos.ts). Null on success, else why not. */
  keepPhoto: (data: string, caption: string) => string | null;
  /** Throw an album photo away. */
  tossPhoto: (id: string) => void;
  /** Speed to pick up again once the decision card that paused the clock is answered (null: stay paused). */
  resumeTo: Speed | null;
  /** Lay out a fence / hedge / wall run for the family to build. */
  planRun: (kind: PerimeterKind, pts: Pt[], gates: Gate[], offLen?: number) => void;
  /** Lay a tunnel-bridge or slope tunnel along a line the ground allows. Null on success, else why not. */
  planSpan: (kind: PerimeterKind, a: Pt, b: Pt) => string | null;
  /** Drop a standing tunnel-bridge or slope tunnel (it is a plan again until rebuilt). */
  dropBridge: (id: string) => string | null;
  /** Hire a contractor to clear a tunnel choked by a fall (sim/corridors). */
  clearCollapse: (id: string) => string | null;
  /** Bring the bridge on the way in down on purpose, or order its rebuilding (null on success, else why not). */
  dropRoadBridge: () => string | null;
  rebuildRoadBridge: () => string | null;
  /** "Wall my property": lay out the whole closed property line in one wall type (creek bars, a road gate, existing runs kept). Returns how many runs. */
  wallProperty: (kind: PerimeterKind, geo: PropertyGeometry, shape?: RingShape, look?: ContainerLook) => number;
  /** Upgrade a finished fence or wall to the next tier, in place (null = laid out; else why not). */
  upgradeRun: (id: string) => string | null;
  /** Bury a steel-and-concrete skirt under a finished wall (null = done, else why not). */
  addSkirt: (id: string) => string | null;
  /** A patrol walkway on top of a finished wall (sim/walkway.ts). */
  addWalkway: (id: string) => string | null;
  /** Hang razor wire along the top of a finished wall or fence (sim/razor.ts). */
  addRazor: (id: string) => string | null;
  /** Armed-response subscription and the road watch (sim/armedResponse.ts, sim/watch.ts): null = done, else why not. */
  subscribeArmedResponse: () => string | null;
  cancelArmedResponse: () => string | null;
  foundRoadWatch: () => string | null;
  prepareForVisitors: (kind: PrepKind) => string | null;
  hailPasser: (id: string) => string | null;
  answerRoadHail: (how: HailAnswer) => string | null;
  buildRoadBlock: (kind: BlockKind) => string | null;
  setRoadBlockPolicy: (p: BlockPolicy) => string | null;
  removeRoadBlock: () => string | null;
  leaveRoadWatch: () => string | null;
  /** Fit an electric fence on outriggers along a finished wall (sim/wallTops.ts); `backup` adds the sealed battery. */
  addElectric: (id: string, backup: boolean) => string | null;
  /** Add the battery backup to an electric fence. */
  addFenceBackup: (id: string) => string | null;
  /** Cut the brush back along a wall (one run, or every run when `id` is null). Returns how many runs were cleared, or why not. */
  trimBrush: (id: string | null) => string | null;
  /** Lay a walk (gravel, stepping stones, duckboards, concrete) along these door-to-door walks, from the stock (null = laid; else why not). */
  layPaths: (edges: LayEdge[], kind: LaidKind) => string | null;
  /** Take a laid walk up again (back to a worn track). */
  pickUpPath: (a: string, b: string) => void;
  /** "Fortify my ring": lay out the plan (container wall, decks, gate garage, towers, passage). Returns how many runs and structures. */
  fortifyRing: (geo: PropertyGeometry, opts: Partial<FortressOptions>) => { runs: number; structures: number };
  /** Cut a gate through every wall that crosses the driveway without one (the one-click fix). Returns how many. */
  cutRoadGates: (drive: Pt[] | undefined) => number;
  /** Bolt or unbolt the blast hatches of an underground passage. */
  lockPassage: (id: string, locked: boolean) => void;
  /** Upgrade a finished watch tower in place: the next tier rises beside it. */
  upgradeTower: (id: string) => string | null;
  /** Floodlight discipline (sim/lights.ts): the default for every light, one light's override (null clears it), or set all (clears the overrides). */
  setLightDefault: (mode: LightMode) => void;
  setLightMode: (id: string, mode: LightMode | null) => void;
  setAllLights: (mode: LightMode) => void;
  /** Fit / strip an AI sensor module on one light (returns why not). */
  setLightAi: (id: string, on: boolean) => string | null;
  setAllLightsAi: (ids: string[], on: boolean) => number;
  /** Plumb or wire a building (a fitting job for the family). */
  fit: (buildingId: string, kind: 'plumb' | 'wire') => string | null;
  /** Order the next tier of a hardening upgrade for one bunker room, or (all) for every room of the bunker up to that tier. */
  harden: (buildingId: string, upgrade: HardenId, all?: boolean) => string | null;
  repairPump: (id: string) => boolean;
  /** Hire a crew for a building, or send one home. */
  /** Hire a crew on a building or a perimeter run; `count` crews side by side on a run. */
  hire: (buildingId: string, count?: number) => string | null;
  dismiss: (crewId: string) => void;
  hireGuard: () => string | null;
  dismissGuard: () => void;
  /** "Work on this first" for a building or wall (null clears it). */
  setFocus: (id: string | null) => string | null;
  /** Mark a batch of trees to fell in one click (the nearest to the yard). */
  markTrees: (trees: Array<{ tree: TreeRef; haulDist: number }>) => number;
  /** Mark a tree to fell, or unmark it if it is marked and not yet cut. */
  toggleMark: (t: TreeRef, haulDist: number) => void;
  setTool: (kind: string | null) => void;
  setToolProblem: (t: string | null) => void;
  flashStaked: (text: string) => void;
  select: (id: string | null) => void;
  /** Ask the HUD to open a right-hand tab (and, for Supplies, its Stores / Farm sub-tab). */
  focusHud: (f: HudFocus | null) => void;
  /** Answer whoever is at the gate. */
  answer: (stance: Stance) => void;
  /** Pick who goes to a dig site (gate card). */
  setAmbushParty: (ids: string[]) => void;
  dismissCard: () => void;
  decideAftermath: (choice: AftermathChoice) => void;
  releasePrisoner: (id: string) => void;
  /** Put a question to a prisoner, kindly or harshly (sim/interrogation.ts). Returns the lines (or why not). */
  askPrisoner: (id: string, q: Question, approach: Approach) => string[];
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
  /** Confirm where the road comes in on the property line (z), before the drive is ordered (sim/roadEntrance.ts). */
  setEntrance: (z: number) => string | null;
  /** Paperwork switches: pull permits for new builds; keep the insurance. */
  setPaper: (k: 'permits' | 'insured', on: boolean) => void;
  /** Comfort tier (Cozy; sim/estate.ts): a tier, or null to let the savings decide. */
  setComfort: (tier: import('../sim/estate').ComfortTier | null) => void;
  /** Put a house rule to a vote (sim/rules.ts); returns the result line, or why not. */
  callRuleVote: (rule: import('../sim/rules').RuleId, option: string) => string;
  /** Sweep the chimney. */
  sweep: () => void;
  /** Eat what you store (rotate the pantry). */
  setRotate: (on: boolean) => void;
  /** OPSEC choices: pick deliveries up in town; blackout curtains. */
  setOpsec: (k: 'quietDeliveries' | 'blackout', on: boolean) => void;
  /** The family's lights-out routine (sim/blackout.ts). */
  setLightsOutAuto: (m: AutoLightsOut) => void;
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
  /** The shelf the window opens on (a prompt that sends you to the right shelf), or null for the default. */
  shopTab: string | null;
  openShop: (open: boolean, tab?: string) => void;
  /** The daily schedule window (sim/daily.ts). */
  scheduleOpen: boolean;
  openSchedule: (open: boolean) => void;
  /** Run a daily-life change (roster, templates, gatherings) on a draft; returns why not, or null. */
  daily: (op: (g: GameState) => string | null) => string | null;
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
  planOpen: false,
  setPlanOpen: (planOpen) => set({ planOpen }),
  toolProblem: null,
  toast: null,
  showToast: (text) => {
    const id = (get().toast?.id ?? 0) + 1;
    set({ toast: { text, id } });
    setTimeout(() => { if (useGameStore.getState().toast?.id === id) useGameStore.setState({ toast: null }); }, 4200);
  },
  welcome: false,
  setWelcome: (welcome) => set({ welcome }),
  stakedNote: null,
  spendAsk: null,
  askSpend: (spendAsk) => set({ spendAsk }),
  answerSpend: (yes) => {
    const a = get().spendAsk;
    set({ spendAsk: null });
    if (!a || !yes) return;
    const before = get().game.structures.length;
    get().plan(a.kind, a.x, a.z, a.rot);
    set({ tool: null });
    if (get().game.structures.length <= before) return;
    get().flashStaked(`Staked out the ${a.kind.replace(/_/g, ' ')}. The family will start when the materials are in (Projects tab).`);
  },
  selected: null,
  hudFocus: null,
  cutscene: null,
  dayCard: null, dayCardSeen: -1,
  ackDayCard: () => set(s => ({ dayCard: null, dayCardSeen: s.dayCard ?? s.dayCardSeen })),
  chooseStance: (stance) => { const c = get().cutscene; if (c?.phase === 'prompt') set({ cutscene: { ...c, stance } }); },
  watchRaid: () => {
    const c = get().cutscene, g = get().game;
    if (c?.phase !== 'prompt' || !g.gate.pending) return;
    const stance = c.stance ?? defaultStance(g.gate.pending.stances, postureOf(g));
    const st = stageRaid(g, stance, undefined, c.orders, c.scoutPlan);
    set({ tool: null, toolProblem: null, shopOpen: false, selected: null, cutscene: { ...c, phase: 'playing', stance, ...fromRaid(st), offer: null, changed: false } });
  },
  setRaidOrder: (order) => {
    const c = get().cutscene, g = get().game;
    if (!c || (c.phase !== 'prompt' && !(c.phase === 'playing' && c.offer != null))) return;
    const orders: RaidOrder[] = order === 'hold' ? [] : [{ t: 0, order }];
    // between scenes: the new order replays the rest of the siege (the scenes already shown stay as they were)
    if (c.phase === 'playing' && c.raid && c.stance) { const next = restageRaid(g, c.raid, (c.offer ?? 0) + 1, c.stance, orders); set({ cutscene: { ...c, ...fromRaid(next), orders, offer: null } }); return; }
    set({ cutscene: { ...c, orders } });
  },
  giveRaidOrderNow: (order) => {
    const c = get().cutscene, g = get().game, v = useCutsceneView.getState().view;
    if (c?.phase !== 'playing' || !c.raid || !c.plan || !c.stance || !v || v.seg !== 'fight' || c.offer != null) return;
    const fc = fightClock(c.plan, v.game);
    if (!fc || fc.scene !== c.plan.scenes.length - 1 || !c.raid.staged.gate.battle) return;   // only the last scene is the real fight
    const orders = [...(c.orders ?? []).filter(o => o.t < fc.t - 0.5), { t: fc.t, order }];
    const next = restageRaid(g, c.raid, fc.scene, c.stance, orders, c.scoutPlan);
    set({ cutscene: { ...c, ...fromRaid(next), orders, swap: { scene: fc.scene, t: fc.t } } });
  },
  clearSwap: () => { const c = get().cutscene; if (c?.swap) set({ cutscene: { ...c, swap: null } }); },
  setScoutPlan: (plan) => { const c = get().cutscene; if (c?.phase === 'prompt') set({ cutscene: { ...c, scoutPlan: plan } }); },
  fireAllHands: (on) => { const g = structuredClone(get().game); setAllHands(g, on); set({ game: g }); },
  offerChange: (scene) => { const c = get().cutscene; if (c?.phase === 'playing' && !c.changed) set({ cutscene: { ...c, offer: scene } }); },
  midStance: (stance) => {
    const c = get().cutscene, g = get().game;
    if (c?.phase !== 'playing' || c.offer == null || !c.raid) return;
    if (!stance || stance === c.stance || c.changed) { set({ cutscene: { ...c, offer: null } }); return; }
    const next = restageRaid(g, c.raid, c.offer + 1, stance, c.orders, c.scoutPlan);
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
    const back = resumeSpeed(get().resumeTo, g.clock.speed, decisionOpen(g, get().cutscene ?? get().dayCard));
    if (back) { set({ game: { ...g, clock: { ...g.clock, speed: back } }, resumeTo: null }); return; }
    // the title screen and the "where we left off" card hold the clock until they are answered
    const feel = useFeelStore.getState();
    if (feel.title || feel.recap) return;
    if (planningHold(get().tool, get().planOpen)) return;   // drawing or placing, or the starter proposal is open: the clock waits (speed kept)
    if (get().cutscene || get().dayCard !== null || g.clock.speed === 0 || g.gate.pending || g.gate.aftermath || (g.ending && !g.ending.continued)) return;
    const days = Math.min(realDt, MAX_DT) / SECONDS_PER_DAY[g.clock.speed];
    const next = step(g, days);
    // someone at the gate: stop the clock until the player decides
    // (and when news of a rescue comes in: the card)
    const paused = (next.gate.pending && !g.gate.pending) || (next.gate.card && !g.gate.card) || (next.ending && !g.ending);
    // the collapse hits: the day-it-happened card, and the clock waits for the player
    const hitNow = !!next.disaster.kind && g.clock.t < g.disaster.hitAt && next.clock.t >= next.disaster.hitAt && get().dayCardSeen !== next.disaster.hitAt;
    if (paused || hitNow) next.clock = { ...next.clock, speed: 0 };
    set({ game: next, ...(hitNow ? { dayCard: next.disaster.hitAt } : {}), ...(paused || hitNow ? { resumeTo: g.clock.speed } : {}), ...(next.gate.pending && !g.gate.pending ? { cutscene: promptFor(next), tool: null } : {}) });
    if (dayIndex(next.clock.t) !== dayIndex(g.clock.t)) {
      void saveGame(AUTOSAVE, next);
      // a project or a need has just become "stuck": its card is on the Build tab, and a one-line toast says so
      const saidNow = Object.values(next.stalls ?? {}).filter(x => x.said).length;
      if (saidNow > Object.values(g.stalls ?? {}).filter(x => x.said).length) { const line = next.disaster.news[next.disaster.news.length - 1]?.text; if (line) get().showToast(line); }
    }
  },
  advance: (days) => set(s => { const game = step(s.game, days); return { game, cutscene: s.cutscene ?? promptFor(game) }; }),
  setSpeed: (speed) => locked() || (speed > 0 && wipeEnded(get().game)) ? undefined : set(s => ({ resumeTo: null, ...(speed > 0 ? { welcome: false } : {}), game: { ...s.game, clock: { ...s.game.clock, speed } } })),
  order: (lines) => {
    if (locked()) return false;
    const g = structuredClone(get().game);
    const ok = placeOrder(g, lines) !== null;
    if (ok) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return ok;
  },
  plan: (kind, x, z, rot) => {
    if (locked()) return;
    const why0 = planProblem(get().game, kind);
    if (why0) { get().showToast(why0[0].toUpperCase() + why0.slice(1) + '.'); return; }
    const aff = permitAffordable(get().game, kind);
    if (!aff.ok) { set({ spendAsk: null, toolProblem: aff.why }); get().showToast(aff.why ?? 'That is not affordable now.'); return; }   // the permit fee would take cash below zero
    if (isRig(kind) && !(get().game.joiners?.waiting.length)) return;   // a rig is parked only for a joiner who is waiting for a pad
    const g = structuredClone(get().game);
    const st = planStructure(g, kind, x, z, rot);
    stampHighGround(st);
    if (isRig(kind)) claimWaitingRig(g, st);
    else {
      claimForWaiting(g, st, kinOf(g).waiting);
      applyForPermit(g, st);
    }
    set({ game: g, selected: st.id });
    void saveGame(AUTOSAVE, g);
  },
  setStay: (stay, placeRig = false) => {
    const e = get().game.gate.pending;
    if (!e) return;
    const g = structuredClone(get().game);
    g.gate.pending!.stay = stay;
    g.gate.pending!.placeRig = stay === 'rig' && placeRig;
    set({ game: g });
  },
  respotJoiners: (spots) => {
    const g = structuredClone(get().game);
    for (const st of g.structures) {
      if (!st.joiner || st.joiner.spotted) continue;
      const p = spots[st.id];
      if (p) { st.x = p.x; st.z = p.z; st.rot = p.rot; }
      st.joiner.spotted = true;
    }
    set({ game: g });
  },
  stakeTerraces: (spots) => {
    if (locked()) return LOCKED_WHY;
    if (!spots.length) return 'nothing to stake';
    const why = planProblem(get().game, 'garden');
    if (why) return why;
    const g = structuredClone(get().game);
    for (const [x, z] of spots) { if (!permitAffordable(g, 'garden').ok) break; const st = planStructure(g, 'garden', x, z, 0); applyForPermit(g, st); }
    set({ game: g });
    void saveGame(AUTOSAVE, g);
    return null;
  },
  layStarter: (pieces, yard, geo) => {
    if (locked()) return 0;
    const g = structuredClone(get().game);
    let n = 0;
    for (const p of pieces) {
      if (planProblem(g, p.kind) || !permitAffordable(g, p.kind).ok) continue;
      const st = planStructure(g, p.kind, p.x, p.z, p.rot);
      stampHighGround(st);
      applyForPermit(g, st);
      n++;
    }
    if (yard && layPropertyWall(g, yard, geo) > 0) n++;
    if (n) { set({ game: g, welcome: false }); void saveGame(AUTOSAVE, g); }   // (the welcome line has done its job once the player lays the compound)
    return n;
  },
  resumeTo: null,
  keepPhoto: (data, caption) => {
    const g = structuredClone(get().game), id = 'p' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const r = takePhotoRecord(g, data, caption, id);
    if (!r.ok) return r.why;
    if (!putPhoto(id, data)) return 'The album is full.';
    removePhotos(r.dropped);
    set({ game: g }); void saveGame(AUTOSAVE, g);
    return null;
  },
  tossPhoto: (id) => { const g = structuredClone(get().game); if (dropPhoto(g, id)) { removePhotos([id]); set({ game: g }); void saveGame(AUTOSAVE, g); } },
  load: (game) => { void syncVault((game.photos ?? []).map(p => p.id)); muteFeedback(); set({ game, welcome: false, selected: null, tool: null, cutscene: promptFor(game), resumeTo: null, dayCard: null }); },
  planRun: (kind, pts, gates, offLen = 0) => {
    if (locked()) return;
    if (routeProblem(get().game, kind, pts)) return;   // a tunnel-bridge needs real low ground, a slope tunnel a hillside (the tool says why)
    const g = structuredClone(get().game);
    planRun(g, kind, pts, gates, offLen);
    set({ game: g });
    void saveGame(AUTOSAVE, g);
  },
  wallProperty: (kind, geo, shape, look) => {
    if (locked()) return 0;
    const g = structuredClone(get().game);
    const n = layPropertyWall(g, planPropertyWall(g, kind, geo, { ...(shape ? { region: compoundRegion(g, geo, shape, ROAD_GATE_W) } : {}), ...(look ? { look } : {}) }), geo);
    if (n) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return n;
  },
  planSpan: (kind, a, b) => {
    if (locked()) return LOCKED_WHY;
    const why = routeProblem(get().game, kind, [a, b]);
    if (why) return why;
    const g = structuredClone(get().game);
    planRun(g, kind, [a, b], []);
    set({ game: g });
    void saveGame(AUTOSAVE, g);
    return null;
  },
  dropBridge: (id) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = dropBridge(g, id);
    if (!why) { strandAway(g); set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  clearCollapse: (id) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = clearCollapse(g, id);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  dropRoadBridge: () => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = dropRoadBridge(g);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  rebuildRoadBridge: () => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = rebuildRoadBridge(g);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  upgradeRun: (id) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = upgradeRun(g, id);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  addSkirt: (id) => {
    const g = structuredClone(get().game);
    const why = addSkirt(g, id);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  layPaths: (edges, kind) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = layPaths(g, edges, kind);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  pickUpPath: (a, b) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    pickUpPath(g, a, b);
    set({ game: g });
    void saveGame(AUTOSAVE, g);
  },
  addWalkway: (id) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = addWalkway(g, id);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  addRazor: (id) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = addRazor(g, id);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  subscribeArmedResponse: () => { if (locked()) return LOCKED_WHY; const g = structuredClone(get().game); const why = subscribeResponse(g); if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); } return why; },
  cancelArmedResponse: () => { if (locked()) return LOCKED_WHY; const g = structuredClone(get().game); const why = cancelResponse(g); if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); } return why; },
  prepareForVisitors: (kind: PrepKind) => { if (locked()) return LOCKED_WHY; const g = structuredClone(get().game); const why = prepare(g, kind); if (!why) set({ game: g }); return why; },
  hailPasser: (id: string) => { if (locked()) return LOCKED_WHY; const g = structuredClone(get().game); const why = hailPass(g, id); if (!why) set({ game: g }); return why; },
  answerRoadHail: (how: HailAnswer) => { if (locked()) return LOCKED_WHY; const g = structuredClone(get().game); const why = answerHail(g, how); if (!why) set({ game: g }); return why; },
  buildRoadBlock: (kind: BlockKind) => { if (locked()) return LOCKED_WHY; const g = structuredClone(get().game); const why = buildBlock(g, kind); if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); } return why; },
  setRoadBlockPolicy: (p: BlockPolicy) => { if (locked()) return LOCKED_WHY; const g = structuredClone(get().game); const why = setBlockPolicy(g, p); if (!why) set({ game: g }); return why; },
  removeRoadBlock: () => { if (locked()) return LOCKED_WHY; const g = structuredClone(get().game); const why = removeBlock(g); if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); } return why; },
  foundRoadWatch: () => { if (locked()) return LOCKED_WHY; const g = structuredClone(get().game); const why = foundWatch(g); if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); } return why; },
  leaveRoadWatch: () => { if (locked()) return LOCKED_WHY; const g = structuredClone(get().game); const why = leaveWatch(g); if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); } return why; },
  addElectric: (id, backup) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = addElectric(g, id, backup);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  addFenceBackup: (id) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = addBackup(g, id);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  trimBrush: (id) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = id ? trimRun(g, id) : (trimAll(g) ? null : 'nothing to cut back');
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  fortifyRing: (geo, opts) => {
    if (locked()) return { runs: 0, structures: 0 };
    const g = structuredClone(get().game);
    const n = layFortress(g, planFortress(g, geo, opts));
    // a wall already standing across the drive gets its gate too
    cutRoadGates(g, geo.drive);
    if (n.runs + n.structures) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return n;
  },
  cutRoadGates: (drive) => {
    if (locked()) return 0;
    const g = structuredClone(get().game);
    const n = cutRoadGates(g, drive);
    if (n) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return n;
  },
  lockPassage: (id, locked) => {
    const g = structuredClone(get().game);
    setPassageLocked(g, id, locked);
    set({ game: g });
    void saveGame(AUTOSAVE, g);
  },
  setLightDefault: (mode) => { const g = structuredClone(get().game); lightsOf(g).mode = mode; set({ game: g }); },
  setLightMode: (id, mode) => { const g = structuredClone(get().game); const l = lightsOf(g); if (mode) l.per[id] = mode; else delete l.per[id]; set({ game: g }); },
  setLightAi: (id, on) => { const g = structuredClone(get().game); const why = setAiSensor(g, id, on); if (!why) set({ game: g }); return why; },
  setAllLightsAi: (ids, on) => { const g = structuredClone(get().game); const n = setAllAi(g, ids, on); if (n) set({ game: g }); return n; },
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
  setTool: (tool) => { if (!locked()) set({ tool, toolProblem: null, spendAsk: null, ...(tool ? { stakedNote: null } : {}) }); },
  setToolProblem: (toolProblem) => set({ toolProblem }),
  flashStaked: (text) => {
    set({ stakedNote: text });
    setTimeout(() => { if (useGameStore.getState().stakedNote === text) useGameStore.setState({ stakedNote: null }); }, 9000);
  },
  select: (selected) => { if (!locked()) set({ selected }); },
  focusHud: (hudFocus) => set({ hudFocus }),
  hire: (id, count = 1) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const { hired, why } = hireCrews(g, id, count);
    if (hired) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return hired ? null : why;
  },
  setFocus: (id) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = setFocus(g, id);
    if (!why) set({ game: g });
    return why;
  },
  markTrees: (trees) => {
    if (locked()) return 0;
    const g = structuredClone(get().game);
    let n = 0;
    for (const { tree, haulDist } of trees) if (!isMarked(g, tree.id) && markTree(g, tree, haulDist)) n++;
    if (n) set({ game: g });
    return n;
  },
  hireGuard: () => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = hireGuard(g);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  dismissGuard: () => {
    if (locked()) return;
    const g = structuredClone(get().game);
    dismissGuard(g);
    set({ game: g });
  },
  dismiss: (crewId) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    dismissCrew(g, crewId);
    set({ game: g });
  },
  setAmbushParty: ids => {
    const g = structuredClone(get().game);
    g.digs ??= newDigs();
    g.digs.partyPick = ids;
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
    log(g, k === 'quietDeliveries' ? (on ? 'Picking deliveries up in town from now on: fewer people see the truck.' : 'Deliveries come to the place again.') : (on ? 'Lights out: windows, fire pit and lamps go dark, nothing shows from the road.' : 'Lights back on.'));
    set({ game: g });
  },
  setLightsOutAuto: (m) => { if (locked()) return; const g = structuredClone(get().game); opsecOf(g).auto = m; log(g, `Lights-out routine: ${AUTO_NAME[m].toLowerCase()}.`); set({ game: g }); },
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
  setComfort: (tier) => {
    if (locked()) return;
    const g = structuredClone(get().game);
    if (tier) g.paper.comfort = tier; else delete g.paper.comfort;
    log(g, tier ? `The household will live ${tier === 'plain' ? 'plainly' : tier === 'comfortable' ? 'comfortably' : 'graciously'} from now on.` : 'The household will live as the savings allow.');
    set({ game: g });
  },
  callRuleVote: (rule, option) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = voteProblem(g, rule, option);
    if (why) return why;
    const r = callVote(g, rule, option)!;
    set({ game: g });
    return r.line;
  },
  hookup: (what) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = orderHookup(g, what);
    if (!why) { set({ game: g }); void saveGame(AUTOSAVE, g); }
    return why;
  },
  setEntrance: (z) => {
    if (locked()) return LOCKED_WHY;
    const g = structuredClone(get().game);
    const why = chooseEntrance(g, z);
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
    if (!g.ending || g.ending.kind === 'wipe') return;   // a wipe cannot be played on: nobody is alive on the place (sim/wipe.ts)
    g.ending.continued = true;
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
  askPrisoner: (id, q, approach) => {
    if (locked()) return [];
    const g = structuredClone(get().game), res = interrogate(g, id, q, approach);
    if (res.refused) return [res.refused];
    set({ game: g });
    return res.lines;
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
    gridChanged(g, on);
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
    if (!unscripted(g.disaster.mode) || (g.disaster.kind && g.disaster.phase !== 'peace')) return;
    triggerDisaster(g.disaster, g.clock.t, kind, g.seed, warnDays);
    set({ game: g });
  },
  setupOpen: false,
  shopOpen: false,
  shopTab: null,
  openShop: (shopOpen, tab) => { if (!locked() || !shopOpen) set({ shopOpen, shopTab: shopOpen ? tab ?? null : null }); },
  scheduleOpen: false,
  openSchedule: (scheduleOpen) => set({ scheduleOpen }),
  daily: (op) => {
    const g = structuredClone(get().game);
    const why = op(g);
    if (!why) set({ game: g });
    return why;
  },
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
