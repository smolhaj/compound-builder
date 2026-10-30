/**
 * Hairpins read from a road's heading: a hairpin is a bend that turns the road through 120 degrees or more in one direction. The old
 * reading looked at a fixed window of road, so two switchbacks stacked close together (a zigzag up a face, left then right) cancelled
 * inside the window and came out as no hairpin at all, or as one. This splits the road into runs that keep turning the same way (a
 * short straight inside a bend does not break it) and measures each run on its own, so every switchback of a stack is its own hairpin
 * with its own apex, landing, sign and guardrail. Pure (tested).
 */
export interface HairpinAt { /** Index of the apex station. */ i: number; /** Total heading change through the bend, radians, signed (positive = the heading increases). */ turn: number; /** First and last station of the bend. */ i0: number; i1: number }

const wrap = (d: number): number => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

/**
 * `head[i]` is the heading at station i (radians); `s[i]` the distance along. A bend is a run of stations whose smoothed turn rate keeps
 * one sign, bridged across straights up to `bridge` units long; it is a hairpin at `minTurn` radians or more. Bends whose apex is nearer
 * than `edge` units to either end of the road are not counted (the ends are the gate and the yard, not a switchback).
 */
export function findHairpins(head: ArrayLike<number>, s: ArrayLike<number>, opts: { minTurn?: number; bridge?: number; edge?: number; maxSpan?: number } = {}): HairpinAt[] {
  const n = head.length, minTurn = opts.minTurn ?? (120 * Math.PI) / 180, bridge = opts.bridge ?? 1.5, edge = opts.edge ?? 3, maxSpan = opts.maxSpan ?? 12;
  if (n < 5) return [];
  const d = new Float64Array(n);
  for (let i = 1; i < n; i++) d[i] = wrap(head[i] - head[i - 1]);
  // the turn per unit of road, smoothed over five stations
  const k = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let a = 0, c = 0;
    for (let q = Math.max(1, i - 2); q <= Math.min(n - 1, i + 2); q++) { a += d[q] / Math.max(1e-6, s[q] - s[q - 1]); c++; }
    k[i] = c ? a / c : 0;
  }
  const EPS = 0.02;   // rad per unit: a gentler turn than this is a straight
  const sign = (i: number) => (k[i] > EPS ? 1 : k[i] < -EPS ? -1 : 0);
  const out: HairpinAt[] = [];
  let i = 1;
  while (i < n) {
    const sg = sign(i);
    if (!sg) { i++; continue; }
    // extend the run while the sign holds, bridging short straights
    let j = i, last = i;
    while (j + 1 < n) {
      const t = sign(j + 1);
      if (t === sg) { last = j + 1; j++; continue; }
      if (t === 0) {
        // a straight: bridge it if the same turn resumes within `bridge` units
        let q = j + 1; while (q < n && sign(q) === 0 && s[q] - s[last] <= bridge) q++;
        if (q < n && sign(q) === sg && s[q] - s[last] <= bridge) { j = q; last = q; continue; }
      }
      break;
    }
    // the tightest stretch of the run that turns through `minTurn`: a hairpin is that sharp (a long easy sweep through the same angle is not)
    let found: HairpinAt | null = null;
    {
      let acc = 0, lo = i;
      const cum: number[] = [];
      for (let q = i; q <= last; q++) { acc += d[q]; cum.push(acc); }
      for (let hi = i; hi <= last && !found; hi++) {
        // advance `lo` while the window [lo, hi] still holds at least minTurn without its first station
        while (lo < hi && Math.abs(cum[hi - i] - cum[lo - i]) >= minTurn) lo++;
        const from = lo > i ? lo - 1 : lo;
        if (Math.abs(cum[hi - i] - (from > i ? cum[from - i] : 0) ) >= minTurn - 1e-9 && s[hi] - s[from] <= maxSpan) {
          const base = from > i ? cum[from - i] : 0, tot = cum[hi - i] - base;
          let apex = from;
          for (let q = from; q <= hi; q++) { if (Math.abs(cum[q - i] - base) >= Math.abs(tot) / 2) { apex = q; break; } }
          found = { i: apex, turn: tot, i0: from, i1: hi };
        }
      }
    }
    if (found && s[found.i] >= edge && s[n - 1] - s[found.i] >= edge) out.push(found);
    i = last + 1;
  }
  return out;
}
