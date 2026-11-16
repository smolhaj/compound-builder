/**
 * FL2: the felt layer's world (docs/FELT_LAYER.md 5.2). Owns the four layers that show persistent world state and decides, about once a second,
 * whether anything needs rebuilding: the marks for today are a pure function of the sim (`sim/felt/marks.ts`); only when their signature changes
 * does it place them (`markPlacement.ts`) and refill the instance and merge buffers. Per frame it moves uniforms only.
 *
 * Draw calls: flood plane 1, decals 1, roadside props 1, lit farm windows 1 = 4 (limit 6); fire and smoke ride on FireFx (already counted).
 * No lights, no post passes, no shadow casters. Hidden (`visible = false`) when a layer has nothing to show.
 */
import * as THREE from 'three';
import type { FireSource } from '../../engine/world/fx/FireFx';
import { feltSpec } from '../../sim/felt/registry';
import { FT_PER_UNIT, feltMarks, farmLooks, markDay, marksActive, marksSignature, type FarmLook, type MarkTier } from '../../sim/felt/marks';
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

export interface FeltStats { marks: number; decals: number; props: number; fires: number; flood: number; rebuilds: number; draws: number; triangles: number }

export class FeltWorld {
  readonly flood: FloodPlane;
  readonly decals: CrackDecals;
  readonly props: RoadsideProps;
  private readonly _glow: THREE.Points;
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
      this.decals.set(tier === 'low' ? [] : placed.decals, !now);
      this.props.set(placed.props);
      setFeltFires(placed.fires as FireSource[]);
    }
    // the flood follows the marks every time (it rises and drains between rebuilds); feet to units
    const fl = marks.find(m => m.kind === 'flood');
    this.flood.set(fl && fl.anchor.at === 'lowland' ? fl.anchor.level / FT_PER_UNIT : 0, host, { flat: tier === 'low', now });
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
    this._nightK += (night - this._nightK) * Math.min(1, dt * 2);
    const n = this._glow.userData.count as number | undefined ?? 0;
    const op = Math.max(0, Math.min(1, (this._nightK - 0.15) / 0.5)) * 0.95;
    (this._glow.material as THREE.PointsMaterial).opacity = op;
    this._glow.visible = n > 0 && op > 0.01;
  }

  drawCalls(): number { return [this.flood.mesh, this.decals.mesh, this.props.mesh, this._glow].filter(m => m.visible).length; }
  triangles(): number { return (this.flood.mesh.visible ? (this.flood.mesh.geometry.index?.count ?? 0) / 3 : 0) + this.decals.count * 2 + this.props.triangles; }
  /** The placement last made (QA and the audit). */
  get placed(): Placed | null { return this._last; }

  dispose(): void {
    setFeltFires([]);
    this.flood.dispose(); this.decals.dispose(); this.props.dispose();
    this._glow.geometry.dispose(); (this._glow.material as THREE.PointsMaterial).map?.dispose(); (this._glow.material as THREE.Material).dispose(); this._glow.removeFromParent();
  }
}
