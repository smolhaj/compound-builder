import type { FeltSpec } from '../types';
import { genericCards, hurtOne, kindCards, noNeighbors } from '../cardLibrary';
import { householdSize as N, r25 } from '../cardFx';

/** Felt layer for unknown: keeps "The empty houses" (its own card), then what the missing left behind. */
export const felt: FeltSpec = {
  cards: [
    genericCards('unknown')[0],
    ...kindCards('unknown', [
      { id: 'lights', phase: 'hit', from: 2, to: 7, title: 'The light in the empty house', fallback: 'watch',
        text: 'A lamp is lit in the house down the road, the one whose family is gone. Nobody lit it. It is lit every night, at the same hour.',
        options: [
          { id: 'cam', label: 'Buy a trail camera and a spotlight', hint: 'A recording, if anything shows up.', cost: s => ({ money: r25(220 + N(s) * 20) }), now: [{ k: 'stock', id: 'cameras', n: 1 }, { k: 'morale', n: 1 }], risk: { p: 0.15, good: 'It caught a raccoon and a cat.', bad: 'It caught nothing, which is worse.', lose: [{ k: 'morale', n: -3 }] }, line: 'You set up a camera.' },
          { id: 'watch', label: 'Watch it from the loft, in shifts', hint: 'A long cold night.', cost: () => ({ hours: 8 }), now: [{ k: 'raidDelay', days: 1 }], risk: { p: 0.3, good: 'A timer on a lamp.', bad: 'A shape moved and was gone.', lose: [{ k: 'morale', n: -4 }] }, line: 'You watched the house from the loft.' },
          { id: 'go', label: 'Go and look, with a neighbor', hint: 'Two people and a flashlight.', cost: () => ({ hours: 3 }), off: noNeighbors, now: [{ k: 'standing', n: 4 }], risk: { p: 0.4, good: 'A dead bulb and a cold stove.', bad: 'Something was wrong in the cellar.', lose: [{ k: 'morale', n: -6 }, hurtOne('a bad scare', 10)] }, line: 'You went to look.' },
        ] },
      { id: 'who', phase: 'month', title: 'The ones who came back', fallback: 'ask',
        text: 'A woman is walking up the drive. She says her name and the street she lived on. She cannot say where she has been.',
        options: [
          { id: 'doc', label: 'Pay a nurse to check her and keep her a night', hint: 'A real exam and a bed, a steadying hand.', cost: s => ({ money: r25(350 + N(s) * 30) }), now: [{ k: 'humanity', n: 5 }], risk: { p: 0.2, good: 'She is hungry and cold, nothing more.', bad: 'She was gone before breakfast.', lose: [{ k: 'morale', n: -3 }] }, line: 'A nurse checked her.' },
          { id: 'ask', label: 'Give her food and ask quiet questions', hint: 'A day, a meal, no promises.', cost: () => ({ hours: 2 }), now: [{ k: 'stock', id: 'canned', n: -2 }, { k: 'humanity', n: 3 }], risk: { p: 0.3, good: 'A piece of the story.', bad: 'She said nothing at all.', lose: [{ k: 'morale', n: -2 }] }, line: 'You fed her and asked.' },
          { id: 'close', label: 'Keep the gate shut and call to her from the porch', hint: 'Safe, and lonely.', cost: () => ({ humanity: 3 }), now: [{ k: 'raidDelay', days: 2 }], line: 'You called to her from the porch.' },
        ] },
      { id: 'maps', phase: 'season', title: 'The map of who is missing', fallback: 'list',
        text: 'The district is quiet. A schoolteacher is trying to make a list of everyone who disappeared, and where.',
        options: [
          { id: 'fund', label: 'Pay for paper, a copier and a week of the teacher\'s time', hint: 'A real record, a real chance to see a pattern.', cost: s => ({ money: r25(300 + N(s) * 20) }), now: [{ k: 'standing', n: 6 }, { k: 'humanity', n: 2 }], risk: { p: 0.15, good: 'The pattern is a road.', bad: 'The pattern is nothing.', lose: [{ k: 'morale', n: -2 }] }, line: 'You funded the missing list.' },
          { id: 'list', label: 'Add your own names and what you saw to her list', hint: 'An evening and a cup of tea.', cost: () => ({ hours: 2 }), off: noNeighbors, now: [{ k: 'standing', n: 3 }], risk: { p: 0.25, good: 'It joined up.', bad: 'It did not.', lose: [{ k: 'morale', n: -1 }] }, line: 'You added names.' },
          { id: 'avoid', label: 'Stay out of it and keep your own counsel', hint: 'It is not your list.', cost: () => ({ standing: 3 }), now: [{ k: 'morale', n: 1 }], risk: { p: 0.2, good: 'Nothing came of it.', bad: 'She asked who you had hidden.', lose: [{ k: 'standing', n: -2 }] }, line: 'You stayed out of it.' },
        ] },
    ], false),
    ...genericCards('unknown').slice(1),
  ],
};
