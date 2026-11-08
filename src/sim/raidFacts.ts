/**
 * The plain-words side of a raid's explicit data (sim/battleTypes.ts `RaidFacts`): the result line, the yard-versus-house losses, the leader's name.
 * Pure. `breached` and `overrun` are different results with different losses, and the card says which.
 */
import type { BreachWhere, RaidFacts } from './battleTypes';
import type { LootItem } from './raidOutcomes';

const LEADERS = ['Dale', 'Rusty', 'Cole', 'Mack', 'Boone', 'Hank', 'Dutch', 'Reyes', 'Tate', 'Walker', 'Vance', 'Kincaid', 'Deke', 'Ortega', 'Pruitt', 'Slade'];
const TITLES: Record<string, string> = { gang: 'the gang\'s boss', militia: 'the militia captain', patrol: 'the patrol sergeant', requisition: 'the requisition officer', looters: 'the loudest of them', refugees: 'the man who spoke for them' };

/** The crew's named leader (the same one in every scene of the same raid). */
export function leaderNameOf(seed: number, kind: string | undefined): string {
  const h = Math.abs(Math.imul(seed ^ 0x9e3779b9, 2654435761)) >>> 0;
  return `${LEADERS[h % LEADERS.length]}${kind && TITLES[kind] ? ` (${TITLES[kind]})` : ''}`;
}

const lootWord = (it: LootItem): string => {
  const n = it.n;
  switch (it.what) {
    case 'ammo': return `${n} rounds of ammunition`;
    case 'guns': return n === 1 ? '1 gun' : `${n} guns`;
    case 'animals': return n === 1 ? '1 animal' : `${n} animals`;
    case 'canned': return n === 1 ? '1 case of canned food' : `${n} cases of canned food`;
    case 'staples': return n === 1 ? '1 bag of bulk staples' : `${n} bags of bulk staples`;
    case 'frozen': return n === 1 ? '1 bag of frozen food' : `${n} bags of frozen food`;
    case 'fresh': return n === 1 ? '1 basket of fresh food' : `${n} baskets of fresh food`;
    case 'fuel': return n === 1 ? '1 can of fuel' : `${n} cans of fuel`;
    case 'meds': return n === 1 ? '1 medical kit' : `${n} medical kits`;
    case 'ifak': return n === 1 ? '1 first aid kit' : `${n} first aid kits`;
    default: return `${n} ${it.what}`;
  }
};
export const lootLines = (items: readonly LootItem[]): string[] => items.map(lootWord);

const how = (m: string | undefined, w: BreachWhere | null): string => {
  const at = w ? (w.gate ? 'the gate' : `the ${w.kind.replace(/_/g, ' ')}`) : 'the line';
  return m === 'ram' ? `rammed ${at}` : m === 'charge' ? `blew ${at}` : `got over ${at}`;
};

/** What the card says. */
export function raidText(f: Pick<RaidFacts, 'result' | 'linePassed' | 'beatenBack' | 'reached' | 'breach' | 'ending' | 'loot' | 'fires' | 'hostages' | 'disposition'> & { killed: number; spared: number; held: number }): string {
  const b = f.breach, fails = (b?.attempts ?? []).filter(a => !a.ok);
  const failed = fails.length ? ` ${fails.map(a => (a.how === 'ram' ? a.why === 'driver_down' ? 'The truck\'s driver was shot before it reached the wall.' : a.why === 'bollards' ? 'A truck was turned at the bollards.' : a.why === 'ditch' ? 'A truck could not cross the ditch.' : a.why === 'gate_held' ? 'A truck hit the gate and the gate held.' : 'A truck hit the wall and the wall held.' : a.why === 'carrier_down' ? 'The man with the charge was shot before he could plant it.' : 'A charge went off and the wall held.')).join(' ')}` : '';
  if (f.ending?.kind === 'tribute') return `They offered to leave for a share of the food and fuel, and the family paid.${failed}`;
  if (f.ending?.kind === 'passage') return `They asked only to pass through, and the family let them.${failed}`;
  if (f.result === 'repelled' || f.result === 'fled') {
    if (f.beatenBack) return `They ${how(b?.method, b?.where ?? null)} and were in the yard, then the family drove them back out.${failed}`;
    return (f.result === 'fled' ? 'They broke off before they got past the wall.' : 'None of them got past the wall.') + failed;
  }
  const lost = f.loot.length ? ` They carried off ${lootLines(f.loot).join(', ')}.` : '';
  const fire = f.fires.length ? ` They set ${f.fires.length === 1 ? 'a fire' : `${f.fires.length} fires`}.` : '';
  const people = [f.killed ? `${f.killed} killed` : '', f.hostages.length ? `${f.hostages.length} taken` : '', f.held ? `${f.held} held at gunpoint` : '', f.spared ? `${f.spared} spared` : ''].filter(Boolean).join(', ');
  const ppl = people ? ` People: ${people}.` : '';
  if (f.result === 'breached') return `The crew ${how(b?.method, b?.where ?? null)} and holds the yard. The houses still stand.${lost}${fire}${ppl}${failed}`;
  return `The crew ${how(b?.method, b?.where ?? null)} and overran the houses.${lost}${fire}${ppl}${failed}`;
}
