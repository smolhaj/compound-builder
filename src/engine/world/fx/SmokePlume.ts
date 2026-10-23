/**
 * SmokePlume — wood smoke from a chimney: soft billboard puffs that rise,
 * swell, drift downwind and fade. One Points draw per plume; the vertex
 * shader animates every puff from its own phase, so there is no CPU work per
 * frame beyond a few uniforms. Procedural sprite (no assets).
 */
import * as THREE from 'three';

const N = 48;

let _sprite: THREE.Texture | null = null;
function sprite(): THREE.Texture {
  if (_sprite) return _sprite;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,0.9)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  _sprite = new THREE.CanvasTexture(c);
  return _sprite;
}

export class SmokePlume {
  readonly points: THREE.Points;
  private readonly _u = {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(0.25, 0.1) },
    uAmount: { value: 1 },
    uColor: { value: new THREE.Color(0.78, 0.78, 0.8) },
    uMap: { value: sprite() },
    uScale: { value: 400 },
  };

  constructor(at: THREE.Vector3) {
    const geo = new THREE.BufferGeometry();
    const phase = new Float32Array(N), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) { phase[i] = i / N; seed[i] = Math.random(); }
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.5, 0), 4);
    const mat = new THREE.ShaderMaterial({
      uniforms: this._u,
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */`
        uniform float uTime; uniform vec2 uWind; uniform float uAmount; uniform float uScale;
        attribute float aPhase; attribute float aSeed;
        varying float vA;
        void main() {
          float life = fract(aPhase + uTime * 0.07);           // ~14 s from the stack to gone
          float rise = life * 2.2 * (0.8 + 0.4 * aSeed);
          vec3 p = position + vec3(uWind.x, 0.0, uWind.y) * life * 6.0;
          p.y += rise;
          p.x += sin(life * 9.0 + aSeed * 6.0) * 0.08 * life;
          p.z += cos(life * 7.0 + aSeed * 4.0) * 0.08 * life;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = 0.05 + life * 0.55;
          gl_PointSize = min(uScale * size / -mv.z, 220.0);
          vA = uAmount * smoothstep(0.0, 0.06, life) * (1.0 - smoothstep(0.35, 1.0, life)) * 0.55;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uMap; uniform vec3 uColor;
        varying float vA;
        void main() {
          vec4 t = texture2D(uMap, gl_PointCoord);
          float a = t.a * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a);
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.position.copy(at);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.userData = { type: 'smoke', noSSAO: true };
  }

  /**
   * `amount` 0..1 (fire lit); `wind` world units/s on x/z; `light` scales the
   * smoke colour with the daylight (grey-blue at night); `viewportH` for size.
   */
  update(time: number, amount: number, windX: number, windZ: number, light: number, viewportH: number): void {
    const u = this._u;
    u.uTime.value = time;
    u.uAmount.value = amount;
    u.uWind.value.set(windX, windZ);
    u.uColor.value.setRGB(0.78, 0.78, 0.8).multiplyScalar(0.25 + 0.75 * light);
    u.uScale.value = viewportH * 1.2;   // ≈ H / (2 tan(fov / 2)) at the 45° view
    this.points.visible = amount > 0.01;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
