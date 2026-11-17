import type { FeltSpec } from '../types';
import { hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for wildfire: go or stay, the firebreak, the burn scar, the long rebuild. */
export const felt: FeltSpec = {
  cards: kindCards('wildfire', [
    { id: 'go_or_stay', phase: 'hit', title: 'Go, or stay and defend', fallback: 'go',
      text: 'The ridge is orange and the wind is toward you. Embers are landing in the yard. Everyone is looking at you.',
      options: [
        { id: 'crew', label: 'Pay a private crew to wet the roof and cut a line', hint: 'Money buys trained people with a pumper. Nearly sure to work.', cost: s => ({ money: r25(1400 + N(s) * 150) }), now: [{ k: 'stock', id: 'sandbags', n: 2 }, { k: 'morale', n: 3 }], risk: { p: 0.1, good: 'The crew held the line and the house is standing.', bad: 'The crew left at dusk with the roof half wet.', lose: [{ k: 'stock', id: 'roofing', n: -1 }] }, line: 'A crew worked the roof and the brush line.' },
        { id: 'stay', label: 'Stay: wet the roof, clear the brush, fill every tub', hint: 'Free in cash. Twelve hours of hard work, smoke and a bad place to be careless.', cost: () => ({ hours: 12, stock: { water_jugs: 2 } }), now: [{ k: 'raidDelay', days: 3 }], risk: { p: 0.4, good: 'Embers fell on wet shingles and went out.', bad: 'A spot fire got into the porch and you fought it by hand.', lose: [hurtOne('burned hands', 25), { k: 'stock', id: 'lumber', n: -2 }] }, line: 'You stayed to defend the place.' },
        { id: 'go', label: 'Load the truck and go to the shelter', hint: 'Everyone lives. The house is on its own, and so are the stores you leave.', cost: () => ({ hours: 4 }), now: [{ k: 'morale', n: -4 }], risk: { p: 0.25, good: 'You were out before the road closed.', bad: 'Smoke closed the road and you lost two hours at a roadblock.', lose: [hurtOne('smoke inhalation', 15), { k: 'stock', id: 'canned', n: -2 }] }, line: 'You loaded the truck and drove out.' },
      ] },
    { id: 'firebreak', phase: 'hit', from: 1, to: 6, title: 'A firebreak, if it is not too late', fallback: 'hand',
      text: 'The fire is two valleys over. A strip of bare dirt between it and the barn might be the difference.',
      options: [
        { id: 'dozer', label: 'Hire a dozer operator for a day', hint: 'A wide, clean line in a morning. He charges what he likes.', cost: s => ({ money: r25(900 + N(s) * 100) }), now: [{ k: 'raidDelay', days: 2 }, { k: 'morale', n: 3 }], risk: { p: 0.08, good: 'The line is deep and straight.', bad: 'He cut it in the wrong place and quit.', lose: [{ k: 'morale', n: -3 }] }, line: 'A dozer cut a line.' },
        { id: 'hand', label: 'Cut and rake a line by hand', hint: 'Two days of shovels and rakes. Narrower, and it only works if the wind holds.', cost: () => ({ hours: 14 }), now: [{ k: 'stock', id: 'hardware', n: 0 }], risk: { p: 0.35, good: 'The line is wide enough.', bad: 'The wind turned and jumped it.', lose: [hurtOne('a wrenched back', 15)] }, line: 'You raked a line by hand.' },
        { id: 'together', label: 'Cut one line with the neighbors, across every fence', hint: 'Shared shovels, shared risk. It works only if they show up.', cost: () => ({ hours: 7 }), off: noNeighbors, now: [{ k: 'standing', n: 7 }, { k: 'humanity', n: 2 }], risk: { p: 0.22, good: 'One long line, and a lot of goodwill.', bad: 'Argument over whose fence line got cut.', lose: [{ k: 'standing', n: -6 }] }, line: 'You cut a joint line with the neighbors.' },
      ] },
    { id: 'burn_scar', phase: 'month', title: 'The burn scar above the creek', fallback: 'seed',
      text: 'The slopes are bare and black. The first hard rain will bring ash and mud to the creek, and the well.',
      options: [
        { id: 'contract', label: 'Pay to have the hillside mulched and the culvert cleared', hint: 'The cleanest way. A crew with straw and a truck.', cost: s => ({ money: r25(700 + N(s) * 120) }), now: [{ k: 'morale', n: 3 }], risk: { p: 0.1, good: 'The slope held in the first storm.', bad: 'A cloudburst took part of it anyway.', lose: [{ k: 'stock', id: 'canned', n: -1 }] }, line: 'A crew mulched the slope.' },
        { id: 'seed', label: 'Seed, stake logs and build check dams yourselves', hint: 'Free in cash, a week of hours, partly effective.', cost: () => ({ hours: 15 }), now: [{ k: 'stock', id: 'logs', n: 1 }], risk: { p: 0.32, good: 'Cheat grass came up and held the soil.', bad: 'A storm took most of it.', lose: [hurtOne('a gashed leg', 15)] }, line: 'You built check dams and seeded.' },
        { id: 'filter', label: 'Move the well intake and boil what you drink', hint: 'Protects people, not land. Costs fuel and patience.', cost: () => ({ stock: { fuel: 1 } }), now: [{ k: 'stock', id: 'water_jugs', n: 2 }, { k: 'morale', n: -2 }], risk: { p: 0.2, good: 'The water stayed clear.', bad: 'The first rain turned the well gray.', lose: [{ k: 'fever' }] }, line: 'You moved the intake and started boiling.' },
      ] },
    { id: 'rebuild', phase: 'season', title: 'What the fire took', fallback: 'patch',
      text: 'The neighbor down the road lost the house. Fences, the pump house and the back forty need work before winter.',
      options: [
        { id: 'contract', label: 'Hire builders for the fence and the pump house', hint: 'Fast, plain work. They bring their own lumber at a price.', cost: s => ({ money: r25(1200 + N(s) * 150) }), now: [{ k: 'stock', id: 'hardware', n: 2 }, { k: 'morale', n: 5 }], line: 'Builders mended the fence and pump house.' },
        { id: 'patch', label: 'Patch what you can from salvage', hint: 'Slow, ugly and it mostly works.', cost: () => ({ hours: 16 }), now: [{ k: 'stock', id: 'lumber', n: 1 }], risk: { p: 0.3, good: 'It holds.', bad: 'A salvaged post gave way.', lose: [hurtOne('a mashed thumb', 10)] }, line: 'You patched with salvage.' },
        { id: 'host', label: 'Take the burned-out neighbors in for the winter', hint: 'Their labor and your woodpile. They will not forget.', cost: s => ({ stock: { canned: N(s) * 2 } }), off: noNeighbors, now: [{ k: 'standing', n: 10 }, { k: 'humanity', n: 5 }, { k: 'morale', n: 2 }], risk: { p: 0.15, good: 'They work as hard as anyone.', bad: 'A crowded winter wears on you all.', lose: [{ k: 'morale', n: -4 }] }, line: 'You took the neighbors in.' },
      ] },
  ]),
};
