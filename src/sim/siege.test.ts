import { describe, expect, it } from 'vitest';
import { newGame, hourOf, dayIndex, type GameState } from './state';
import { step } from './engine';
import { planRun } from './perimeter';
import type { Encounter, EncounterKind } from './encounters';
import {
  arrivalHour, hasCutscene, siegeStrain, clockLabel, commitDays, gapLabel, gateScene, hourAfter, isRaid, locate, planSiege, probeBattle, promptNarration,
  scheduleArrival, arrivalCheck, sceneWindow, segments, type SiegeInput,
} from './siege';
import { commitRaid, restageRaid, stageRaid } from './raidCutscene';
import { useGameStore } from '../store/gameStore';

function afterHit(seed = 1): GameState {
  const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
  g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
  g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
  g.stock.canned = 20; g.stock.fuel = 10; g.stock.meds = 3;
  g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
  const r = planRun(g, 'container_wall', [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]);
  r.done = r.hours; r.supplied = true; r.finishedAt = 0;
  for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) {
    g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id });
    g.armory.skill[p.id] = 6;
  }
  g.armory.ammo['556'] = 2000;
  return g;
}
const raid = (kind: EncounterKind, size: number, id = 'e1'): Encounter => ({ id, kind, day: 5, title: 'A crew', dossier: [], size, armed: true, strength: size * 12, wants: { canned: 3 }, stances: ['hide', 'parley', 'defend'] });
const input = (o: Partial<SiegeInput> = {}): SiegeInput => ({ kind: 'gang', size: 8, temper: 'hard', hour: 2.25, seed: 1, fought: true, fightSeconds: 90, ...o });

describe('which encounters are raids, and when they come', () => {
  it('only an armed crew that can be fought is a raid', () => {
    expect(isRaid(raid('gang', 8))).toBe(true);
    expect(isRaid(raid('horde', 20))).toBe(true);
    expect(isRaid({ kind: 'trader', strength: 10, stances: ['trade', 'turn_away'] })).toBe(false);
    expect(isRaid({ kind: 'break_in', strength: 10, stances: ['defend'] })).toBe(false);
    expect(isRaid({ kind: 'looters', strength: 0, stances: ['defend'] })).toBe(false);
  });

  it('gangs come in the small hours, requisition teams in daylight, on quarter hours', () => {
    let gangNight = 0, reqDay = 0;
    for (let s = 1; s <= 200; s++) {
      const g = arrivalHour('gang', s), q = arrivalHour('requisition', s);
      expect(g * 4).toBe(Math.floor(g * 4)); expect(g).toBeGreaterThanOrEqual(0); expect(g).toBeLessThan(24);
      if (g < 5 || g >= 20) gangNight++;
      if (q >= 8 && q < 19) reqDay++;
    }
    expect(gangNight).toBeGreaterThan(160);
    expect(reqDay).toBe(200);
    expect(arrivalHour('gang', 9)).toBe(arrivalHour('gang', 9));
  });

  it('a raid rolled at midnight waits for its hour; the engine stops on that quarter hour', () => {
    const g = afterHit(2);
    g.gate.next = 99999;
    const e = raid('gang', 8);
    g.clock.t = dayIndex(g.clock.t) + 1 - 0.25;   // midnight
    g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
    g.clock.t = g.clock.ticks * (0.25 / 24);
    expect(scheduleArrival(g, e)).toBe(true);
    expect(g.gate.pending).toBeNull();
    const at = g.gate.incoming!.at;
    expect(at).toBeGreaterThan(g.clock.t);
    expect(arrivalCheck(g)).toBeNull();
    // stepping a whole day: the clock stops exactly at the arrival, on a quarter hour
    const s = step(g, 1);
    expect(s.gate.pending?.id).toBe('e1');
    expect(s.gate.incoming).toBeNull();
    expect(s.clock.t).toBeCloseTo(at, 6);
    const q = hourOf(s.clock.t) * 4;
    expect(Math.abs(q - Math.round(q))).toBeLessThan(1e-6);
  });
});

describe('words for the clock', () => {
  it('reads the hour like a bedside clock, and the gaps like a narrator', () => {
    expect(clockLabel(2.25)).toBe('2:15 AM');
    expect(clockLabel(0)).toBe('12:00 AM');
    expect(clockLabel(12.5)).toBe('12:30 PM');
    expect(clockLabel(23.75)).toBe('11:45 PM');
    expect(gapLabel(40 * 60)).toBe('40 minutes later');
    expect(gapLabel(70 * 60)).toBe('An hour and 10 minutes later');
    expect(gapLabel(2 * 3600)).toBe('2 hours later');
  });
});

describe('how long a raid lasts', () => {
  it('most raids are one scene of two to eight minutes', () => {
    for (let s = 1; s <= 120; s++) {
      for (const [kind, size, fought, hour] of [['looters', 3, true, 15], ['requisition', 5, true, 11], ['looters', 4, false, 19], ['patrol', 6, true, 9]] as const) {
        const p = planSiege(input({ seed: s, kind, size, fought, hour, fightSeconds: fought ? 40 + (s % 7) * 20 : null }));
        if (p.scenes.length > 1) continue;
        const total = p.scenes[0].lead + p.scenes[0].fight + p.scenes[0].tail;
        expect(total).toBeGreaterThanOrEqual(120);
        expect(total).toBeLessThanOrEqual(Math.max(480, p.scenes[0].fight + 40));
      }
    }
  });

  it('an organized crew at night often lays siege: 2-5 scenes, gaps of 10-90 minutes, the assault last', () => {
    let sieges = 0, n = 0;
    for (let s = 1; s <= 200; s++) {
      const p = planSiege(input({ seed: s, kind: 'gang', size: 10, hour: 1 }));
      n++;
      if (p.scenes.length === 1) continue;
      sieges++;
      expect(p.scenes.length).toBeGreaterThanOrEqual(2);
      expect(p.scenes.length).toBeLessThanOrEqual(5);
      expect(p.scenes[p.scenes.length - 1].kind).toBe('assault');
      expect(p.scenes[0].gap).toBe(0);
      expect(p.scenes[0].kind).toBe('probe');
      for (const sc of p.scenes.slice(1)) { expect(sc.gap).toBeGreaterThanOrEqual(10 * 60); expect(sc.gap).toBeLessThanOrEqual(90 * 60); }
      for (const sc of p.scenes) { const t = sc.lead + sc.fight + sc.tail; expect(t).toBeGreaterThanOrEqual(120); }
      expect(p.totalGame).toBeLessThanOrEqual(7 * 3600 + 1);
    }
    expect(sieges / n).toBeGreaterThan(0.5);
    expect(sieges / n).toBeLessThan(0.9);
  });

  it('daylight and small crews rarely besiege; a peaceful stance is one scene at the gate', () => {
    let day = 0, small = 0;
    for (let s = 1; s <= 200; s++) {
      if (planSiege(input({ seed: s, kind: 'gang', hour: 13 })).scenes.length > 1) day++;
      if (planSiege(input({ seed: s, kind: 'looters', size: 3, hour: 2 })).scenes.length > 1) small++;
      const calm = planSiege(input({ seed: s, fought: false, fightSeconds: null }));
      expect(calm.scenes.length).toBe(1);
      expect(calm.scenes[0].kind).toBe('gate');
    }
    expect(day).toBeLessThan(60);
    expect(small).toBe(0);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(planSiege(input({ seed: 4 })))).toBe(JSON.stringify(planSiege(input({ seed: 4 }))));
    expect(JSON.stringify(planSiege(input({ seed: 4 })))).not.toBe(JSON.stringify(planSiege(input({ seed: 5 }))));
  });
});

describe('the clock runs through the siege exactly once', () => {
  const siege = () => { for (let s = 1; s < 400; s++) { const p = planSiege(input({ seed: s, kind: 'gang', size: 12, hour: 1 })); if (p.scenes.length >= 3) return p; } throw new Error('no siege found'); };

  it('segments tile the game and playback time with no gaps or overlaps', () => {
    const p = siege(), segs = segments(p);
    let g = 0, r = 0;
    for (const sg of segs) { expect(sg.game0).toBeCloseTo(g, 6); expect(sg.real0).toBeCloseTo(r, 6); g += sg.gameLen; r += sg.realLen; }
    expect(g).toBeCloseTo(p.totalGame, 6);
    expect(r).toBeCloseTo(p.totalReal, 6);
  });

  it('the virtual clock is monotone, 1:1 through the fights, and ends at the siege length', () => {
    const p = siege();
    let prev = -1;
    for (let t = 0; t <= p.totalReal + 1; t += 0.5) { const l = locate(p, t); expect(l.game).toBeGreaterThanOrEqual(prev); prev = l.game; }
    expect(locate(p, p.totalReal + 5).game).toBeCloseTo(p.totalGame, 6);
    expect(locate(p, p.totalReal + 5).done).toBe(true);
    const f = segments(p).find(sg => sg.kind === 'fight')!;
    const a = locate(p, f.real0 + 1), b = locate(p, f.real0 + 11);
    expect(b.game - a.game).toBeCloseTo(10, 6);   // a playback second is a game second in the fight
  });

  it('skipping a scene lands on the next scene window and the clock still ends on the total', () => {
    const p = siege();
    for (const sc of p.scenes) { const w = sceneWindow(p, sc.index); expect(w.end).toBeGreaterThan(w.start); }
    const w0 = sceneWindow(p, 0), w1 = sceneWindow(p, 1);
    expect(w1.start).toBeCloseTo(w0.end, 6);
    expect(hourAfter(p, 0)).toBeCloseTo(1, 6);
    expect(hourAfter(p, 3600)).toBeCloseTo(2, 6);
  });

  it('committing puts exactly the siege on the clock, once; the daily sim is not double counted', () => {
    const g = afterHit(3);
    g.gate.next = 99999;
    const e = raid('gang', 6);
    g.gate.pending = e;
    const st = stageRaid(g, 'defend');
    const total = st.plan.totalGame / 86_400;
    expect(commitDays(st.plan)).toBeCloseTo(total, 12);
    const done = commitRaid(st);
    expect(done.clock.t).toBeCloseTo(st.staged.clock.t + total, 9);
    // the staging itself did not move the clock
    expect(st.staged.clock.t).toBe(g.clock.t);
    expect(g.gate.pending).toBe(e);
    // and it is the same state as stepping the staged game by that long
    const direct = step(st.staged, total);
    expect(done.clock.t).toBe(direct.clock.t);
    expect(done.stock.canned).toBe(direct.stock.canned);
    expect(JSON.stringify(done.personState)).toBe(JSON.stringify(direct.personState));
  }, 20_000);
});

describe('the scenes people watch', () => {
  it('probes cost rounds, never blood; they are deterministic and short', () => {
    const g = afterHit(4);
    const a = probeBattle(g, 'probe', 8, 11), b = probeBattle(g, 'probe', 8, 11);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.events.some(e => e.kind === 'wound' || e.kind === 'death' || e.kind === 'taken')).toBe(false);
    expect(a.events.filter(e => e.kind === 'shot').every(e => e.kind === 'shot' && !e.hit)).toBe(true);
    expect(a.events[a.events.length - 1].kind).toBe('end');
    expect(a.duration).toBeLessThanOrEqual(70);
  });

  it('a gate scene has raiders who come up and leave, and always ends', () => {
    const g = afterHit(5);
    for (const stance of ['hide', 'parley', 'warn'] as const) for (const tone of ['good', 'mixed', 'bad'] as const) {
      const b = gateScene(g, raid('looters', 5), stance, tone, 3);
      expect(b.units.some(u => u.side === 'raider')).toBe(true);
      expect(b.events[b.events.length - 1].kind).toBe('end');
      for (let i = 1; i < b.events.length; i++) expect(b.events[i].t).toBeGreaterThanOrEqual(b.events[i - 1].t);
    }
  });

  it('staging a fought raid plays one battle per scene and leaves the visible game alone', () => {
    const g = afterHit(6);
    g.gate.next = 99999;
    g.gate.pending = raid('gang', 10);
    const before = JSON.stringify(g);
    const st = stageRaid(g, 'defend');
    expect(JSON.stringify(g)).toBe(before);
    expect(st.battles.length).toBe(st.plan.scenes.length);
    expect(st.battles[st.battles.length - 1].events.some(e => e.kind === 'end')).toBe(true);
    expect(st.staged.gate.pending).toBeNull();
    expect(st.report.title.length).toBeGreaterThan(0);
  });

  it('writes a line for the prompt, at night and by day', () => {
    const g = afterHit(7);
    const night = promptNarration(g, raid('gang', 8), 2.25), day = promptNarration(g, raid('gang', 8), 13);
    expect(night.length).toBeGreaterThan(20);
    expect(day.length).toBeGreaterThan(20);
    expect(promptNarration(g, raid('gang', 8), 2.25)).toBe(night);
  });
});

describe('the lock: you decide, then you watch', () => {
  it('building, planning, buying and menus do nothing while a cutscene is up; they work again after', () => {
    const g = afterHit(8);
    useGameStore.setState({ game: g, cutscene: null, tool: null });
    const S = useGameStore.getState();
    const n0 = S.game.structures.length;
    S.plan('shed', 4, 4, 0);
    expect(useGameStore.getState().game.structures.length).toBeGreaterThan(n0);
    useGameStore.setState({ cutscene: { phase: 'prompt', hour: 2.25, narration: 'x', stance: null }, selected: null });
    const n1 = useGameStore.getState().game.structures.length;
    useGameStore.getState().plan('shed', 8, 8, 0);
    useGameStore.getState().setTool('shed');
    useGameStore.getState().select('house');
    useGameStore.getState().openShop(true);
    useGameStore.getState().planRun('container_wall', [[1, 1], [2, 2]], [], 0);
    expect(useGameStore.getState().order([{ material: 'lumber', qty: 5 }])).toBe(false);
    expect(useGameStore.getState().buy('p1')).toBe('not while the raid is on');
    const st = useGameStore.getState();
    expect(st.game.structures.length).toBe(n1);
    expect(st.tool).toBeNull();
    expect(st.selected).toBeNull();
    expect(st.shopOpen).toBe(false);
    // time does not move under a cutscene
    const t = st.game.clock.t;
    useGameStore.getState().tick(0.2);
    expect(useGameStore.getState().game.clock.t).toBe(t);
    useGameStore.setState({ cutscene: null });
    useGameStore.getState().plan('shed', 8, 8, 0);
    expect(useGameStore.getState().game.structures.length).toBeGreaterThan(n1);
  });

  it('a raid reaching the gate in the sim raises the prompt and stops the clock at the arrival hour', () => {
    const g = afterHit(9);
    g.gate.next = 99999;
    g.clock.speed = 1;
    const e = raid('gang', 8);
    g.gate.incoming = { e, at: g.clock.t + 0.05 };
    useGameStore.setState({ game: g, cutscene: null });
    for (let i = 0; i < 400 && !useGameStore.getState().cutscene; i++) useGameStore.getState().tick(0.25);
    const c = useGameStore.getState().cutscene;
    expect(c?.phase).toBe('prompt');
    expect(useGameStore.getState().game.clock.speed).toBe(0);
    expect(c!.hour).toBeCloseTo(hourOf(useGameStore.getState().game.clock.t), 9);
    // Watch, then commit: the clock moves by exactly the siege's length
    useGameStore.getState().chooseStance('defend');
    const t0 = useGameStore.getState().game.clock.t;
    useGameStore.getState().watchRaid();
    const playing = useGameStore.getState().cutscene!;
    expect(playing.phase).toBe('playing');
    expect(useGameStore.getState().game.clock.t).toBe(t0);
    useGameStore.getState().commitCutscene();
    expect(useGameStore.getState().cutscene!.phase).toBe('aftermath');
    expect(useGameStore.getState().game.clock.t).toBeCloseTo(t0 + playing.plan!.totalGame / 86_400, 9);
    useGameStore.getState().endCutscene();
    expect(useGameStore.getState().cutscene).toBeNull();
    expect(useGameStore.getState().game.gate.card).toBeNull();
  }, 30_000);
});

/** A night game with a gang at the gate whose plan is a siege of 3+ scenes. */
function siegeGame(): GameState {
  for (let seed = 1; seed < 40; seed++) for (let day = 1; day < 60; day++) {
    const g = afterHit(seed);
    g.gate.next = 99999;
    const SUB = 0.25 / 24;
    g.clock.t = Math.round((Math.floor(g.clock.t) - 0.25 + 1 / 24) / SUB) * SUB; g.clock.ticks = Math.round(g.clock.t / SUB);
    const e = { ...raid('gang', 12), day, temper: 'hard' as const };
    g.gate.pending = e;
    const p = planSiege({ kind: 'gang', size: 12, temper: 'hard', hour: hourOf(g.clock.t), seed: g.seed * 131 + day * 7 + 1, fought: true, fightSeconds: 90 });
    if (p.scenes.length >= 3) return g;
  }
  throw new Error('no siege game');
}

describe('a night under siege costs sleep and morale', () => {
  it('strain grows with the scenes and the hours; the staged family is shaken, never hurt before the assault', () => {
    const g = siegeGame();
    const st = stageRaid(g, 'defend');
    const a = siegeStrain(st.plan), one = siegeStrain({ ...st.plan, scenes: st.plan.scenes.slice(0, 1), totalGame: 400 });
    expect(a.morale).toBeGreaterThan(one.morale);
    expect(a.sleep).toBeGreaterThan(one.sleep);
    const i = g.personState.findIndex((p, k) => p.needs.died == null && st.staged.personState[k].needs.died == null && !st.staged.personState[k].needs.taken);
    const before = g.personState[i].needs.morale;
    expect(st.staged.personState[i].needs.morale).toBeLessThan(before);
    expect(st.staged.personState[i].needs.tired ?? 0).toBeGreaterThan(0);
    expect(st.outcome.lines.some(l => /slept|sleep/.test(l))).toBe(true);
    // the cosmetic scenes never wound anyone
    for (const b of st.battles.slice(0, -1)) expect(b.events.some(e => e.kind === 'wound' || e.kind === 'death' || e.kind === 'taken')).toBe(false);
  });
});

describe('one change of stance between scenes', () => {
  it('keeps the scenes already played, swaps the rest, and the clock accounting stays exact', () => {
    const g = siegeGame();
    const first = stageRaid(g, 'defend');
    const played = 1;
    const next = restageRaid(g, first, played, 'hide');
    // the part already shown is identical, so the virtual clock does not jump at the change
    expect(JSON.stringify(next.plan.scenes.slice(0, played))).toBe(JSON.stringify(first.plan.scenes.slice(0, played)));
    expect(next.battles[0]).toBe(first.battles[0]);
    const endOfPlayed = sceneWindow(first.plan, played - 1).end;
    expect(locate(next.plan, endOfPlayed).game).toBeCloseTo(locate(first.plan, endOfPlayed).game, 9);
    expect(next.plan.scenes.length).toBe(played + 1);
    expect(next.plan.scenes[played].kind).toBe('gate');
    expect(next.plan.scenes[played].gap).toBe(first.plan.scenes[played].gap);
    // committed once, by the NEW plan's length; the visible game was never touched
    const done = commitRaid(next);
    expect(done.clock.t).toBeCloseTo(g.clock.t + next.plan.totalGame / 86_400, 9);
    expect(next.staged.clock.t).toBe(g.clock.t);
    expect(next.plan.totalGame).not.toBe(first.plan.totalGame);
    // the rounds of the scene already played are still spent; the outcome is the new stance's
    expect(next.outcome.title).not.toBe(first.outcome.title);
    // staying a fight keeps the cosmetic scenes still to come and the same length
    const again = restageRaid(g, first, played, 'defend');
    expect(again.plan.scenes.length).toBe(first.plan.scenes.length);
    expect(again.plan.totalGame).toBe(first.plan.totalGame);
  });

  it('through the store: the card is offered after a scene, answered once, then the siege runs to its commit', () => {
    const g = siegeGame();
    useGameStore.setState({ game: g, cutscene: { phase: 'prompt', hour: hourOf(g.clock.t), narration: 'x', stance: null }, tool: null });
    useGameStore.getState().chooseStance('defend');
    useGameStore.getState().watchRaid();
    const t0 = useGameStore.getState().game.clock.t;
    const n0 = useGameStore.getState().cutscene!.plan!.scenes.length;
    useGameStore.getState().offerChange(0);
    expect(useGameStore.getState().cutscene!.offer).toBe(0);
    // carrying on leaves the plan alone and lets the card come again
    useGameStore.getState().midStance(null);
    expect(useGameStore.getState().cutscene!.offer).toBeNull();
    expect(useGameStore.getState().cutscene!.changed).toBe(false);
    useGameStore.getState().offerChange(1);
    useGameStore.getState().midStance('hide');
    const c = useGameStore.getState().cutscene!;
    expect(c.changed).toBe(true);
    expect(c.stance).toBe('hide');
    expect(c.plan!.scenes.length).toBe(3);
    expect(n0).toBeGreaterThanOrEqual(3);
    // once only: no more cards, a second change is ignored, and the lock still holds
    useGameStore.getState().offerChange(1);
    expect(useGameStore.getState().cutscene!.offer ?? null).toBeNull();
    useGameStore.getState().midStance('trade');
    expect(useGameStore.getState().cutscene!.stance).toBe('hide');
    const s0 = useGameStore.getState().game.structures.length;
    useGameStore.getState().plan('shed', 9, 9, 0);
    expect(useGameStore.getState().game.structures.length).toBe(s0);
    useGameStore.getState().commitCutscene();
    expect(useGameStore.getState().game.clock.t).toBeCloseTo(t0 + c.plan!.totalGame / 86_400, 9);
    useGameStore.getState().endCutscene();
    expect(useGameStore.getState().cutscene).toBeNull();
  }, 30_000);
});

describe('a night break-in plays as a short single scene', () => {
  const breakIn = (): Encounter => ({ id: 'b1', kind: 'break_in', day: 5, title: 'Someone is in the house', dossier: ['Two in the morning. Glass breaking downstairs.'], size: 2, armed: false, strength: 10, wants: {}, stances: ['call_911', 'shout', 'confront'] });

  it('arrives between 1:30 and 3:30 and has a cutscene; a raid-only test still excludes it', () => {
    for (let s = 1; s < 50; s++) { const h = arrivalHour('break_in', s); expect(h).toBeGreaterThanOrEqual(1.5); expect(h).toBeLessThanOrEqual(3.5); }
    expect(hasCutscene(breakIn())).toBe(true);
    expect(isRaid(breakIn())).toBe(false);
  });

  it('every stance stages one scene of 2-4 minutes, with a scene that always ends', () => {
    for (const stance of ['call_911', 'shout', 'confront'] as const) for (let seed = 1; seed <= 6; seed++) {
      const g = newGame(seed);   // the law still works
      g.clock.t = 3 - 0.25 + 2 / 24; g.clock.ticks = Math.round(g.clock.t / (0.25 / 24));
      g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
      g.gate.pending = breakIn();
      const st = stageRaid(g, stance);
      expect(st.plan.scenes.length).toBe(1);
      const total = st.plan.totalGame;
      expect(total).toBeGreaterThanOrEqual(120);
      expect(total).toBeLessThanOrEqual(Math.max(240, st.plan.scenes[0].fight + 40));
      const b = st.battles[0];
      expect(b.events[b.events.length - 1].kind).toBe('end');
      expect(st.staged.gate.pending).toBeNull();
    }
  });

  it('the store raises the Watch prompt for a break-in and locks like any raid', () => {
    const g = newGame(2);
    g.clock.speed = 1;
    g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    g.gate.incoming = { e: breakIn(), at: g.clock.t + 0.05 };
    useGameStore.setState({ game: g, cutscene: null });
    for (let i = 0; i < 400 && !useGameStore.getState().cutscene; i++) useGameStore.getState().tick(0.25);
    expect(useGameStore.getState().cutscene?.phase).toBe('prompt');
    expect(useGameStore.getState().cutscene!.narration.length).toBeGreaterThan(15);
    expect(useGameStore.getState().buy('p1')).toBe('not while the raid is on');
  });
});
