/**
 * Atmosphere on the compound (decided with the user: "all of these" — night
 * life, weathering, a season montage). Draws what the pure helpers decide:
 *
 *   night     per-building window light (oil / electric / blackout curtain /
 *             dark: shared glow materials swapped per building), the room
 *             lamp's brightness, the fire pit, flashlights for the watch,
 *             the generator's exhaust and running light
 *   aging     `aWear` on every building and perimeter mesh (weathering.ts),
 *             weeds and saplings on untended ground
 *   seasons   drifts against the walls, mud season and morning frost
 *             (season patch uniforms), the stock tank icing over
 *
 * Reads sim state only (read-only hooks); no save fields.
 */
import * as THREE from 'three';
import type { Quality } from '../../engine/world/WorldScene';
import type { GameState, Structure } from '../../sim/state';
import { calendarOf, dayIndex } from '../../sim/state';
import { REGIONS } from '../../sim/regions';
import { isHome } from '../../sim/blueprints';
import type { PerimeterRun } from '../../sim/perimeter';
import { KIT, footprint } from '../buildkit/kit';
import { kitMaterial, type KitMaterialId } from '../buildkit/materials';
import { CAMP } from '../props/campGeometry';
import { FirePit } from '../props/firePit';
import { StockTank } from '../props/stockTank';
import { Flashlights, type Carrier } from '../fx/Flashlights';
import type { FamilyRenderer } from '../people/FamilyRenderer';
import { SmokePlume } from '../../engine/world/fx/SmokePlume';
import { seasonState } from '../../engine/world/season/seasonState';
import { writeSeasonExtras } from '../../engine/world/season/seasonShader';
import { containerWear, overgrowth, packWear, structureAge, wearFor, wetnessOf, type Wear } from './aging';
import { curtainSets, lightsOutNow } from '../../sim/blackout';
import { awakeAtHome, firePitLit, flashlightCarriers, generatorRunning, windowLight, type LampKind, type NightPerson } from './nightLife';
import { frostAt, mudSeason, troughIce } from './seasonCover';
import { kitIdOf, setMeshWear, WEAR_CLASS } from './weathering';
import { SnowDrifts, type DriftWall } from './snowDrifts';
import { Overgrowth, type WildArea } from './Overgrowth';

/** What the atmosphere needs of a built structure. */
export interface AtmosBuilding {
  id: string;
  kind: string;
  x: number; z: number; rot: number;
  group: THREE.Group;
  finished: boolean;
  under: boolean;
}

export interface AtmosHost {
  scene: THREE.Scene;
  groundAt: (x: number, z: number) => number;
  buildings: () => Iterable<AtmosBuilding>;
  runs: () => Iterable<{ run: PerimeterRun; group: THREE.Group }>;
  camp: { x: number; z: number; rot: number };
  family: FamilyRenderer;
  /** Is the spot taken (buildings, access, camp): no weeds there. */
  blocked: (x: number, z: number) => boolean;
}

/** The frame's sky and weather. */
export interface AtmosFrame {
  dt: number;
  /** Seconds of real time (animation clock). */
  time: number;
  hour: number;
  /** 0–1 darkness of the sky (WorldScene.nightFactor). */
  night: number;
  daylight: number;
  wind: number;
  rain: number;
  cloud: number;
  /** Lying snow 0–1 (season + weather). */
  snow: number;
  viewportH: number;
  battle: boolean;
}

const LAMP_MAT: Record<LampKind, KitMaterialId> = { off: 'glow_off', oil: 'glow_oil', electric: 'glow_electric', curtained: 'glow_curtain' };
/** Layers that are the building's inside (never weathered). */
const INSIDE = new Set(['interior', 'decor', 'loft']);
/** No drifts against these (open, flat or tiny). */
const NO_DRIFT = new Set(['garden', 'field', 'orchard', 'septic', 'solar_array', 'well_drilled', 'well_hand']);
const WILD_KINDS = new Set(['garden', 'field']);

export class Atmosphere {
  readonly firePit: FirePit;
  /** World spot of the fire pit (and its seats, world x, z). */
  readonly fire: { x: number; z: number; seats: Array<[number, number]> };
  private readonly _h: AtmosHost;
  private readonly _flash: Flashlights;
  private readonly _drifts: SnowDrifts;
  private readonly _wild: Overgrowth;
  private _tank: StockTank | null = null;
  private _tankKey = '';
  private _q: Quality = 'high';
  /** Room brightness per building (0–1), for its lamp. */
  private readonly _room = new Map<string, number>();
  private readonly _wearKey = new Map<string, string>();
  private readonly _repairedAt = new Map<string, number>();
  private readonly _roofDone = new Map<string, boolean>();
  private readonly _gens = new Map<string, { smoke: SmokePlume; lamp: THREE.Mesh; group: THREE.Group }>();
  private _genLamp: THREE.MeshBasicMaterial | null = null;
  private _wearTimer = 0;
  private _mud = 0;
  private _frost = 0;
  /** QA: force every window's lamp kind / the fire. */
  qa: { lamp?: LampKind; fire?: number } = {};

  constructor(host: AtmosHost) {
    this._h = host;
    const c = host.camp, cs = Math.cos(c.rot), sn = Math.sin(c.rot);
    const toW = (lx: number, lz: number): [number, number] => [c.x + lx * cs + lz * sn, c.z - lx * sn + lz * cs];
    const [fx, fz] = toW(CAMP.fire.x, CAMP.fire.z);
    this.firePit = new FirePit(false, 7);
    this.firePit.group.position.set(fx, host.groundAt(fx, fz), fz);
    host.scene.add(this.firePit.group);
    this.fire = { x: fx, z: fz, seats: [] };
    this._flash = new Flashlights(host.scene);
    this._drifts = new SnowDrifts(host.scene);
    this._wild = new Overgrowth(host.scene);
  }

  setQuality(q: Quality): void {
    this._q = q;
    this.firePit.setQuality(q);
    this._flash.setQuality(q);
    this._wild.setQuality(q);
  }

  /** Room brightness for a building's lamp tonight (undefined: not decided here). */
  room(id: string): number | undefined { return this._room.get(id); }
  /** Mud season now (0–1): the canvas darkens the damp ground with it. */
  get mud(): number { return this._mud; }
  get frost(): number { return this._frost; }

  update(f: AtmosFrame, game: GameState, doy: number): void {
    const people: NightPerson[] = game.people.map((p, i) => {
      const st = game.personState[i];
      return { id: p.id, task: st?.task ?? 'idle', kid: !!p.kid, gone: st?.needs.died != null };
    });
    const lightsOut = lightsOutNow(game), curtains = curtainSets(game);
    const built = [...this._h.buildings()];
    // ── seasons: mud, frost, drifts, the stock tank ──
    const R = REGIONS[game.site.region];
    const sp = seasonState.params;
    this._mud = mudSeason(doy, R.frost[0], R.cold, sp.snow);
    this._frost = frostAt(f.hour, sp.cold, f.snow, f.cloud);
    writeSeasonExtras(this._frost, this._mud);
    const driftsOn = this._q !== 'low';
    if (driftsOn && f.snow > 0.05) this._drifts.build(this._driftKey(built), this._driftWalls(built, game.perimeter), this._h.groundAt);
    this._drifts.update(f.snow, driftsOn);
    this._syncTank(built);
    this._tank?.setIce(troughIce(sp.ice, this._frost));
    // ── night: windows and lamps ──
    const awake = awakeAtHome(people);
    const watch = people.some(p => !p.gone && p.task === 'watch');
    const homes = built.filter(b => b.finished && !b.under && isHome(b.kind)).sort((a, b) => KIT[b.kind].sleeps - KIT[a.kind].sleeps);
    for (const b of built) {
      if (!b.finished || b.under || !KIT[b.kind].light) { if (!b.under) this._setLamp(b.group, 'off'); continue; }
      const home = KIT[b.kind].sleeps > 0;
      const rank = homes.indexOf(b);
      // the main house holds the household; another house is lit when there are more people than the first sleeps
      const here = !home ? 0 : rank === 0 ? awake : Math.max(0, awake - KIT[homes[0].kind].sleeps * rank);
      const powered = game.utilities.lit.includes(b.id);
      // lights out: a house with a set of curtains keeps its room lit behind them; every other building goes dark
      const covered = lightsOut && home && rank < curtains;
      const w = windowLight({ hour: f.hour, night: f.night, home, awake: here, powered, blackout: covered, dark: lightsOut && !covered, watch: watch && rank === 0 });
      const kind = this.qa.lamp ?? w.kind;
      this._room.set(b.id, this.qa.lamp ? (kind === 'off' ? 0 : 0.8) : w.room);
      this._setLamp(b.group, kind);
    }
    // ── the fire pit ──
    const hasHome = homes.length > 0;
    let sitting = 0;
    for (const id of this._h.family.shown) { const p = this._h.family.poseOf(id); if (p && Math.hypot(p.x - this.fire.x, p.z - this.fire.z) < 0.5) sitting++; }
    const collapsed = !!game.disaster.kind && game.clock.t >= game.disaster.hitAt;
    const lit = this.qa.fire ?? firePitLit({ hour: f.hour, sittingOut: sitting, rain: f.rain, cold: sp.cold, hasHome, blackout: lightsOut, collapsed: collapsed || lightsOut, night: f.night });
    const wx = 0.08 + f.wind * 0.45, wz = 0.03 + f.wind * 0.12;
    this.firePit.update(f.time, lit, wx, wz, f.daylight, f.viewportH);
    // ── flashlights ──
    const threat = {
      radioWarned: !!game.radio && dayIndex(game.clock.t) <= game.radio.warnedUntil,
      atGate: !!game.gate.pending, battle: f.battle, dogs: (game.stock.dog ?? 0) >= 1 && !!game.gate.pending,
    };
    // lights out: the watch goes without a torch unless it has come to a fight or someone is at the gate
    const ids = lightsOut && !f.battle && !threat.atGate ? [] : flashlightCarriers(people, this._h.family.shown, f.night, threat);
    const carriers: Carrier[] = [];
    for (const id of ids) { const p = this._h.family.poseOf(id); if (p) carriers.push({ x: p.x, y: this._h.groundAt(p.x, p.z), z: p.z, rot: p.rot }); }
    this._flash.update(carriers, f.night, f.time);
    // ── the generator ──
    this._syncGenerators(built, game, f, wx, wz);
    // ── aging (a few times a second is plenty: it changes over years) ──
    this._wearTimer -= f.dt;
    if (this._wearTimer <= 0) {
      this._wearTimer = 0.5;
      this._syncWear(built, game);
      this._syncWild(built, game);
    }
    this._wild.setDormant(Math.max(sp.dormant, sp.bare * 0.6));
  }

  // ── night ───────────────────────────────────────────────────────────────
  private _setLamp(group: THREE.Group, kind: LampKind): void {
    const want = kitMaterial(LAMP_MAT[kind]);
    for (const o of group.children) {
      const m = o as THREE.Mesh;
      if (!m.isMesh) continue;
      const ud = m.userData as { baseMat?: THREE.Material; glow?: boolean };
      const base = ud.baseMat ?? (m.material as THREE.Material);
      if (!ud.glow && !base.name.startsWith('kit_glow')) continue;
      ud.glow = true;
      if (base === want) continue;
      if (m.material === base) m.material = want;
      ud.baseMat = want;
    }
  }

  private _syncGenerators(built: readonly AtmosBuilding[], game: GameState, f: AtmosFrame, wx: number, wz: number): void {
    const sheds = built.filter(b => b.kind === 'generator_shed' && b.finished && !game.utilities.fried.includes(b.id));
    for (const [id, g] of this._gens) if (!sheds.some(b => b.id === id && b.group === g.group)) {
      g.smoke.points.parent?.remove(g.smoke.points); g.smoke.dispose(); g.lamp.parent?.remove(g.lamp); g.lamp.geometry.dispose(); this._gens.delete(id);
    }
    this._genLamp ??= new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 1.6, 0.35) });
    const running = generatorRunning(game.utilities.report?.genKwh ?? 0, 7, f.hour);
    for (const b of sheds) {
      let g = this._gens.get(b.id);
      if (!g) {
        // the exhaust out the back corner under the eave, the running light by the door
        const box = new THREE.Box3().setFromObject(b.group);
        const ex = new THREE.Vector3(box.max.x - 0.02, box.min.y + (box.max.y - box.min.y) * 0.62, box.min.z + 0.03);
        const smoke = new SmokePlume(ex, { rise: 0.55, size: 0.12, color: 0x8a8580 });
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 4), this._genLamp);
        lamp.position.set((box.min.x + box.max.x) / 2 + 0.06, box.min.y + 0.2, box.max.z + 0.004);
        lamp.userData.noSSAO = true;
        this._h.scene.add(smoke.points, lamp);
        g = { smoke, lamp, group: b.group };
        this._gens.set(b.id, g);
      }
      g.smoke.update(f.time * 3, running ? 0.8 : 0, wx * 0.6, wz * 0.6, f.daylight, f.viewportH);
      g.lamp.visible = running && Math.sin(f.time * 3.2) > -0.6;
    }
  }

  // ── aging ───────────────────────────────────────────────────────────────
  /** Years on a building's walls and its roof, and the years since a repair (null: none). */
  private _ages(st: Structure | undefined, game: GameState): { walls: number; roof: number; repaired: number | null; roofRepaired: boolean } {
    if (!st) return { walls: 0, roof: 0, repaired: null, roofRepaired: false };
    const cal = calendarOf(game.clock), imp = game.site.improvements;
    const builtYear = !st.pre ? null : isHome(st.kind) ? imp.house?.built ?? null : st.kind === 'barn' ? imp.barn?.built ?? null : null;
    const walls = structureAge({ finishedAt: st.finishedAt, t: game.clock.t, pre: st.pre, builtYear, nowYear: cal.year, startYear: game.clock.startYear });
    const roofFix = (st.fixes ?? []).find(x => x.part === 'roof');
    const done = !!roofFix && roofFix.done >= roofFix.hours;
    // a repair seen happening: remember when; done before we looked: assume at the start
    if (roofFix) {
      const was = this._roofDone.get(st.id);
      if (done && was === false) this._repairedAt.set(st.id, game.clock.t);
      this._roofDone.set(st.id, done);
    }
    const at = done ? this._repairedAt.get(st.id) ?? 0 : null;
    const since = at === null ? null : Math.max(0, game.clock.t - at) / 365;
    const roof = roofFix ? (done ? since! : walls + (roofFix.cond === 'poor' ? 16 : 6)) : walls;
    return { walls, roof, repaired: since, roofRepaired: done };
  }

  private _syncWear(built: readonly AtmosBuilding[], game: GameState): void {
    const wet = wetnessOf(REGIONS[game.site.region].rainMm);
    const byId = new Map(game.structures.map(s => [s.id, s]));
    for (const b of built) {
      const a = this._ages(byId.get(b.id), game);
      const key = `${b.group.uuid}|${b.finished}|${Math.round(a.walls * 10)}|${Math.round(a.roof * 10)}|${a.repaired === null ? '-' : Math.round(a.repaired * 10)}`;
      if (this._wearKey.get(b.id) === key) continue;
      this._wearKey.set(b.id, key);
      const walls = wearFor(a.walls, wet, a.repaired), roof = wearFor(a.roof, wet);
      const cont = containerWear(a.walls, wet);
      for (const o of b.group.children) {
        const m = o as THREE.Mesh;
        if (!m.isMesh) continue;
        const id = kitIdOf(m), cls = id ? WEAR_CLASS[id] ?? null : null;
        if (!cls) continue;
        const layer = m.userData.layer as string;
        const w: Wear = !b.finished || INSIDE.has(layer) ? { rust: 0, gray: 0, peel: 0, moss: 0, patch: 0, grime: 0 } : cls === 'container' ? cont : layer === 'roof' ? roof : walls;
        setMeshWear(m, packWear(w, cls));
      }
    }
    // the perimeter: rust on the container wall, gray on the posts and rails
    for (const { run, group } of this._h.runs()) {
      const years = run.finishedAt === null ? 0 : Math.max(0, game.clock.t - run.finishedAt) / 365;
      const key = `${group.uuid}|${Math.round(years * 10)}`;
      if (this._wearKey.get(run.id) === key) continue;
      this._wearKey.set(run.id, key);
      const w = wearFor(years, wet), cont = containerWear(years, wet);
      group.traverse(o => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const id = kitIdOf(m), cls = id ? WEAR_CLASS[id] ?? null : null;
        if (cls) setMeshWear(m, packWear(cls === 'container' ? cont : w, cls));
      });
    }
  }

  /**
   * Untended ground: fields and gardens while nobody is left to work them
   * (and, once the place is empty, the foot of every wall).
   */
  private _syncWild(built: readonly AtmosBuilding[], game: GameState): void {
    const t = game.clock.t;
    const living = game.personState.filter(p => p.needs.died == null && p.task !== 'gone');
    const goneSince = living.length ? null : game.ending?.day ?? Math.max(0, ...game.personState.map(p => p.needs.died ?? 0));
    const days = goneSince === null ? 0 : Math.max(0, t - goneSince);
    const og = overgrowth(days);
    const areas: WildArea[] = [];
    const step = (v: number) => Math.round(v * 12) / 12;
    for (const b of built) {
      if (!b.finished || b.under) continue;
      const r = footprint(KIT[b.kind], b.x, b.z, b.rot, false);
      const seed = [...b.id].reduce((a, c) => a * 31 + c.charCodeAt(0), 7);
      if (WILD_KINDS.has(b.kind)) areas.push({ x0: r.x0 + 0.04, z0: r.z0 + 0.04, x1: r.x1 - 0.04, z1: r.z1 - 0.04, weeds: step(og.weeds), saplings: step(og.saplings), seed });
      else if (og.weeds > 0) areas.push({ x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, weeds: step(og.weeds * 0.8), saplings: 0, seed, ring: 0.12 });
    }
    const key = areas.map(a => `${a.x0.toFixed(2)},${a.z0.toFixed(2)},${a.weeds},${a.saplings}`).join('|');
    const blocked = (x: number, z: number) => this._h.blocked(x, z);
    // weeds in a field grow between the rows too: only the walls and the access block them
    this._wild.build(key, areas, this._h.groundAt, (x, z) => blocked(x, z) && !areas.some(a => !a.ring && x > a.x0 && x < a.x1 && z > a.z0 && z < a.z1));
  }

  get wildCounts(): { weeds: number; saplings: number } { return this._wild.counts; }

  // ── seasons ─────────────────────────────────────────────────────────────
  private _driftKey(built: readonly AtmosBuilding[]): string {
    return built.filter(b => b.finished && !b.under).map(b => b.id).join(',') + '|' + [...this._h.runs()].filter(r => r.run.kind === 'container_wall' && r.run.finishedAt !== null).map(r => r.run.id).join(',');
  }

  private _driftWalls(built: readonly AtmosBuilding[], runs: readonly PerimeterRun[]): DriftWall[] {
    const out: DriftWall[] = [];
    for (const b of built) {
      if (!b.finished || b.under || NO_DRIFT.has(b.kind)) continue;
      const r = footprint(KIT[b.kind], b.x, b.z, b.rot, false);
      out.push(
        { x0: r.x1, z0: r.z0, x1: r.x1, z1: r.z1, nx: 1, nz: 0 },
        { x0: r.x0, z0: r.z1, x1: r.x0, z1: r.z0, nx: -1, nz: 0 },
        { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z0, nx: 0, nz: -1 },
        { x0: r.x1, z0: r.z1, x1: r.x0, z1: r.z1, nx: 0, nz: 1 },
      );
    }
    for (const run of runs) {
      if (run.kind !== 'container_wall' || run.finishedAt === null) continue;
      for (let i = 1; i < run.pts.length; i++) {
        const [ax, az] = run.pts[i - 1], [bx, bz] = run.pts[i], l = Math.hypot(bx - ax, bz - az);
        if (l < 0.1) continue;
        const nx = (bz - az) / l, nz = -(bx - ax) / l, o = 0.21;
        out.push({ x0: ax + nx * o, z0: az + nz * o, x1: bx + nx * o, z1: bz + nz * o, nx, nz });
        out.push({ x0: bx - nx * o, z0: bz - nz * o, x1: ax - nx * o, z1: az - nz * o, nx: -nx, nz: -nz });
      }
    }
    return out;
  }

  /** A stock tank by the barn (or the chicken coop): where the animals drink. */
  private _syncTank(built: readonly AtmosBuilding[]): void {
    const b = built.find(x => x.finished && x.kind === 'barn') ?? built.find(x => x.finished && x.kind === 'chicken_coop');
    const key = b ? `${b.id}|${b.x},${b.z},${b.rot}` : '';
    if (key === this._tankKey) return;
    this._tankKey = key;
    if (this._tank) { this._h.scene.remove(this._tank.group); this._tank.dispose(); this._tank = null; }
    if (!b) return;
    const r = footprint(KIT[b.kind], b.x, b.z, b.rot, false);
    // on the sheltered east side, off the corner
    const x = r.x1 + 0.3, z = r.z0 + Math.min(0.45, (r.z1 - r.z0) * 0.3);
    this._tank = new StockTank();
    this._tank.group.position.set(x, this._h.groundAt(x, z) - 0.005, z);
    this._h.scene.add(this._tank.group);
  }

  dispose(): void {
    this._h.scene.remove(this.firePit.group);
    this.firePit.dispose();
    this._flash.dispose();
    this._drifts.dispose();
    this._wild.dispose();
    if (this._tank) { this._h.scene.remove(this._tank.group); this._tank.dispose(); }
    for (const g of this._gens.values()) { g.smoke.points.parent?.remove(g.smoke.points); g.smoke.dispose(); g.lamp.parent?.remove(g.lamp); }
    writeSeasonExtras(0, 0);
  }
}
