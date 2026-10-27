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
import { PERIMETER, hasSkirt, runFinished, skirtProblem, wallLength, type PerimeterRun, type Pt } from './perimeter';
import { hatches, insideRing, linkedGroups, links, yardRings, type Hatch, type Link } from './compounds';
import { digDefense, detectChances, combine, floodChance, noticeOverDig } from './tunnelers';
import { dogCount } from './gear';
import type { GameState } from './state';

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
  /** Walkways and passages between yards, and what they join. */
  linked: Check[];
  linkList: Array<Link & { name: string }>;
  hatches: Hatch[];
  /** Digging under the walls: footing / skirt, ground sensors, ditch or moat, dogs and watch. */
  digging: Check[];
  /** Wall runs that could take a buried skirt (id, label, null if it can't yet, else why not). */
  skirtable: Array<{ id: string; label: string; has: boolean; problem: string | null }>;
  /** What has been built or bought for defense, one line each. */
  improvements: string[];
  /** Spots on the line that are open (for the Boundary view). */
  gaps: Pt[];
}

const n = (s: GameState, k: string) => Math.floor((s.stock as unknown as Record<string, number>)[k] ?? 0);
const chk = (id: string, label: string, ok: boolean, detail: string, warn = false): Check => ({ id, label, ok, tone: ok ? 'good' : warn ? 'warn' : 'bad', detail });

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

  const powered = s.utilities.lit.length > 0 || (s.utilities.grid && s.disaster.tracks.grid > 0.5);
  // ── the homes ──
  const rings = yardRings(s, line.onLine);
  const homes = fin.filter(st => isHome(st.kind)).map(st => {
    const ring = rings.find(r => insideRing(r.pts, st.x, st.z));
    const covered = closed || !!ring;
    const group = ring ? linkedGroups(rings, links(s, rings)).find(g => g.includes(ring.id)) : undefined;
    const joined = group && group.length > 1 ? `, joined to ${group.length - 1} other yard${group.length > 2 ? 's' : ''} by a covered way` : '';
    return { id: st.id, name: st.kind.replace(/_/g, ' '), covered, how: closed ? 'inside the closed property line' : ring ? `inside its own ${PERIMETER[ring.kind].name.toLowerCase()} ring${joined}` : 'not inside any closed wall' };
  });

  // ── linked yards: covered walkways and underground passages ──
  const ls = links(s, rings), groups = linkedGroups(rings, ls);
  const linked: Check[] = [];
  const names = new Map<string, string>(rings.map((r, i) => [r.id, `yard ${i + 1}`]));
  const walks = ls.filter(l => l.kind === 'walkway'), passages = ls.filter(l => l.kind === 'passage');
  if (rings.length > 1 || ls.length) {
    const joined = groups.filter(g => g.length > 1).length;
    linked.push(chk('yards', `${rings.length} walled yard${rings.length === 1 ? '' : 's'}`, rings.length <= 1 || groups.length === 1, groups.length === 1 && rings.length > 1 ? 'all joined under cover: the family moves house to house without going outside' : `${groups.length} separate group${groups.length === 1 ? '' : 's'}${joined ? `, ${joined} joined` : ''}: the walk between them is open ground`, true));
  }
  for (const l of walks) linked.push(chk(`walk_${l.runId}`, `Covered walkway: ${names.get(l.a ?? '') ?? 'open ground'} to ${names.get(l.b ?? '') ?? 'open ground'}`, !!l.a && !!l.b && l.a !== l.b, l.a && l.b ? (l.lit ? 'steel and glass, lights on' : 'no power: dark at night') : 'one end is not against a walled yard', true));
  const hs = hatches(s, rings);
  for (const l of passages) {
    const mine = hs.filter(h => h.runId === l.runId);
    const out = mine.filter(h => h.exposed), open = out.filter(h => !h.locked);
    linked.push(chk(`pass_${l.runId}`, `Underground passage: ${names.get(l.a ?? '') ?? 'a hatch in the woods'} to ${names.get(l.b ?? '') ?? 'a hatch in the woods'}`, !open.length, out.length ? (open.length ? 'a hatch outside the wall is unbolted: a way in' : `${out.length} hatch${out.length > 1 ? 'es' : ''} outside the wall, blast door${out.length > 1 ? 's' : ''} bolted`) : 'both ends inside walls: hidden, no way in', !!out.length && !open.length));
  }
  const linkList = ls.map(l => ({ ...l, name: l.kind === 'walkway' ? 'Covered walkway' : 'Underground passage' }));

  // ── digging under the walls ──
  const wallRuns = s.perimeter.filter((r): r is PerimeterRun => runFinished(r) && PERIMETER[r.kind].blocks.people >= 0.6 && PERIMETER[r.kind].height > 0 && !PERIMETER[r.kind].walkway && r.pts.length > 1);
  const dd = digDefense(s, wallRuns[0] ?? { kind: 'barbed_wire', finishedAt: 0 }, wallRuns[0]?.pts[0] ?? [0, 0]);
  const skirted = wallRuns.filter(r => hasSkirt(r, s.clock.t)).length;
  const hunter = Math.max(0, ...s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null).map(p => p.skills.hunter));
  const per = combine(detectChances(dd, hunter));
  const ditches = s.perimeter.filter(r => r.kind === 'ditch' && runFinished(r));
  const dig: Check[] = [];
  if (wallRuns.length) {
    dig.push(chk('skirt', 'Deep footing or buried skirt', skirted === wallRuns.length, skirted === wallRuns.length ? 'every wall goes down below a tunnel' : `${skirted} of ${wallRuns.length} wall runs: a crew digs under the others`, skirted > 0));
    dig.push(chk('sensors', 'Ground sensors', dd.sensorsPowered, dd.sensors ? (powered ? `${dd.sensors} set${dd.sensors > 1 ? 's' : ''} covering ${Math.round(dd.coverage * 100)}% of the wall` : 'need power to listen') : 'nobody hears digging until it is through', true));
    dig.push(chk('moat', 'Ditch or moat outside the wall', ditches.length > 0, ditches.length ? `the water table floods tunnels near it (${Math.round(floodChance(s, { ditch: true }) * 100)}% fail)` : 'no ditch to flood a tunnel', true));
    dig.push(chk('dogwatch', 'Dogs and a watch', dd.dogs + dd.watchers + (dd.tower ? 1 : 0) > 0, dogCount(s) || dd.watchers ? `${dogCount(s)} dog${dogCount(s) === 1 ? '' : 's'}, ${dd.watchers} on the watch${dd.tower ? ', a tower' : ''}` : 'nobody to bark or to see fresh spoil', true));
    dig.push(chk('notice', 'Chance a dig is noticed', per >= 0.2, `${Math.round(per * 100)}% a day, about ${Math.round(noticeOverDig(per, 9) * 100)}% over a nine-day dig`, per > 0.05));
  }
  const skirtable = wallRuns.filter(r => !PERIMETER[r.kind].deepFooting).map(r => ({ id: r.id, label: `${PERIMETER[r.kind].name}, ${Math.round(wallLength(r) * 6)} m`, has: hasSkirt(r, s.clock.t), problem: hasSkirt(r, s.clock.t) ? 'already has one' : skirtProblem(s, r) }));

  // ── watching, fighting, sheltering ──
  const tower = fin.some(st => st.kind.includes('tower'));
  const watch: Check[] = [
    chk('tower', 'Watch tower', tower, tower ? 'a view over the wall' : 'nobody sees them coming over a wall', true),
    chk('dog', 'Guard dog', n(s, 'dog') > 0, n(s, 'dog') > 0 ? `${Math.min(2, n(s, 'dog'))} on watch` : 'no bark to warn you', true),
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
  for (const r of s.perimeter) if (runFinished(r) && (PERIMETER[r.kind].blocks.people > 0 || PERIMETER[r.kind].twoWay)) byKind.set(r.kind, (byKind.get(r.kind) ?? 0) + 1);
  for (const [k, c] of byKind) improvements.push(`${PERIMETER[k as keyof typeof PERIMETER].name}${c > 1 ? ` ×${c}` : ''}`);
  for (const st of fin) if (st.kind.includes('tower') || st.kind.startsWith('bunker_')) improvements.push(st.kind.replace(/_/g, ' '));
  for (const [k, lbl] of [['dog', 'guard dog'], ['cameras', 'cameras'], ['floodlights', 'floodlights'], ['steel_door', 'steel door'], ['window_bars', 'window bars'], ['sandbags', 'sandbags'], ['safe_room', 'safe room'], ['tripwire', 'tripwires'], ['driveway_alarm', 'driveway alarm']] as const) if (n(s, k) > 0) improvements.push(lbl);

  // ── the score ──
  const score = Math.round(Math.min(100, 0.38 * p.barrier + 0.2 * p.detection + 0.14 * Math.min(100, p.fighters * 18) + 0.14 * Math.min(100, Math.max(0, ((p.firepower ?? 1) - 0.6) * 100)) + 0.08 * p.fortress + (bunker ? 4 : 0) + (p.safeRoom ? 2 : 0)));
  const label = score >= 85 ? 'Fortress' : score >= 65 ? 'Hardened' : score >= 45 ? 'Guarded' : score >= 25 ? 'Vulnerable' : 'Exposed';
  return { score, label, tone: score >= 65 ? 'good' : score >= 35 ? 'warn' : 'bad', barrier: p.barrier, detection: p.detection, walls, homes, linked, linkList, hatches: hs, digging: dig, skirtable, watch, fight, shelter, catastrophes, improvements, gaps: line.gaps };
}
