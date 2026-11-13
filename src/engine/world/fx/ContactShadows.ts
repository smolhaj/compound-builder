import * as THREE from 'three';

/**
 * One shared layer of soft contact shadows / ambient occlusion decals: a single transparent instanced quad mesh (one draw call, two
 * triangles an instance) that sits flat on the ground under people, dogs, animals, vehicles and along the foot of every wall, so they
 * stand in the world instead of looking pasted on. It is drawn by a tiny procedural shader (no texture): a soft ellipse ("blob") or a
 * wall-base band ("strip": dark at the wall, gone half a metre out).
 *
 *  - Slopes: the caller gives the ground normal; the quad is tilted to it and lifted a hair, so it follows the ground and neither floats nor clips.
 *  - Sun: a tall thing (person, tree) gets its blob stretched and pushed away from the sun as the sun gets low (`lean`); the blob's
 *    strength falls toward night, because the ambient light is already dim then.
 *  - Quality: Low draws blobs only (nothing at the walls), Medium and High add the wall bands.
 *  - Not in the SSAO pre-pass (`userData.noSSAO`) and not a shadow caster. Fades out with distance from the camera.
 *
 * Static decals (wall bands) are written once with `setStatic`; the moving ones are rewritten every frame between `begin` and `end`.
 */

export type ContactQuality = 'low' | 'medium' | 'high';

const CAP = 1024;
const EPS = 0.004;
const UP = new THREE.Vector3(0, 1, 0);

const VERT = /* glsl */`
  attribute vec2 aShape;       // x: kind (0 blob, 1 strip), y: strength 0..1
  varying vec2 vUv;
  varying vec2 vShape;
  varying float vDist;
  void main() {
    vUv = uv; vShape = aShape;
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vDist = distance(w.xyz, cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const FRAG = /* glsl */`
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec2 uFade;
  uniform float uNight;
  varying vec2 vUv;
  varying vec2 vShape;
  varying float vDist;
  void main() {
    float a;
    if (vShape.x < 0.5) {
      float r = length(vUv - 0.5) * 2.0;
      a = pow(max(0.0, 1.0 - r), 1.5);
    } else {
      // v = 0 at the wall, 1 at the outer edge; the ends fade so two bands never double at a corner
      float across = pow(max(0.0, 1.0 - vUv.y), 2.2);
      a = across * smoothstep(0.0, 0.10, vUv.x) * smoothstep(1.0, 0.90, vUv.x);
    }
    float fade = 1.0 - smoothstep(uFade.x, uFade.y, vDist);
    a *= vShape.y * uOpacity * fade * uNight;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpN = new THREE.Vector3();

export class ContactShadows {
  readonly mesh: THREE.InstancedMesh;
  private readonly _shape: THREE.InstancedBufferAttribute;
  private readonly _mat: THREE.ShaderMaterial;
  private _n = 0;
  private _nStatic = 0;
  /** QA / settings switch: false draws nothing. */
  enabled = true;
  private _quality: ContactQuality = 'high';
  private _night = 0;
  /** Horizontal unit vector pointing away from the sun, and how long a shadow is per unit of height (cot of the sun's elevation, capped). */
  private _awayX = 0;
  private _awayZ = 1;
  private _lean = 0.4;

  constructor(scene: THREE.Object3D) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    // after rotateX(-90deg) uv.y runs 0 at local +z to 1 at local -z: a strip's v = 0 edge (the wall) is its +z edge
    this._shape = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2);
    this._shape.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aShape', this._shape);
    this._mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0x0d0c08) }, uOpacity: { value: 0.6 }, uFade: { value: new THREE.Vector2(70, 150) }, uNight: { value: 1 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    this.mesh = new THREE.InstancedMesh(geo, this._mat, CAP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.visible = false; this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = false; this.mesh.renderOrder = 1;
    this.mesh.name = 'contact_shadows'; this.mesh.userData = { type: 'contact_shadows', noSSAO: true };
    scene.add(this.mesh);
  }

  get quality(): ContactQuality { return this._quality; }
  setQuality(q: ContactQuality): void { this._quality = q; }
  /** Bands along walls are worth their instances from Medium up. */
  get wantsBands(): boolean { return this._quality !== 'low'; }

  /** The light for this frame: the sun's direction (unit vector toward the sun) and how far into the night (0..1). */
  setLight(sun: THREE.Vector3, night: number): void {
    const hx = sun.x, hz = sun.z, h = Math.hypot(hx, hz) || 1;
    this._awayX = -hx / h; this._awayZ = -hz / h;
    const elev = Math.max(0.12, sun.y);                       // sun.y is sin(elevation)
    this._lean = Math.min(2.2, Math.sqrt(1 - elev * elev) / elev);
    this._night = night;
    this._mat.uniforms.uNight.value = 1 - 0.55 * night;
  }

  /** Start the moving decals of a frame (the static ones stay). */
  begin(): void { this._n = this._nStatic; }

  /**
   * A soft ellipse on the ground. `rx` / `rz` are the half sizes along the thing's own x / z (its width / length), `yaw` turns it, `n` is the
   * ground normal, `tall` the height of the thing (0: a flat prop with no lean), `k` the strength 0..1.
   */
  blob(x: number, y: number, z: number, n: THREE.Vector3 | null, rx: number, rz: number, yaw: number, tall: number, k: number): void {
    if (this._n >= CAP) return;
    let cx = x, cz = z, sx = rx, sz = rz;
    if (tall > 0) {
      // a shadow reaches away from the sun: stretch toward it and slide the centre half the stretch
      const reach = tall * this._lean * 0.5, keep = Math.min(1.6, 1 + reach / Math.max(rx, rz, 0.01));
      const grow = Math.max(rx, rz) * (keep - 1);
      cx += this._awayX * grow * 0.6; cz += this._awayZ * grow * 0.6;
      // the ellipse is longest along the lean: an approximation by growing the larger axis in its own frame
      const ax = Math.abs(Math.sin(yaw) * this._awayX + Math.cos(yaw) * this._awayZ);   // how much the thing's z axis points along the lean
      sz *= 1 + (keep - 1) * ax; sx *= 1 + (keep - 1) * (1 - ax);
    }
    this._put(cx, y, cz, n, yaw, sx * 2, sz * 2, 0, k * (tall > 0 ? 1 - 0.25 * Math.min(1, this._lean / 2.2) : 1));
  }

  /** A band along a wall's foot: from (x0, z0) to (x1, z1) on the ground at height y, `w` wide, dark at the wall, on the side of `(sx, sz)` (outward unit vector). */
  strip(x0: number, z0: number, x1: number, z1: number, y: number, outX: number, outZ: number, w: number, k: number): void {
    if (this._n >= CAP) return;
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 0.01) return;
    const mx = (x0 + x1) / 2 + outX * w / 2, mz = (z0 + z1) / 2 + outZ * w / 2;
    // local +x along the wall; local z is the band's width, with uv.y = 0 at local +z, so +z must point to the wall (inward)
    const yaw = Math.atan2(-(z1 - z0), x1 - x0);               // rotation about Y taking +x onto the wall direction
    // inward = -out. Local +z after yaw rotates to (sin(yaw), cos(yaw)); if it points outward, add a half turn (the band's length is symmetric)
    const lz = Math.cos(yaw) * outZ + Math.sin(yaw) * outX;
    this._put(mx, y, mz, null, lz > 0 ? yaw + Math.PI : yaw, len, w, 1, k);
  }

  private _put(x: number, y: number, z: number, n: THREE.Vector3 | null, yaw: number, sx: number, sz: number, kind: number, k: number): void {
    const i = this._n++;
    tmpQ.setFromAxisAngle(UP, yaw);
    if (n && n.y < 0.9995) { tmpQ2.setFromUnitVectors(UP, tmpN.copy(n).normalize()); tmpQ.premultiply(tmpQ2); }
    tmpM.compose(tmpV.set(x, y + EPS, z), tmpQ, tmpS.set(sx, 1, sz));
    this.mesh.setMatrixAt(i, tmpM);
    this._shape.setXY(i, kind, k);
  }

  /** The strength of the static bands follows the light too (they are rewritten with it by `refreshStatic`). */
  get night(): number { return this._night; }

  /** Freeze what has been added since `begin()` (called once with an empty dynamic set) as the static decals. */
  endStatic(): void { this._nStatic = this._n; this.end(); }
  clearStatic(): void { this._nStatic = 0; this._n = 0; this.end(); }

  /** Upload the frame. */
  end(): void {
    this.mesh.count = this._n;
    this.mesh.visible = this._n > 0 && this.enabled;
    this.mesh.instanceMatrix.needsUpdate = true;
    this._shape.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.mesh.geometry.dispose();
    this._mat.dispose();
  }
}

/** The unit ground normal at (x, z) from the height function (central differences over `d`). */
export function groundNormal(ground: (x: number, z: number) => number, x: number, z: number, out: THREE.Vector3, d = 0.12): THREE.Vector3 {
  const hx = ground(x + d, z) - ground(x - d, z), hz = ground(x, z + d) - ground(x, z - d);
  return out.set(-hx / (2 * d), 1, -hz / (2 * d)).normalize();
}
