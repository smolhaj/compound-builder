import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { BLUEPRINTS } from './blueprints';
import { MATERIALS } from './materials';
import { bunkerChecklist } from './guidance';
import { exposureParts } from './opsec';
import { BUNKER_ENTRANCES } from './bunkerEntrances';

const fresh = (): GameState => newGame(2, 105, 2027, { mode: 'scenario', peace: 'short', kind: 'grid_down' });
const add = (g: GameState, kind: string) => g.structures.push({ id: kind, kind, x: 0, z: 0, rot: 0, stage: 99, done: 0, supplied: true, finishedAt: 0 } as never);

describe('the floor hatch as a bunker entrance', () => {
  it('is built through the same five stages (dig, walls, roof and backfill, fit-out) with real materials', () => {
    const bp = BLUEPRINTS.bunker_floorhatch;
    expect(bp.stages.length).toBe(5);
    for (const st of bp.stages) for (const m of Object.keys(st.materials)) expect(MATERIALS[m as keyof typeof MATERIALS], m).toBeTruthy();
    expect(bp.stages[1].yields?.spoil).toBeGreaterThan(0);                                  // the dig leaves spoil for berms
    expect(bp.stages[1].materials.excavator).toBeGreaterThan(0);                            // dug with the hired machine
  });
  it('counts as a way down: the checklist is done, and it shows less than a hatch in the yard (it is under a rug)', () => {
    expect(BUNKER_ENTRANCES).toContain('bunker_floorhatch');
    const g = fresh();
    expect(bunkerChecklist(g).find(c => c.id === 'entrance')!.done).toBe(false);
    const e0 = exposureParts(g).structures;
    add(g, 'bunker_floorhatch');
    expect(bunkerChecklist(g).find(c => c.id === 'entrance')!.done).toBe(true);
    const e1 = exposureParts(g).structures - e0;
    const h = fresh(); add(h, 'bunker_hatch');
    expect(e1).toBeGreaterThan(0); expect(e1).toBeLessThan(exposureParts(h).structures - e0);
  });
});
