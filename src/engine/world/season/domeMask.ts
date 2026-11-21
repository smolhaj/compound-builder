/**
 * domeMask — the climate-controlled interiors of the domes, as one small shared uniform block the season, weather, terrain, tree and ground-cover
 * shaders sample by world position. Inside a protected footprint the ground, trees, shrubs, roofs, paths and water show the dome's own season (no lying
 * snow or ash, no frost or ice, no scorched or dry lawn) instead of the world's; a soft edge about one build cell wide keeps the wall line from popping.
 *
 * One footprint is a capsule in 3D: a segment on the ground from (x, z) to (x2, z2) at ground height `y`, radius `r`. A dome is the degenerate capsule
 * (both ends equal: a hemisphere of its shell radius, so the shell itself, which sits at distance r, is OUTSIDE the mask and keeps its snow load);
 * a covered walkway link is a thin capsule along its line. Up to DOME_MAX footprints; the rest fall back to the outside look.
 *
 * No new draw call, no texture, no pass: one Float32Array (two vec4 per footprint) and one vec4, shared by reference (a typed array and a plain
 * {x,y,z,w} object both survive three's cloneUniforms, so every material sees the live values). The CPU twin `domeMaskAt` is the reference for tests.
 */
export const DOME_MAX = 8;
/** One build cell in world units (a cell is half a unit): the soft edge of a footprint. */
export const DOME_EDGE = 0.5;

export interface DomeFootprint {
  /** One end of the segment on the ground (a dome's center), world units. */
  x: number; z: number;
  /** The other end (a walkway link); omit for a dome. */
  x2?: number; z2?: number;
  /** Radius: a dome's shell radius at its base, or the half width of a walkway tube. */
  r: number;
  /** Ground height at the footprint. */
  y: number;
  /** Protection 0..1 (sim/dome/interiorClimate): how much the inside keeps the outside weather off. */
  k: number;
  /** Soft edge width (default one cell). */
  edge?: number;
}

/** The shared uniforms: footprints (x, z, r, k) then (x2, z2, y, edge); and (count, dormant look, 0, daylight). */
const BLOCK = new Float32Array(DOME_MAX * 8);
const INFO = { x: 0, y: 0, z: 0, w: 1 };
export const DOME_UNIFORMS = { uSeaDome: { value: BLOCK }, uSeaDomeI: { value: INFO } } as const;

const fin = (x: number | undefined, d: number): number => (typeof x === 'number' && Number.isFinite(x) ? x : d);
const clamp01 = (x: number): number => Math.max(0, Math.min(1, x));

/**
 * Write the footprints (the first DOME_MAX with some protection; the caller puts the biggest domes first) and the dome's dormant-lawn look
 * (sim/dome/interiorClimate.interiorDormant, 0..1). Returns the count written. Cheap: a few dozen float writes.
 */
export function writeDomeMask(list: readonly DomeFootprint[], dormant = 0): number {
  let n = 0;
  for (const f of list) {
    if (n >= DOME_MAX) break;
    const k = clamp01(fin(f.k, 0)), r = fin(f.r, 0);
    if (k <= 0.002 || r <= 0) continue;
    const o = n * 8;
    BLOCK[o] = fin(f.x, 0); BLOCK[o + 1] = fin(f.z, 0); BLOCK[o + 2] = r; BLOCK[o + 3] = k;
    BLOCK[o + 4] = fin(f.x2, BLOCK[o]); BLOCK[o + 5] = fin(f.z2, BLOCK[o + 1]); BLOCK[o + 6] = fin(f.y, 0); BLOCK[o + 7] = Math.max(0.02, Math.min(r, fin(f.edge, DOME_EDGE)));
    n++;
  }
  INFO.x = n; INFO.y = clamp01(fin(dormant, 0));
  return n;
}

/** Daylight 0 (night) to 1 (day): scales the dome's warm self-light and lawn glow, so a night interior is lit by its lamps and windows only. */
export function writeDomeDaylight(day: number): void { INFO.w = Number.isFinite(day) ? Math.max(0, Math.min(1, day)) : 1; }
export function domeDaylightNow(): number { return INFO.w; }

/** The count and dormant look last written (tests and QA). */
export function domeMaskInfo(): { count: number; dormant: number } { return { count: INFO.x, dormant: INFO.y }; }
export function clearDomeMask(): void { writeDomeMask([], 0); }

/** CPU twin of the GLSL `seaDomeK`: the mask (0 outside, up to the footprint's protection inside) at a world point, from the written block. */
export function domeMaskAt(x: number, y: number, z: number): number {
  let m = 0;
  const n = Math.round(INFO.x);
  for (let i = 0; i < n; i++) {
    const o = i * 8, ax = BLOCK[o], az = BLOCK[o + 1], r = BLOCK[o + 2], k = BLOCK[o + 3], bx = BLOCK[o + 4], bz = BLOCK[o + 5], y0 = BLOCK[o + 6], edge = BLOCK[o + 7];
    const abx = bx - ax, abz = bz - az, apx = x - ax, apz = z - az, apy = y - y0;
    const h = clamp01((apx * abx + apz * abz) / Math.max(abx * abx + abz * abz, 1e-4));
    const qx = apx - abx * h, qz = apz - abz * h, qy = Math.max(apy, 0);
    const d = Math.hypot(qx, qy, qz), t = clamp01((d - (r - edge)) / edge), s = t * t * (3 - 2 * t);
    m = Math.max(m, k * (1 - s));
  }
  return m;
}

/** GLSL: the uniforms and `seaDomeK(vec3 worldPos)`, 0 outside every footprint. Included wherever the season uniforms are declared. */
export const DOME_DECL = /* glsl */`
uniform vec4 uSeaDome[${DOME_MAX * 2}];
uniform vec4 uSeaDomeI;
float seaDomeK( vec3 p ) {
  float m = 0.0;
  int n = int( uSeaDomeI.x + 0.5 );
  for ( int i = 0; i < ${DOME_MAX}; i++ ) {
    if ( i >= n ) break;
    vec4 a = uSeaDome[ 2 * i ], b = uSeaDome[ 2 * i + 1 ];
    vec3 s0 = vec3( a.x, b.z, a.y ), ab = vec3( b.x - a.x, 0.0, b.y - a.y ), ap = p - s0;
    float h = clamp( dot( ap, ab ) / max( dot( ab, ab ), 1e-4 ), 0.0, 1.0 );
    vec3 q = ap - ab * h;
    q.y = max( q.y, 0.0 );
    m = max( m, a.w * ( 1.0 - smoothstep( a.z - b.w, a.z, length( q ) ) ) );
  }
  return m;
}
`;

/**
 * GLSL: local copies `seLA..seLD` of the four season vectors for a world position expression (a vec3): the world's season where the point is outside
 * every dome, the dome's own where it is inside (no snow, ice, wet, litter, frost, mud, rime, fall color, bare crowns, flush or bloom; the lawn
 * dormant by the dome's own band). `seDk` is the mask. Use with `seaLocalize` on code that reads uSeaA..uSeaD.
 */
export const seaLocalGlsl = (pos: string): string => /* glsl */`
float seDk = uSeaDomeI.x > 0.5 ? seaDomeK( ${pos} ) : 0.0;
vec4 seLA = uSeaA * ( 1.0 - seDk );
vec4 seLB = vec4( uSeaB.x * ( 1.0 - seDk ), mix( uSeaB.y, uSeaDomeI.y, seDk ), uSeaB.z * ( 1.0 - seDk ), uSeaB.w * ( 1.0 - seDk ) );
vec4 seLC = vec4( uSeaC.x * ( 1.0 - seDk ), uSeaC.y, uSeaC.z * ( 1.0 - seDk ), uSeaC.w * ( 1.0 - seDk ) );
vec4 seLD = vec4( uSeaD.x, uSeaD.yzw * ( 1.0 - seDk ) );
`;

/** Rewrite shader code that reads the shared season uniforms to read the local copies from `seaLocalGlsl` instead. */
export const seaLocalize = (code: string): string => code.replace(/\buSea([ABCD])\b/g, 'seL$1');
