/**
 * The Defense tab: one score, whether the property is walled in or exposed,
 * what has been built, and how ready the place is for the other things that
 * can go wrong. Pure (tested); reads the same posture and enclosure the gate
 * and the battle read, so what it says is what will happen.
 */
import { isFinished } from './construction';
import { isHome } from './blueprints';
import { postureOf } from './encounters';
import { enclosure } from './enclosure';
import { daysOfFood } from './needs';
import { PERIMETER, runFinished, type Pt } from './perimeter';
import { dayIndex, type GameState } from './state';
import { bondOf, dogWatch, livingDogs, temperOf } from './pets';

export type Tone = 'good' | 'warn' | 'bad';
export interface Check { id: string; label: string; ok: boolean; tone: Tone; detail: string }
export interface DefenseReport {
  score: number;
  label: 'Exposed' | 'Vulnerable' | 'Guarded' | 'Hardened' | 'Fortress';
  tone: Tone;
  barrier: number;
  detection: number;
  /** The property line and the creek. */
  walls: Check[];
  /** Homes and who they are exposed to. */
  homes: Array<{ id: string; name: string; covered: boolean; how: string }>;
  watch: Check[];
  fight: Check[];
  shelter: Check[];
  /** Readiness for things that are not raiders. */
  catastrophes: Check[];
  /** What has been built or bought for defense, one line each. */
  improvements: string[];
  /** Spots on the line that are open (for the Boundary view). */
  gaps: Pt[];
}

const n = (s: GameState, k: string) => Math.floor((s.stock as unknown as Record<string, number>)[k] ?? 0);
const chk = (id: string, label: string, ok: boolean, detail: string, warn = false): Check => ({ id, label, ok, tone: ok ? 'good' : warn ? 'warn' : 'bad', detail });

/** Point in a closed polyline (ray casting). */
function inside(pts: readonly Pt[], x: number, z: number): boolean {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}

/** The dogs, one row each: who is on a post and who is kept inside, and how they are. */
function dogRows(s: GameState): Check[] {
  const ds = livingDogs(s), day = dayIndex(s.clock.t);
  if (!ds.length) return [chk('dog', 'Dog', false, 'no bark to warn you', true)];
  const w = dogWatch(s);
  return ds.map(d => {
    const b = bondOf(d), who = b.id ? s.people.find(p => p.id === b.id)?.first : null;
    const t = temperOf(d);
    const bad = d.hunger > 60 || d.health < 40 || t === 'aggressive' || t === 'withdrawn';
    const place = d.guard ? 'on the post' : 'kept inside';
    const note = d.hunger > 60 ? 'hungry' : d.health < 40 ? 'unwell' : t === 'withdrawn' || t === 'aggressive' ? t : who ? `bonded to ${who}` : '';
    return chk(`dog:${d.id}`, d.name, !bad && (d.guard || w.detection > 0), `${place}${note ? ` · ${note}` : ''}${day - d.born < 180 ? ' · a puppy' : ''}`, true);
  });
}

export function defenseReport(s: GameState): DefenseReport {
  const p = postureOf(s), line = enclosure(s, s.clock.t);
  const fin = s.structures.filter(isFinished);
  const closed = line.openShare === 0 && line.creekOpen === 0;
  const lineRuns = s.perimeter.filter(r => runFinished(r) && line.onLine.has(r.id));

  // ── the line ──
  const gates = lineRuns.reduce((a, r) => a + r.gates.length, 0);
  const walls: Check[] = [
    chk('line', 'Property line closed', line.openShare === 0, line.openShare === 0 ? `held all round (${Math.round(line.barrier)}% strength)` : `${Math.round(line.openShare * 100)}% of the line is open: they walk in there`, line.openShare < 0.15),
  ];
  if (s.site.creek) walls.push(chk('creek', 'Creek barred where it crosses the line', line.creekOpen === 0, line.creekOpen === 0 ? 'steel bars at both crossings' : `${line.creekOpen} crossing${line.creekOpen > 1 ? 's' : ''} open: the creek is the way round every wall and gate`));
  if (gates > 0) walls.push(chk('gates', `${gates} gate${gates > 1 ? 's' : ''} in the line`, true, 'a closed gate holds about as well as 60 % of its fence'));
  const strong = lineRuns.filter(r => PERIMETER[r.kind].blocks.people >= 0.7).length;
  if (lineRuns.length && !strong) walls.push(chk('strong', 'A wall that stops people', false, 'what is built stops walkers poorly; palisade, container or a grown hedge stop them', true));

  // ── the homes ──
  const rings = s.perimeter.filter(r => runFinished(r) && PERIMETER[r.kind].blocks.people >= 0.5 && r.pts.length > 3 && Math.hypot(r.pts[0][0] - r.pts.at(-1)![0], r.pts[0][1] - r.pts.at(-1)![1]) < 0.6 && !line.onLine.has(r.id));
  const homes = fin.filter(st => isHome(st.kind)).map(st => {
    const ring = rings.find(r => inside(r.pts, st.x, st.z));
    const covered = closed || !!ring;
    return { id: st.id, name: st.kind.replace(/_/g, ' '), covered, how: closed ? 'inside the closed property line' : ring ? `inside a ${PERIMETER[ring.kind].name.toLowerCase()} ring` : 'not inside any closed wall' };
  });

  // ── watching, fighting, sheltering ──
  const powered = s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5);
  const tower = fin.some(st => st.kind.includes('tower'));
  const watch: Check[] = [
    chk('tower', 'Watch tower', tower, tower ? 'a view over the wall' : 'nobody sees them coming over a wall', true),
    ...dogRows(s),
    chk('cameras', 'Cameras / motion sensors', n(s, 'cameras') + n(s, 'thermal_cam') + n(s, 'driveway_alarm') > 0, powered ? 'working' : 'need power to run', true),
    chk('lights', 'Floodlights', n(s, 'floodlights') > 0 && !!powered, n(s, 'floodlights') > 0 ? (powered ? 'on at night' : 'no power') : 'dark at night', true),
    chk('radio', 'Radio', n(s, 'radios') + n(s, 'sw_radio') + n(s, 'ham_rig') > 0, 'warning from neighbors and the net', true),
  ];
  const guns = s.armory.guns.length;
  const fight: Check[] = [
    chk('adults', 'Adults who can fight', p.fighters >= 2, `${Math.round(p.fighters * 10) / 10} on the line`, p.fighters >= 1),
    chk('guns', 'Armed with ammo', p.armed, guns ? (p.armed ? `${guns} gun${guns > 1 ? 's' : ''}, loaded` : 'guns but no ammunition') : 'no firearms', false),
    chk('gear', 'Armor and night vision', n(s, 'plate_carrier') + n(s, 'soft_armor') + n(s, 'nvg') + n(s, 'thermal') > 0, 'plates, vests, NVG or thermal', true),
    chk('cover', 'Cover on the line', n(s, 'sandbags') > 0 || n(s, 'steel_door') > 0 || n(s, 'window_bars') > 0, 'sandbags, a steel door, bars on the windows', true),
  ];
  const bunker = fin.some(st => st.kind === 'bunker_hatch' || st.kind === 'bunker_stairs');
  const shelter: Check[] = [
    chk('bunker', 'Bunker', bunker, bunker ? 'the family can hide' : 'nowhere to hide if the line falls', true),
    chk('safe', 'Safe room', n(s, 'safe_room') > 0, 'a hard room in the house', true),
    chk('tunnel', 'Escape tunnel', s.perimeter.some(r => r.kind === 'escape_tunnel' && runFinished(r)), 'a way out that is not a way in', true),
  ];

  // ── other catastrophes ──
  const days = daysOfFood(s), people = Math.max(1, s.people.length);
  const waterDays = s.utilities.storedL / (people * 10);
  const well = fin.some(st => st.kind.startsWith('well'));
  const catastrophes: Check[] = [
    chk('food', 'Food put by', days >= 90, `${Number.isFinite(days) ? Math.floor(days) : '∞'} days`, days >= 30),
    chk('water', 'Water', well || waterDays >= 14, well ? 'a well' : `${Math.floor(waterDays)} days stored`, waterDays >= 3),
    chk('power', 'Power if the grid goes', s.utilities.fittings.some(f => /solar|generator|battery/i.test(String(f))) || s.utilities.batteryKwh > 0, s.utilities.batteryKwh > 0 ? 'battery bank' : 'no backup', true),
    chk('heat', 'Winter heat', n(s, 'firewood') >= 8, `${n(s, 'firewood')} cords of firewood`, n(s, 'firewood') >= 3),
    chk('meds', 'Medical supplies', n(s, 'meds') + n(s, 'ifak') >= 3, `${n(s, 'meds')} meds, ${n(s, 'ifak')} first-aid kits`, n(s, 'meds') + n(s, 'ifak') >= 1),
    chk('fallout', 'Shelter from fallout', bunker, bunker ? 'the bunker' : 'no shielded room', true),
  ];

  // ── what's been built ──
  const improvements: string[] = [];
  const byKind = new Map<string, number>();
  for (const r of s.perimeter) if (runFinished(r) && PERIMETER[r.kind].blocks.people > 0) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
  for (const [k, c] of byKind) improvements.push(`${PERIMETER[k as keyof typeof PERIMETER].name}${c > 1 ? ` ×${c}` : ''}`);
  for (const st of fin) if (st.kind.includes('tower') || st.kind.startsWith('bunker_')) improvements.push(st.kind.replace(/_/g, ' '));
  for (const d of livingDogs(s)) improvements.push(d.guard ? `${d.name} (dog on guard)` : `${d.name} (dog)`);
  for (const [k, lbl] of [['cameras', 'cameras'], ['floodlights', 'floodlights'], ['steel_door', 'steel door'], ['window_bars', 'window bars'], ['sandbags', 'sandbags'], ['safe_room', 'safe room'], ['tripwire', 'tripwires'], ['driveway_alarm', 'driveway alarm']] as const) if (n(s, k) > 0) improvements.push(lbl);

  // ── the score ──
  const score = Math.round(Math.min(100, 0.38 * p.barrier + 0.2 * p.detection + 0.14 * Math.min(100, p.fighters * 18) + 0.14 * Math.min(100, Math.max(0, ((p.firepower ?? 1) - 0.6) * 100)) + 0.08 * p.fortress + (bunker ? 4 : 0) + (p.safeRoom ? 2 : 0)));
  const label = score >= 85 ? 'Fortress' : score >= 65 ? 'Hardened' : score >= 45 ? 'Guarded' : score >= 25 ? 'Vulnerable' : 'Exposed';
  return { score, label, tone: score >= 65 ? 'good' : score >= 35 ? 'warn' : 'bad', barrier: p.barrier, detection: p.detection, walls, homes, watch, fight, shelter, catastrophes, improvements, gaps: line.gaps };
}
