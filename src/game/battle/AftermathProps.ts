/**
 * The props of the quiet after a fight that has a death in it (sim/raidDrama.ts): the tools in people's hands (a shovel, a rake, a hammer), the grave (pit,
 * mound, a plank marker), and the planks nailed across a breach. Everything drawn here is something a caption says is happening: a grave that is dug when
 * "they dig", a mound when "they fill it in". Instanced where there are several, fixed small caps, all of it taken away in `end()` (the leak test counts).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BattleEvent } from '../../sim/battleTypes';

type ToolKind = 'shovel' | 'rake' | 'hammer';
const MAX_TOOLS = 3;
interface Hooks { ground: (x: number, z: number) => number; puff: (p: THREE.Vector3, r0: number, r1: number, life: number, rise: number, color: number, o0: number, glow?: boolean) => void }
interface Grave { x: number; z: number; dig: { t0: number; secs: number } | null; fill: { t0: number; secs: number } | null; lowered: boolean; yaw: number }
interface Repair { x: number; z: number; w: number; heading: number; t0: number; secs: number }
interface Held { unit: string; what: ToolKind; t0: number; secs: number }

const part = (g: THREE.BufferGeometry, color: number): THREE.BufferGeometry => {
  const n = g.getAttribute('position').count, c = new Float32Array(n * 3), k = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
};
const WOOD = 0x6e5233, IRON = 0x8a8d90, EARTH = 0x5a4228, PIT = 0x1c130b, PLANK = 0xa98a58;

export class AftermathProps {
  private _held: Held[] = [];
  private _meshes = new Map<ToolKind, THREE.InstancedMesh>();
  private _grave: { g: Grave; group: THREE.Group; pit: THREE.Mesh; mound: THREE.Mesh; marker: THREE.Group } | null = null;
  private _repair: { r: Repair; group: THREE.Group; planks: THREE.Mesh[] } | null = null;
  private _geo: THREE.BufferGeometry[] = [];
  private _mat: THREE.Material[] = [];
  private _t = 0;
  private _puffAt = 0;
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _e = new THREE.Euler();
  private readonly _p = new THREE.Vector3();
  private readonly _s = new THREE.Vector3(1, 1, 1);
  private readonly _group: THREE.Group;
  private readonly _h: Hooks;
  constructor(group: THREE.Group, hooks: Hooks) { this._group = group; this._h = hooks; }

  get live(): { tools: number; grave: boolean; repair: boolean } { return { tools: this._held.length, grave: !!this._grave, repair: !!this._repair }; }

  private _mesh(what: ToolKind): THREE.InstancedMesh {
    let m = this._meshes.get(what);
    if (m) return m;
    // a tool is a handle and a head, 0.2 to 0.26 long (a person is 0.28 tall): vertex colours, one shared material
    const parts: THREE.BufferGeometry[] = what === 'shovel'
      ? [part(new THREE.BoxGeometry(0.012, 0.21, 0.012).translate(0, 0.105, 0), WOOD), part(new THREE.BoxGeometry(0.05, 0.06, 0.008).translate(0, -0.025, 0), IRON)]
      : what === 'rake'
        ? [part(new THREE.BoxGeometry(0.012, 0.21, 0.012).translate(0, 0.105, 0), WOOD), part(new THREE.BoxGeometry(0.11, 0.012, 0.012).translate(0, -0.004, 0), IRON), part(new THREE.BoxGeometry(0.11, 0.02, 0.004).translate(0, -0.018, 0), IRON)]
        : [part(new THREE.BoxGeometry(0.012, 0.1, 0.012).translate(0, 0.05, 0), WOOD), part(new THREE.BoxGeometry(0.045, 0.022, 0.022).translate(0, 0.105, 0), IRON)];
    const geo = mergeGeometries(parts)!;
    for (const p of parts) p.dispose();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
    this._geo.push(geo); this._mat.push(mat);
    m = new THREE.InstancedMesh(geo, mat, MAX_TOOLS);
    m.count = 0; m.frustumCulled = false; m.userData = { noSSAO: true };
    this._group.add(m); this._meshes.set(what, m);
    return m;
  }

  private _box(w: number, h: number, d: number, color: number): THREE.Mesh {
    const geo = new THREE.BoxGeometry(w, h, d), mat = new THREE.MeshStandardMaterial({ color, roughness: 0.95 });
    this._geo.push(geo); this._mat.push(mat);
    return new THREE.Mesh(geo, mat);
  }

  onEvent(e: BattleEvent): void {
    if (e.kind === 'tool') {
      this._held = this._held.filter(x => x.unit !== e.unit);
      if (this._held.length < MAX_TOOLS * 3) this._held.push({ unit: e.unit, what: e.what, t0: this._t, secs: e.secs });
    } else if (e.kind === 'grave') {
      if (!this._grave) {
        const group = new THREE.Group(), y = this._h.ground(e.x, e.z);
        const pit = this._box(0.26, 0.012, 0.14, PIT), mound = this._box(0.3, 0.06, 0.17, EARTH), marker = new THREE.Group();
        const post = this._box(0.012, 0.09, 0.012, PLANK), bar = this._box(0.06, 0.012, 0.012, PLANK);
        post.position.y = 0.045; bar.position.y = 0.07; marker.add(post, bar);
        const yaw = 0.5 + ((e.x * 12.9898 + e.z * 78.233) % 1) * 0.4;
        group.position.set(e.x, y, e.z); group.rotation.y = yaw;
        pit.position.y = 0.004; mound.position.y = 0.03; marker.position.set(-0.17, 0, 0);
        pit.visible = mound.visible = marker.visible = false;
        group.add(pit, mound, marker);
        this._group.add(group);
        this._grave = { g: { x: e.x, z: e.z, dig: null, fill: null, lowered: false, yaw }, group, pit, mound, marker };
      }
      const G = this._grave.g;
      if (e.stage === 'dig') G.dig = { t0: this._t, secs: Math.max(1, e.secs) };
      else if (e.stage === 'lower') G.lowered = true;
      else G.fill = { t0: this._t, secs: Math.max(1, e.secs) };
    } else if (e.kind === 'repair') {
      if (this._repair) return;
      const group = new THREE.Group(), planks: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) { const p = this._box(Math.max(0.25, e.w * 0.95), 0.045, 0.018, PLANK); p.position.y = 0.09 + i * 0.12; p.rotation.z = (i - 1) * 0.035; p.visible = false; group.add(p); planks.push(p); }
      group.position.set(e.x, this._h.ground(e.x, e.z), e.z); group.rotation.y = e.heading - Math.PI / 2;
      this._group.add(group);
      this._repair = { r: { x: e.x, z: e.z, w: e.w, heading: e.heading, t0: this._t, secs: Math.max(1, e.secs) }, group, planks };
    }
  }

  update(dt: number, at: (id: string) => { x: number; y: number; z: number; rot: number; dead: boolean; gone: boolean } | null): void {
    this._t += dt;
    // tools in hand: held forward at the hip and swung (dig and rake: a stroke every 0.8 s; hammer: quick taps)
    const per = new Map<ToolKind, number>();
    for (const m of this._meshes.values()) m.count = 0;
    this._held = this._held.filter(x => this._t - x.t0 < x.secs + 0.2);
    for (const h of this._held) {
      const u = at(h.unit); if (!u || u.dead || u.gone) continue;
      const mesh = this._mesh(h.what), n = per.get(h.what) ?? 0; if (n >= MAX_TOOLS) continue;
      per.set(h.what, n + 1);
      const age = this._t - h.t0, k = h.what === 'hammer' ? 7 : 4.2, swing = Math.sin(age * k) * 0.5 + 0.5;
      // in the hand ahead of the body, the head down by the ground at the bottom of the stroke
      const fx = Math.sin(u.rot), fz = Math.cos(u.rot);
      const reach = 0.085 + swing * 0.03;
      this._p.set(u.x + fx * reach + fz * 0.03, this._h.ground(u.x, u.z) + u.y + (h.what === 'hammer' ? 0.12 : 0.1) + (1 - swing) * 0.03, u.z + fz * reach - fx * 0.03);
      this._e.set(h.what === 'hammer' ? -0.9 + swing * 1.5 : 0.35 + swing * 0.55, u.rot, 0, 'YXZ');
      this._q.setFromEuler(this._e);
      this._m.compose(this._p, this._q, this._s);
      mesh.setMatrixAt(n, this._m); mesh.count = n + 1; mesh.instanceMatrix.needsUpdate = true;
    }
    // the grave: the pit opens as they dig, the fallen lies in it, the mound rises as they fill it in, and a plank marks the head
    const gr = this._grave;
    if (gr) {
      const { g } = gr;
      const dug = g.dig ? Math.min(1, (this._t - g.dig.t0) / g.dig.secs) : 0;
      gr.pit.visible = dug > 0; gr.pit.scale.set(0.25 + 0.75 * dug, 1, 0.25 + 0.75 * dug);
      const filled = g.fill ? Math.min(1, (this._t - g.fill.t0) / g.fill.secs) : 0;
      gr.mound.visible = filled > 0.02; gr.mound.scale.set(0.5 + 0.5 * filled, Math.max(0.05, filled), 0.5 + 0.5 * filled);
      if (filled > 0.5) gr.pit.visible = false;   // (the earth has covered it)
      gr.marker.visible = filled >= 1;
      // earth flying: a brown puff off the spade every third of a second while they dig or fill
      if (((g.dig && dug < 1) || (g.fill && filled < 1)) && this._t - this._puffAt > 0.33) {
        this._puffAt = this._t;
        this._h.puff(new THREE.Vector3(g.x + Math.cos(this._t * 3) * 0.05, this._h.ground(g.x, g.z) + 0.04, g.z + Math.sin(this._t * 3) * 0.05), 0.012, 0.045, 0.55, 0.03, 0x6b5232, 0.7);
      }
    }
    // the planks across the breach, one after another
    const rp = this._repair;
    if (rp) { const f = Math.min(1, (this._t - rp.r.t0) / rp.r.secs); rp.planks.forEach((p, i) => { p.visible = f > (i + 0.3) / 3.2; }); }
  }

  end(): void {
    for (const m of this._meshes.values()) this._group.remove(m);
    this._meshes.clear(); this._held = [];
    if (this._grave) this._group.remove(this._grave.group);
    if (this._repair) this._group.remove(this._repair.group);
    this._grave = null; this._repair = null;
    for (const g of this._geo) g.dispose();
    for (const m of this._mat) m.dispose();
    this._geo = []; this._mat = []; this._t = 0; this._puffAt = 0;
  }
}
