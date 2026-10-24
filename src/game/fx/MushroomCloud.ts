/**
 * A mushroom cloud on the horizon (nuclear war, GDS §4: "the sky flashes on
 * the horizon, a mushroom cloud in the distance"). Procedural: a churning
 * column of overlapping smooth lumps rising into a rolled, flattened cap
 * (darker underneath, sunlit on top), a dust skirt at the base; lit from
 * inside at first (fireball orange), cooling to a dirty tan-gray as it
 * climbs and spreads, then drifting apart over a day.
 */
import * as THREE from 'three';

/** A noisy, smooth ball (several octaves of sine displacement), height-shaded via vertex colors. */
function lump(r: number, seed: number, under: number, top: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 4);
  const p = g.getAttribute('position');
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = 1 + 0.14 * Math.sin(x * 3.1 / r + seed) * Math.cos(z * 2.7 / r - seed) + 0.07 * Math.sin(y * 6.3 / r + seed * 2) + 0.04 * Math.sin((x + z) * 11 / r + seed * 3);
    p.setXYZ(i, x * n, y * n, z * n);
    // underside in shadow, crown in sun
    const t = Math.max(0, Math.min(1, (y / r + 1) / 2));
    const v = under + (top - under) * t;
    col[i * 3] = v; col[i * 3 + 1] = v * 0.97; col[i * 3 + 2] = v * 0.92;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export class MushroomCloud {
  readonly group = new THREE.Group();
  private readonly _mat: THREE.MeshStandardMaterial;
  private readonly _stem = new THREE.Group();
  private readonly _cap = new THREE.Group();
  private readonly _skirt = new THREE.Group();
  /** Cap radius (world units). */
  private readonly scale: number;

  constructor(x: number, z: number, scale: number) {
    this.scale = scale;
    this._mat = new THREE.MeshStandardMaterial({ color: 0xc9c2b6, vertexColors: true, roughness: 1, emissive: new THREE.Color(1, 0.42, 0.1), emissiveIntensity: 2, transparent: true, opacity: 1, fog: false });
    const s = scale;
    // the column: overlapping lumps, thickening a little as it rises, with a wobble
    for (let i = 0; i < 26; i++) {
      const f = i / 25;
      const m = new THREE.Mesh(lump(s * (0.17 + 0.07 * f), i, 0.55, 0.85), this._mat);
      m.position.set(Math.sin(i * 1.9) * s * 0.035, f * s * 3.1, Math.cos(i * 1.3) * s * 0.035);
      this._stem.add(m);
    }
    // the cap: a rolled ring (darker below) round a dome, flattened
    for (let ring = 0; ring < 2; ring++) {
      const n = ring ? 18 : 14, rr = ring ? s * 0.78 : s * 0.42;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + ring * 0.2;
        const m = new THREE.Mesh(lump(s * (ring ? 0.36 : 0.4), i + 20 + ring * 40, ring ? 0.42 : 0.6, 0.95), this._mat);
        m.position.set(Math.cos(a) * rr, s * (3.2 + (ring ? -0.05 : 0.18)) + Math.sin(i * 1.3) * s * 0.06, Math.sin(a) * rr);
        m.scale.set(1.15, 0.62, 1.15);
        this._cap.add(m);
      }
    }
    const dome = new THREE.Mesh(lump(s * 0.7, 7, 0.65, 1), this._mat);
    dome.position.y = s * 3.5; dome.scale.set(1.1, 0.5, 1.1);
    this._cap.add(dome);
    // the dust skirt kicked up round the base
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const m = new THREE.Mesh(lump(s * 0.28, i + 90, 0.5, 0.7), this._mat);
      m.position.set(Math.cos(a) * s * 0.45, s * 0.08, Math.sin(a) * s * 0.45);
      m.scale.set(1.3, 0.45, 1.3);
      this._skirt.add(m);
    }
    this.group.add(this._stem, this._cap, this._skirt);
    this.group.position.set(x, 0, z);
  }

  /** `h` = hours since the detonation: rises in minutes, cools, spreads and fades over a day. */
  update(h: number): void {
    const rise = Math.min(1, h / 0.15);                  // ≈ 10 minutes to full height
    const cool = Math.min(1, h / 0.1);
    const fade = h < 2 ? 1 : Math.max(0, 1 - (h - 2) / 20);
    this.group.visible = h >= 0 && fade > 0.01;
    this._stem.scale.set(Math.max(0.05, rise) * (1 + h * 0.03), Math.max(0.05, rise), Math.max(0.05, rise) * (1 + h * 0.03));
    this._cap.position.y = (rise - 1) * this.scale * 3.3;
    const spread = 1 + Math.max(0, h - 0.15) * 0.08;
    this._cap.scale.set(rise * spread, rise * (1 + Math.max(0, h - 0.15) * 0.02), rise * spread);
    this._skirt.scale.setScalar(Math.min(1, h / 0.05) * (1 + h * 0.05));
    this._mat.emissiveIntensity = 2.4 * (1 - cool) + 0.04;
    this._mat.opacity = fade * (h > 1 ? 0.92 : 1);
    this._stem.children.forEach((c, i) => { c.rotation.y = h * 0.5 + i; c.rotation.x = Math.sin(h + i) * 0.2; });
    this._cap.children.forEach((c, i) => { c.rotation.y = h * 0.3 + i; });
  }

  dispose(): void {
    this.group.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
    this._mat.dispose();
  }
}
