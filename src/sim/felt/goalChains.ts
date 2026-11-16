/**
 * One signature goal chain per kind (docs/FELT_LAYER.md 5.5 and section 9): three to five steps picked from the shared library (goalSteps.ts),
 * each kind rewriting the words that matter to it. A kind's own `FeltSpec.goals` wins over these; the five biology kinds (pandemic, bioweapon,
 * zombies, livestock_plague, crop_blight) keep the chain content they already had (their `KindFx.goal` hook) and are routed through here
 * as `fxChain`, so there is one goal system. Pure.
 */
import { fxGoal } from '../disasterFx';
import type { GameState } from '../state';
import { PRIMS, clockWords, type Act, type PrimId, type Words } from './goalSteps';
import type { FeltKind, GoalChain, GoalStep } from './types';
export { isFxChain } from './goalWindow';

interface Over { title?: string; short?: string; why?: Words; reward?: { title: string; line: string } }
type Def = [PrimId, Over?];
const words = (w: Words, s: GameState): string => (typeof w === 'function' ? w(s) : w);

const CHAINS: Partial<Record<FeltKind, { title: string; steps: Def[] }>> = {
  mega_quake: { title: 'Shore up before the next one', steps: [
    ['repairs', { title: 'Check the structures and shore up the weak ones', why: s => `Aftershocks bring down what the first shock only cracked. ${clockWords(s)}` }],
    ['breakers', { title: 'Shut the gas and water valves', why: 'A broken gas line or a burst main does more harm than the shaking. Close the valves and throw the breakers.' }],
    ['water', { title: 'Store boiled water', why: s => `Mains break in a quake and the water is not safe for days. ${clockWords(s)}` }],
    ['meds', { title: 'Stock a first-aid kit for the injured' }],
  ] },
  dam_flood: { title: 'Get ahead of the water', steps: [
    ['highStore', {}],
    ['breakers', { title: 'Throw the main and raise the pump', why: s => `Water in a live panel kills. Cut the power to the low buildings before the crest. ${clockWords(s)}` }],
    ['water', { title: 'Store clean water: the well will be fouled', why: 'Floodwater carries the creek into the well. Stored water is what you drink until the well is tested.' }],
    ['radio', { title: 'Get a radio for the crest warning', why: s => `The dam keepers and the county will say when the crest is due, if you can hear them. ${clockWords(s)}` }],
  ] },
  supervolcano: { title: 'Get ready for the ash', steps: [
    ['filters', { title: 'Gather respirators and filters' }],
    ['sandbags', { title: 'Cover the well cap and the air intakes', why: 'Ash is glass and cement: it grinds an engine in an hour and fouls an open well in a day. Cover what draws air or water.' }],
    ['water', {}],
    ['food90', { why: s => `Crops fail under the ash and the shops will not reopen soon. ${clockWords(s)}` }],
  ] },
  ash_winter: { title: 'Plant for a short summer', steps: [
    ['coldCrops', { title: 'Move food to cold crops under cover' }],
    ['food90', { title: 'Store a season of staples', why: s => `The dimmed sun cuts every harvest for years. What is on the shelf now is the buffer. ${clockWords(s)}` }],
    ['seed', {}],
    ['firewood', {}],
  ] },
  asteroid: { title: 'Dig in for the long dark', steps: [
    ['shelter', { title: 'Dig in: a cellar or bunker', why: s => `If it lands, the blast and the dust come in hours. Earth and mass are the whole plan. ${clockWords(s)}` }],
    ['food90', { title: 'Stock for a long year' }],
    ['water', {}],
    ['coldCrops', { title: 'Add grow cover for the dim years', reward: { title: 'Growing under cover', line: 'Cover for crops in dim light: a harvest is possible when the sky is dark.' } }],
  ] },
  wildfire: { title: 'Make the place defensible', steps: [
    ['firebreak', { title: 'Clear defensible space: dig a firebreak' }],
    ['cistern', { title: 'Hold water for hoses and roofs', why: s => `A full cistern wets the roof and feeds the pump when the line fails. ${clockWords(s)}` }],
    ['bugout', { title: 'Load the go-bag for the truck', why: s => `If the wind turns, you have minutes, not hours. ${clockWords(s)}` }],
    ['radio', { title: 'Get a radio for the evacuation notices' }],
  ] },
  drought: { title: 'Make the water last', steps: [
    ['water', { title: 'Measure and store water', why: s => `The well is the clock: store what you can while it still gives. ${clockWords(s)}` }],
    ['cistern', {}],
    ['food30', {}],
    ['seed', { title: 'Save drought-hardy seed' }],
  ] },
  grid_down: { title: 'Run the place without the grid', steps: [
    ['breakers', { title: 'Disconnect from the grid: breakers off', why: 'When the grid comes back it may come back as a surge. Break the tie yourself and run on your own power.' }],
    ['fuel', { title: 'Test the generator and count fuel' }],
    ['water', { title: 'Fill water', why: s => `Pumps stop with the grid. ${clockWords(s)}` }],
    ['food30', { title: 'Triage the freezer, stock the shelf' }],
  ] },
  solar_flare: { title: 'Ride out the storm', steps: [
    ['breakers', { title: 'Disconnect the long lines and the grid tie', why: s => `A big storm drives current down every long wire and into the transformers. ${clockWords(s)}` }],
    ['cage', { title: 'Build the Faraday box' }],
    ['spares', { title: 'Box the spares', reward: { title: 'Spares are safe', line: 'The inverter and the radios in the cage will survive the storm.' } }],
    ['radio', { title: 'Verify with a radio test', why: 'Run the set on its own battery and tune the bands. A set that works now is the proof the box did.' }],
  ] },
  emp: { title: 'Save what the pulse spares', steps: [
    ['cage', { title: 'Shield the spares: a Faraday box' }],
    ['spares', { title: 'Pull the spares and box them' }],
    ['fuel', { title: 'Fuel the old truck', why: 'Old carbureted engines have no chip to burn. Keep one running and fueled.' }],
    ['water', { title: 'Carry water by hand: store it', why: s => `Electric pumps are the first thing the pulse takes. ${clockWords(s)}` }],
  ] },
  cyberattack: { title: 'Run on paper and cash', steps: [
    ['radio', { title: 'Get a radio and paper maps' }],
    ['cash', { why: 'Cards and apps fail with the network. Cash and coin still pass hand to hand.' }],
    ['trade', { title: 'Start a barter shelf' }],
    ['food30', {}],
  ] },
  satellite_loss: { title: 'Navigate without the sky', steps: [
    ['radio', { title: 'Build a radio net: no GPS, no time signal' }],
    ['cash', { title: 'Cash on hand for a market with no card readers' }],
    ['fuel', { title: 'Fuel for the trips you can no longer route' }],
    ['trade', {}],
  ] },
  oil_shock: { title: 'Get through the fuel crunch', steps: [
    ['fuel', { title: 'Take a tank inventory and fill the cans', why: s => `The pump price will not wait for you. ${clockWords(s)}` }],
    ['firewood', { title: 'Switch heat to wood' }],
    ['trade', { title: 'Hold fuel and goods for barter' }],
    ['cash', {}],
  ] },
  financial: { title: 'Move out of paper', steps: [
    ['cash', { title: 'Take part of the savings out as cash' }],
    ['metals', { title: 'Put some in gold and silver' }],
    ['trade', { title: 'Start a barter shelf' }],
    ['food30', { title: 'Turn money into a month of food' }],
  ] },
  lawless: { title: 'Hold the place through the dark months', steps: [
    ['watch', { title: 'Set the watch rota' }],
    ['dark', { title: 'Light discipline: go dark' }],
    ['pact', { title: 'Make a pact with the neighbors' }],
    ['defended', {}],
  ] },
  civil_war: { title: 'Stay out of the fight', steps: [
    ['pact', { title: 'Choose a posture: make terms with the neighbors' }],
    ['dark', { title: 'Hide the stock: go dark' }],
    ['bugout', { title: 'Make an exit plan', why: s => `Front lines move. Know the road out and have the bag packed. ${clockWords(s)}` }],
    ['cash', { title: 'Cash for a paper pass and a toll' }],
  ] },
  invasion: { title: 'Live under the occupation', steps: [
    ['dark', { title: 'Hide stock and keep a curfew routine' }],
    ['cash', { title: 'Cash for papers and checkpoints' }],
    ['bugout', {}],
    ['radio', { title: 'Keep a radio for word from the resistance' }],
  ] },
  mass_exodus: { title: 'Meet the people on the road', steps: [
    ['tents', {}],
    ['food90', { title: 'Stock for guests: a ration plan' }],
    ['water', {}],
    ['defended', { title: 'Mark your boundaries and a camp spot' }],
  ] },
  cult_takeover: { title: 'Keep your household your own', steps: [
    ['pact', { title: 'A safe signal with neighbors' }],
    ['radio', { title: 'Keep a line to the outside' }],
    ['defended', { title: 'Keep the household together and the gate yours' }],
    ['food30', {}],
  ] },
  water_war: { title: 'Secure your water', steps: [
    ['water', {}],
    ['cistern', { title: 'Build a cistern', why: s => `Whoever holds the water holds the valley. A cistern is water they cannot meter. ${clockWords(s)}` }],
    ['defended', { title: 'Guard the intake' }],
    ['watch', {}],
  ] },
  unknown: { title: 'Find out what it is', steps: [
    ['dark', { title: 'Cover the lights until you know what it is' }],
    ['radio', { title: 'Listen: get a radio' }],
    ['pact', { title: 'Count heads: talk to the neighbors' }],
    ['food30', {}],
  ] },
  nuclear: { title: 'Get inside and stay there', steps: [
    ['shelter', { title: 'Get inside a hardened room', why: s => `Most of the dose comes in the first two days. Mass between you and the sky is the whole plan. ${clockWords(s)}` }],
    ['iodine', { title: 'Seal and log the dose: counter and iodine' }],
    ['food30', { title: 'Ration for 14 days and more' }],
    ['water', {}],
  ] },
  reactor_meltdown: { title: 'Shelter from the plume', steps: [
    ['radio', { title: 'Check the wind: get a radio' }],
    ['shelter', { title: 'Seal and shelter', why: s => `Plumes drift with the wind: a sealed room with mass is the best answer. ${clockWords(s)}` }],
    ['iodine', {}],
    ['filters', { title: 'Filters for a decon station' }],
  ] },
  global_famine: { title: 'Feed the family and the field', steps: [
    ['food90', { title: 'A ration plan: stock a season' }],
    ['seed', { title: 'Store a seed reserve' }],
    ['defended', { title: 'Guard the fields and the store' }],
    ['coldCrops', {}],
  ] },
};

/** The five kinds whose chain content lives in their `KindFx.goal` hook (WP4+7): label order, and the Do-it for each step. */
const FX_KINDS: Partial<Record<FeltKind, { title: string; steps: Array<{ label: string; short?: string; act: Act }> }>> = {
  pandemic: { title: 'Ride out the waves', steps: fxSteps('family') },
  bioweapon: { title: 'Keep it out', steps: fxSteps('family') },
  zombies: { title: 'Hold the wall through the winter', steps: [
    { label: 'Go dark and quiet', short: 'Dark', act: { label: 'Open Defense and turn on lights-out', act: { type: 'open', right: 'defense' } } },
    { label: 'A wall that holds the crowd', short: 'Wall', act: { label: 'Open Defense and strengthen the wall', act: { type: 'open', right: 'defense' } } },
    { label: 'Hold a stranger 24 hours in the shed', short: 'Hold a stranger', act: { label: 'Open the people tab (the bite protocol)', act: { type: 'open', right: 'family' } } },
    { label: 'Get through 30 nights', short: '30 nights', act: { label: 'Open Defense and check the watch', act: { type: 'open', right: 'defense' } } },
    { label: 'Reach the thaw with no one lost to a bite', short: 'The thaw', act: { label: 'Open the people tab', act: { type: 'open', right: 'family' } } },
  ] },
  livestock_plague: { title: 'Get the stock through', steps: [
    { label: 'Close the barn (three biosecurity measures)', short: 'Barn', act: { label: 'Open the farm and close the barn', act: { type: 'open', right: 'supplies', supplies: 'farm' } } },
    { label: 'Answer the cull', short: 'Cull', act: { label: 'Open the farm and answer the cull', act: { type: 'open', right: 'supplies', supplies: 'farm' } } },
    { label: 'Wait out the fallow', short: 'Fallow', act: { label: 'Open the farm', act: { type: 'open', right: 'supplies', supplies: 'farm' } } },
    { label: 'Restock from clean sources', short: 'Restock', act: { label: 'Open the farm and restock', act: { type: 'open', right: 'supplies', supplies: 'farm' } } },
  ] },
  crop_blight: { title: 'Feed the year after the blight', steps: [
    { label: 'Choose the seed that goes in first', short: 'Seed', act: { label: 'Open the farm and choose seed', act: { type: 'open', right: 'supplies', supplies: 'farm' } } },
    { label: 'Grow three different crops in one year', short: 'Three crops', act: { label: 'Open the farm and plant a mix', act: { type: 'open', right: 'supplies', supplies: 'farm' } } },
    { label: 'Share with a hungry neighbor', short: 'Share', act: { label: 'Open the neighborhood', act: { type: 'open', right: 'outside' } } },
    { label: 'Reach the second year with seed in the store', short: 'Year two', act: { label: 'Check the seed store', act: { type: 'open', right: 'supplies', supplies: 'stores' } } },
  ] },
};
function fxSteps(_: 'family'): Array<{ label: string; short?: string; act: Act }> {
  return [
    { label: 'Decide: seal or stay open', short: 'Seal or open', act: { label: 'Open the neighborhood and decide', act: { type: 'open', right: 'outside' } } },
    { label: 'Build a drop box', short: 'Drop box', act: { label: 'Open Defense and build a drop box', act: { type: 'open', right: 'defense' } } },
    { label: 'Get through the first wave with no one lost', short: 'First wave', act: { label: 'Open the people tab', act: { type: 'open', right: 'family' } } },
    { label: 'Have a recovered runner', short: 'Runner', act: { label: 'Open the people tab', act: { type: 'open', right: 'family' } } },
    { label: 'Reach the end of the last wave', short: 'Last wave', act: { label: 'Open the people tab', act: { type: 'open', right: 'family' } } },
  ];
}

/** The live step list of the kind's own `KindFx.goal` hook (never throws: a hook that cannot answer yet says "not done"). */
function fxLive(s: GameState): Array<{ label: string; done: boolean }> {
  try { return fxGoal(s)?.steps ?? []; } catch { return []; }
}

function fxChain(kind: FeltKind): GoalChain | null {
  const def = FX_KINDS[kind];
  if (!def) return null;
  const steps: GoalStep[] = def.steps.map((st, i) => ({
    id: `${kind}:fx${i}`, short: st.short ?? `Step ${i + 1}`, title: st.label,
    line: s => (fxLive(s)[i]?.done ? 'Done' : `Step ${i + 1} of ${def.steps.length}, not done yet`),
    why: s => `${clockWords(s)} This is step ${i + 1} of ${def.steps.length} of the way through it: the Next steps list keeps the decision cards.`,
    done: s => !!fxLive(s)[i]?.done, act: () => st.act,
    reward: { title: i === def.steps.length - 1 ? 'You came through' : `Step ${i + 1} done`, line: `${st.label}: done.` },
  }));
  return { id: kind, title: def.title, startsAt: 'warning', steps };
}

/** Keyword -> library step whose "Do it" fits, for a kind's own steps that came without one (the tech adapter, sim/techFelt.ts). */
const ACT_WORDS: Array<[RegExp, PrimId]> = [
  [/water|well|tank/i, 'water'], [/freezer|food|pantry|meal|ration/i, 'food30'], [/fuel|generator|diesel|gas/i, 'fuel'], [/neighbo|pact|trade|barter/i, 'pact'],
  [/radio|news|listen/i, 'radio'], [/cash|money|bank/i, 'cash'], [/dark|light|window/i, 'dark'], [/watch|guard|gate/i, 'watch'], [/med|first.?aid|sick/i, 'meds'],
  [/breaker|grid|line|power|solar|battery/i, 'breakers'], [/seed|garden|plant/i, 'seed'], [/wall|fence|defen/i, 'defended'], [/cellar|bunker|shelter/i, 'shelter'],
];
/** Give a step with no "Do it" a working one: the best-fitting library handler, else the people tab. */
function withActs(c: GoalChain): GoalChain {
  return { ...c, steps: c.steps.map(st => {
    if (st.act) return st;
    const hit = ACT_WORDS.find(([re]) => re.test(st.title))?.[1];
    return { ...st, act: hit ? PRIMS[hit].act : () => ({ label: 'Open the family tab', act: { type: 'open' as const, right: 'family' as const } }) };
  }) };
}

/** The chain for a kind: its own spec's if it wrote one, else the fx hook's, else the generic one. */
export function chainFor(kind: FeltKind, own?: GoalChain): GoalChain | null {
  if (own) return withActs(own);
  const fx = fxChain(kind);
  if (fx) return fx;
  const def = CHAINS[kind];
  if (!def) return null;
  const steps: GoalStep[] = def.steps.map(([p, o]) => {
    const base = PRIMS[p];
    return {
      id: `${kind}:${p}`, short: o?.short ?? base.short, title: o?.title ?? base.title, line: base.line,
      why: s => words(o?.why ?? base.why, s), done: base.done, act: base.act,
      reward: o?.reward ?? base.reward, ...(base.pace ? { pace: base.pace } : {}),
    };
  });
  return { id: kind, title: def.title, startsAt: 'warning', steps };
}

export const CHAIN_KINDS = [...Object.keys(CHAINS), ...Object.keys(FX_KINDS)] as FeltKind[];
