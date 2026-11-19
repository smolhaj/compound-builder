/**
 * Raids against a dome (owner decisions of 2026-11-17: a very visible target that can be well defended; the arcology's panels are impervious to
 * firearms and missiles, the geodesic and glass shells are real materials a determined crew can breach with the right means; crews get in
 * through the airlocks and gates). Pure (tested in siege.test.ts).
 *
 *  the shell      the raid sim already knows a wall as a run with gates. A dome standing over the home is laid into it as a closed ring of the tier's
 *                 shell kind (`shell_geodesic` ...) with an airlock for every gate and an open gap for every panel still down (`withDomeShell`). Nothing
 *                 is saved: it is built on a copy for each fight, so the wall rules (the drawn wall segment, the ram, the charge, the climb, the gap
 *                 events the cutscene draws) are the one set the fences use.
 *  odds           what one ram or one satchel does to a panel (`SHELL_ODDS`) and to an airlock door (`AIRLOCK_DOOR`), by tier. Every counter that lowers a
 *                 ram's odds at a gate (bollards, a ditch, the caged motor) lowers them here too. The higher the tier, the lower the odds (property test).
 *  tools          a crew with no truck and no charge works the shell with what it carries: a saw and a knife through twin-wall polycarbonate, axes and
 *                 sledges at laminated glass; the arcology is not a wall a crew can work at all. This is the existing `climb` (the time is the wall's
 *                 hit points); the card calls it cutting.
 *  firearms       what a rifle does to the glazing: `panelsHit`. The arcology's panels turn rifles, heavy rifles and rockets (protection.STOPS).
 *  the sally port the airlock is two doors and a chamber between them, interlocked: a crew through the outer door is still in a box with the
 *                 defenders at the inner one (`SALLY_HOLD` seconds more before the line is lost, a kill zone), longer for a longer vestibule.
 *  after          panels down are a job for a glazier (`panelJob`): a bill, hours, and a lead time for the special order (`repairLeadDays`), and an open gap
 *                 in the shell until it is done. A sealed dome with the shell open is an emergency (`shellOpen`, the hook the lockdown state reads).
 */
import { PERIMETER, type PerimeterKind, type PerimeterRun } from '../perimeter';
import { repairLeadDays } from '../structureDamage';
import { TIER, type DomeTier } from './tiers';
import { STOPS, type Weapon } from './protection';
import { domesOf, PANELS, type Dome } from './standing';
import { MATERIALS, type MaterialId, type Stock } from '../materials';
import type { GameState } from '../state';

export const SHELL_KIND: Record<DomeTier, PerimeterKind> = { earthen: 'shell_earthen', geodesic: 'shell_geodesic', glass: 'shell_glass', arcology: 'shell_arcology' };
export const isShellKind = (k: string): boolean => k.startsWith('shell_') && k in PERIMETER;
export const tierOfShell = (k: string): DomeTier | null => (Object.keys(SHELL_KIND) as DomeTier[]).find(t => SHELL_KIND[t] === k) ?? null;

/** The chance ONE truck hit (ram) or ONE satchel (blast) opens a panel, before the counters. The berm and the stem wall are what a truck meets on a geodesic dome; the ring beam on a glass one. */
export const SHELL_ODDS: Record<DomeTier, { ram: number; blast: number }> = {
  earthen: { ram: 0.3, blast: 0.5 },
  geodesic: { ram: 0.3, blast: 0.9 },
  glass: { ram: 0.25, blast: 0.8 },
  arcology: { ram: 0, blast: 0.02 },
};
/** The same against an airlock's outer door (the gate odds): the doors of a dome are a vestibule's, not a farm gate's. */
export const AIRLOCK_DOOR: Record<DomeTier, { ram: number; blast: number }> = {
  earthen: { ram: 0.55, blast: 0.85 },
  geodesic: { ram: 0.45, blast: 0.88 },
  glass: { ram: 0.35, blast: 0.7 },
  arcology: { ram: 0.03, blast: 0.12 },
};
/** Odds at an airlock door for a shell kind (null: not a shell). */
export function airlockDoor(kind: string): { ram: number; blast: number } | null { const t = tierOfShell(kind); return t ? AIRLOCK_DOOR[t] : null; }

/** Seconds one trip spends cycling an airlock (two doors, interlocked, a pressure check): longer for a longer chamber. */
export const AIRLOCK_CYCLE_S: Record<DomeTier, number> = { earthen: 3, geodesic: 10, glass: 14, arcology: 24 };

/** Seconds a crew that gets through the outer door of an airlock is held in the chamber before it can be through the inner one (the interlock cycles and the defenders have the room). */
export const SALLY_HOLD: Record<DomeTier, number> = { earthen: 3, geodesic: 7, glass: 12, arcology: 22 };

/** The chance one rifle round that lands on the shell goes through it and damages a panel: what the glazing does not turn. */
export const panelHitChance = (tier: DomeTier, w: Weapon = 'rifle'): number => 1 - STOPS[tier][w];
/** Panels a fight's shots break: `shots` rounds at the shell (a rifle each) and `heavy` rockets or charges; whole panels, rounded. Never more than a tenth of the shell in one fight. */
export function panelsHit(tier: DomeTier, shots: number, heavy = 0): number {
  if (tier === 'earthen') return 0;
  const n = shots * panelHitChance(tier, 'rifle') * 0.12 + heavy * 4 * panelHitChance(tier, 'rocket');
  return Math.min(Math.floor(PANELS[tier] / 10), Math.round(n));
}

/** Seconds a crew of `men` working the shell with hand tools needs to open a hole a man can pass: infinity when nothing they carry will do (the arcology). */
export function cutSeconds(tier: DomeTier, men: number): number {
  const base: Record<DomeTier, number> = { earthen: 900, geodesic: 90, glass: 420, arcology: Infinity };
  return base[tier] / Math.sqrt(Math.max(1, men));
}

// ── the shell laid into the raid sim ──

const RING = 72;
/** A world position on the shell at `angle` (radians from +z toward +x). */
const onShell = (d: Pick<Dome, 'x' | 'z' | 'r'>, a: number): [number, number] => [d.x + Math.sin(a) * d.r, d.z + Math.cos(a) * d.r];

/** The shell as a closed run, its airlocks as gates and its open panels as gaps. */
export function shellRun(d: Dome, openAngles: readonly number[] = []): PerimeterRun {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= RING; i++) pts.push(onShell(d, i * 2 * Math.PI / RING));
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const at = (a: number) => { const u = ((a / (2 * Math.PI)) % 1 + 1) % 1; return u * total; };
  const gates = d.airlocks.map(l => ({ at: at(l.angle), w: l.w }));
  for (const a of openAngles) gates.push({ at: at(a), w: 0.6, breach: true } as { at: number; w: number; breach?: boolean });
  return { id: `dome:${d.id}`, kind: SHELL_KIND[d.tier], pts, gates, done: 0, hours: 0, supplied: true, finishedAt: 0 };
}

/** The point on the shell `at` world units along its run (the distance the `gap` and `breach` events carry), and the angle there. */
export function shellPointAt(d: Pick<Dome, 'x' | 'z' | 'r'>, at: number): { x: number; z: number; angle: number } {
  let total = 0, prev = onShell(d, 0);
  for (let i = 1; i <= RING; i++) { const p = onShell(d, i * 2 * Math.PI / RING); total += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p; }
  const angle = ((at / (total || 1)) % 1) * 2 * Math.PI, p = onShell(d, angle);
  return { x: p[0], z: p[1], angle };
}

/** The angle on the shell of an open panel job: where it was shot or blown. */
const angleOf = (d: Dome, x: number, z: number): number => Math.atan2(x - d.x, z - d.z);

/**
 * The state as a raid sees it: the same, with the shell of each dome that stands over the home laid in as a wall run. Returns the same object when
 * no dome stands over the home (no copy, no cost). A dome that does not cover the home (a summer kitchen out in the field) is not the line.
 */
export function withDomeShell<T extends Pick<GameState, 'structures' | 'perimeter'> & Partial<Pick<GameState, 'raidDamage'>>>(s: T, home: { x: number; z: number }): T {
  const over = domesOf(s).filter(d => Math.hypot(home.x - d.x, home.z - d.z) < d.r);
  if (!over.length) return s;
  const runs = over.map(d => shellRun(d, (s.raidDamage ?? []).filter(j => j.kind === 'panel' && j.structure === d.id && j.done < j.hours).map(j => angleOf(d, j.x, j.z))));
  return { ...s, perimeter: [...s.perimeter, ...runs] };
}

/** The dome run's structure id, from a run or a drawn-wall id (`dome:<structure>`), or null. */
export const domeIdOfRun = (runId: string): string | null => (runId.startsWith('dome:') ? runId.slice(5) : null);

// ── what a raid leaves ──

/** Replacement panels are sold by the 100 sq ft (the earthbag shell always was). PROPOSED, docs/design/dome_pricing.md. */
export const PANEL_UNIT_SF = 100;
const PANEL_GOOD: Record<DomeTier, MaterialId> = { earthen: 'dome_earthbag', geodesic: 'dome_geodesic_panels', glass: 'dome_glass_panels', arcology: 'dome_arcology_panels' };

/**
 * The glazier's job for `panels` lost panels: the goods, the work, and the days before the special order arrives. The goods are billed by the 100 sq ft of
 * panel lost (to the nearest 100, at least one), so a repair costs what the area costs: about $65,000 a 100 sq ft of glass and $500,000 of arcology panel,
 * not a whole 1,000 sq ft kit. `usd` is the quote for the goods.
 */
export function panelJob(tier: DomeTier, panels: number, o: { wealth?: number } = {}): { bill: Partial<Stock>; hours: number; leadDays: number; sqft: number; usd: number } {
  const per: Record<DomeTier, { sqft: number; hours: number; order: number }> = {
    earthen: { sqft: 60, hours: 40, order: 0 },
    geodesic: { sqft: 38, hours: 3, order: 4 },
    glass: { sqft: 120, hours: 9, order: 21 },
    arcology: { sqft: 190, hours: 14, order: 45 },
  };
  const p = per[tier], n = Math.max(1, Math.round(panels));
  const share = Math.min(1, n / PANELS[tier]), units = Math.max(1, Math.round(n * p.sqft / PANEL_UNIT_SF)), good = PANEL_GOOD[tier];
  return { bill: { [good]: units } as Partial<Stock>, hours: Math.round(n * p.hours), leadDays: Math.round(p.order + repairLeadDays(share) * (1 - Math.min(0.8, o.wealth ?? 0))), sqft: n * p.sqft, usd: units * (MATERIALS[good].price ?? 0) };
}

/** Is the shell open to the outside right now (a panel down, an airlock door held open)? The lockdown state reads this: a sealed dome with an open shell is an emergency. */
export function shellOpen(s: Pick<GameState, 'raidDamage'>, domeId: string): boolean {
  return (s.raidDamage ?? []).some(j => j.kind === 'panel' && j.structure === domeId && j.done < j.hours);
}
export const shellOpenAny = (s: Pick<GameState, 'raidDamage'>): boolean => (s.raidDamage ?? []).some(j => j.kind === 'panel' && j.done < j.hours);

/** How the glazing reads in words, for the card (null: whole). */
export function shellWord(tier: DomeTier, health: number): string | null {
  if (health >= 0.999) return null;
  const down = Math.round((1 - health) * PANELS[tier]);
  return `${down} panel${down === 1 ? '' : 's'} down: the shell is open there until the glazier has replaced ${down === 1 ? 'it' : 'them'}`;
}
export const TIER_PANELS = (t: DomeTier): number => PANELS[t];
export const AIRLOCKS = (t: DomeTier): number => TIER[t].airlocks;

/** What the shell is worth as a barrier on the posture's 0-100 scale (a closed ring of the tier, less the panels down). Never falls as the tier rises (property test); the arcology is the top of the chain. */
export const SHELL_BARRIER: Record<DomeTier, number> = { earthen: 50, geodesic: 35, glass: 62, arcology: 100 };
/** The best shell standing over the home, as barrier points (0 with none). */
export function domeBarrier(s: Pick<GameState, 'structures'> & Partial<Pick<GameState, 'raidDamage'>>, home: { x: number; z: number }): number {
  let best = 0;
  for (const d of domesOf(s)) if (Math.hypot(home.x - d.x, home.z - d.z) < d.r) best = Math.max(best, SHELL_BARRIER[d.tier] * d.health);
  return best;
}

// ── where a lost panel sits ──

/** How far (world units, along the shell) a panel hole keeps from an airlock's axis: the chamber, its surround plate and room to stand beside it. */
export const PANEL_CLEARANCE = 0.9;
const angDiff = (a: number, b: number): number => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/**
 * A point on the shell for a panel lost to stray rounds: the middle of the widest stretch of shell between two airlocks (the `k`-th widest for the
 * `k`-th hole, so two holes do not stack), never beside an airlock. A dome with one airlock takes it opposite.
 */
export function panelSpot(d: Pick<Dome, 'x' | 'z' | 'r' | 'airlocks'>, k = 0): { x: number; z: number; angle: number } {
  const angs = d.airlocks.map(a => a.angle).sort((p, q) => p - q), gaps: Array<{ mid: number; span: number }> = [];
  if (!angs.length) gaps.push({ mid: 0.4, span: 2 * Math.PI });
  for (let i = 0; i < angs.length; i++) {
    const a = angs[i], b = i + 1 < angs.length ? angs[i + 1] : angs[0] + 2 * Math.PI;
    gaps.push({ mid: (a + b) / 2, span: b - a });
  }
  gaps.sort((p, q) => q.span - p.span || p.mid - q.mid);
  const angle = gaps[k % gaps.length].mid, [x, z] = onShell(d, angle);
  return { x, z, angle };
}

/** A hole's spot moved along the shell to clear the airlocks (it stays where it is when it already does). */
export function awayFromAirlocks(d: Pick<Dome, 'x' | 'z' | 'r' | 'airlocks'>, x: number, z: number, clear = PANEL_CLEARANCE): { x: number; z: number; moved: boolean } {
  let a = Math.atan2(x - d.x, z - d.z), moved = false;
  const need = clear / d.r;
  for (let pass = 0; pass < 3; pass++) {
    for (const l of d.airlocks) {
      const off = angDiff(a, l.angle);
      if (Math.abs(off) < need) { a = l.angle + (off >= 0 ? 1 : -1) * need; moved = true; }
    }
  }
  const [nx, nz] = onShell(d, a);
  return moved ? { x: nx, z: nz, moved } : { x, z, moved };
}
