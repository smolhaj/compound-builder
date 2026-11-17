import type { DecisionCard, FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25, type Fx } from '../cardFx';
import { scaredLine, walkerChoose, wallsOf, zombiesOf } from '../../walkers';

/** The teeth module's choice handler (sim/walkers.ts), as a card effect: one place decides what lights out, a strip-search and a shed hold mean. */
const walk = (choice: string): Fx => ({ k: 'run', f: s => walkerChoose(s, choice) });

let c: DecisionCard[] | null = null;
/**
 * Felt layer for zombies: the decisions the walkers module already built (lights out, the stranger at the gate) routed through the felt cards,
 * plus the wall repair and the long winter. Lazy: walkers imports the sim, which imports the felt registry.
 */
export const felt: FeltSpec = {
  get cards() {
    return (c ??= kindCards('zombies', [
      { id: 'lights_out', phase: 'hit', title: 'Lights out and quiet, or go to the road', fallback: 'dark',
        text: 'They come to light and to noise, not to smoke. A dark house, no generator, the dogs inside, and no shooting: a few at the wall a night instead of a crowd.',
        options: [
          { id: 'curtains', label: 'Buy blackout curtains and a quiet generator baffle', hint: 'Money buys a dark house that is still livable. They still hear a shot for a mile.', cost: s => ({ money: r25(300 + N(s) * 50) }), now: [{ k: 'stock', id: 'blackout_curtains', n: 4 }, walk('zb:dark'), { k: 'morale', n: 2 }], risk: { p: 0.1, good: 'A dark, quiet house with a few visitors at the wall.', bad: 'A light leaked from the pantry window.', lose: [{ k: 'raidDelay', days: -2 }] }, line: 'You blacked out the house.' },
          { id: 'dark', label: 'Lights out, stove at dusk only, quiet hours', hint: 'Free in cash. Cold, boring and nobody sleeps well.', cost: () => ({ hours: 4 }), now: [walk('zb:dark'), { k: 'morale', n: -3 }], risk: { p: 0.3, good: 'A few at the wall a night, not a crowd.', bad: 'A child dropped a pan at midnight.', lose: [{ k: 'morale', n: -3 }] }, line: 'You went dark and quiet.' },
          { id: 'road', label: 'Carry on as we are and go to the road for news', hint: 'Normal life, a lit house, and a crowd that grows.', now: [walk('zb:asis'), { k: 'morale', n: 3 }, { k: 'standing', n: 2 }], risk: { p: 0.5, good: 'A busy day, nothing came.', bad: 'The light drew them in the night.', lose: [{ k: 'raidDelay', days: -5 }, hurtOne('a bite scare', 12)] }, line: 'You carried on as before.' },
        ] },
      { id: 'wall', phase: 'hit', from: 2, to: 7, title: 'The wall, and the weak spot in it', fallback: 'brace',
        text: s => `Walking the line, the weakest run is rated about ${Math.round(wallsOf(s).weakest)} pounds per foot, and a crowd that size leans on it every night.`,
        options: [
          { id: 'crew', label: 'Pay a crew to rebuild the weak run in concrete block and rebar', hint: 'Real, permanent work. They will not work at night.', cost: s => ({ money: r25(1600 + N(s) * 120) }), now: [{ k: 'stock', id: 'concrete', n: 2 }, { k: 'stock', id: 'rebar', n: 2 }, { k: 'morale', n: 3 }], risk: { p: 0.1, good: 'The wall is straight and stiff.', bad: 'They walked off at dusk, a course short.', lose: [{ k: 'morale', n: -2 }] }, line: 'A crew rebuilt the weak run.' },
          { id: 'brace', label: 'Brace it from behind with posts and sandbags', hint: 'Ten hours of heavy work, a few bags of sand.', cost: () => ({ hours: 10 }), now: [{ k: 'stock', id: 'lumber', n: -2 }, { k: 'stock', id: 'sandbags', n: 2 }], risk: { p: 0.36, good: 'It feels solid when you push.', bad: 'A post slipped and caught a hand.', lose: [hurtOne('a crushed hand', 25)] }, line: 'You braced the wall from behind.' },
          { id: 'together', label: 'Raise a wall bee with the neighbors, house by house', hint: 'Shared labor, shared walls, shared risk.', cost: () => ({ hours: 6 }), off: noNeighbors, now: [{ k: 'standing', n: 7 }, { k: 'humanity', n: 2 }], risk: { p: 0.22, good: 'Four walls fixed in one day.', bad: 'A fight over whose came first.', lose: [{ k: 'standing', n: -5 }] }, line: 'The district held a wall bee.' },
        ] },
      { id: 'stranger', phase: 'month', from: 3, to: 160, timeout: 2, title: 'The stranger at the gate', fallback: 'away',
        if: s => !!zombiesOf(s).visitor,
        text: s => `"${zombiesOf(s).visitor?.line ?? scaredLine(() => 0.3)}" Someone is at the gate, alone, with a pack. Not walking right.`,
        options: [
          { id: 'search', label: 'Strip-search at the gate', hint: 'Most bites are seen. It costs the stranger some dignity and you an hour.', cost: () => ({ hours: 1 }), now: [walk('zb:v:search')], risk: { p: 0.3, good: 'Done; you have an answer.', bad: 'Something you could not see was on the arm.', lose: [{ k: 'morale', n: -3 }] }, line: 'You searched the stranger at the gate.' },
          { id: 'hold', label: 'Hold them 24 hours in the shed, with a watcher', hint: 'The surest filter, and the cost of a watcher through the night.', cost: () => ({ hours: 8, humanity: 0 }), now: [walk('zb:v:hold'), { k: 'humanity', n: 3 }], risk: { p: 0.15, good: 'A long night and a clear answer.', bad: 'The watcher dozed.', lose: [hurtOne('a scratch in the dark', 10)] }, line: 'You held the stranger in the shed.' },
          { id: 'away', label: 'Tell them to go', hint: 'Safe and cold. You will think about it later.', cost: () => ({ humanity: 4 }), now: [walk('zb:v:away')], line: 'You told the stranger to go.' },
          { id: 'in', label: 'Let them in', hint: 'Warm, kind and a gamble. A bite you do not see is a death in the house.', now: [walk('zb:v:in'), { k: 'humanity', n: 5 }], risk: { p: 0.35, good: 'They were whole and thankful.', bad: 'Nobody asked about the bandage.', lose: [{ k: 'fever' }, { k: 'morale', n: -6 }] }, line: 'You let the stranger in.' },
        ] },
      { id: 'winter', phase: 'season', title: 'The long cold and the crowd at the wall', fallback: 'wait',
        text: 'In deep cold they stop moving. When it thaws they come back all at once. Somebody has to decide what the household does with the freeze.',
        options: [
          { id: 'clear', label: 'Hire a crew to clear the frozen ones from the road', hint: 'Dangerous, for pay. Burning them draws every eye for miles.', cost: s => ({ money: r25(1200 + N(s) * 100) }), now: [{ k: 'raidDelay', days: 12 }, { k: 'respect', n: 0.05 }], risk: { p: 0.25, good: 'The road is clear and the crew paid.', bad: 'A thaw came early.', lose: [hurtOne('a bite scare', 15), { k: 'raidDelay', days: -4 }] }, line: 'A crew cleared the road.' },
          { id: 'wait', label: 'Hold the wall and wait for the thaw', hint: 'Nothing spent. A quiet winter and a loud spring.', cost: () => ({ hours: 6 }), now: [{ k: 'stock', id: 'firewood', n: -3 }, { k: 'morale', n: -1 }], risk: { p: 0.35, good: 'The wall held through the thaw.', bad: 'A section of wall gave way at the first warm night.', lose: [{ k: 'raidDelay', days: -5 }] }, line: 'You held the wall through the freeze.' },
          { id: 'move', label: 'Move the household to the upland camp before the thaw', hint: 'Away from the wall, in a bad place for the stores.', cost: () => ({ hours: 10, stock: { fuel: 1 } }), now: [{ k: 'morale', n: -3 }, { k: 'stock', id: 'canned', n: -2 }], risk: { p: 0.45, good: 'A quiet spring in the hills.', bad: 'A cold camp and a long hike.', lose: [hurtOne('frostbitten toes', 15)] }, line: 'You moved to the upland camp.' },
        ] },
    ]));
  },
};
