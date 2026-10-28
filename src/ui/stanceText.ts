import type { Stance } from '../sim/encounters';

/** The gate card's words for each stance: [name, what it does]. */
export const STANCE: Record<Stance, [string, string]> = {
  hide: ['Hide', 'Lights out, everyone underground or into the timber. They may never know you\'re here, or they may take what they find.'],
  parley: ['Parley', 'Talk at the gate. A good negotiator can send them off with little.'],
  warn: ['Warn off', 'Show the walls and the rifles. Opportunists turn around; some don\'t.'],
  defend: ['Defend', 'Hold the line. Walls, fighters, the armory and allies on the radio decide it.'],
  trade: ['Trade', 'Offer something for peace, or for what they carry.'],
  take_in: ['Take them in', 'They join the family: more hands, more mouths.'],
  trial: ['A month\'s trial', 'They camp outside the wall for a month and work for their keep, fed from your stores. You\'ll see what they\'re made of.'],
  turn_away: ['Turn them away', 'The gate stays shut.'],
  call_911: ['Lock in and call 911', 'Everyone behind the safe-room or a locked bedroom door, on the phone with dispatch. They\'ll likely take something and be gone before the deputies come.'],
  shout: ['Lights on and shout', 'Every light on, and a shout down the stairs that the police are coming. Most burglars run.'],
  pay: ['Pay them', 'Hand it over at the gate and pray they keep their word.'],
  refuse: ['Refuse', 'Send them off with nothing.'],
  confront: ['Confront them', 'Gun in hand. They\'ll probably run, but a shooting means the sheriff\'s investigation, lawyers, and the guns held as evidence.'],
};
