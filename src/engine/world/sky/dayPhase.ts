/**
 * Time-of-day weights for the three lighting regimes (day / golden / night),
 * smoothstep-interpolated between keyframes so the cycle is continuous.
 * Before noon the golden weight is dawn (WorldScene uses the pinker palette).
 * Pure — from UE CampusScene._phaseWeights.
 */
export interface DayPhase { day: number; golden: number; night: number }

/** [hour, day, golden, night] keyframes. */
const DAWN_KEYS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0, 0, 1], [5, 0, 0, 1], [5.8, 0, 0.5, 0.5], [6.5, 0, 1, 0], [7.3, 0.45, 0.55, 0], [8.2, 1, 0, 0], [12, 1, 0, 0],
];
const DUSK_KEYS: ReadonlyArray<readonly [number, number, number, number]> = [
  [12, 1, 0, 0], [16.8, 1, 0, 0], [17.9, 0.15, 0.85, 0], [18.7, 0, 1, 0], [19.8, 0, 0.45, 0.55], [21, 0, 0, 1], [24, 0, 0, 1],
];

export function phaseWeights(t: number, out: DayPhase = { day: 0, golden: 0, night: 0 }): DayPhase {
  t = ((t % 24) + 24) % 24;
  const K = t < 12 ? DAWN_KEYS : DUSK_KEYS;
  let i = 0;
  while (i < K.length - 2 && t > K[i + 1][0]) i++;
  const a = K[i];
  const b = K[i + 1];
  const span = b[0] - a[0];
  const f = span > 0 ? Math.max(0, Math.min(1, (t - a[0]) / span)) : 0;
  const s = f * f * (3 - 2 * f);
  out.day = a[1] + (b[1] - a[1]) * s;
  out.golden = a[2] + (b[2] - a[2]) * s;
  out.night = a[3] + (b[3] - a[3]) * s;
  return out;
}
