/**
 * The floor hatch's stairwell (pure; builder, house floor opening and walk mode share it). A 3 × 3 m cell, a 0.3 m wall
 * all round, three straight flights side by side joined by short landings: down the first column, back up the second,
 * down the third, so the stair is gentle (about 36 degrees) in a plan the size of a closet. Each flight drops a third of the
 * way, and the last one (1.77 m for a 5.3 m shaft) is exactly what lets a person turn at the first landing under the
 * floor. The lid is hinged over the first flight; people go down through that opening.
 *
 * Local frame: x across, z along the flights, the bunker floor at y = 0 and the house floor at y = depth. Units are
 * world units (1 unit = 6 m).
 */
export const SHAFT_T = 0.05;                 // wall thickness (0.3 m)
export const FLIGHT_W = 0.125;               // 0.75 m clear
export const LANDING = 0.034;                // 0.2 m turning space at each end
export const STEPS = 10;

export interface Flight { col: number; x: number; zFrom: number; zTo: number; yFrom: number; yTo: number }
export interface HatchPlan {
  inner: { x0: number; x1: number; z0: number; z1: number };
  flights: [Flight, Flight, Flight];
  rise: number;
  /** The opening in the house floor, in the cell's frame (the lid sits in it, hinged at its +z edge). */
  hole: { x0: number; x1: number; z0: number; z1: number };
  /** Where somebody stands on the house floor to go down, and where they land at the foot (local x, z). */
  top: [number, number];
  foot: [number, number];
  /** Tread height along the flight at (x, z), or null if the point is not on a flight. */
  yAt(x: number, z: number): number | null;
}

/** `depth`: the house floor above the bunker floor. `cell`: the cell's side (0.5). */
export function hatchPlan(depth: number, cell = 0.5): HatchPlan {
  const h = cell / 2 - SHAFT_T, inner = { x0: -h, x1: h, z0: -h, z1: h };
  const rise = depth / 3, zA = inner.z0 + LANDING, zB = inner.z1 - LANDING;
  const gap = (2 * h - 3 * FLIGHT_W) / 2, cx = (c: number) => inner.x0 + FLIGHT_W / 2 + c * (FLIGHT_W + gap);
  const flights: [Flight, Flight, Flight] = [
    { col: 0, x: cx(0), zFrom: zA, zTo: zB, yFrom: depth, yTo: depth - rise },
    { col: 1, x: cx(1), zFrom: zB, zTo: zA, yFrom: depth - rise, yTo: depth - 2 * rise },
    { col: 2, x: cx(2), zFrom: zA, zTo: zB, yFrom: depth - 2 * rise, yTo: 0 },
  ];
  const hole = { x0: flights[0].x - FLIGHT_W / 2 - 0.004, x1: flights[0].x + FLIGHT_W / 2 + 0.004, z0: zA - 0.012, z1: zB + 0.006 };
  return {
    inner, flights, rise, hole,
    top: [flights[0].x, inner.z0 - 0.03],
    foot: [flights[2].x, zB - 0.02],
    yAt(x, z) {
      for (const f of flights) {
        if (Math.abs(x - f.x) > FLIGHT_W / 2) continue;
        const lo = Math.min(f.zFrom, f.zTo), hi = Math.max(f.zFrom, f.zTo);
        if (z < lo - 1e-9 || z > hi + 1e-9) continue;
        const t = (z - f.zFrom) / (f.zTo - f.zFrom);
        return f.yFrom + (f.yTo - f.yFrom) * t;
      }
      return null;
    },
  };
}
