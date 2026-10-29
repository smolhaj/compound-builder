import { describe, expect, it } from 'vitest';
import { newGame, SAVE_VERSION, dayIndex, type GameState } from './state';
import { generateFamily, variedFamily, type Person } from './family';
import { BLUEPRINTS } from './blueprints';
import { housingPlan, OWN_PLACE_MORALE } from './housing';
import { resolve } from './encounters';
import { startFunds, FUNDS_RANGE } from './startFunds';
import { migrate } from './save/migrations';
import { step } from './engine';
import { suggestions, longTerm } from './guidance';
import {
  admitKin, fallChance, incomeOf, kinDay, kinMorale, kinOf, kinPersonal, kinPool, kinSavings, kinTitle, linkKin, makeKinRequest, newKin, requestChance, residents, retireeIncomePerDay, retirementIncome,
} from './kin';

const game = (seed = 3, o: { open?: boolean; mode?: 'scenario' | 'sandbox'; peace?: 'short' | 'medium' } = {}): GameState => {
  const base = variedFamily(seed, 0).people;
  const pool = kinPool(seed, 0, base);
  return newGame(seed, 105, 2027, { family: base, mode: o.mode ?? 'scenario', kind: o.mode === 'sandbox' ? null : 'grid_down', peace: o.peace ?? 'short', kinAway: pool, kinOpen: o.open ?? true });
};
const finish = (s: GameState, kind: string) => {
  const st = { id: `t${s.nextId++}`, kind, x: 0, z: 0, rot: 0, stage: BLUEPRINTS[kind].stages.length, done: 0, supplied: true, finishedAt: 0 };
  s.structures.push(st as GameState['structures'][number]);
  return st;
};

describe('the pool of relatives', () => {
  it('is seeded and stable, with unique ids', () => {
    const fam = variedFamily(5, 0).people;
    const a = kinPool(5, 0, fam), b = kinPool(5, 0, fam), c = kinPool(5, 1, fam);
    expect(a).toEqual(b);
    expect(a.map(p => p.first).join()).not.toBe(c.map(p => p.first).join());
    expect(new Set(a.map(p => p.id)).size).toBe(a.length);
    expect(a.length).toBeGreaterThanOrEqual(2);
    expect(a.length).toBeLessThanOrEqual(7);
  });
  it('every relative has a real relation to someone in the household and fits the sim', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const fam = variedFamily(seed, 0).people;
      const pool = kinPool(seed, 0, fam);
      expect(new Set(pool.map(p => p.id)).size).toBe(pool.length);
      for (const p of pool) {
        expect(p.rel).toBeTruthy();
        expect(fam.some(f => f.id === p.rel!.of)).toBe(true);
        expect(p.kin).toBe(true);
        expect(p.kid).toBe(false);
        if (p.elder) {
          expect(p.age).toBeGreaterThanOrEqual(58);
          expect(p.income!.perDay).toBeGreaterThan(40);
          expect(p.job).toBeUndefined();
          if (p.age >= 72) expect(p.conditions!.length).toBeGreaterThan(0);
        } else expect(p.job).toBeTruthy();
        if (p.rel!.role === 'mother' || p.rel!.role === 'father') expect(p.age).toBeGreaterThan(fam.find(f => f.id === p.rel!.of)!.age + 15);
        expect(kinTitle(p, fam)).toMatch(/’s /);
      }
    }
  });
  it('never touches the household it hangs from', () => {
    const fam = variedFamily(8, 0).people, snap = structuredClone(fam);
    kinPool(8, 0, fam);
    expect(fam).toEqual(snap);
  });
  it('linkKin points the adults at their parents and a grown child at theirs', () => {
    const fam = variedFamily(2, 0).people;
    const pool = kinPool(2, 0, fam);
    const people = [...structuredClone(fam), ...structuredClone(pool)];
    linkKin(people);
    const mom = people.find(p => p.rel?.role === 'mother');
    if (mom) expect(people.find(p => p.id === mom.rel!.of)!.parents).toContain(mom.id);
  });
  it('retirement income and savings are seeded and sensible', () => {
    const p = { id: 'pk1', age: 70 } as Person;
    expect(retirementIncome(p, 3)).toEqual(retirementIncome(p, 3));
    const inc = retirementIncome(p, 3).perDay * 30;
    expect(inc).toBeGreaterThan(1300); expect(inc).toBeLessThan(5000);
    expect(kinSavings({ ...p, elder: true }, 3)).toBeGreaterThanOrEqual(25_000);
  });
});

describe('setup money', () => {
  it('relatives who come add savings lines and stay inside the lifestyle range', () => {
    const fam = variedFamily(4, 0).people;
    const pool = kinPool(4, 0, fam);
    const base = startFunds(fam, 'fulltime', 4);
    const more = startFunds([...fam, ...pool], 'fulltime', 4);
    expect(more.lines.length).toBeGreaterThan(base.lines.length);
    expect(more.budget).toBeGreaterThanOrEqual(FUNDS_RANGE.fulltime[0]);
    expect(more.budget).toBeLessThanOrEqual(FUNDS_RANGE.fulltime[1]);
    expect(more.lines.some(l => /savings/.test(l.label) && /mother|father|sister|brother|grand|son|daughter/.test(l.label))).toBe(true);
  });
});

describe('newGame', () => {
  it('keeps relatives left in town in the state, and brings the others as people', () => {
    const fam = variedFamily(6, 0).people;
    const pool = kinPool(6, 0, fam);
    const g = newGame(6, 105, 2027, { family: [...fam, pool[0]], kinAway: pool.slice(1), kinOpen: true });
    expect(g.people.some(p => p.id === pool[0].id)).toBe(true);
    expect(g.kin!.away.map(p => p.id)).toEqual(pool.slice(1).map(p => p.id));
    expect(g.kin!.open).toBe(true);
    expect(g.version).toBe(SAVE_VERSION);
  });
  it('a game with no relatives has an empty kin state', () => {
    const g = newGame(1);
    expect(g.kin!.away).toEqual([]);
  });
});

describe('when they ask', () => {
  it('never in a free-build game, never with the option off', () => {
    const sand = game(3, { mode: 'sandbox' });
    sand.clock.t = 200;
    expect(requestChance(sand)).toBe(0);
    const g = game(3, { open: false });
    for (let i = 0; i < 400; i++) { g.clock.t += 1; kinDay(g); }
    expect(g.gate.pending).toBeNull();
  });
  it('rare in the quiet years, much likelier as the warning grows, and again just after the hit', () => {
    const g = game();
    g.clock.t = 10; expect(requestChance(g)).toBe(0);                    // a first month of settling in
    g.clock.t = 100; const calm = requestChance(g);
    g.clock.t = g.disaster.warnAt + (g.disaster.hitAt - g.disaster.warnAt) * 0.9; g.disaster.phase = 'warning';
    const late = requestChance(g);
    expect(calm).toBeGreaterThan(0); expect(calm).toBeLessThan(0.002);
    expect(late).toBeGreaterThan(calm * 8); expect(late).toBeLessThan(0.03);
    g.clock.t = g.disaster.hitAt + 5; g.disaster.phase = 'impact';
    expect(requestChance(g)).toBeGreaterThan(0.02); expect(requestChance(g)).toBeLessThan(0.05);
    g.clock.t = g.disaster.hitAt + 60;
    expect(requestChance(g)).toBe(0);
  });
  it('a decision card arrives on the gate, with the three answers', () => {
    const g = game(3);
    let found = false;
    for (let i = 0; i < 3000 && !found; i++) { g.clock.t = g.disaster.warnAt + (i % 60) * 0.5; g.disaster.phase = 'warning'; g.kin!.next = -1; kinDay(g); g.kin!.day = -1; found = g.gate.pending?.kind === 'kin'; }
    expect(found).toBe(true);
    const e = g.gate.pending!;
    expect(e.stances).toEqual(['take_in', 'build_first', 'turn_away']);
    expect(e.people!.every(p => p.rel)).toBe(true);
    expect(e.dossier.join(' ')).toMatch(/Good at/);
    expect(e.title).toMatch(/ask/);
  });
  it('after the hit the card has no "build first" (the roads are closing)', () => {
    const g = game(3);
    g.clock.t = g.disaster.hitAt + 2; g.disaster.phase = 'impact';
    const e = makeKinRequest(g, [g.kin!.away[0]], true, () => 0.3, 'e1');
    expect(e.stances).toEqual(['take_in', 'turn_away']);
    expect(e.kin!.late).toBe(true);
  });
});

function pend(g: GameState, group?: Person[]) {
  const people = group ?? [g.kin!.away[0]];
  g.gate.pending = makeKinRequest(g, people, false, () => 0.3, 'e1');
  return people;
}

describe('welcome them', () => {
  it('they join: people, bedroll, medicine, savings, humanity, and leave the town list', () => {
    const g = game(3);
    const ppl = pend(g);
    const n = g.people.length, bags = g.stock.sleeping_bag, money = g.money, hum = g.gate.humanity;
    const o = resolve(g, 'take_in');
    expect(o.tone).toBe('good');
    expect(g.people.length).toBe(n + ppl.length);
    expect(g.personState.length).toBe(g.people.length);
    expect(g.stock.sleeping_bag).toBe(bags + ppl.length);
    expect(g.money).toBeGreaterThan(money);
    expect(g.gate.humanity).toBe(Math.min(100, hum + 4));
    expect(g.kin!.away.some(p => ppl.some(q => q.id === p.id))).toBe(false);
    expect(residents(g).length).toBe(ppl.length);
    for (const p of ppl) if (p.conditions?.length) expect(g.body.rx[p.id]).toBe(60);
    expect(kinOf(g).joined).toBe(ppl.length);
  });
  it('their old job keeps going before the hit when the household still works', () => {
    const g = game(3);
    g.personState[0].employed = true;
    const sib = g.kin!.away.find(p => !p.elder);
    if (!sib) return;
    admitKin(g, [sib], 0);
    expect(g.personState.find(x => x.id === sib.id)!.employed).toBe(true);
  });
  it('with nowhere to put them it says so (housing system lines)', () => {
    const g = game(3);
    pend(g);
    const o = resolve(g, 'take_in');
    expect(o.lines.join(' ')).toMatch(/sleep|bed|roof|tent|room/i);
  });
});

describe('housing for relatives', () => {
  it('an elder takes the bed in a guest house over a bed in the main house, and sleeps happier for it', () => {
    const g = game(3);
    finish(g, 'timber_cabin');
    const gh = finish(g, 'guest_house');
    const elder = g.kin!.away.find(p => p.elder)!;
    admitKin(g, [elder], 0);
    const plan = housingPlan(g);
    const sl = plan.sleepers.find(x => x.id === elder.id)!;
    expect(sl.spot).toMatchObject({ kind: 'bed', where: gh.id });
    expect(sl.own).toBe(true);
    const cabinOnly = game(3); finish(cabinOnly, 'timber_cabin'); admitKin(cabinOnly, [elder], 0);
    const base = housingPlan(cabinOnly).sleepers.find(x => x.id === elder.id)!;
    expect(sl.morale).toBeGreaterThanOrEqual(base.morale + OWN_PLACE_MORALE - 1e-9);
    expect(base.own).toBeFalsy();
  });
  it('the main family does not move into the guest house', () => {
    const g = game(3);
    finish(g, 'timber_cabin'); finish(g, 'guest_house');
    const plan = housingPlan(g);
    for (const x of plan.sleepers) if (x.index >= 0 && !g.people[x.index].rel && !g.people[x.index].elder) expect(x.own).toBeFalsy();
  });
});

describe('build them a place first', () => {
  it('they wait; a finished guest house brings them in with a happy card', () => {
    const g = game(3);
    const people = pend(g, [g.kin!.away.find(p => p.elder) ?? g.kin!.away[0]]);
    const o = resolve(g, 'build_first');
    expect(o.tone).toBe('mixed');
    expect(g.kin!.waiting).toHaveLength(1);
    expect(g.kin!.away.some(p => p.id === people[0].id)).toBe(false);
    expect(g.people.some(p => p.id === people[0].id)).toBe(false);
    g.gate.card = null;
    g.clock.t += 1; kinDay(g);
    expect(g.kin!.waiting).toHaveLength(1);                               // no place yet
    finish(g, 'timber_cabin'); finish(g, 'guest_house');
    g.clock.t += 1; const lines = kinDay(g);
    expect(g.people.some(p => p.id === people[0].id)).toBe(true);
    expect(g.kin!.waiting).toHaveLength(0);
    expect(lines.join(' ')).toMatch(/arrive/);
    expect((g.gate.card as { tone: string } | null)?.tone).toBe('good');
  });
  it('a place with only a couch is not enough', () => {
    const g = game(3);
    pend(g, [g.kin!.away.find(p => p.elder) ?? g.kin!.away[0]]);
    resolve(g, 'build_first');
    g.structures.length = 0;
    g.clock.t += 1; kinDay(g);
    expect(g.kin!.waiting).toHaveLength(1);
  });
  it('the wait runs out: they make other plans, and can ask again; it stings', () => {
    const g = game(3);
    const people = pend(g, [g.kin!.away[0]]);
    resolve(g, 'build_first');
    g.clock.t += 400; g.disaster.phase = 'peace';
    g.gate.card = null;
    const lines = kinDay(g);
    expect(g.kin!.waiting).toHaveLength(0);
    expect(g.kin!.away.some(p => p.id === people[0].id)).toBe(true);
    expect(lines.join(' ')).toMatch(/stopped waiting/);
    expect(kinMorale(g)).toBeLessThan(0);
  });
  it('the hit comes first: they arrive anyway and take what room there is', () => {
    const g = game(3);
    const people = pend(g, [g.kin!.away[0]]);
    resolve(g, 'build_first');
    g.clock.t = g.disaster.hitAt + 1; g.disaster.phase = 'impact';
    g.gate.card = null;
    const lines = kinDay(g);
    expect(g.people.some(p => p.id === people[0].id)).toBe(true);
    expect(lines.join(' ')).toMatch(/came anyway/);
  });
});

describe('refuse', () => {
  it('costs humanity and morale, and takes them off the list', () => {
    const g = game(3);
    const elder = g.kin!.away.find(p => p.elder) ?? g.kin!.away[0];
    pend(g, [elder]);
    const hum = g.gate.humanity;
    const o = resolve(g, 'turn_away');
    expect(o.tone).toBe('bad');
    expect(g.gate.humanity).toBeLessThan(hum);
    expect(g.kin!.refused).toHaveLength(1);
    expect(g.kin!.away.some(p => p.id === elder.id)).toBe(false);
    expect(kinMorale(g)).toBeLessThan(0);
    const anchor = g.people.findIndex(p => p.id === elder.rel!.of);
    expect(kinPersonal(g, anchor)).toBeLessThan(kinMorale(g) + 1e-9);
  });
  it('the sting fades over the months', () => {
    const g = game(3);
    pend(g); resolve(g, 'turn_away');
    const now = kinMorale(g);
    g.clock.t += 120;
    expect(Math.abs(kinMorale(g))).toBeLessThan(Math.abs(now) / 3);
  });
  it('a follow-up after the hit: word they are fine, they turn up, or they did not make it', () => {
    const fates = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const g = game(seed);
      const ppl = [g.kin!.away[0]];
      pend(g, ppl); resolve(g, 'turn_away');
      g.gate.card = null;
      g.clock.t = g.disaster.hitAt + 90; g.disaster.phase = 'survival';
      const hum = g.gate.humanity;
      const lines = kinDay(g);
      const rf = g.kin!.refused[0];
      expect(rf.fate).toBeTruthy();
      fates.add(rf.fate!);
      if (rf.fate === 'came') { expect(g.gate.pending?.kind).toBe('kin'); expect(g.gate.pending?.stances).toEqual(['take_in', 'turn_away']); }
      if (rf.fate === 'died') { expect(g.gate.humanity).toBeLessThan(hum); expect(lines.join(' ')).toMatch(/did not make it/); }
      if (rf.fate === 'fine') expect(lines.join(' ')).toMatch(/alive/);
    }
    expect([...fates].sort()).toEqual(['came', 'died', 'fine']);
  });
  it('Cozy never kills them', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = game(seed); g.disaster.difficulty = 'cozy';
      pend(g); resolve(g, 'turn_away'); g.gate.card = null;
      g.clock.t = g.disaster.hitAt + 90; g.disaster.phase = 'survival';
      kinDay(g);
      expect(g.kin!.refused[0].fate).not.toBe('died');
    }
  });
});

describe('pacing: random but rare', () => {
  it('at most two requests before the hit and three after, however long the wait', () => {
    for (const seed of [1, 4, 8]) {
      const g = game(seed, { peace: 'medium' });
      let pre = 0, post = 0;
      for (let d = 31; d < g.disaster.hitAt + 60; d++) {
        g.clock.t = d + 0.5;
        const hit = g.clock.t >= g.disaster.hitAt;
        g.disaster.phase = hit ? 'survival' : g.clock.t >= g.disaster.warnAt ? 'warning' : 'peace';
        kinDay(g);
        const e = g.gate.pending;
        if (e?.kind === 'kin') { if (hit) post++; else pre++; g.gate.pending = null; g.kin!.away.push(...(e.people ?? [])); }
      }
      expect(pre).toBeLessThanOrEqual(2); expect(post).toBeLessThanOrEqual(3);
    }
  });
  it('the timing differs from game to game', () => {
    const firsts = new Set<number>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const g = game(seed, { peace: 'medium' });
      for (let d = 31; d < g.disaster.hitAt; d++) {
        g.clock.t = d + 0.5; g.disaster.phase = g.clock.t >= g.disaster.warnAt ? 'warning' : 'peace';
        kinDay(g);
        if (g.gate.pending) { firsts.add(d); break; }
      }
    }
    expect(firsts.size).toBeGreaterThan(2);
  });
});

describe('retirees, falls and the grandparents', () => {
  it('Social Security and pensions come in a day while the banks work, and stop at the collapse', () => {
    const g = game(3);
    const elder = g.kin!.away.find(p => p.elder)!;
    admitKin(g, [elder], 0);
    expect(incomeOf(elder, g.seed)!.perDay).toBeGreaterThan(40);
    const m0 = g.money; g.clock.t += 1; kinDay(g);
    expect(g.money - m0).toBeCloseTo(retireeIncomePerDay(g), 5);
    expect(retireeIncomePerDay(g)).toBeGreaterThan(0);
    g.disaster.tracks.banks = 0.1;
    const m1 = g.money; g.clock.t += 1; kinDay(g);
    expect(g.money).toBe(m1);
  });
  it('grandparents who came with the household draw Social Security too', () => {
    const fam = generateFamily(1).concat([{ id: 'pg', first: 'Old', last: 'Timer', age: 74, kid: false, body: 'm', elder: true, skills: generateFamily(1)[0].skills, shirt: 1 }]);
    const g = newGame(1, 105, 2027, { family: fam });
    expect(retireeIncomePerDay(g)).toBeGreaterThan(40);
  });
  it('falls begin at 72, grow with age, and a medic in the house makes them rarer', () => {
    expect(fallChance(60, 0)).toBe(0);
    expect(fallChance(85, 0)).toBeGreaterThan(fallChance(75, 0));
    expect(fallChance(85, 5)).toBeLessThan(fallChance(85, 0));
    const g = game(3);
    const elder = g.kin!.away.find(p => p.elder)!;
    elder.age = 90;
    admitKin(g, [elder], 0);
    let hurt = 0;
    for (let d = 1; d <= 400 && !hurt; d++) { g.clock.t = d; kinDay(g); hurt = g.personState.find(x => x.id === elder.id)!.needs.hurt.length; }
    expect(hurt).toBeGreaterThan(0);
  });
  it('an able grandparent counts as minding the little ones', () => {
    const g = game(3);
    const elder = g.kin!.away.find(p => p.elder)!;
    elder.age = 70;
    admitKin(g, [elder], 0);
    g.people.push({ id: 'kid1', first: 'Tiny', last: 'X', age: 5, kid: true, body: 'f', skills: elder.skills, shirt: 1 });
    g.personState.push({ id: 'kid1', task: 'idle', target: null, needs: g.personState[0].needs });
    const parent = g.people.findIndex(p => !p.kid && !p.elder);
    expect(kinPersonal(g, parent)).toBeGreaterThan(0);
  });
});

describe('guidance', () => {
  it('suggests a place of their own when someone is waiting, and adds the family goal', () => {
    const g = game(3);
    finish(g, 'timber_cabin');
    pend(g); resolve(g, 'build_first');
    const sg = suggestions(g).find(x => x.id === 'kin_home');
    expect(sg).toBeTruthy();
    expect(['guest_house', 'moms_house']).toContain(sg!.kind);
    const goals = longTerm(g);
    expect(goals.map(x => x.id)).toContain('family');
    expect(goals.find(x => x.id === 'family')!.steps[1].done).toBe(false);
    finish(g, 'guest_house');
    expect(longTerm(g).find(x => x.id === 'family')!.steps[1].done).toBe(true);
  });
  it('no family goal for a household with no relatives and no elders', () => {
    const g = newGame(1);
    expect(longTerm(g).map(x => x.id)).toEqual(['enclose', 'bunker', 'self']);
  });
});

describe('save', () => {
  it('migrates v54 to the current version with nobody in town and no requests', () => {
    const old = structuredClone(newGame(2)) as unknown as Record<string, unknown>;
    old.version = 54; delete old.kin;
    const back = migrate(old);
    expect(back.version).toBe(SAVE_VERSION);
    expect(back.kin).toEqual(newKin([], false));
  });
  it('relatives survive a long run through the engine without breaking sleep plans', () => {
    let g = game(4);
    admitKin(g, g.kin!.away.slice(0, 2), 0);
    finish(g, 'timber_cabin');
    g = step(g, 20);
    expect(g.people.length).toBeGreaterThan(4);
    expect(dayIndex(g.clock.t)).toBeGreaterThanOrEqual(19);
  });
  it('a four-year game with relatives asking, answered every way, stays sane and ends with the right people', () => {
    let askedAll = 0;
    for (const seed of [2, 9, 5, 11]) {
      let g = game(seed, { peace: 'medium' });
      let n = 0;
      for (let d = 0; d < 4 * 365; d += 5) {
        g = step(g, 5);
        if (g.gate.pending?.kind === 'kin') {
          const e = g.gate.pending;
          resolve(g, e.stances[n++ % e.stances.length]);
          g.gate.card = null;
        } else if (g.gate.pending) { resolve(g, g.gate.pending.stances.includes('turn_away') ? 'turn_away' : g.gate.pending.stances[0]); g.gate.card = null; }
        g.gate.card = null;
      }
      const k = g.kin!;
      askedAll += k.asked;
      // nobody exists in two places
      const ids = [...g.people.map(p => p.id), ...k.away.map(p => p.id), ...k.waiting.flatMap(w => w.ids), ...k.refused.flatMap(r => r.people.map(p => p.id))];
      const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
      expect(dup.map(d => [g.people.some(p => p.id === d) ? 'people' : '', k.away.some(p => p.id === d) ? 'away' : '', k.waiting.some(w => w.ids.includes(d)) ? 'waiting' : '', k.refused.some(r => r.people.some(p => p.id === d)) ? 'refused' : ''].filter(Boolean).join('+'))).toEqual([]);
      expect(g.personState.length).toBe(g.people.length);
      for (const ps of g.personState) { expect(Number.isFinite(ps.needs.morale)).toBe(true); expect(Number.isFinite(ps.needs.health)).toBe(true); }
      expect(Number.isFinite(g.money)).toBe(true);
    }
    expect(askedAll).toBeGreaterThan(0);
  }, 120_000);
});

describe('playtest 3: whose in-laws they are', () => {
  it('a household has one set of parents per adult: an in-law is named for the OTHER adult and linked to the one it belongs to', () => {
    let seen = 0;
    for (let seed = 1; seed <= 80; seed++) {
      const fam = variedFamily(seed, 0).people, pool = kinPool(seed, 0, fam);
      const adults = fam.filter(p => !p.kid && !p.elder);
      if (adults.length < 2) continue;
      const people = [...fam, ...pool];
      linkKin(people);
      for (const p of pool.filter(x => x.rel && /_in_law$/.test(x.rel.role))) {
        seen++;
        expect(p.rel!.of).toBe(adults[0].id);               // "Beth's mother-in-law"...
        expect(people.find(x => x.id === adults[1].id)!.parents).toContain(p.id);   // ...is Pete's mother
        expect(people.find(x => x.id === adults[0].id)!.parents ?? []).not.toContain(p.id);
      }
      for (const a of adults) expect((people.find(x => x.id === a.id)!.parents ?? []).length).toBeLessThanOrEqual(2);
    }
    expect(seen).toBeGreaterThan(5);
  });
  it('a request from both in-laws reads in the plural and names the in-laws, not "parents"', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const g = game(seed), ins = g.kin!.away.filter(p => p.rel && /_in_law$/.test(p.rel.role));
      if (ins.length !== 2) continue;
      const e = makeKinRequest(g, ins, false, () => 0.3, 'e1');
      const text = e.dossier.join(' ');
      expect(text).not.toMatch(/ is finding/);
      expect(text).not.toMatch(/’s parents \(/);
      return;
    }
    throw new Error('no seed had both in-laws');
  });
});
