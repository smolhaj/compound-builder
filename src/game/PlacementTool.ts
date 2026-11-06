import { isOrchard, orchardSiteNote } from '../sim/orchard';
import * as THREE from 'three';
import { ownsAt } from '../sim/land';
import { KIT, PROBLEM_TEXT, snapCenter, footprint, type SiteQuery } from './buildkit/kit';
import { DEPTH, isUnderground, previewDatum, siteProblem } from './buildkit/underground';
import { useWorldStore } from '../store/worldStore';
import { buildGhost } from './buildkit/buildings';
import type { HomesteadWorld } from './HomesteadWorld';
import { useGameStore } from '../store/gameStore';
import { hydroProblem } from '../sim/renewables';
import { dockProblem, isDock } from '../sim/waterfront';
import { siteNote } from '../sim/microclimate';
import { onJustPlaced, type Spot } from './buildkit/justPlaced';
import { stakeSpendAsk } from '../sim/spendGuard';
import { DRIVE_W } from './region/access';
import { YARD_GAPS, YARD_SITE, YARD_SLIDES, spurGradeOk, spurProfileOk, yardBesideDrive, yardSpur } from './buildkit/yardSite';
import { arcNear, distToPolyline, pointAtArc } from './perimeter/gateKitLayout';
import { clashText, padClash, padSnap } from './buildkit/padRules';

/**
 * Build tool: a translucent ghost of the kit piece follows the cursor over
 * the terrain, snapped to the 3 m grid; green where it can go, red (with the
 * reason in the HUD) where it can't. Click to place, R to rotate, Esc /
 * right-click to stop. On a slope a piece whose graded pad would cut into the
 * pad of a neighbour at another level is refused with the neighbour named, and
 * S snaps the ghost to the nearest spot where the pads clear (buildkit/padRules).
 */
export class PlacementTool {
  private readonly _ray = new THREE.Raycaster();
  private readonly _ndc = new THREE.Vector2();
  private _ghost: THREE.Group | null = null;
  private _kind: string | null = null;
  private _rot = 0;
  /** A vehicle yard near the drive sits beside it, turned to its heading with the gate toward it (buildkit/yardSite); R flips it to the other side. */
  private _yardRot: number | null = null;
  private _yardFlip = false;
  private get _turn(): number { return this._yardRot ?? this._rot; }
  private _at: [number, number] | null = null;
  private _ok = false;
  /** The nearest clear spot when the pad clashes with a neighbour's (S jumps there). */
  private _snap: [number, number] | null = null;
  /** The spot just staked: the cursor is still over it, so say nothing about it. */
  private _just: Spot | null = null;
  private _down: { x: number; y: number } | null = null;
  private readonly _okMat = new THREE.MeshBasicMaterial({ color: 0x9be38a, transparent: true, opacity: 0.45, depthWrite: false });
  private readonly _badMat = new THREE.MeshBasicMaterial({ color: 0xe36a5a, transparent: true, opacity: 0.45, depthWrite: false });
  private readonly _off: Array<() => void> = [];
  private readonly _site: SiteQuery;
  private readonly _scene: THREE.Scene;
  private readonly _camera: THREE.PerspectiveCamera;
  private readonly _dom: HTMLElement;
  private readonly _world: HomesteadWorld;

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera, dom: HTMLElement, world: HomesteadWorld) {
    this._scene = scene; this._camera = camera; this._dom = dom; this._world = world;
    const _world = world, _dom = dom;
    this._site = {
      height: (x, z) => _world.parcel.natural(x, z).h,
      owned: (x, z) => ownsAt(useGameStore.getState().game, x, z),
      water: (x, z) => _world.parcel.isCreek(x, z) || _world.stream.depthAt(x, z) > 0,
      blocked: (x, z) => _world.onCamp(x, z) || _world.onAccess(x, z, 0.1),
      rule: (kind, x, z) => (kind === 'micro_hydro' ? hydroProblem(useGameStore.getState().game, x, z) : isDock(kind) ? dockProblem(useGameStore.getState().game) : null),
    };
    const on = <K extends keyof HTMLElementEventMap>(el: HTMLElement | Window, t: K, f: (e: HTMLElementEventMap[K]) => void) => {
      el.addEventListener(t, f as EventListener);
      this._off.push(() => el.removeEventListener(t, f as EventListener));
    };
    on(_dom, 'pointermove', e => this._move(e.clientX, e.clientY));
    // off the map (onto a panel): no ghost, no message about a spot the cursor is not over
    on(_dom, 'pointerleave', () => { if (!this._kind) return; this._at = null; this._ok = false; if (this._ghost) this._ghost.visible = false; useGameStore.getState().setToolProblem(null); });
    on(_dom, 'pointerdown', e => { if (e.button === 0) this._down = { x: e.clientX, y: e.clientY }; if (e.button === 2) this.setKind(null); });
    on(_dom, 'pointerup', e => {
      const d = this._down;
      this._down = null;
      if (e.button !== 0 || !d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5) return;
      this._place(e.shiftKey);
    });
    on(window, 'keydown', e => {
      if (!this._kind) return;
      if (e.code === 'KeyR') { if (this._yardRot !== null) this._yardFlip = !this._yardFlip; else this._rot = (this._rot + 1) % 4; this._update(); }
      if (e.code === 'KeyS' && !e.ctrlKey && !e.metaKey && this._snap) { this._at = [this._snap[0], this._snap[1]]; this._update(); }
      if (e.code === 'Escape') this.setKind(null);
    });
  }

  get active(): boolean { return this._kind !== null; }

  setKind(kind: string | null): void {
    if (kind && !KIT[kind]) kind = null;          // another tool (tree marking) is active
    if (kind === this._kind) return;
    const wasPlacing = this._kind !== null;
    this._kind = kind;
    this._just = null;
    this._yardRot = null; this._yardFlip = false;
    if (this._ghost) { this._scene.remove(this._ghost); this._ghost.traverse(o => (o as THREE.Mesh).geometry?.dispose()); this._ghost = null; }
    if (kind) {
      if (isUnderground(KIT[kind])) useWorldStore.getState().setUnderground(true);
      this._ghost = buildGhost(KIT[kind]);
      this._ghost.traverse(o => { if ((o as THREE.Mesh).isMesh) { (o as THREE.Mesh).castShadow = false; (o as THREE.Mesh).renderOrder = 5; } });
      this._ghost.visible = false;
      this._scene.add(this._ghost);
    }
    const st = useGameStore.getState();
    if (st.tool !== kind && (kind || (wasPlacing && st.tool && KIT[st.tool]))) st.setTool(kind);
  }

  /** QA: put the ghost at a world point. */
  hoverAt(x: number, z: number, rot = this._rot): void {
    this._rot = rot;
    this._at = [x, z];
    this._update();
  }

  /** QA / click: place at the current hover point if allowed. */
  private _place(repeat = false, force = false): void {
    if (!this._kind || !this._at || !this._ok) return;
    const [x, z] = this._at, kind = this._kind;
    const store = useGameStore.getState();
    // the county permit fee would take the cash under the living reserve (or negative): ask first, never block (sim/spendGuard)
    const ask = force ? null : stakeSpendAsk(store.game, kind);
    if (ask) { store.askSpend({ kind, x, z, rot: this._turn, cost: ask.cost, after: ask.check.after, reserve: ask.check.reserve, cannot: ask.cannot }); return; }
    const before = store.game.structures.length;
    store.plan(kind, x, z, this._turn);
    const placed = useGameStore.getState().game.structures.length > before;
    this._just = { x, z, rot: this._turn };
    // one click stakes one building and puts the tool away (Shift-click keeps it armed to stake several), with a line saying so
    if (placed && !repeat) {
      this.setKind(null);
      // (an orchard planted in a cold-air pocket loses its blossom to the late frosts: say so while it can still be moved: sim/orchard.ts)
      const gm = useGameStore.getState().game, note = isOrchard(kind) ? [orchardSiteNote(gm, x, z), siteNote(gm, kind, { x, z })].filter(Boolean).join(' ') || null : siteNote(gm, kind, { x, z });
      useGameStore.getState().flashStaked(`Staked out the ${kind.replace(/_/g, ' ')}. The family will start when the materials are in (Projects tab). Shift-click stakes several in a row.${note ? ' ' + note : ''}`);
      return;
    }
    this._update();
  }

  /** QA: place at the hover point and keep the tool armed (screenshot scripts stake several pieces in a row). */
  placeHere(): void { this._place(true, true); }

  /** QA: the nearest valid spot for a piece to (x, z) (searched in a growing ring on the build grid), or null. */
  findSpot(kind: string, x: number, z: number, rot = 0, maxR = 30): [number, number] | null {
    const def = KIT[kind];
    const placed = useGameStore.getState().game.structures;
    for (let r = 0; r <= maxR; r += 0.5) {
      const n = Math.max(1, Math.ceil(2 * Math.PI * r / 0.5));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const [sx, sz] = snapCenter(def, x + Math.cos(a) * r, z + Math.sin(a) * r, rot);
        if (siteProblem(def, sx, sz, rot, this._site, placed) === null && !padClash(def, sx, sz, rot, this._site.height, placed)) return [sx, sz];
      }
    }
    return null;
  }

  private _move(cx: number, cy: number): void {
    if (!this._kind || !this._world.terrain.mesh) return;
    const r = this._dom.getBoundingClientRect();
    this._ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this._ray.setFromCamera(this._ndc, this._camera);
    const hit = this._ray.intersectObject(this._world.terrain.mesh, false)[0];
    if (!hit) return;
    this._at = [hit.point.x, hit.point.z];
    this._yardFlip = false;
    this._update();
  }

  private _update(): void {
    const g = this._ghost, kind = this._kind;
    if (!g || !kind || !this._at) return;
    const def = KIT[kind];
    let [x, z] = snapCenter(def, this._at[0], this._at[1], this._rot);
    // beside the drive: the yard's own site (a diagonal drive turns it a fractional quarter)
    this._yardRot = null;
    const drive = kind === 'vehicle_yard' ? this._world.access.drive : undefined;
    if (drive && distToPolyline(drive, this._at) < YARD_SITE.snapR) {
      // nearest setback whose ground will take a yard (the road's own cut bank or fill can be too steep right at its edge)
      const placed0 = useGameStore.getState().game.structures;
      let ys = null as ReturnType<typeof yardBesideDrive>;
      const nat = yardBesideDrive(drive, this._at, 1, DRIVE_W)?.side ?? 1, sd: 1 | -1 = this._yardFlip ? (nat === 1 ? -1 : 1) : nat;
      search: for (const gap of YARD_GAPS) for (const along of YARD_SLIDES) {
        const c = yardBesideDrive(drive, this._at, def.cellsX * 0.25, DRIVE_W, sd, gap, along);
        if (!c) break search;
        if (siteProblem(def, c.x, c.z, c.rot, this._site, placed0) === null && !padClash(def, c.x, c.z, c.rot, this._site.height, placed0) && this._spurOk(def, c)) { ys = c; break search; }
      }
      if (ys) { x = ys.x; z = ys.z; this._yardRot = ys.rot; }
    }
    this._at = [x, z];
    if (onJustPlaced(this._just, x, z, this._turn)) { this._ok = false; g.visible = false; useGameStore.getState().setToolProblem(null); return; }
    this._just = null;
    const placed = useGameStore.getState().game.structures;
    const problem = siteProblem(def, x, z, this._turn, this._site, placed);
    // (a spot the plain rules allow can still grade a pad into a neighbour's, at another level)
    const clash = problem === null ? padClash(def, x, z, this._turn, this._site.height, placed) : null;
    this._snap = null;
    let clashMsg: string | null = null;
    if (clash) {
      this._snap = padSnap(def, x, z, this._turn, this._site.height, placed, (px, pz) => snapCenter(def, px, pz, this._turn), (px, pz) => siteProblem(def, px, pz, this._turn, this._site, placed) === null);
      clashMsg = clashText(clash, this._snap ? Math.hypot(this._snap[0] - x, this._snap[1] - z) * 6 : null);
    }
    this._ok = problem === null && !clash;
    const fp = footprint(def, x, z, this._turn);
    // a bunker room's ghost hangs at its bunker's floor level, under the see-through ground
    const y = isUnderground(def) ? previewDatum(def, x, z, this._turn, this._site.height, placed) ?? this._site.height(x, z) - DEPTH : def.waterside ? (this._world.parcel.lakeY ?? this._world.parcel.creek.waterY(x)) + 0.02 : this._world.parcel.padHeight(fp.x0, fp.z0, fp.x1, fp.z1);
    g.position.set(x, y, z);
    g.rotation.y = this._turn * Math.PI / 2;
    g.visible = true;
    const m = this._ok ? this._okMat : this._badMat;
    g.traverse(o => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = m; });
    useGameStore.getState().setToolProblem(problem ? PROBLEM_TEXT[problem] : clashMsg);
  }

  /** The gravel spur from the yard's gate must meet the road's edge at a drivable grade: not a yard on a bench above a road cut. */
  private _spurOk(def: (typeof KIT)[string], c: { x: number; z: number; rot: number }): boolean {
    const half = def.cellsX * 0.25, drive = this._world.access.drive, th = c.rot * Math.PI / 2, fx = Math.sin(th), fz = Math.cos(th);
    const spur = yardSpur(drive, c.x, c.z, c.rot, half, DRIVE_W), fp = footprint(def, c.x, c.z, c.rot);
    const pad = this._world.parcel.padHeight(fp.x0, fp.z0, fp.x1, fp.z1), road = this._world.groundAt(c.x + fx * (half + spur), c.z + fz * (half + spur));
    // and no retaining wall (a road cut's stone face) across the way from the gate to the road
    for (let k = 0; k <= 4; k++) { const d = half + (spur + 0.25) * k / 4; if (this._world.walls.blocks(c.x + fx * d, c.z + fz * d)) return false; }
    // the road itself must be at the spur's end: not in a cut below it or on a fill above it (the road bed's bank starts at its edge)
    const g: [number, number] = [c.x + fx * half, c.z + fz * half], rc = pointAtArc(drive, arcNear(drive, g)), roadY = this._world.groundAt(rc[0], rc[1]);
    if (Math.abs(road - roadY) > 0.08) return false;
    for (const k of [-0.5, 0.5]) { const ex = c.x + fx * (half + spur) - fz * k, ez = c.z + fz * (half + spur) + fx * k; if (Math.abs(this._world.groundAt(ex, ez) - roadY) > 0.1 + 0.15 * Math.abs(k)) return false; }
    // and the ground across the whole way is one plain slope from the pad to the road: a bank beside or across the spur (a road cut's slope, a bench edge) refuses the site
    const hs: number[][] = [];
    for (let i = 0; i <= 4; i++) { const d = half + spur * i / 4, row: number[] = []; for (const k of [-0.35, 0, 0.35]) row.push(this._world.groundAt(c.x + fx * d - fz * k, c.z + fz * d + fx * k)); hs.push(row); }
    if (!spurProfileOk(pad, roadY, hs, 0.1 + 0.05 * Math.abs(roadY - pad))) return false;
    return spurGradeOk(spur, roadY - pad);
  }

  dispose(): void {
    this.setKind(null);
    this._off.forEach(f => f());
    this._okMat.dispose();
    this._badMat.dispose();
  }
}
