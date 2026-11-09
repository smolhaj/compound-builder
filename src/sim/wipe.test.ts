import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { step, SUBSTEP } from './engine';
import { tallyDay, reportCard } from './report';
import { mulberry32 } from './rng';
import { aliveOnPlace, declareWipe, isWiped, wipeEnded, wipeSummary } from './wipe';
import { CAUSE_TEXT, inferCause, type DeathCause } from './deaths';
import { freshNeeds } from './needs';

const game = (seed = 7) => {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = g.disaster.hitAt + 40;
  g.clock.ticks = Math.round(g.clock.t / SUBSTEP);   // (the engine counts sub-steps: a clock set by hand needs its counter too)
  return g;
};
const killAll = (g: GameState, cause?: DeathCause) => g.personState.forEach(ps => { ps.needs.died = Math.floor(g.clock.t) - 3; if (cause) ps.needs.cause = cause; });

describe('the wipe ending: nobody alive on the property', () => {
  it('is not a wipe while one person lives', () => {
    const g = game();
    g.personState.slice(1).forEach(ps => { ps.needs.died = 5; });
    expect(isWiped(g)).toBe(false);
    expect(declareWipe(g)).toBeNull();
    expect(g.ending).toBeNull();
  });

  it('ends the run, stops the clock and drops anything waiting at the gate', () => {
    const g = game();
    g.clock.speed = 2;
    g.gate.aftermath = { } as never;
    killAll(g);
    const e = declareWipe(g);
    expect(e?.kind).toBe('wipe');
    expect(e?.continued).toBe(false);
    expect(g.clock.speed).toBe(0);
    expect(g.gate.aftermath).toBeNull();
    expect(wipeEnded(g)).toBe(true);
    // said once
    expect(declareWipe(g)).toBeNull();
  });

  it('lists who died, when and of what, earliest first; the taken are listed as taken, guests who moved away are not', () => {
    const g = game();
    const n = g.personState.length;
    expect(n).toBeGreaterThanOrEqual(3);
    g.personState[0].needs.died = 50; g.personState[0].needs.cause = 'starvation';
    g.personState[1].needs.died = 20; g.personState[1].needs.cause = 'cold';
    g.personState[2].needs.died = 30; g.personState[2].needs.taken = true;
    for (let i = 3; i < n; i++) { g.personState[i].needs.died = 40; g.personState[i].needs.left = true; }
    const w = wipeSummary(g);
    expect(w.roll.map(r => r.day)).toEqual([20, 30, 50]);
    expect(w.roll[0].cause).toBe('cold');
    expect(w.roll[0].text).toContain(CAUSE_TEXT.cold);
    expect(w.roll[1].taken).toBe(true);
    expect(w.roll[1].text).toMatch(/taken by raiders/);
    expect(w.roll[2].text).toContain('starved');
    expect(w.roll[2].text).toContain('day 50');
  });

  it('with children alive at a neighbor the ending says the family survives elsewhere, and the run still ends', () => {
    const g = game();
    const kid = g.people[g.people.length - 1];
    killAll(g, 'raid');
    g.lineage.wards = [{ person: kid, by: g.neighbors[0].id, since: 1 }];
    const e = tallyDay(g);
    expect(e?.kind).toBe('wipe');
    const w = wipeSummary(g);
    expect(w.elsewhere).toHaveLength(1);
    expect(w.text).toMatch(/alive with the/);
    expect(w.text).toMatch(/family goes on elsewhere/);
    expect(w.text).toMatch(/run is over/);
    const r = reportCard(g);
    expect(r.headline).toMatch(/lives on elsewhere/);
    expect(r.grade).toBe('F');
    expect(wipeSummary(Object.assign(game(), {})).text).not.toMatch(/elsewhere/);
  });

  it('without anyone away the card says nobody is left', () => {
    const g = game();
    killAll(g);
    tallyDay(g);
    expect(reportCard(g).headline).toMatch(/No one left/);
    expect(wipeSummary(g).text).toMatch(/^Nobody is left on the place\. This run is over\.$/);
  });

  it('a wipe before the collapse says so, and a starved wipe never says nobody went hungry', () => {
    const g = game();
    g.clock.t = g.disaster.hitAt - 30;
    killAll(g, 'starvation');
    tallyDay(g);
    const r = reportCard(g);
    expect(r.date).toBe('Before the collapse');
    expect(r.sub).toMatch(/^Before the collapse came/);
    expect(r.lines.join(' ')).not.toMatch(/Nobody went hungry/);
    expect(r.lines.join(' ')).toMatch(/died for lack of food or water/);
  });

  it('natural play, no staged deaths: a no-food start runs to a wipe whose day counts, hungry days and causes agree', () => {
    let g = newGame(3, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down', difficulty: 'hardcore' } as never);
    for (const f of ['staples', 'canned', 'frozen', 'fresh'] as const) g.stock[f] = 0;
    for (let i = 0; i < 400 && !g.ending; i++) { g = step(g, 5); g.gate.pending = null; }
    expect(g.ending?.kind).toBe('wipe');
    const r = reportCard(g), w = wipeSummary(g);
    expect(r.date).toBe(`Day ${g.stats.days} after grid-down`);
    expect(g.stats.hungryDays).toBeGreaterThan(0);
    expect(r.lines.join(' ')).toMatch(new RegExp(`${g.stats.hungryDays} hungry days`));
    expect(w.roll.every(x => x.cause === 'starvation' || x.cause === 'wild animal' || x.cause === 'radiation' || x.cause === 'cold')).toBe(true);
    expect(w.roll.every(x => x.day <= g.ending!.day)).toBe(true);
  }, 120_000);

  it('step never moves the clock for an empty place, whether or not the ending was filed', () => {
    const g = game();
    killAll(g);
    const t = g.clock.t;
    const a = step(g, 10);
    expect(a.clock.t).toBe(t);
    expect(a.ending?.kind).toBe('wipe');
    const b = step(a, 10);
    expect(b.clock.t).toBe(t);
    expect(b.ending).toEqual(a.ending);
  });

  it('a death in the middle of a step ends it on that tick, not at the next midnight', () => {
    const g = game();
    g.personState.slice(1).forEach(ps => { ps.needs.died = 2; });
    const last = g.personState[0].needs;
    last.hunger = 30000; last.health = 0.2;
    for (const f of ['staples', 'canned', 'frozen', 'fresh'] as const) g.stock[f] = 0;
    const a = step(g, 3);
    expect(a.ending?.kind).toBe('wipe');
    expect(a.personState[0].needs.died).not.toBeNull();
    // the clock stopped where the last death happened, well inside the three days asked for
    expect(a.clock.t - g.clock.t).toBeLessThan(3);
    expect(a.ending?.day).toBe(Math.floor(a.clock.t));
    expect(a.personState[0].needs.died).toBe(a.ending?.day);
    expect(a.clock.speed).toBe(0);
    expect(a.personState[0].needs.cause).toBe('starvation');
  });

  it('property: over random states the ending, the roll and the clock agree', () => {
    for (let k = 0; k < 120; k++) {
      const r = mulberry32(1000 + k);
      const g = game(1 + (k % 9));
      const n = g.personState.length;
      let dead = 0, awayLeft = 0;
      g.personState.forEach(ps => {
        const u = r();
        if (u < 0.55) { ps.needs.died = Math.floor(r() * 400); dead++; ps.needs.cause = (['starvation', 'cold', 'raid', 'illness', 'wound'] as const)[Math.floor(r() * 5)]; if (r() < 0.15) ps.needs.taken = true; else if (r() < 0.1) { ps.needs.left = true; awayLeft++; } }
      });
      const wards = Math.floor(r() * 3);
      g.lineage.wards = Array.from({ length: wards }, (_, i) => ({ person: { ...g.people[0], id: `w${i}`, first: `Kid${i}`, age: 4 + i }, by: g.neighbors[0].id, since: 1 }));
      const alive = n - dead;
      expect(aliveOnPlace(g)).toBe(alive);
      expect(isWiped(g)).toBe(alive === 0);
      const e = declareWipe(g);
      expect(!!e).toBe(alive === 0);
      const w = wipeSummary(g);
      expect(w.elsewhere).toHaveLength(wards);
      expect(w.roll).toHaveLength(dead - awayLeft);
      expect(w.roll.map(x => x.day)).toEqual([...w.roll.map(x => x.day)].sort((a, b) => a - b));
      expect(/elsewhere/.test(w.text)).toBe(wards > 0);
      const t = g.clock.t, after = step(g, 4);
      if (alive === 0) { expect(after.clock.t).toBe(t); expect(wipeEnded(after)).toBe(true); expect(after.clock.speed).toBe(0); }
      else expect(after.clock.t).toBeGreaterThan(t);
    }
  });

  it('property: deaths dealt at random moments in a live game never leave the clock running with nobody alive', () => {
    for (let k = 0; k < 14; k++) {
      let g = game(2 + k);
      const r = mulberry32(77 + k);
      for (let i = 0; i < 14; i++) {
        // some turns kill a random person; the last person on the property is taken sooner or later
        for (const ps of g.personState) if (ps.needs.died == null && r() < 0.18) { ps.needs.died = Math.floor(g.clock.t); ps.needs.cause = 'illness'; }
        const t0 = g.clock.t, wasOver = wipeEnded(g) || isWiped(g);
        g = step(g, 0.5 + r() * 2);
        if (wasOver) expect(g.clock.t).toBe(t0);
        expect(aliveOnPlace(g) > 0 || wipeEnded(g)).toBe(true);
      }
    }
  });
});

describe('how people died', () => {
  const needs = (o: Partial<ReturnType<typeof freshNeeds>>) => ({ ...freshNeeds(), ...o });
  it('is worked out from the body when no cause was recorded', () => {
    expect(inferCause(needs({ hunger: 20000 }))).toBe('starvation');
    expect(inferCause(needs({ starved: 30 }))).toBe('starvation');
    expect(inferCause(needs({ dose: 6 }))).toBe('radiation');
    expect(inferCause(needs({ hurt: [{ what: 'frostbite', sev: 40 }] }), false)).toBe('cold');
    expect(inferCause(needs({ hurt: [{ what: 'shot in the leg', sev: 70, trauma: true }] }))).toBe('wound');
    expect(inferCause(needs({ hurt: [{ what: 'flu', sev: 60 }] }))).toBe('illness');
    expect(inferCause(needs({}), true)).toBe('thirst');
    expect(inferCause(needs({}))).toBe('unknown');
    expect(inferCause(needs({ hunger: 20000, cause: 'raid' }))).toBe('raid');
  });
  it('a bad wound beats hunger; hunger beats a scratch', () => {
    expect(inferCause(needs({ hunger: 20000, hurt: [{ what: 'shot in the body', sev: 80, trauma: true }] }))).toBe('wound');
    expect(inferCause(needs({ hunger: 20000, hurt: [{ what: 'a scrape', sev: 5 }] }))).toBe('starvation');
  });
});
