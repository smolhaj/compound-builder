/**
 * FL2: the felt layer's world (docs/FELT_LAYER.md 5.2). Owns the four layers that show persistent world state and decides, about once a second,
 * whether anything needs rebuilding: the marks for today are a pure function of the sim (`sim/felt/marks.ts`); only when their signature changes
 * does it place them (`markPlacement.ts`) and refill the instance and merge buffers. Per frame it moves uniforms only.
 *
 * Draw calls: flood plane 1, decals 1, roadside props 1, lit farm windows 1, fallout plume 1 = 5 (limit 6); fire and smoke ride on FireFx (already counted).
 * No lights, no post passes, no shadow casters. Hidden (`visible = false`) when a layer has nothing to show.
 */
import * as THREE from 'three';
import type { FireSource } from '../../engine/world/fx/FireFx';
import { feltSpec } from '../../sim/felt/registry';
import { FT_PER_UNIT, cropLook, feltMarks, streamDrop, farmLooks, markDay, marksActive, marksSignature, type FarmLook, type MarkTier } from '../../sim/felt/marks';
import type { GameState } from '../../sim/state';
import { setFeltFires } from '../atmosphere/fireSources';
import { CrackDecals } from './CrackDecals';
import { FloodPlane } from './FloodPlane';
import { placeMarks, type PlaceHost, type Placed } from './markPlacement';
import { RoadsideProps } from './RoadsideProps';

function glowSprite(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,236,190,1)'); gr.addColorStop(0.25, 'rgba(255,196,110,0.65)'); gr.addColorStop(1, 'rgba(255,170,70,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** A fallout plume standing on the sky: one soft grey stripe at a bearing, leaning with the wind. One draw call, no lights, drawn over the sky only. */
function plumeTexture(): THREE.CanvasTexture {
  const W = 128, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  for (let y = 0; y < H; y++) {
    const v = y / H;                       // 0 top .. 1 bottom
    const half = 0.12 + 0.34 * (1 - v) ** 0.6;   // wide at the top, a column at the foot
    for (let x = 0; x < W; x++) {
      const u = Math.abs(x / W - 0.5) / half;
      const a = Math.max(0, 1 - u * u) * (v < 0.08 ? v / 0.08 : 1) * (0.35 + 0.65 * (1 - v * 0.4));
      g.fillStyle = `rgba(${96 + Math.round(30 * v)},${90 + Math.round(24 * v)},${82 + Math.round(18 * v)},${a.toFixed(3)})`; g.fillRect(x, y, 1, 1);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export interface FeltStats { marks: number; decals: number; props: number; fires: number; flood: number; rebuilds: number; draws: number; triangles: number }

export class FeltWorld {
  readonly flood: FloodPlane;
  readonly decals: CrackDecals;
  readonly props: RoadsideProps;
  private readonly _glow: THREE.Points;
  private readonly _plume: THREE.Mesh;
  /** The home fields' look and the creek's drop, read by HomesteadWorld and the stream (GameCanvas wires them). */
  crop = { dead: 0, empty: false };
  streamDrop = 0;
  private _sig = '';
  private _farmKey = '';
  private _last: Placed | null = null;
  private _nightK = 0;
  stats: FeltStats = { marks: 0, decals: 0, props: 0, fires: 0, flood: 0, rebuilds: 0, draws: 0, triangles: 0 };
  /** Called when the neighbor farmsteads should be rebuilt in another look (rare). */
  onFarms: ((looks: FarmLook[]) => void) | null = null;

  constructor(scene: THREE.Scene) {
    this.flood = new FloodPlane(scene); this.decals = new CrackDecals(scene); this.props = new RoadsideProps(scene);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(3 * 12), 3)); g.setDrawRange(0, 0);
    this._glow = new THREE.Points(g, new THREE.PointsMaterial({ map: glowSprite(), size: 1.1, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc36a }));
    this._glow.name = 'felt_farm_glow'; this._glow.visible = false; this._glow.frustumCulled = false; this._glow.userData = { type: 'feltGlow', noSSAO: true };
    scene.add(this._glow);
    this._plume = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: plumeTexture(), transparent: true, opacity: 0, depthWrite: false, fog: false, color: 0xffffff }));
    this._plume.name = 'felt_plume'; this._plume.visible = false; this._plume.frustumCulled = false; this._plume.renderOrder = -1; this._plume.userData = { type: 'feltPlume', noSSAO: true };
    scene.add(this._plume);
  }
  private _plumeSev = 0;
  private _zoom = 1;
  /**
   * The camera's distance to the camp sets how big the roadside set is drawn: 1 up close, up to 6 from the diorama's orbit (a prop is 2 px at the default
   * zoom otherwise). Bucketed to halves so the merged mesh is rebuilt only when the view really changes.
   */
  setViewDistance(d: number): void {
    const k = Math.round(Math.max(1, Math.min(3.5, d / 9)) * 2) / 2;
    if (k === this._zoom) return;
    this._zoom = k;
    if (this._last) this.props.set(this._last.props, k);
  }

  /** Recompute the marks and rebuild what changed. `now` skips the rise and the fade (a loaded game, a QA jump). */
  update(game: GameState, host: PlaceHost, tier: MarkTier, now = false): void {
    const active = marksActive(game);
    const marks = active ? feltMarks(game, markDay(game), feltSpec(game.disaster.kind), tier) : [];
    const sig = `${tier}|${marksSignature(marks)}`;
    let placed = this._last;
    if (sig !== this._sig || !placed) {
      this._sig = sig;
      placed = placeMarks(game, marks, host);
      this._last = placed;
      this.stats.rebuilds++;
      // Low keeps the decals (one instanced draw call, no shadows): the cracks, scars and dry mud are the cheapest readable cue; fewer of them
      this.decals.set(tier === 'low' ? placed.decals.slice(0, 48) : placed.decals, !now);
      this.props.set(placed.props, this._zoom);
      setFeltFires(placed.fires as FireSource[]);
    }
    // the flood follows the marks every time (it rises and drains between rebuilds); feet to units
    const fl = marks.find(m => m.kind === 'flood');
    this.flood.set(fl && fl.anchor.at === 'lowland' ? fl.anchor.level / FT_PER_UNIT : 0, host, { flat: tier === 'low', now });
    // the fields, the creek and the plume (read from the kind and the day, not from a rebuild)
    const kind = active ? game.disaster.kind as import('../../sim/felt/types').FeltKind : null, day = markDay(game);
    this.crop = cropLook(kind, day); this.streamDrop = streamDrop(kind, day);
    const pl = marks.find(m => m.kind === 'plume');
    this._plumeSev = pl ? pl.sev : 0;
    if (pl && pl.anchor.at === 'sky') {
      const d = 210, p = this._plume;
      p.position.set(host.camp.x + Math.sin(pl.anchor.bearing) * d, host.groundAt(host.camp.x, host.camp.z) + 34, host.camp.z + Math.cos(pl.anchor.bearing) * d);
      p.scale.set(95, 80, 1); p.lookAt(host.camp.x, p.position.y, host.camp.z);
    }
    // the neighbor farms: look and lit windows
    const looks = farmLooks(game, marks, host.farms.length || 3);
    const key = looks.map(l => l.variant).join(',');
    if (key !== this._farmKey) { this._farmKey = key; this.onFarms?.(looks); }
    this._setGlow(looks, host);
    this.stats = { ...this.stats, marks: marks.length, decals: this.decals.count, props: this.props.count, fires: placed.fires.length, flood: Math.round(this.flood.level * FT_PER_UNIT * 10) / 10, draws: this.drawCalls(), triangles: this.triangles() };
  }

  private _setGlow(looks: readonly FarmLook[], host: PlaceHost): void {
    const pos = this._glow.geometry.getAttribute('position') as THREE.BufferAttribute;
    let n = 0;
    looks.forEach((l, i) => {
      const f = host.farms[i];
      if (!f || !l.lit || n > 9) return;
      const c = Math.cos(f.rot), s = Math.sin(f.rot);
      // the farmhouse's front windows (regionalFarmsteads puts the house near local (-3.2, -3.4)); two lit panes and a candle-glow at the porch
      for (const [lx, lz, ly] of [[-3.65, -4.2, 0.24], [-2.75, -4.2, 0.24], [-3.2, -2.5, 0.2]] as const) {
        const x = f.x + lx * c + lz * s, z = f.z - lx * s + lz * c;
        pos.setXYZ(n++, x, host.groundAt(x, z) + ly, z);
      }
    });
    pos.needsUpdate = true; this._glow.geometry.setDrawRange(0, n); this._glow.userData.count = n;
  }

  /** Per frame: uniforms only. `night` is 0 (day) to 1 (dark). */
  frame(dt: number, night: number): void {
    this.flood.frame(dt); this.decals.frame(dt);
    const pm = this._plume.material as THREE.MeshBasicMaterial;
    pm.opacity += (0.62 * this._plumeSev - pm.opacity) * Math.min(1, dt * 2);
    pm.color.setScalar(1 - 0.85 * night);
    this._plume.visible = pm.opacity > 0.01;
    this._nightK += (night - this._nightK) * Math.min(1, dt * 2);
    const n = this._glow.userData.count as number | undefined ?? 0;
    const op = Math.max(0, Math.min(1, (this._nightK - 0.15) / 0.5)) * 0.95;
    (this._glow.material as THREE.PointsMaterial).opacity = op;
    this._glow.visible = n > 0 && op > 0.01;
  }

  drawCalls(): number { return [this.flood.mesh, this.decals.mesh, this.props.mesh, this._glow, this._plume].filter(m => m.visible).length; }
  triangles(): number { return (this.flood.mesh.visible ? (this.flood.mesh.geometry.index?.count ?? 0) / 3 : 0) + this.decals.count * 2 + this.props.triangles; }
  /** The placement last made (QA and the audit). */
  get placed(): Placed | null { return this._last; }

  dispose(): void {
    setFeltFires([]);
    this.flood.dispose(); this.decals.dispose(); this.props.dispose();
    this._plume.geometry.dispose(); (this._plume.material as THREE.MeshBasicMaterial).map?.dispose(); (this._plume.material as THREE.Material).dispose(); this._plume.removeFromParent();
    this._glow.geometry.dispose(); (this._glow.material as THREE.PointsMaterial).map?.dispose(); (this._glow.material as THREE.Material).dispose(); this._glow.removeFromParent();
  }
}
