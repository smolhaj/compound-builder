import { describe, expect, it } from 'vitest';
import { newGame, hourOf, type GameState } from '../../sim/state';
import { planRun } from '../../sim/perimeter';
import { hourAfter, planSiege } from '../../sim/siege';
import { useGameStore } from '../../store/gameStore';
import { useBattleStore } from '../../store/battleStore';
import { useCutsceneView } from '../../store/cutsceneStore';
import { CutscenePlayer } from './CutscenePlayer';
import type { BattleRenderer } from './BattleRenderer';

function siegeGame(): GameState {
  for (let seed = 1; seed < 40; seed++) for (let day = 1; day < 60; day++) {
    const g = newGame(seed, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
    g.clock.t = Math.floor(g.disaster.hitAt + 20) + 0.25;
    g.disaster.tracks = { ...g.disaster.tracks, law: 0, stores: 0, deliveries: 0, banks: 0 };
    g.stock.canned = 20; g.stock.fuel = 10; g.stock.meds = 3;
    g.structures.push({ id: 'house', kind: 'farmhouse', x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 });
    const r = planRun(g, 'container_wall', [[-10, -10], [10, -10], [10, 10], [-10, 10], [-10, -10]]);
    r.done = r.hours; r.supplied = true; r.finishedAt = 0;
    for (const [i, p] of g.people.entries()) if (!p.kid || p.age >= 15) { g.armory.guns.push({ id: `g${i}`, model: 'sw_mp15', condition: 1, fired: 0, where: 'house', carrier: p.id }); g.armory.skill[p.id] = 6; }
    g.armory.ammo['556'] = 2000;
    g.gate.next = 99999;
    const SUB = 0.25 / 24;
    g.clock.t = Math.round((Math.floor(g.clock.t) - 0.25 + 1 / 24) / SUB) * SUB; g.clock.ticks = Math.round(g.clock.t / SUB);
    g.gate.pending = { id: 'e1', kind: 'gang', day, title: 'A crew', dossier: [], size: 12, armed: true, strength: 144, wants: { canned: 3 }, stances: ['hide', 'parley', 'defend'], temper: 'hard' } as never;
    const p = planSiege({ kind: 'gang', size: 12, temper: 'hard', hour: hourOf(g.clock.t), seed: g.seed * 131 + day * 7 + 1, fought: true, fightSeconds: 90 });
    if (p.scenes.length >= 3) return g;
  }
  throw new Error('no siege game');
}

/** A stand-in for the battle renderer: the cast stays where it is; the fight's clock runs unless held. */
function fakeBattle() {
  const fb = {
    playing: false, time: 0, hold: false, cur: null as null | { duration: number },
    actors: () => [], drainEvents: () => [],
    sync(dt: number) {
      const bs = useBattleStore.getState();
      if (bs.battle && bs.battle !== fb.cur) { fb.cur = bs.battle; fb.playing = true; fb.time = 0; }
      else if (!bs.battle && fb.playing) { fb.playing = false; fb.cur = null; }
      if (fb.playing && !fb.hold) { fb.time += dt; if (fb.time > fb.cur!.duration + 1) useBattleStore.getState().endBattle(); }
    },
  };
  return fb;
}

describe('the cutscene clock reads one continuous time, scene to scene', () => {
  it.each([false, true])('never steps back or jumps at a scene boundary, and the report card reads where the last frame left off (skipping the first scene: %s)', (skipFirst) => {
    const g = siegeGame();
    useGameStore.setState({ game: g, cutscene: { phase: 'prompt', hour: hourOf(g.clock.t), narration: 'x', stance: null }, tool: null });
    useGameStore.getState().chooseStance('defend');
    useGameStore.getState().watchRaid();
    const c0 = useGameStore.getState().cutscene!;
    const plan = c0.plan!;
    const fb = fakeBattle();
    const player = new CutscenePlayer({ battle: fb as unknown as BattleRenderer, ground: () => 0, house: () => ({ x: 0, y: 0, z: 0 }), commit: () => useGameStore.getState().commitCutscene(), seed: g.seed });
    player.start(c0);
    const seen: Array<{ hour: number; seg: string; scene: number; offer: boolean }> = [];
    let answered = 0;
    for (let i = 0; i < 40_000 && player.active && useGameStore.getState().cutscene?.phase === 'playing'; i++) {
      if (skipFirst && i === 30) player.skipScene();
      player.update(0.1);
      fb.sync(0.1);
      const c = useGameStore.getState().cutscene!;
      const v = useCutsceneView.getState().view;
      if (v) seen.push({ hour: v.hour, seg: v.seg ?? '', scene: v.scene, offer: c.offer != null });
      // the card between scenes: answer it after a few frames, carrying on
      if (c.offer != null && seen.filter(s => s.offer).length % 5 === 0) { useGameStore.getState().midStance(null); answered++; }
      if (c.phase !== 'playing') break;
    }
    expect(answered).toBeGreaterThan(0);
    const end = useGameStore.getState().cutscene!;
    expect(end.phase).toBe('aftermath');
    // continuous: the hour on the overlay never goes down (across midnight it wraps, which this siege does not reach unless it starts late)
    const unwrap = (h: number, prev: number) => (h + 1e-9 < prev - 12 ? h + 24 : h);
    let prev = seen[0].hour;
    for (const s of seen) {
      const h = unwrap(s.hour, prev);
      expect(h, `${s.seg} of scene ${s.scene} reads ${h}, after ${prev}`).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = h;
    }
    // the card between scenes reads the end of the scene before, and the gap card then the end of the gap: no one-frame flash of the later time
    // (skipping a scene jumps the clock forward by what was skipped, never back)
    let cards = 0;
    seen.forEach((s, i) => { if (s.offer && i > 0 && !seen[i - 1].offer) { cards++; if (!skipFirst || cards > 1) expect(Math.abs(s.hour - seen[i - 1].hour), `card after ${seen[i - 1].seg}`).toBeLessThan(0.02); } });
    expect(cards).toBeGreaterThan(0);
    // the report card (what the overlay shows after) is the last frame's time
    const report = (end.hour + plan.totalGame / 3600) % 24;
    expect(Math.abs(unwrap(report, prev) - prev)).toBeLessThan(1 / 60);
    expect(report).toBeCloseTo(hourAfter(end.plan!, end.plan!.totalGame), 9);
  }, 60_000);
});
