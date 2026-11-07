/**
 * Who is out there (raid depth, user decision 1: distinct raider types with their own looks, tactics and captions). Pure and seeded.
 *
 * The siege planner already knows the crew's kind (looters, gang, militia, patrol, requisition), its size, its temper and whether it
 * is armed. This module reads those into a CREW STYLE the cutscene can draw and describe, so a night with a loud mob of hungry men does
 * not look like a night with a disciplined crew, and a pair of scouts at the wire does not look like either:
 *
 *   scouts         two lean figures in dark clothes, no light, low and slow: they are counting the people and the dogs
 *   crowd          a loud rabble with torches and flashlights, bright mismatched clothes, shouting; they rush
 *   crew           a disciplined squad: the same colors, plate and helmets, no lights, they spread out and flank
 *   families       desperate households: parents with packs, kids at the back, lanterns, hands out; nobody has to die
 *   opportunists   a few men with a pickup and a bag, work jackets, a flashlight, grabbing what is near the road
 *
 * `decorateRaiders` stamps every raider unit of a battle with its role and look (the renderer reads `BattleUnit.look`) and, for a
 * flanking crew, swings half of them round the house so they come from two sides. Nothing here changes who wins a fight or what it
 * costs: the battle sim decided that; this is what the cutscene shows.
 */
import type { Battle, BattleEvent, BattleUnit, RaiderLook } from './battleTypes';
import type { RaiderTemper } from './battle';
import type { EncounterKind } from './encounters';
import { mulberry32 } from './rng';

export type CrewStyle = 'scouts' | 'crowd' | 'crew' | 'families' | 'opportunists';
export type Tactic = 'probing' | 'rushing' | 'flanking' | 'distraction' | 'pleading';
export type SceneKindLike = 'gate' | 'probe' | 'harass' | 'fires' | 'assault';

export const STYLE_NAME: Record<CrewStyle, string> = {
  scouts: 'Scouts', crowd: 'A loud crowd', crew: 'A disciplined crew', families: 'Desperate families', opportunists: 'Opportunists with a truck',
};

/** What the crew is, from what the encounter says. The dead are not a crew (null). */
export function crewStyle(kind: EncounterKind, size: number, temper: RaiderTemper | undefined, armed: boolean, seed: number): CrewStyle | null {
  if (kind === 'horde') return null;
  const r = mulberry32(seed * 7331 + size * 17 + 5);
  const t = temper ?? 'desperate';
  if (kind === 'patrol' || kind === 'requisition' || kind === 'militia') return 'crew';
  if (kind === 'gang') return t === 'desperate' && size >= 6 && r() < 0.55 ? 'crowd' : 'crew';
  if (kind === 'looters') {
    if (t === 'desperate' && (!armed || r() < 0.3)) return 'families';
    return armed || size <= 3 ? 'opportunists' : 'crowd';
  }
  return 'crowd';
}

/** The style a scene shows: a probe is always two scouts (a family does not send them), a night of fires is a crowd's work. */
export function sceneStyle(crew: CrewStyle, scene: SceneKindLike): CrewStyle {
  if (crew === 'families') return crew;
  if (scene === 'probe') return 'scouts';
  return crew;
}

/** How the scene is played. */
export function sceneTactic(crew: CrewStyle, scene: SceneKindLike, seed: number): Tactic {
  if (scene === 'probe') return 'probing';
  if (scene === 'fires') return 'distraction';
  if (crew === 'families') return 'pleading';
  const r = mulberry32(seed * 977 + 13);
  if (crew === 'crew') return scene === 'assault' ? (r() < 0.7 ? 'flanking' : 'rushing') : 'flanking';
  if (crew === 'scouts') return 'probing';
  if (crew === 'crowd' || crew === 'opportunists') return scene === 'harass' ? 'distraction' : 'rushing';
  return 'rushing';
}

/** The roles in a crew of `n`, and how each is dressed and lit. */
export function raiderLooks(style: CrewStyle, n: number, night: boolean, seed: number): RaiderLook[] {
  const r = mulberry32(seed * 6151 + n * 3 + 11);
  const out: RaiderLook[] = [];
  for (let i = 0; i < n; i++) {
    switch (style) {
      case 'scouts': out.push({ style, role: 'scout', torch: false, tone: 0 }); break;
      case 'crowd': out.push({ style, role: i === 0 ? 'shouter' : 'rabble', torch: night ? r() < 0.55 : false, tone: Math.floor(r() * 6) }); break;
      case 'crew': out.push({ style, role: i === 0 ? 'leader' : 'soldier', torch: false, tone: 0 }); break;
      case 'families': {
        // a couple of adults to every two children, the children behind
        const kid = n >= 3 && i >= Math.ceil(n / 2);
        out.push({ style, role: kid ? 'kid' : 'parent', torch: night && !kid && i % 2 === 0, tone: Math.floor(r() * 6) });
        break;
      }
      default: out.push({ style, role: i === 0 ? 'driver' : 'looter', torch: night && r() < 0.6, tone: Math.floor(r() * 6) });
    }
  }
  return out;
}

/** Turn a point round `(cx, cz)` by `a` radians. */
function swing(x: number, z: number, cx: number, cz: number, a: number): { x: number; z: number } {
  const dx = x - cx, dz = z - cz, c = Math.cos(a), s = Math.sin(a);
  return { x: Math.round((cx + dx * c - dz * s) * 100) / 100, z: Math.round((cz + dx * s + dz * c) * 100) / 100 };
}

/**
 * Stamp the raiders of a battle with a role and a look and play the scene's tactic. Returns a new battle; the input is untouched.
 * Flanking: every second raider swings round the house by about 30 degrees (to alternate sides), start point and every move with it,
 * so the crew comes at the line from two directions. Kids of a family stay at the back.
 */
export function decorateRaiders(b: Battle, style: CrewStyle, tactic: Tactic, night: boolean, seed: number): Battle {
  const raiders = b.units.filter(u => u.side === 'raider' && !u.machine);
  if (!raiders.length) return b;
  const looks = raiderLooks(style, raiders.length, night, seed);
  const home = b.units.filter(u => u.side === 'home' && !u.machine);
  const cx = home.length ? home.reduce((a, u) => a + u.x, 0) / home.length : 0, cz = home.length ? home.reduce((a, u) => a + u.z, 0) / home.length : 0;
  const side = new Map<string, number>();
  if (tactic === 'flanking' && home.length) raiders.forEach((u, i) => { if (i % 2 === 1) side.set(u.id, ((i >> 1) % 2 ? 1 : -1) * 0.52); });
  let k = 0;
  const units: BattleUnit[] = b.units.map(u => {
    if (u.side !== 'raider' || u.machine) return u;
    const look = looks[k++];
    const a = side.get(u.id);
    const p = a ? swing(u.x, u.z, cx, cz, a) : null;
    return { ...u, ...(p ?? {}), look };
  });
  const events: BattleEvent[] = side.size ? b.events.map(e => {
    const a = 'unit' in e && e.unit ? side.get(e.unit) : undefined;
    if (!a) return e;
    if (e.kind === 'move' || e.kind === 'cover' || e.kind === 'snag') return { ...e, ...swing(e.x, e.z, cx, cz, a) };
    return e;
  }) : b.events;
  // opportunists come in a pickup: it stands behind them on the road side, nose toward the house
  let vehicle = b.vehicle;
  if (style === 'opportunists' && home.length && !vehicle) {
    const rx = raiders.reduce((a, u) => a + u.x, 0) / raiders.length, rz = raiders.reduce((a, u) => a + u.z, 0) / raiders.length;
    const dx = rx - cx, dz = rz - cz, l = Math.hypot(dx, dz) || 1;
    vehicle = { kind: 'pickup', x: Math.round((rx + (dx / l) * 3) * 100) / 100, z: Math.round((rz + (dz / l) * 3) * 100) / 100, rot: Math.atan2(-dx, -dz) + 0.35 };
  }
  return { ...b, units, events, ...(vehicle ? { vehicle } : {}) };
}

// ─────────────────────────────────────────────────────────────────────────
// Words
// ─────────────────────────────────────────────────────────────────────────

const pickOf = <T,>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length) % xs.length];

/** One caption line for a crew's part of a scene, or null to fall back to the plain line. */
export function styleCaption(style: CrewStyle, tactic: Tactic, part: 'lead' | 'fight' | 'tail', night: boolean, seed: number): string | null {
  const r = mulberry32(seed * 4663 + (part === 'lead' ? 1 : part === 'fight' ? 2 : 3) + style.length);
  const L: Record<CrewStyle, { lead: string[]; fight: string[]; tail: string[] }> = {
    scouts: {
      lead: night ? ['Two lean shapes at the edge of the field. No lights. They are counting windows and dogs.', 'Nothing moves but the grass, and then two men are lying in the ditch, very still.'] : ['Two men on foot, close to the ground, working along the ditch and not talking.', 'A pair of scouts at the tree line, looking at the house through binoculars.'],
      fight: night ? ['The scouts test the wire in the dark, listening for who answers.', 'A quiet pair along the fence. They are not here to fight; they are here to learn.'] : ['The scouts test the fence and watch who comes to the window.', 'Two men crawl the ditch, noting where the watch is thin.'],
      tail: ['The scouts slide back into the dark with a count of heads and guns.', 'They are gone as quietly as they came. They know more about the place than they did.'],
    },
    crowd: {
      lead: night ? ['A mob with torches and flashlights, shouting, banging on the truck. They want everyone to hear them.', 'Torches bob down the county road. The shouting reaches the house before the light does.'] : ['A crowd spills out of three trucks, shouting, jostling, waving whatever they have.', 'Loud voices on the drive. Nobody is in charge, and everybody is angry.'],
      fight: ['The crowd surges at the fence all at once, shouting, with no plan but numbers.', 'They come in a rush, torches high, and the noise is worse than the shooting.'],
      tail: ['The crowd breaks up in the dark, men shouting at each other about who ran first.', 'The shouting moves down the road. A torch lies burning in the ditch.'],
    },
    crew: {
      lead: ['No lights, no shouting. They spread along the fence in twos, the same coats, the same hand signals.', 'They have done this before. Each man stops at a place he has already been shown.'],
      fight: ['The crew works the line from two sides at once, covering each other, not wasting a round.', 'A squad moves along the fence in a long arc, trying to get round behind the house.'],
      tail: ['They withdraw by pairs, covering each other, and the road goes quiet. They will be back with a plan.', 'The crew pulls back in good order. Nobody ran.'],
    },
    families: {
      lead: night ? ['A few lanterns on the road, and the sound of children. They are walking slowly, with their hands out.', 'A woman stands at the gate with a child on her hip and says nothing.'] : ['Men and women with packs, children trailing behind. Nobody is carrying a rifle where you can see it.', 'A family on foot at the end of the drive, thin and filthy, standing in the road.'],
      fight: ['They hold up their hands and call for water, for anything. The children stay behind the cart.', 'Somebody is begging at the gate. The kids are crying.'],
      tail: ['They turn and go back down the road, a long line of backs.', 'The lanterns shrink down the county road. Nobody at the house says anything for a while.'],
    },
    opportunists: {
      lead: ['A pickup with its lights off rolls up the drive, a couple of men in the bed.', 'A truck idles at the mailbox. Two men get out with a flashlight and a duffel bag.'],
      fight: ['They work the fence line near the truck, grabbing for anything they can carry.', 'Two men go for the nearest shed. The truck is running.'],
      tail: ['Doors slam, the truck lurches off down the road. The engine noise carries a long way.', 'The pickup bounces off the drive and is gone.'],
    },
  };
  void tactic;
  if (r() < 0.35) return null;
  return pickOf(r, L[style][part]);
}
