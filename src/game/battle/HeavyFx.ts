/**
 * Heavy weapons against a sealed dome shell, drawn for the raid scene (visual only: no sim rule, no state, nothing saved, nothing left on the shell).
 * A crew with an RPG, a tank gun, a .50 cal, an anti-materiel rifle, a mortar, a breaching charge, a truck bomb, a thermite cut or a drone drop is shown
 * hitting the Arcology and the Arcology being unmarked: every effect here is a flash, a streak, a puff or a spark that fades, never a decal, a dent or
 * a scorch (the lasting marks of lighter attacks are `ShellFx` marks and `GameState.shellScars`, which the sealed tier does not take).
 * Procedural art only; scale v2: 1 unit = 20 ft, a person is 0.28 tall. Idle cost is zero: nothing is added to the scene until `fire` or `prop` is called,
 * `update` returns at once while `active` is false, and `end` removes everything and frees it.
 */
import * as THREE from 'three';

export interface HeavyHooks {
  ground: (x: number, z: number) => number;
  puff: (p: THREE.Vector3, r0: number, r1: number, life: number, rise: number, color: number, o0: number, glow?: boolean) => void;
  flash: (p: THREE.Vector3, k: number, color: number) => void;
  shake: (v: number) => void;
  tracer: (a: THREE.Vector3, b: THREE.Vector3) => void;
}

export type HeavyKind = 'rpg' | 'tank' | 'hmg' | 'amr' | 'mortar' | 'charge' | 'vbied' | 'thermite' | 'drone';

const MAXSPARK = 160;
interface Spark { p: THREE.Vector3; v: THREE.Vector3; age: number; life: number; len: number }
interface Shot { mesh: THREE.Object3D; a: THREE.Vector3; b: THREE.Vector3; age: number; dur: number; trail: boolean; last: number; then: () => void }
interface Later { at: number; run: () => void }

const mat = (c: number, r = 0.8, m = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

/** A tank, front toward +z, tracks on y = 0 (a modern main battle tank: about 26 ft hull, 12 ft wide). `userData.turret` is the turret group, `userData.muzzle` the gun's tip in turret space. */
export function buildTank(): THREE.Group {
  const g = new THREE.Group(), olive = mat(0x5d6048, 0.85), dark = mat(0x2a2c26, 0.9), rub = mat(0x1d1d1d, 1);
  const box = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = g) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = true; p.add(o); return o; };
  box(0.5, 0.15, 1.2, olive, 0, 0.17, 0);                 // hull
  box(0.46, 0.05, 0.3, olive, 0, 0.27, 0.46).rotation.x = -0.3;   // glacis
  for (const s of [-1, 1]) {
    box(0.13, 0.15, 1.3, rub, s * 0.3, 0.09, 0);          // track run
    box(0.15, 0.04, 1.32, dark, s * 0.3, 0.19, 0);        // skirt
    for (let i = 0; i < 7; i++) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12).rotateZ(Math.PI / 2), mat(0x303030, 0.9)); w.position.set(s * 0.3, 0.08, -0.52 + i * 0.17); g.add(w); }
  }
  const tur = new THREE.Group(); tur.position.set(0, 0.26, -0.05); g.add(tur);
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.1, 8), olive); t.position.y = 0.06; t.castShadow = true; tur.add(t);
  box(0.26, 0.07, 0.3, olive, 0, 0.08, -0.18, tur);       // bustle
  box(0.2, 0.07, 0.18, olive, 0, 0.07, 0.17, tur);        // mantlet
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.9, 10).rotateX(Math.PI / 2), dark); barrel.position.set(0, 0.075, 0.6); barrel.castShadow = true; tur.add(barrel);
  const brake = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 10).rotateX(Math.PI / 2), dark); brake.position.set(0, 0.075, 1.05); tur.add(brake);
  box(0.05, 0.04, 0.05, dark, 0.07, 0.14, -0.02, tur);    // cupola
  const mg = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.1, 6).rotateX(Math.PI / 2), dark); mg.position.set(0.07, 0.19, 0.04); tur.add(mg);
  g.userData = { type: 'heavy_tank', turret: tur, muzzle: new THREE.Vector3(0, 0.075, 1.08) };
  return g;
}

/** A box truck loaded for a car bomb, front toward +z, wheels on y = 0 (about 24 ft long). */
export function buildBombTruck(): THREE.Group {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  add(new THREE.BoxGeometry(0.17, 0.06, 0.62), mat(0x2b2d30, 0.8), 0, 0.075, 0);
  add(new THREE.BoxGeometry(0.17, 0.12, 0.16), mat(0xa8441f, 0.6), 0, 0.17, 0.25);              // cab
  add(new THREE.BoxGeometry(0.15, 0.05, 0.005), mat(0x182028, 0.2, 0.3), 0, 0.19, 0.335);         // windshield
  add(new THREE.BoxGeometry(0.18, 0.17, 0.4), mat(0xd8d4c8, 0.7), 0, 0.215, -0.1);              // cargo box
  for (const s of [-1, 1]) for (const z of [-0.2, 0.0, 0.25]) add(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 12).rotateZ(Math.PI / 2), mat(0x151515, 1), s * 0.09, 0.04, z);
  g.userData = { type: 'heavy_vbied' };
  return g;
}

/** A quadcopter with a bomb under it (about 4 ft across: heavy lift). */
export function buildDrone(): THREE.Group {
  const g = new THREE.Group(), body = mat(0x25282c, 0.5, 0.3);
  const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.012, 0.05), body); g.add(b);
  for (const [x, z] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.06), body); arm.position.set(x * 0.03, 0, z * 0.03); arm.rotation.y = x * z * Math.PI / 4; g.add(arm);
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.002, 16), new THREE.MeshBasicMaterial({ color: 0x9aa4ac, transparent: true, opacity: 0.35, depthWrite: false })); r.position.set(x * 0.058, 0.008, z * 0.058); g.add(r);
  }
  const bomb = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.04, 8).rotateX(Math.PI / 2), mat(0x3a3a2c, 0.7)); bomb.position.y = -0.016; bomb.name = 'bomb'; g.add(bomb);
  g.userData = { type: 'heavy_drone' };
  return g;
}

/** A weapon prop to hold at a raider's shoulder: pointing +z. */
export function buildWeapon(kind: 'rpg' | 'amr' | 'hmg' | 'mortar'): THREE.Group {
  const g = new THREE.Group(), steel = mat(0x2b2d2f, 0.5, 0.5), olive = mat(0x4f5a3c, 0.85);
  const tube = (r: number, l: number, m: THREE.Material, z = 0, y = 0) => { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, 10).rotateX(Math.PI / 2), m); o.position.set(0, y, z); g.add(o); return o; };
  if (kind === 'rpg') { tube(0.006, 0.07, olive, 0.0); const w = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.025, 8).rotateX(Math.PI / 2), mat(0x3a4a3a)); w.position.z = 0.048; g.add(w); }
  if (kind === 'amr') { tube(0.003, 0.11, steel, 0.02); const stock = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.05), olive); stock.position.set(0, -0.003, -0.04); g.add(stock); const sc = tube(0.004, 0.03, steel, 0, 0.01); sc.position.z = 0.0; }
  if (kind === 'hmg') {
    tube(0.004, 0.09, steel, 0.03); const body = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.014, 0.05), steel); body.position.z = -0.01; g.add(body);
    for (const a of [0, 2.1, 4.2]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.05, 5), steel); leg.position.set(Math.sin(a) * 0.014, -0.022, Math.cos(a) * 0.014); leg.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); g.add(leg); }
  }
  if (kind === 'mortar') { const t = tube(0.007, 0.07, steel, 0, 0.0); t.rotation.x = Math.PI / 2 - 1.15; t.position.set(0, 0.032, 0); const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.003, 12), mat(0x2a2a2a)); g.add(bp); }
  g.traverse(o => { (o as THREE.Mesh).castShadow = true; });
  return g;
}

export class HeavyFx {
  private readonly _group: THREE.Group;
  private readonly _h: HeavyHooks;
  private _t = 0;
  private _shots: Shot[] = [];
  private _later: Later[] = [];
  private _props: THREE.Object3D[] = [];
  private _ring: Array<{ m: THREE.Mesh; age: number; life: number; r1: number }> = [];
  private _sparks: Spark[] = [];
  private _spark: THREE.InstancedMesh | null = null;
  private _glow: Array<{ m: THREE.Mesh; age: number; life: number }> = [];
  private readonly _m = new THREE.Matrix4();
  private readonly _q = new THREE.Quaternion();
  private readonly _c = new THREE.Color();
  private _seed = 5;
  /** Number of impacts drawn so far (QA reads it). */
  impacts = 0;

  constructor(group: THREE.Group, hooks: HeavyHooks) { this._group = group; this._h = hooks; }

  get active(): boolean { return this._shots.length > 0 || this._later.length > 0 || this._ring.length > 0 || this._sparks.length > 0 || this._glow.length > 0; }
  private _r(): number { this._seed = (Math.imul(this._seed, 1664525) + 1013904223) >>> 0; return this._seed / 4294967296; }

  /** A prop that stays until `end` (the tank, the truck, a weapon): the scene owns it, `end` frees it. */
  prop(o: THREE.Object3D): THREE.Object3D { this._group.add(o); this._props.push(o); return o; }

  /** Clears every effect and prop. */
  end(): void {
    for (const s of this._shots) { this._group.remove(s.mesh); this._free(s.mesh); }
    for (const p of this._props) { this._group.remove(p); this._free(p); }
    for (const r of this._ring) { this._group.remove(r.m); r.m.geometry.dispose(); (r.m.material as THREE.Material).dispose(); }
    for (const r of this._glow) { this._group.remove(r.m); r.m.geometry.dispose(); (r.m.material as THREE.Material).dispose(); }
    if (this._spark) { this._group.remove(this._spark); this._spark.geometry.dispose(); (this._spark.material as THREE.Material).dispose(); this._spark = null; }
    this._shots = []; this._props = []; this._ring = []; this._glow = []; this._sparks = []; this._later = []; this._t = 0; this.impacts = 0;
  }
  /** Effects only (props stay): the scene after the smoke has cleared. */
  clearFx(): void {
    const props = this._props; this._props = [];
    this.end(); this._props = props;
  }
  private _free(o: THREE.Object3D): void { o.traverse(c => { const m = c as THREE.Mesh; if (m.isMesh) { m.geometry.dispose(); const mm = m.material; if (Array.isArray(mm)) mm.forEach(x => x.dispose()); else mm.dispose(); } }); }

  /**
   * One weapon fires from `from` at the shell point `at`; `n` is the outward unit vector of the shell there. `delay` seconds from now.
   * Everything it makes fades: the shell takes no mark.
   */
  fire(kind: HeavyKind, from: THREE.Vector3, at: THREE.Vector3, n: THREE.Vector3, delay = 0): void {
    this._later.push({ at: this._t + delay, run: () => this._go(kind, from.clone(), at.clone(), n.clone()) });
  }

  private _go(kind: HeavyKind, from: THREE.Vector3, at: THREE.Vector3, n: THREE.Vector3): void {
    const h = this._h, dir = at.clone().sub(from).normalize();
    switch (kind) {
      case 'rpg': {
        // backblast behind the tube, a smoking rocket in
        h.flash(from, 8, 0xffa050);
        for (let i = 0; i < 4; i++) h.puff(from.clone().addScaledVector(dir, -0.04 - i * 0.035).add(new THREE.Vector3((this._r() - 0.5) * 0.03, (this._r() - 0.7) * 0.03, (this._r() - 0.5) * 0.03)), 0.02, 0.1, 1.2 + this._r() * 0.6, 0.02, 0xc9c2b4, 0.7);
        h.puff(from.clone(), 0.03, 0.09, 0.3, 0, 0xffb060, 1, true);
        this._rocket(from, at, 7, () => this.impact('rpg', at, n));
        break;
      }
      case 'tank': {
        h.flash(from, 20, 0xffc070);
        h.puff(from.clone(), 0.08, 0.28, 0.35, 0, 0xffd080, 1, true);
        for (let i = 0; i < 5; i++) h.puff(from.clone().addScaledVector(dir, 0.05 + i * 0.07).add(new THREE.Vector3(0, 0.03 * i, 0)), 0.05, 0.2 + i * 0.03, 1.6 + i * 0.2, 0.05, 0x9a9488, 0.65);
        const gz = new THREE.Vector3(from.x, h.ground(from.x, from.z) + 0.02, from.z);
        h.puff(gz, 0.1, 0.5, 1.6, 0.03, 0x8c7a62, 0.55);
        h.shake(0.06);
        // a tank round is fast: a thick tracer and a hot streak, then the burst
        this._rocket(from, at, 40, () => this.impact('tank', at, n), 0.012, 0xffe8b0);
        h.tracer(from, at);
        break;
      }
      case 'hmg': {
        for (let i = 0; i < 14; i++) {
          const j = new THREE.Vector3((this._r() - 0.5) * 0.18, (this._r() - 0.5) * 0.12, (this._r() - 0.5) * 0.18);
          const to = at.clone().add(j);
          this._later.push({ at: this._t + i * 0.045, run: () => {
            h.flash(from, 4, 0xffc070); h.puff(from.clone().add(new THREE.Vector3(0, 0.005, 0)), 0.008, 0.035, 0.12, 0, 0xffe0a0, 1, true);
            h.tracer(from, to);
            this._rocket(from, to, 55, () => this.impact('hmg', to, n), 0.005, 0xffe9a0);
          } });
        }
        break;
      }
      case 'amr': {
        h.flash(from, 10, 0xffd090);
        h.puff(from.clone(), 0.02, 0.07, 0.15, 0, 0xffe0a0, 1, true);
        for (let i = 0; i < 3; i++) h.puff(from.clone().addScaledVector(dir, 0.02 + i * 0.025), 0.01, 0.05, 1.2, 0.01, 0xb8b2a4, 0.5);
        h.tracer(from, at);
        this._rocket(from, at, 50, () => this.impact('amr', at, n), 0.006, 0xfff0c0);
        break;
      }
      case 'mortar': {
        // the bomb comes down out of the sky, with the tube's puff at the far end
        h.puff(from.clone(), 0.02, 0.12, 1.5, 0.03, 0xb8b0a0, 0.6); h.flash(from, 6, 0xffb060);
        const top = at.clone().add(new THREE.Vector3(-dir.x * 0.1, 3.2, -dir.z * 0.1));
        const bomb = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.045, 8), mat(0x3b3f33, 0.6));
        bomb.geometry.rotateX(Math.PI / 2); this._group.add(bomb);
        this._shots.push({ mesh: bomb, a: top, b: at, age: 0, dur: 0.35, trail: false, last: 0, then: () => this.impact('mortar', at, n) });
        break;
      }
      case 'charge': {
        // a shaped charge hung on the plate: the detonation (it only scorches the air)
        const c = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.012), mat(0x3b3b34, 0.7)); c.position.copy(at).addScaledVector(n, 0.012); c.lookAt(at.clone().add(n)); this._group.add(c);
        this._shots.push({ mesh: c, a: c.position.clone(), b: c.position.clone(), age: 0, dur: 0.0001, trail: false, last: 0, then: () => this.impact('charge', at, n) });
        break;
      }
      case 'vbied': {
        this.impact('vbied', at, n);
        break;
      }
      case 'thermite': {
        this._thermite(at, n);
        break;
      }
      case 'drone': {
        const bomb = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.04, 8).rotateX(Math.PI / 2), mat(0x3a3a2c, 0.7)); this._group.add(bomb);
        this._shots.push({ mesh: bomb, a: from.clone(), b: at, age: 0, dur: 0.5, trail: false, last: 0, then: () => this.impact('drone', at, n) });
        break;
      }
    }
  }

  /** A projectile in flight: a glowing body with a smoke trail. */
  private _rocket(a: THREE.Vector3, b: THREE.Vector3, speed: number, then: () => void, r = 0.012, glow = 0xffb050): void {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color: glow, toneMapped: false }));
    m.scale.set(1, 1, speed > 20 ? 3 : 2.2);
    m.lookAt(b.clone().sub(a)); this._group.add(m);
    this._shots.push({ mesh: m, a: a.clone(), b: b.clone(), age: 0, dur: Math.max(0.05, a.distanceTo(b) / speed), trail: speed < 20, last: 0, then });
  }

  private _thermite(at: THREE.Vector3, n: THREE.Vector3): void {
    const h = this._h;
    // a white-hot pool on the plate, a rod of sparks falling, smoke; the plate beneath stays cold
    const g = new THREE.Mesh(new THREE.CircleGeometry(0.06, 20), new THREE.MeshBasicMaterial({ color: 0xfff0c0, toneMapped: false, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    g.position.copy(at).addScaledVector(n, 0.01); g.lookAt(at.clone().add(n)); g.userData = { noSSAO: true };
    this._group.add(g); this._glow.push({ m: g, age: 0, life: 4 });
    h.flash(at.clone().addScaledVector(n, 0.05), 14, 0xffd890);
    h.puff(at.clone().addScaledVector(n, 0.04), 0.03, 0.09, 4, 0, 0xfff2d0, 1, true);
    for (let i = 0; i < 6; i++) h.puff(at.clone().addScaledVector(n, 0.05 + i * 0.03).add(new THREE.Vector3(0, i * 0.04, 0)), 0.03, 0.14 + i * 0.03, 4 + i * 0.4, 0.08, 0xd0cbc0, 0.5);
    for (let i = 0; i < 110; i++) this._emit(at.clone().addScaledVector(n, 0.015), n, 0.5, 1.6, true);
  }

  /** The burst: a flash, a fireball, smoke and dust by size, sparks off the plate, a glancing streak. Nothing here is left behind. */
  impact(kind: HeavyKind, at: THREE.Vector3, n: THREE.Vector3): void {
    this.impacts++;
    const h = this._h, P = at.clone().addScaledVector(n, 0.02), up = new THREE.Vector3(0, 1, 0);
    const SZ: Record<HeavyKind, number> = { rpg: 0.2, tank: 0.34, hmg: 0.02, amr: 0.04, mortar: 0.5, charge: 0.4, vbied: 1.5, thermite: 0.05, drone: 0.22 };
    const s = SZ[kind] * 1.5;
    const gY = h.ground(at.x, at.z);
    if (kind === 'hmg' || kind === 'amr') {
      h.flash(P, kind === 'amr' ? 9 : 5, 0xfff4d8);
      h.puff(P, 0.01, kind === 'amr' ? 0.05 : 0.03, 0.14, 0, 0xfff0c8, 1, true);
      const k = kind === 'amr' ? 16 : 6; for (let i = 0; i < k; i++) this._emit(P, n, 0.6, 1.2, false);
      return;
    }
    // a blast: bright flash and light, a hot core, an orange body, dark smoke rising, dust at the ground, a ring of dust
    const L = P.clone().addScaledVector(n, s * 0.3);
    h.flash(L, Math.min(26, 38 * Math.max(0.6, s * 2.5)), 0xffb860);
    // (solid orange body so the ball reads against a bright sky, with additive glow over it)
    h.puff(L, s * 0.45, s * 1.5, 0.7, 0.05, 0xff8a1e, 0.95);
    h.puff(L.clone().add(new THREE.Vector3(0, s * 0.15, 0)), s * 0.35, s * 1.25, 0.8, 0.12, 0xffc040, 0.95);
    for (let i = 0; i < 5; i++) h.puff(L.clone().add(new THREE.Vector3((this._r() - 0.5) * s * 1.2, (this._r() - 0.3) * s * 1.0, (this._r() - 0.5) * s * 1.2)), s * 0.25, s * 0.8, 0.5 + this._r() * 0.3, 0.1, 0xff6a14, 0.9);
    h.puff(L, s * 0.25, Math.min(0.5, s * 0.7), 0.4, 0.02, 0xffd890, 0.7, true);
    h.puff(L, s * 0.12, Math.min(0.3, s * 0.4), 0.25, 0.02, 0xffffff, 0.8, true);
    for (let i = 0; i < 6; i++) {
      const q = L.clone().add(new THREE.Vector3((this._r() - 0.5) * s * 0.9, s * (0.7 + this._r() * 0.8), (this._r() - 0.5) * s * 0.9)).addScaledVector(n, s * 0.5);
      h.puff(q, s * 0.28, s * (0.9 + this._r() * 0.6), 3.2 + this._r() * 1.5, s * 0.8, i % 2 ? 0x1e1c1a : 0x3a3632, 0.9);
    }
    for (let i = 0; i < 3; i++) h.puff(new THREE.Vector3(at.x + (this._r() - 0.5) * s, gY + 0.02, at.z + (this._r() - 0.5) * s), s * 0.3, s * (1.1 + this._r() * 0.8), 2.6, s * 0.15, 0x9a8668, 0.55);
    h.shake(Math.min(0.2, 0.05 + s * 0.2));
    const k = Math.min(MAXSPARK - 8, Math.round(26 + s * 60));
    for (let i = 0; i < k; i++) this._emit(P, n, 0.9, 2.0 + s * 3, false);
    // ricochet streaks off the plate
    void up;
  }

  /** One spark: thrown off the plate (`n` out), falling; `slow` ones drip. */
  private _emit(p: THREE.Vector3, n: THREE.Vector3, spread: number, speed: number, drip: boolean): void {
    if (this._sparks.length >= MAXSPARK) return;
    if (!this._spark) {
      this._spark = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), MAXSPARK);
      this._spark.count = 0; this._spark.frustumCulled = false; this._spark.userData = { noSSAO: true }; this._group.add(this._spark);
    }
    const v = n.clone().multiplyScalar(0.3 + this._r() * 0.7).add(new THREE.Vector3((this._r() - 0.5) * 2 * spread, (this._r() - 0.3) * spread * 1.4, (this._r() - 0.5) * 2 * spread)).normalize().multiplyScalar(speed * (0.3 + this._r() * 0.7) * (drip ? 0.5 : 1));
    this._sparks.push({ p: p.clone(), v, age: 0, life: drip ? 1.2 + this._r() * 1.4 : 0.35 + this._r() * 0.5, len: 0.04 + this._r() * 0.08 });
  }

  update(dt: number): void {
    if (!this.active) return;
    this._t += dt;
    for (let i = this._later.length - 1; i >= 0; i--) if (this._later[i].at <= this._t) { const l = this._later.splice(i, 1)[0]; l.run(); }
    for (let i = this._shots.length - 1; i >= 0; i--) {
      const s = this._shots[i]; s.age += dt;
      const k = Math.min(1, s.age / s.dur);
      s.mesh.position.lerpVectors(s.a, s.b, k);
      if (s.trail && s.age - s.last > 0.035) { s.last = s.age; this._h.puff(s.mesh.position, 0.012, 0.07, 1.6, 0.015, 0xd8d4cc, 0.6); this._h.puff(s.mesh.position, 0.01, 0.025, 0.12, 0, 0xffa050, 1, true); }
      if (k >= 1) { this._shots.splice(i, 1); this._group.remove(s.mesh); this._free(s.mesh); s.then(); }
    }
    for (let i = this._ring.length - 1; i >= 0; i--) {
      const r = this._ring[i]; r.age += dt; const k = r.age / r.life;
      r.m.scale.setScalar(Math.max(0.05, r.r1 * Math.sqrt(k))); (r.m.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
      if (k >= 1) { this._ring.splice(i, 1); this._group.remove(r.m); r.m.geometry.dispose(); (r.m.material as THREE.Material).dispose(); }
    }
    for (let i = this._glow.length - 1; i >= 0; i--) {
      const g = this._glow[i]; g.age += dt; const k = g.age / g.life;
      (g.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k * k); g.m.scale.setScalar(1 + 0.4 * Math.sin(g.age * 40));
      if (k >= 1) { this._glow.splice(i, 1); this._group.remove(g.m); g.m.geometry.dispose(); (g.m.material as THREE.Material).dispose(); }
    }
    const sp = this._spark;
    if (sp) {
      let n = 0;
      for (let i = this._sparks.length - 1; i >= 0; i--) { const s = this._sparks[i]; s.age += dt; if (s.age >= s.life) this._sparks.splice(i, 1); else { s.v.y -= 6 * dt; s.p.addScaledVector(s.v, dt); } }
      for (const s of this._sparks) {
        const fade = 1 - s.age / s.life, vl = Math.max(0.01, s.v.length());
        this._q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.v.clone().divideScalar(vl));
        this._m.compose(s.p, this._q, new THREE.Vector3(0.0035, 0.0035, s.len * (0.4 + 0.6 * fade)));
        sp.setMatrixAt(n, this._m); sp.setColorAt(n, this._c.setHex(0xffc060).lerp(new THREE.Color(0xff5010), 1 - fade).multiplyScalar(fade + 0.2)); n++;
      }
      sp.count = n; sp.instanceMatrix.needsUpdate = true; if (sp.instanceColor) sp.instanceColor.needsUpdate = true;
    }
  }
}
