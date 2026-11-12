import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { planRun, wallLength, type Pt } from './perimeter';
import { addRazor, razorBill, razorMetres, razorProblem } from './razor';
import { topClimb } from './wallTops';

const pts: Pt[] = [[4, 4], [20, 4], [20, 20], [4, 20], [4, 4]];
function walledWithDeck() {
  const g = newGame(3);
  const wall = planRun(g, 'concrete_wall', pts); wall.done = wall.hours; wall.supplied = true; wall.finishedAt = 0; g.perimeter.push(wall);
  const deck = planRun(g, 'wall_walk', pts); deck.hostId = wall.id; deck.done = deck.hours; deck.supplied = true; deck.finishedAt = 0; g.perimeter.push(deck);
  return { g, wall, deck };
}

describe('razor wire on a wall that carries a patrol deck', () => {
  it('is hung on the host wall from the stockpile, for its real bill, and slows a climber', () => {
    const { g, wall } = walledWithDeck();
    expect(razorProblem(g, wall)).toMatch(/waiting for/);
    const bill = razorBill(wallLength(wall));
    for (const [k, v] of Object.entries(bill)) (g.stock as Record<string, number>)[k] = (v as number) + 2;
    expect(razorProblem(g, wall)).toBeNull();
    const before = { ...g.stock };
    expect(topClimb(g, wall).climb).toBe(1);
    expect(addRazor(g, wall.id)).toBeNull();
    for (const [k, v] of Object.entries(bill)) expect((g.stock as Record<string, number>)[k]).toBeCloseTo((before as Record<string, number>)[k] - (v as number), 6);
    expect(wall.razor).toBe(true);
    const t = topClimb(g, wall);
    expect(t.climb).toBeLessThan(1);
    expect(t.hazards[0].what).toBe('razor coils');
    expect(razorMetres(g)).toBeGreaterThan(0);
    expect(addRazor(g, wall.id)).toMatch(/already/);
  });

  it('cannot go on the deck itself (it is not a wall) and cannot share a run with an electric top', () => {
    const { g, wall, deck } = walledWithDeck();
    expect(razorProblem(g, deck)).not.toBeNull();
    wall.electric = true;
    expect(razorProblem(g, wall)).toMatch(/electric/);
  });
});
