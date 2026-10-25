/**
 * After the shooting (decided with the user: "Player decides"): when a raid
 * is beaten off, the raiders who went down and couldn't run are still out on
 * the drive. The family has to decide what to do with them. Pure.
 *
 *  Treat and release  dress their wounds (meds or an IFAK each) and let them
 *                     walk. Humanity up. Some come back with their friends;
 *                     word gets around that this place is merciful.
 *  Hold them          prisoners: a meal a day each and someone watching them.
 *                     Talked to, one may give up where his crew camps or
 *                     where they cached what they took. They can slip away
 *                     (and take something). Later: let them go, or let one
 *                     join the family once he's earned it.
 *  Leave them         nobody helps; they crawl off or die out there.
 *  Finish them        a line most families never come back from: humanity
 *                     drops hard, morale with it.
 *
 * The dead are buried either way (a day's grim work; left out they bring
 * coyotes and sickness).
 */
import { log } from './economy';
import { mulberry32 } from './rng';
import type { GameState } from './state';
import { SKILL_IDS, type Person, type SkillId } from './family';
import { freshNeeds } from './needs';
import { prisonerLead } from './rescue';

export type AftermathChoice = 'treat_release' | 'hold' | 'leave' | 'finish';
export interface Aftermath { day: number; wounded: number; dead: number }
export interface Prisoner { id: string; name: string; since: number; /** Wound severity (0 healed). */ sev: number; talked: boolean; /** 0–100: how far he's come round. */ trust: number }

export const AFTERMATH_TEXT: Record<AftermathChoice, [string, string]> = {
  treat_release: ['Patch them up and let them go', 'Dressings and antibiotics, then they walk. The decent thing; some come back with their friends.'],
  hold: ['Hold them', 'Prisoners: food and a guard every day. They might talk: where their crew is, where they stashed things.'],
  leave: ['Leave them', 'Nobody goes out there. They crawl off, or they don\'t.'],
  finish: ['Finish it', 'Nobody comes back for revenge. Nobody here is the same after.'],
};

const NAMES = ['Dale', 'Cody', 'Travis', 'Wade', 'Jesse', 'Shane', 'Rusty', 'Kyle', 'Darnell', 'Luis', 'Brent', 'Terry'];
const living = (s: GameState) => s.personState.filter(ps => ps.needs.died == null);
const lowerMorale = (s: GameState, by: number) => { for (const ps of living(s)) ps.needs.morale = Math.max(0, ps.needs.morale - by); };

/** Raiders left behind after a fight the family won (from the battle). */
export function leaveAftermath(s: GameState, wounded: number, dead: number) {
  if (wounded <= 0 && dead <= 0) return;
  s.gate.aftermath = { day: Math.floor(s.clock.t), wounded, dead };
}

/** The family decides. Returns lines for the card / log. */
export function resolveAftermath(s: GameState, choice: AftermathChoice): string[] {
  const a = s.gate.aftermath;
  if (!a) return [];
  s.gate.aftermath = null;
  const g = s.gate, out: string[] = [];
  const r = mulberry32(s.seed * 4111 + a.day * 7 + choice.length);
  const n = a.wounded;
  if (n > 0) {
    if (choice === 'treat_release') {
      let treated = 0;
      for (let i = 0; i < n; i++) {
        if (s.stock.meds >= 1) { s.stock.meds -= 1; treated++; } else if (s.stock.ifak >= 1) { s.stock.ifak -= 1; treated++; }
      }
      g.humanity = Math.min(100, g.humanity + 4 + 2 * treated);
      out.push(treated === n ? `Dressed ${n === 1 ? 'his wounds' : 'their wounds'} and let ${n === 1 ? 'him' : 'them'} go.` : `Not enough dressings for all of them: ${treated} of ${n} patched up, the rest given water and pointed at the road.`);
      if (treated < n && r() < 0.5) out.push('One of them didn\'t make it to the road.');
      // they know the place now: some come back with friends; word also gets around
      if (r() < 0.35) { g.next = Math.min(g.next, Math.floor(s.clock.t) + 5 + Math.floor(r() * 10)); out.push('One of them looked back at the walls a long time before he went.'); }
      g.mercy = (g.mercy ?? 0) + n;
    } else if (choice === 'hold') {
      g.prisoners ??= [];
      for (let i = 0; i < n; i++) {
        const sev = 30 + Math.round(r() * 40);
        if (s.stock.meds >= 1) s.stock.meds -= 1;
        g.prisoners.push({ id: `pr${s.nextId++}`, name: NAMES[Math.floor(r() * NAMES.length)], since: a.day, sev, talked: false, trust: 10 + Math.round(r() * 15) });
      }
      out.push(`${n === 1 ? 'One prisoner' : `${n} prisoners`}, zip-tied in the shop. Someone has to watch them now.`);
    } else if (choice === 'leave') {
      g.humanity = Math.max(0, g.humanity - 2 - n);
      out.push(r() < 0.5 ? 'By morning the drive was empty. A blood trail went into the trees.' : 'By morning they had stopped calling for help.');
      lowerMorale(s, 4);
    } else {
      g.humanity = Math.max(0, g.humanity - 12 - 4 * n);
      lowerMorale(s, 15);
      const kids = s.people.some((p, i) => p.kid && s.personState[i]?.needs.died == null);
      out.push(`It was done. Nobody talked at supper.${kids ? ' The kids heard the shots.' : ''}`);
      g.executed = (g.executed ?? 0) + n;
    }
  }
  if (a.dead > 0) {
    out.push(`${a.dead === 1 ? 'One body' : `${a.dead} bodies`} buried past the tree line. A long, grim day.`);
    lowerMorale(s, 3);
  }
  for (const l of out) log(s, l);
  return out;
}

/**
 * Prisoners, once a day: they eat (about 2,200 kcal each from the staples,
 * canned food if the staples are gone), heal, might talk, might slip away.
 */
export function prisonersDay(s: GameState): string[] {
  const ps = s.gate.prisoners;
  if (!ps?.length) return [];
  const out: string[] = [];
  const day = Math.floor(s.clock.t + 0.25), r = mulberry32(s.seed * 6007 + day * 11 + 3);
  const guards = s.people.filter((p, i) => !p.kid && s.personState[i]?.needs.died == null).length;
  for (const p of [...ps]) {
    // a meal a day
    if (s.stock.staples >= 2200 / 80000) s.stock.staples -= 2200 / 80000;
    else if (s.stock.canned >= 1) s.stock.canned -= 1;
    else p.trust = Math.max(0, p.trust - 2);
    p.sev = Math.max(0, p.sev - 1);
    p.trust = Math.min(100, p.trust + 0.6 + (s.gate.humanity - 50) / 100);
    // talking: once he trusts you a little, he gives up his crew or their cache
    if (!p.talked && p.trust >= 35 && r() < 0.1) {
      p.talked = true;
      // the taken: a prisoner may know the crew that has them
      const lead = r() < 0.5 ? prisonerLead(s, r) : null;
      if (lead) out.push('The prisoner talked about the crew that took the child.');
      else if (r() < 0.5) {
        s.stock.canned += 6 + Math.floor(r() * 10);
        s.armory.ammo['556'] = (s.armory.ammo['556'] ?? 0) + 40;
        out.push('The prisoner told you where his crew cached what they took. You brought back canned food and a can of 5.56.');
      } else {
        s.gate.forewarned = true;
        out.push('The prisoner told you where his crew camps and how they come in. You\'ll see them sooner.');
      }
    }
    // slipping away: likelier with fewer people to watch, less once he's healed and come round
    if (r() < (guards <= 1 ? 0.03 : 0.012) * (p.trust > 60 ? 0.3 : 1)) {
      ps.splice(ps.indexOf(p), 1);
      if (r() < 0.5) { s.stock.fuel = Math.max(0, s.stock.fuel - 1); out.push('A prisoner slipped his ties in the night and took a can of fuel with him.'); }
      else out.push('A prisoner slipped his ties in the night.');
    }
  }
  for (const l of out) log(s, l);
  return out;
}

/** Let a prisoner go (he's walked to the road). */
export function releasePrisoner(s: GameState, id: string): string | null {
  const ps = s.gate.prisoners ?? [];
  const p = ps.find(x => x.id === id);
  if (!p) return 'no such prisoner';
  ps.splice(ps.indexOf(p), 1);
  s.gate.humanity = Math.min(100, s.gate.humanity + 2);
  log(s, 'Walked a prisoner to the road and let him go.');
  return null;
}

/** A prisoner who has come round (trust 70+, a month held) can join the family. */
export const canJoin = (s: GameState, p: Prisoner) => p.trust >= 70 && Math.floor(s.clock.t) - p.since >= 30 && p.sev < 30;

/** He's earned it: cut the ties, he's one of you (a fair shot, not much else). */
export function joinPrisoner(s: GameState, id: string): string | null {
  const ps = s.gate.prisoners ?? [];
  const p = ps.find(x => x.id === id);
  if (!p) return 'no such prisoner';
  if (!canJoin(s, p)) return 'not yet';
  ps.splice(ps.indexOf(p), 1);
  const r = mulberry32(s.seed * 313 + s.nextId);
  const skills = Object.fromEntries(SKILL_IDS.map(k => [k, Math.floor(r() * 3)])) as Record<SkillId, number>;
  skills.hunter = 4 + Math.floor(r() * 3);
  const person: Person = { id: `p${s.nextId++}`, first: p.name, last: '', age: 20 + Math.floor(r() * 25), kid: false, body: 'm', skills, shirt: Math.floor(r() * 0xffffff) & 0x7f7f7f };
  s.people.push(person);
  s.personState.push({ id: person.id, task: 'idle', target: null, needs: freshNeeds() });
  s.gate.tookIn++; s.gate.humanity = Math.min(100, s.gate.humanity + 5);
  log(s, `${p.name} came to rob you and stayed to help. He's one of the family now.`);
  return null;
}
