/**
 * The dome in the felt layer (owner decision 3 of 2026-11-18): radio lines about the glass house, and the fallout decisions that know a sealed,
 * filtered dome is a shelter with its own air clock. Radio lines (`domeLines`) join the generic set of every kind; the cards (`domeFalloutCards`)
 * sit in front of the generic "How long to stay sealed" card, which steps aside while a dome stands (`hasDome`).
 */
import type { GameState } from '../state';
import { domesOf, domeShelterFacts, domeLabel, stateOf, outsideDirt, setLockdown, buyFiltering, filteringBill, filteringProblem, chillerUsd, bedsUnder, ownState } from '../dome/live';
import { BAND } from '../dome/climate';
import { SHELL } from '../dome/protection';
import { feltDay } from './state';
import { genLine, familyName, firstNeighbor, THEME, type GenLine } from './lineKit';
import { opt } from './cardLibrary';
import { householdSize as N, r25 } from './cardFx';
import type { DecisionCard, FeltKind } from './types';

export const hasDome = (s: GameState): boolean => domesOf(s).length > 0;
const sealedDome = (s: GameState) => domesOf(s).find(d => stateOf(s, d).lockdown);
const hoursText = (h: number | null): string => h === null ? 'as long as the plant runs' : h < 72 ? `about ${Math.max(1, Math.floor(h))} hours` : `about ${Math.floor(h / 24)} days`;
const bedsAny = (s: GameState): boolean => domesOf(s).some(d => bedsUnder(s, d) > 0);

// ── radio ─────────────────────────────────────────────────────────────────────────────────

export function domeLines(kind: FeltKind): GenLine[] {
  const T = THEME[kind];
  return [
    genLine(kind, { id: 'dome_air_alert', channel: 'official', truth: 'true', tone: 2, when: s => !!sealedDome(s), claim: () => ({ id: 'dome_sealed' }),
      text: s => { const f = domeShelterFacts(s); return `Emergency management on ${T.noun}: sealed enclosures should read their CO2 every hour. A shelter with its own air plant lasts ${hoursText(f?.hours ?? null)} sealed; open it and the dust comes in with the air.`; } }),
    genLine(kind, { id: 'dome_shelter_notice', channel: 'official', truth: 'true', tone: 1, when: hasDome, claim: () => ({ id: 'dome_stands' }),
      text: () => `County: after ${T.noun}, the best shelter is a sealed building with filtered air. Do not open airlocks or vents while there is dust in the air outside.` }),
    genLine(kind, { id: 'dome_ham_hill', channel: 'ham', truth: 'true', tone: 1, when: hasDome, claim: () => ({ id: 'dome_stands' }),
      text: () => `Ham net: somebody out your way has a glass house on the hill, lit up all night through ${T.noun}. Operators two counties over can see the glow.` }),
    genLine(kind, { id: 'dome_ham_sealed', channel: 'ham', truth: 'true', tone: 1, when: s => !!sealedDome(s), claim: () => ({ id: 'dome_sealed' }),
      text: s => { const d = sealedDome(s)!; const st = stateOf(s, d); return `Ham net: a sealed dome in your county reports ${Math.round(st.co2ppm).toLocaleString('en-US')} ppm CO2 and ${st.o2pct.toFixed(1)} percent oxygen, with the plant ${st.powered ? 'running' : 'dark'}.`; } }),
    genLine(kind, { id: 'dome_trade_beds', channel: 'trade', truth: 'true', tone: 0, when: s => hasDome(s) && bedsAny(s), claim: () => ({ id: 'dome_stands' }),
      text: () => `Trader: the glass house on the ridge is the only place in the county still growing tomatoes through ${T.noun}. Greens and eggs, if you have something to swap.` }),
    genLine(kind, { id: 'dome_local_hill', channel: 'local', truth: 'true', tone: 1, when: s => hasDome(s) && !!firstNeighbor(s, false), claim: () => ({ id: 'dome_stands' }),
      text: s => `The ${familyName(s, firstNeighbor(s, false)!.id)} boy keeps pointing up the hill. Glass house. Lit all night. No smoke, not a wisp. Nobody comes or goes.` }),
    genLine(kind, { id: 'dome_local_scout', channel: 'local', truth: 'true', tone: 2, when: hasDome, claim: () => ({ id: 'dome_stands' }),
      text: () => 'Stranger at the glass house. Dusk. Walked the fence. Counting the doors. Gone when the lights came on.' }),
    genLine(kind, { id: 'dome_rumor_closed', channel: 'rumor', truth: 'true', tone: 1, when: s => !!sealedDome(s), claim: () => ({ id: 'dome_sealed' }),
      text: () => 'Glass house is shut. Sealed tight. Own air, they say. Nobody going in. Nobody coming out.' }),
    genLine(kind, { id: 'dome_local_plant', channel: 'local', truth: 'true', tone: 2, when: s => (s.raidDamage ?? []).some(j => j.kind === 'plant' && j.done < j.hours), claim: () => ({ id: 'dome_plant_hurt' }),
      text: () => 'Smoke over the glass house, from the yard by the wall. They hit the machinery. Lights flickering up there. Whoever lives in there is on borrowed power.' }),
    genLine(kind, { id: 'dome_rumor_sale', channel: 'rumor', truth: 'false', tone: 0, claim: () => ({ id: 'dome_stands' }),
      text: () => `Seats in a dome. By the fairgrounds. Six thousand each. Man swears it. Nobody has seen one.` }),
  ];
}

// ── cards ─────────────────────────────────────────────────────────────────────────────────

const sealMain = (s: GameState): string | null => {
  const d = domesOf(s).find(x => !stateOf(s, x).lockdown);
  if (!d) return null;
  const why = setLockdown(s, true, d.st.id);
  return why ? null : `${domeLabel(s, d)} sealed`;
};

/** The dome branch of "How long to stay sealed" and the hot-day card for the sealed dome in fallout. Put these first in a fallout kind's cards. */
export function domeFalloutCards(kind: FeltKind): DecisionCard[] {
  const seal: DecisionCard = {
    id: `${kind}:dome_sealed`, phase: 'hit', when: s => hasDome(s) && feltDay(s) >= 0 && feltDay(s) <= 5,
    title: () => 'How long to stay sealed', fallback: 'seal',
    text: s => {
      const f = domeShelterFacts(s), d = domesOf(s)[0], pf = d ? SHELL[d.tier].fallout_pf : 1.5, fl = f && f.filtering !== 'none' ? `${f.filtering} filtering` : 'its shell alone';
      return `The air outside is not the air you remember, but you have a dome. Sealed, the air lasts ${hoursText(f?.hours ?? null)} for ${f?.people ?? N(s)} people, on ${fl}, and ${pf < 3 ? `a plastic-and-steel shell trims the dose by only about ${Math.round((1 - 1 / pf) * 100)} percent (the bunker is the real shelter, the dome keeps the ground under it clean)` : `the shell cuts the dose by about ${Math.round(pf)} times`}. Every time an airlock opens, some of outside comes in.`;
    },
    options: [
      opt({ id: 'seal', label: 'Seal the dome and live on its air', hint: 'Free. The clock on the Dome page tells you how long. Nobody is exposed while it holds.', now: [{ k: 'raidDelay', days: 6 }, { k: 'morale', n: -2 }, { k: 'run', f: s => sealMain(s) }],
        risk: { p: 0.12, good: 'The air held.', bad: 'The air got stale before the plant caught up.', lose: [{ k: 'morale', n: -3 }] }, line: 'You sealed the dome.' }),
      opt({ id: 'filter', label: 'Pay for the advanced air bank now, then seal', hint: 'The crew fits it in about two weeks: longer clock, and dust scrubbed from what comes in.',
        cost: s => ({ money: r25(filteringBill(s, 'advanced')?.totalUsd ?? 0) }), off: s => (hasDome(s) ? filteringProblem(s, 'advanced') === 'already fitted' ? 'The advanced air bank is fitted.' : null : 'No dome stands.'),
        now: [{ k: 'run', f: s => { const w = buyFiltering(s, 'advanced'); return w ? null : 'The advanced air bank is ordered.'; } }, { k: 'run', f: s => sealMain(s) }], line: 'You ordered the air bank and sealed the dome.' }),
      opt({ id: 'dash', label: 'Seal it, but send one person out in a mask for water and wood', hint: 'Cheap. Each trip is a dose, and the airlock lets some dust in.', cost: () => ({ hours: 6 }),
        now: [{ k: 'stock', id: 'water_jugs', n: 2 }, { k: 'stock', id: 'firewood', n: 2 }, { k: 'run', f: s => sealMain(s) }], risk: { p: 0.35, good: 'They kept clear of the hot spots.', bad: 'The meter spiked on the way back, and the airlock was open a minute too long.', lose: [{ k: 'dose', n: 0.08 }] }, line: 'Someone made a short dash outside.' }),
    ],
  };
  const hot: DecisionCard = {
    id: `${kind}:dome_hot`, phase: 'month', when: s => {
      const d = domesOf(s).find(x => stateOf(s, x).lockdown);
      return !!d && stateOf(s, d).indoorF >= BAND[stateOf(s, d).mode][1] - 2 && outsideDirt(s) > 0.2 && feltDay(s) >= 0;
    },
    title: () => 'A hot day under a sealed dome', fallback: 'wait',
    text: s => { const d = sealedDome(s); const st = d ? stateOf(s, d) : null; return `It is ${Math.round(st?.indoorF ?? 90)} F inside the glass and the sun is high. The vents would cool it in minutes, and the dust outside would come in with the air.`; },
    options: [
      opt({ id: 'chill', label: 'Rent portable chillers and keep it sealed', hint: 'Cash for cooling. The dust stays out.', cost: s => { const d = sealedDome(s); return { money: d ? chillerUsd(s, d) : 2000 }; },
        now: [{ k: 'run', f: s => { const d = sealedDome(s); if (!d) return null; ownState(s, d).chillUntil = s.clock.t + 2; return 'Chillers are running.'; } }], line: 'Chillers were trucked in and ducted through the airlocks.' }),
      opt({ id: 'vent', label: 'Open the vents for the afternoon', hint: 'Free. Fast. Whatever is in the air outside comes in, and the dome stops being a clean zone.',
        now: [{ k: 'run', f: s => { const d = sealedDome(s); if (!d) return null; setLockdown(s, false, d.st.id); return 'The vents are open.'; } }], risk: { p: 0.5, good: 'The wind was off the ridge: not much came in.', bad: 'The dust came in on the first breeze.', lose: [{ k: 'dose', n: 0.06 }, { k: 'morale', n: -2 }] }, line: 'You opened the vents.' }),
      opt({ id: 'wait', label: 'Ride it out in the shade', hint: 'Free. Everyone is uncomfortable, the beds wilt, and the shell may open its own vents at 105 F.', now: [{ k: 'morale', n: -3 }], line: 'You rode out the heat.' }),
    ],
  };
  return [seal, hot];
}

