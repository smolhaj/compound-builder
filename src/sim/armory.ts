/**
 * The armory (decided with the user: real makes and models, each gun tracked
 * on its own; ammo by caliber; realistic buying; training by range time and
 * classes; guns matter at the gate, in hunting, as a deterrent and as a
 * paper trail, and in accidents and upkeep). Pure.
 *
 * Buying: from the gun shop in town while the law and the banks work, after
 * the federal background check (most clear on the spot, about 1 in 10 is
 * delayed three business days). Washington adds a 10-business-day wait
 * (the PNW region). Each sale is on the shop's records (OPSEC). Panic in the
 * warning signs drives gun and ammo prices up faster than anything else, and
 * ammo goes on purchase limits. After the collapse it's the gate and barter.
 *
 * Semi-automatic AR-, AK- and MP5-pattern guns sell over the counter like
 * any rifle, except where the state bans them (Washington, the PNW region,
 * since 2023). Machine guns (full auto) are the National Firearms Act:
 * only ones registered before May 1986 can be sold to a civilian, so they
 * are collector pieces ($9,000 for a MAC-10 to $45,000+ for an MP5). The
 * buyer pays the dealer up front, files ATF Form 4 with fingerprints and a
 * $200 tax stamp, and waits four to nine months for approval. Banned in
 * Washington. Full auto empties a magazine in two seconds: it hits harder
 * at the gate and burns three times the ammo.
 *
 * Prices are 2025 US street prices.
 */
import { log } from './economy';
import { mulberry32 } from './rng';
import { calendarOf, type GameState } from './state';
import type { MaterialId } from './materials';

export type Caliber = '22lr' | '9mm' | '38spl' | '357' | '45acp' | '556' | '762x39' | '308' | '3006' | '3030' | '65cm' | '12ga';
export const CALIBER: Record<Caliber, { name: string; box: number; price: number; centerfire: boolean }> = {
  '22lr': { name: '.22 LR', box: 500, price: 35, centerfire: false },
  '9mm': { name: '9mm', box: 50, price: 16, centerfire: true },
  '38spl': { name: '.38 Special', box: 50, price: 27, centerfire: true },
  '357': { name: '.357 Magnum', box: 50, price: 38, centerfire: true },
  '45acp': { name: '.45 ACP', box: 50, price: 30, centerfire: true },
  '556': { name: '5.56 NATO', box: 20, price: 11, centerfire: true },
  '762x39': { name: '7.62×39', box: 20, price: 10, centerfire: true },
  '308': { name: '.308 Winchester', box: 20, price: 26, centerfire: true },
  '3006': { name: '.30-06', box: 20, price: 30, centerfire: true },
  '3030': { name: '.30-30', box: 20, price: 32, centerfire: true },
  '65cm': { name: '6.5 Creedmoor', box: 20, price: 30, centerfire: true },
  '12ga': { name: '12 gauge (buckshot / slugs)', box: 25, price: 22, centerfire: true },
};
export const CALIBERS = Object.keys(CALIBER) as Caliber[];

export type GunType = 'rimfire' | 'bolt' | 'lever' | 'semi_rifle' | 'pcc' | 'pump' | 'pistol' | 'revolver' | 'auto_rifle' | 'smg';
/** The shop's shelves. */
export type GunGroup = 'hunting' | 'handgun' | 'semi' | 'nfa';
export interface GunModel {
  id: string; name: string; type: GunType; cal: Caliber; price: number; capacity: number; blurb: string;
  /** Pattern, for the picture: an AR, an AK, an MP5-style sub-gun. */
  look?: 'ar' | 'ak' | 'smg';
  /** Banned for sale under a state assault-weapons law (Washington). */
  assault?: boolean;
  /** A machine gun: NFA, pre-1986 registered, Form 4 and a tax stamp. */
  nfa?: boolean;
  /** Black market only (sim/blackMarket.ts): illegal to own, never on the shop's shelves; price is street value for reference. */
  contraband?: boolean;
}
export const GUNS: GunModel[] = [
  { id: 'ruger_1022', name: 'Ruger 10/22', type: 'rimfire', cal: '22lr', price: 300, capacity: 10, blurb: 'The classic .22 for rabbits, grouse and teaching the kids.' },
  { id: 'henry_h001', name: 'Henry Classic Lever .22', type: 'rimfire', cal: '22lr', price: 380, capacity: 15, blurb: 'Lever-action .22: small game and plinking.' },
  { id: 'rem_700', name: 'Remington 700 SPS', type: 'bolt', cal: '308', price: 650, capacity: 4, blurb: 'Bolt-action .308 deer and elk rifle; accurate to 400 m with a scope.' },
  { id: 'savage_axis', name: 'Savage Axis II', type: 'bolt', cal: '3006', price: 450, capacity: 4, blurb: 'Budget bolt-action .30-06, big enough for elk.' },
  { id: 'ruger_american', name: 'Ruger American Gen II', type: 'bolt', cal: '65cm', price: 600, capacity: 3, blurb: 'Light, flat-shooting 6.5 Creedmoor for deer and antelope.' },
  { id: 'marlin_336', name: 'Marlin 336', type: 'lever', cal: '3030', price: 900, capacity: 6, blurb: 'Lever-action .30-30: the timber deer rifle.' },
  { id: 'sw_mp15', name: 'Smith & Wesson M&P15 Sport III', type: 'semi_rifle', cal: '556', price: 750, capacity: 30, look: 'ar', assault: true, blurb: 'AR-pattern 5.56 rifle: light recoil, 30-round magazines.' },
  { id: 'ruger_mini14', name: 'Ruger Mini-14 Ranch', type: 'semi_rifle', cal: '556', price: 1100, capacity: 20, blurb: 'Ranch rifle in 5.56: coyotes, predators, and the gate.' },
  { id: 'colt_6920', name: 'Colt LE6920', type: 'semi_rifle', cal: '556', price: 1100, capacity: 30, look: 'ar', assault: true, blurb: 'The benchmark AR-15: mil-spec, chrome-lined barrel.' },
  { id: 'psa_pa15', name: 'Palmetto State Armory PA-15', type: 'semi_rifle', cal: '556', price: 500, capacity: 30, look: 'ar', assault: true, blurb: 'Budget AR-15 that runs.' },
  { id: 'zpap_m70', name: 'Zastava ZPAP M70', type: 'semi_rifle', cal: '762x39', price: 1000, capacity: 30, look: 'ak', assault: true, blurb: 'Serbian AK on a thick receiver: rugged and cheap to feed.' },
  { id: 'wasr_10', name: 'Century WASR-10', type: 'semi_rifle', cal: '762x39', price: 950, capacity: 30, look: 'ak', assault: true, blurb: 'Romanian AK: rough finish, runs dirty.' },
  { id: 'sks', name: 'Yugoslav SKS (surplus)', type: 'semi_rifle', cal: '762x39', price: 550, capacity: 10, blurb: 'Cold War surplus: fixed 10-round magazine, a fine brush gun for deer.' },
  { id: 'm1a', name: 'Springfield M1A Standard', type: 'semi_rifle', cal: '308', price: 1800, capacity: 20, blurb: 'Semi-auto .308 battle rifle: reaches out, hits hard, heavy.' },
  { id: 'zenith_z5', name: 'Zenith Z-5RS', type: 'pcc', cal: '9mm', price: 1850, capacity: 30, look: 'smg', assault: true, blurb: 'MP5-pattern 9mm, roller-delayed, semi-auto only (a braced pistol).' },
  { id: 'hk_sp5', name: 'Heckler & Koch SP5', type: 'pcc', cal: '9mm', price: 3000, capacity: 30, look: 'smg', assault: true, blurb: 'H&K\'s own civilian MP5: semi-auto, same gun otherwise.' },
  { id: 'mac10_nfa', name: 'MAC-10 (registered, full auto)', type: 'smg', cal: '45acp', price: 9000, capacity: 30, look: 'smg', nfa: true, blurb: 'Pre-1986 transferable: 1,100 rounds a minute, hard to hit anything with.' },
  { id: 'uzi_nfa', name: 'Uzi (registered, full auto)', type: 'smg', cal: '9mm', price: 18000, capacity: 32, look: 'smg', nfa: true, blurb: 'Pre-1986 transferable open-bolt Uzi: heavy, controllable, reliable.' },
  { id: 'ak_nfa', name: 'AK-47 (registered, full auto)', type: 'auto_rifle', cal: '762x39', price: 28000, capacity: 30, look: 'ak', nfa: true, blurb: 'A pre-1986 registered select-fire AK: rock, paper, AK.' },
  { id: 'm16_nfa', name: 'Colt M16A1 (registered, full auto)', type: 'auto_rifle', cal: '556', price: 35000, capacity: 30, look: 'ar', nfa: true, blurb: 'A pre-1986 transferable Colt M16: the real thing, at collector prices.' },
  { id: 'mp5_nfa', name: 'H&K MP5 (registered, full auto)', type: 'smg', cal: '9mm', price: 45000, capacity: 30, look: 'smg', nfa: true, blurb: 'A transferable MP5 on a registered sear: the most wanted sub-gun there is.' },
  { id: 'm4_contraband', name: 'M4-type carbine (unregistered, select-fire)', type: 'auto_rifle', cal: '556', price: 2500, capacity: 30, look: 'ar', contraband: true, blurb: 'Post-1986 select-fire: illegal for a civilian to own. Black market only.' },
  { id: 'ak_contraband', name: 'AK-type rifle (unregistered, select-fire)', type: 'auto_rifle', cal: '762x39', price: 2000, capacity: 30, look: 'ak', contraband: true, blurb: 'A select-fire AK with no paperwork: illegal to own. Black market only.' },
  { id: 'mossberg_500', name: 'Mossberg 500', type: 'pump', cal: '12ga', price: 450, capacity: 5, blurb: 'Pump 12-gauge: birds, deer with slugs, the house at night.' },
  { id: 'rem_870', name: 'Remington 870 Fieldmaster', type: 'pump', cal: '12ga', price: 550, capacity: 4, blurb: 'The other classic pump 12-gauge.' },
  { id: 'glock_19', name: 'Glock 19', type: 'pistol', cal: '9mm', price: 550, capacity: 15, blurb: 'Compact 9mm pistol: simple, reliable, common.' },
  { id: 'sw_mp9', name: 'Smith & Wesson M&P9 2.0', type: 'pistol', cal: '9mm', price: 550, capacity: 17, blurb: 'Full-size 9mm pistol.' },
  { id: 'ruger_gp100', name: 'Ruger GP100', type: 'revolver', cal: '357', price: 850, capacity: 6, blurb: '.357 revolver: shoots .38 Special too; bear country sidearm.' },
  { id: 'ruger_lcr', name: 'Ruger LCR', type: 'revolver', cal: '38spl', price: 600, capacity: 5, blurb: 'Light .38 Special revolver.' },
];
export const GUN = Object.fromEntries(GUNS.map(g => [g.id, g])) as Record<string, GunModel>;
export const groupOf = (m: GunModel): GunGroup => (m.nfa ? 'nfa' : m.type === 'pistol' || m.type === 'revolver' ? 'handgun' : m.look || m.type === 'semi_rifle' || m.type === 'pcc' ? 'semi' : 'hunting');
export const GUN_GROUP: Record<GunGroup, string> = { hunting: 'Hunting rifles & shotguns', handgun: 'Handguns', semi: 'Semi-auto: AR, AK, MP5-style', nfa: 'Machine guns (NFA)' };
/** The ATF tax stamp on a machine gun transfer, and the Form 4 wait (days). */
export const NFA_STAMP = 200, FORM4_DAYS: [number, number] = [120, 270];
/** Full auto: harder-hitting at the gate, and how many times the rounds. */
const AUTO_BURN = 3;
const isAuto = (t: GunType) => t === 'auto_rifle' || t === 'smg';
/** Why this gun can't be bought here (state law), or null. Washington: no sales of assault weapons (2023), no machine guns. */
export function stateBan(s: GameState, m: GunModel): string | null {
  if (s.site.region !== 'pnw') return null;
  if (m.nfa) return 'machine guns are illegal in Washington';
  if (m.assault) return 'Washington banned sales of these in 2023';
  return null;
}

/** How much a gun adds in a fight at the gate (by type). */
const FIGHT: Record<GunType, number> = { rimfire: 0.35, bolt: 0.8, lever: 0.8, semi_rifle: 1.2, pcc: 1.0, pump: 0.9, pistol: 0.6, revolver: 0.5, auto_rifle: 1.5, smg: 1.25 };

export interface Gun { id: string; model: string; condition: number; fired: number; where: 'safe' | 'house'; carrier: string | null }
export interface Armory {
  guns: Gun[];
  /** Rounds on hand by caliber. */
  ammo: Partial<Record<Caliber, number>>;
  /** Shooting skill per person (0–10). */
  skill: Record<string, number>;
  /** Guns on a shop's records (OPSEC), and pending sales (background check delay). */
  onBooks: number;
  pending: Array<{ model: string; readyAt: number; form4?: boolean }>;
}
export const newArmory = (): Armory => ({ guns: [], ammo: {}, skill: {}, onBooks: 0, pending: [] });

/** Starting shooting skill: hunters already shoot. */
export const skillOf = (s: GameState, pid: string) => s.armory.skill[pid] ?? Math.round((s.people.find(p => p.id === pid)?.skills.hunter ?? 0) * 0.6);

export const shopOpen = (s: GameState) => s.disaster.tracks.law >= 0.5 && s.disaster.tracks.banks >= 0.5 && s.disaster.tracks.stores >= 0.4;
/** Panic in the warning signs runs guns and ammo up faster than anything (1 = normal). */
export function gunPrices(s: GameState): number {
  const d = s.disaster;
  if (!d.kind || s.clock.t < d.warnAt) return 1;
  const w = Math.min(1, (s.clock.t - d.warnAt) / Math.max(1, d.hitAt - d.warnAt));
  return 1 + 1.2 * w * w;
}
/** Ammo purchase limit per visit once the panic starts (boxes per caliber). */
export const ammoLimit = (s: GameState) => (gunPrices(s) > 1.3 ? 4 : Infinity);

export function buyGun(s: GameState, model: string): string | null {
  const m = GUN[model];
  if (!m) return 'no such gun';
  if (m.contraband) return 'no shop sells that';
  if (!shopOpen(s)) return 'the gun shop is closed';
  const ban = stateBan(s, m);
  if (ban) return ban;
  if (m.nfa && s.disaster.tracks.phone < 0.5) return 'the ATF isn\'t processing transfers now';
  const cost = Math.round(m.price * gunPrices(s) * 1.08) + (m.nfa ? NFA_STAMP : 0);   // with sales tax (and the stamp)
  if (s.money < cost) return 'not enough money';
  s.money -= cost;
  s.armory.onBooks++;
  const day = Math.floor(s.clock.t);
  const r = mulberry32(s.seed * 4271 + day * 3 + s.armory.onBooks);
  if (m.nfa) {
    const wait = Math.round(FORM4_DAYS[0] + (FORM4_DAYS[1] - FORM4_DAYS[0]) * r());
    s.armory.pending.push({ model, readyAt: s.clock.t + wait, form4: true });
    log(s, `Paid for a ${m.name} ($${cost.toLocaleString('en-US')} with the $${NFA_STAMP} tax stamp). Fingerprints and ATF Form 4 are in: it stays at the dealer until the ATF approves (months).`);
    return null;
  }
  const wait = s.site.region === 'pnw' ? 14 : r() < 0.1 ? 3 : 0;
  if (wait) {
    s.armory.pending.push({ model, readyAt: s.clock.t + wait });
    log(s, `Bought a ${m.name} ($${cost.toLocaleString('en-US')}). ${s.site.region === 'pnw' ? 'State law: a 10-business-day wait.' : 'The background check came back "delayed": three business days.'}`);
  } else {
    s.armory.guns.push({ id: `g${s.nextId++}`, model, condition: 1, fired: 0, where: s.stock.gun_safe >= 1 ? 'safe' : 'house', carrier: null });
    log(s, `Bought a ${m.name} ($${cost.toLocaleString('en-US')}); the background check cleared at the counter.`);
  }
  return null;
}

export function buyAmmo(s: GameState, cal: Caliber, boxes: number): string | null {
  if (!shopOpen(s)) return 'the gun shop is closed';
  if (boxes > ammoLimit(s)) return `limit ${ammoLimit(s)} boxes a caliber (everyone's buying)`;
  const c = CALIBER[cal], cost = Math.round(c.price * boxes * gunPrices(s) * 1.08);
  if (s.money < cost) return 'not enough money';
  s.money -= cost;
  s.armory.ammo[cal] = (s.armory.ammo[cal] ?? 0) + c.box * boxes;
  log(s, `Bought ${boxes} box${boxes > 1 ? 'es' : ''} of ${c.name} (${c.box * boxes} rounds) for $${cost.toLocaleString('en-US')}.`);
  return null;
}

export const CLASS_USD = 350;
/** A weekend class in town (while it runs): +1.5 shooting, up to 7. */
export function takeClass(s: GameState, pid: string): string | null {
  if (!shopOpen(s)) return 'nobody is teaching classes now';
  if (s.money < CLASS_USD) return 'not enough money';
  const p = s.people.find(x => x.id === pid);
  if (!p || (p.kid && p.age < 12)) return 'too young for the class';
  const sk = skillOf(s, pid);
  if (sk >= 7) return 'past what a class can teach: practice';
  s.money -= CLASS_USD;
  s.armory.skill[pid] = Math.min(7, sk + 1.5);
  log(s, `${p.first} took a weekend firearms class ($${CLASS_USD}).`);
  return null;
}

/** Range practice: 100 rounds of whatever they carry (or the .22), a few hours. Up to 9, slower the better you are. */
export function practice(s: GameState, pid: string): string | null {
  const p = s.people.find(x => x.id === pid);
  if (!p || (p.kid && p.age < 10)) return 'too young';
  const gun = s.armory.guns.find(g => g.carrier === pid) ?? s.armory.guns.find(g => GUN[g.model].cal === '22lr') ?? s.armory.guns[0];
  if (!gun) return 'no gun to practice with';
  const cal = GUN[gun.model].cal;
  if ((s.armory.ammo[cal] ?? 0) < 100) return `not 100 rounds of ${CALIBER[cal].name}`;
  s.armory.ammo[cal]! -= 100;
  gun.fired += 100; gun.condition = Math.max(0, gun.condition - 0.03);
  const sk = skillOf(s, pid);
  s.armory.skill[pid] = Math.min(9, sk + 0.4 * (1 - sk / 10));
  log(s, `${p.first} put 100 rounds through the ${GUN[gun.model].name} at the range.`);
  return null;
}

/** Hand a gun to a person to carry (or put it back: null). */
export function issue(s: GameState, gunId: string, pid: string | null): void {
  const g = s.armory.guns.find(x => x.id === gunId);
  if (g) { g.carrier = pid; g.where = pid ? 'house' : s.stock.gun_safe >= 1 ? 'safe' : 'house'; }
}

/** Firepower at the gate: each fighter with the best gun they can use, its ammo, their skill and the gun's condition. (0.6 = fists and tools, ~1.6 = well armed and trained.) */
export function firepower(s: GameState): number {
  const fighters = s.people.filter((p, i) => s.personState[i]?.needs.died == null && (!p.kid || p.age >= 15));
  if (!fighters.length) return 0.6;
  const free = [...s.armory.guns].filter(g => (s.armory.ammo[GUN[g.model].cal] ?? 0) >= (isAuto(GUN[g.model].type) ? 90 : 10)).sort((a, b) => FIGHT[GUN[b.model].type] - FIGHT[GUN[a.model].type]);
  let sum = 0;
  for (const p of fighters) {
    const own = free.find(g => g.carrier === p.id) ?? free.find(g => !g.carrier);
    if (!own) { sum += 0.6; continue; }
    free.splice(free.indexOf(own), 1);
    const sk = skillOf(s, p.id);
    sum += 0.6 + FIGHT[GUN[own.model].type] * (0.5 + 0.06 * sk) * (own.condition < 0.5 ? 0.6 : 1);
  }
  return sum / fighters.length;
}
export const armed = (s: GameState) => s.armory.guns.some(g => (s.armory.ammo[GUN[g.model].cal] ?? 0) >= 10);

/** A fight at the gate: rounds fired, guns worked hard. */
export function spendInFight(s: GameState, r: () => number): string | null {
  let used = 0;
  for (const g of s.armory.guns) {
    const cal = GUN[g.model].cal, have = s.armory.ammo[cal] ?? 0;
    if (have < 1) continue;
    const t = GUN[g.model].type, n = Math.min(have, Math.round((t === 'semi_rifle' || t === 'pcc' ? 60 : isAuto(t) ? 60 * AUTO_BURN : 15) * (0.5 + r())));
    s.armory.ammo[cal] = have - n; g.fired += n; g.condition = Math.max(0, g.condition - n * 0.0004);
    used += n;
  }
  return used ? `${used} rounds fired.` : null;
}

/** A rifle (or a shotgun with slugs) and rounds for it: who can hunt big game. Spends the rounds when it's used. */
export function huntingRifle(s: GameState, take = false): boolean {
  const g = s.armory.guns.find(x => ['bolt', 'lever', 'semi_rifle', 'auto_rifle', 'pump'].includes(GUN[x.model].type) && (s.armory.ammo[GUN[x.model].cal] ?? 0) >= 3);
  if (g && take) { const c = GUN[g.model].cal; s.armory.ammo[c]! -= 3; g.fired += 3; }
  return !!g;
}
/** A .22 or a shotgun for rabbits and grouse. */
export function smallGameGun(s: GameState): boolean {
  return s.armory.guns.some(x => ['rimfire', 'pump'].includes(GUN[x.model].type) && (s.armory.ammo[GUN[x.model].cal] ?? 0) >= 5);
}

/** Once a day: delayed sales come through, guns kept and cleaned (or not), and the risk of guns lying around with little kids in the house. */
export function armoryDay(s: GameState): string[] {
  const out: string[] = [];
  const a = s.armory, day = Math.floor(s.clock.t + 0.25);
  const r = mulberry32(s.seed * 6151 + day * 7 + 2);
  for (const p of [...a.pending]) {
    if (s.clock.t < p.readyAt) continue;
    // an approved Form 4 waits at the dealer until there's a dealer open to pick it up from
    if (p.form4 && !shopOpen(s)) continue;
    a.pending.splice(a.pending.indexOf(p), 1);
    a.guns.push({ id: `g${s.nextId++}`, model: p.model, condition: 1, fired: 0, where: s.stock.gun_safe >= 1 ? 'safe' : 'house', carrier: null });
    out.push(p.form4 ? `The ATF approved the Form 4: picked up the ${GUN[p.model].name} from the dealer, tax stamp and all.` : `Picked up the ${GUN[p.model].name}: the wait is over.`);
  }
  // cleaning: a kit keeps them up (a kit is about a year of cleaning for a few guns)
  if (day % 30 === 0 && a.guns.length) {
    if (s.stock.gun_cleaning >= 0.1) { s.stock.gun_cleaning -= Math.min(s.stock.gun_cleaning, 0.03 * a.guns.length); for (const g of a.guns) g.condition = Math.min(1, g.condition + 0.15); }
    // uncleaned: fouling, and rust in the wet months
    else { const wet = calendarOf(s.clock).doy < 120 || calendarOf(s.clock).doy > 280; for (const g of a.guns) g.condition = Math.max(0, g.condition - (wet ? 0.04 : 0.02)); }
  }
  // guns not locked up with little kids around
  const loose = a.guns.filter(g => g.where === 'house' && !g.carrier).length;
  const little = s.people.some((p, i) => p.kid && p.age < 13 && s.personState[i]?.needs.died == null);
  if (loose && little && r() < 0.0004 * loose) {
    const i = s.people.findIndex((p, j) => p.kid && p.age < 13 && s.personState[j]?.needs.died == null);
    const n = s.personState[i].needs;
    n.hurt.push({ what: 'hurt in a firearm accident', sev: 35 });
    n.health -= 15;
    out.push(`A firearm accident: ${s.people[i].first} got hold of a gun that wasn't locked up and was hurt. Lock them in a safe.`);
  }
  return out;
}

/** Gun-related materials sold at the shop (the safe, the cleaning kit). */
export const ARMORY_GOODS: MaterialId[] = ['gun_safe', 'gun_cleaning'];
