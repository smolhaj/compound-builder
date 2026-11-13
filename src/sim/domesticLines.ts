/**
 * Small domestic lines inside the walls ("soup's ready", a kid humming, "turn the lamp down"), picked from the state: the
 * ritual under way, the time of day, the food on the table, the mood and the weather. Pure and deterministic (the `seed`
 * picks within a pool). Calm lines are warm and whole sentences. Only when the household is wary or on alert (a threat or
 * a breach exists) do people speak in the short, scared fragments of untrained civilians.
 */
import type { RitualKind, Stance } from './rituals';

export type FoodState = 'plenty' | 'lean' | 'bare';
export interface LineInput {
  /** The ritual they are at, `bed` for the last hour before sleep, or null (no line). */
  ritual: RitualKind | 'bed' | null;
  stance: Stance;
  hour: number;
  kid: boolean;
  elder: boolean;
  /** Their morale, 0 to 100. */
  morale: number;
  food: FoodState;
  /** What is mostly on the plate (a lowercase item name), if known. */
  dish?: string;
  /** 0 mild to 1 bitter. */
  cold: number;
  snowing: boolean;
  /** Picks within a pool. */
  seed: number;
}
export interface HomeLine { text: string; tone: 'warm' | 'low' | 'scared' }

const pick = <T,>(xs: readonly T[], seed: number): T => xs[Math.abs(Math.floor(seed)) % xs.length];

const ALERT_ADULT = ['Get down. Get down.', 'They are at the gate. At the gate.', 'Stay low. Stay low.', 'Not the window. Not the window.', 'Oh no. Oh no, no.', 'Lock it. Lock the door.'];
const ALERT_KID = ['Mama?', 'I want, I want to go home.', 'Is it them? Is it them?', 'I am scared. I am scared.'];
const ALERT_ELDER = ['Away from the glass. Away.', 'Keep the little ones. Keep them down.', 'Quiet now. Quiet.'];
const WARY = ['Did you hear that?', 'Stay inside a minute.', 'Somebody at the gate.', 'Keep the lamp low.', 'Nobody go out. Not yet.'];

const DINNER = ["Soup's ready.", 'Wash up, supper is on the table.', 'Pass the bread, would you?', 'Who wants seconds?', 'Sit down before it gets cold.', 'Smells good in here tonight.', 'Everybody have a plate?'];
const DINNER_KID = ['Can I have the end piece?', 'Is there more?', 'He took my spoon.', 'Mm, mm, hmm-hmm.', 'I washed my hands. Really.', 'It is my turn to say grace.'];
const DINNER_LEAN = ['Small plates tonight. We will stretch it.', 'There is enough if we go easy.', 'Eat slow. It goes further.'];
const DINNER_BARE = ['Just broth tonight. Tomorrow we will see.', 'Share it out. Everyone gets some.'];
const DINNER_ELDER = ['Grace first, then eat.', 'This is the best thing I have had all week.'];
const FIRESIDE = ['Turn the lamp down a little.', 'Put another log on, would you?', 'Quiet tonight.', 'That stove is doing its job.', 'Come sit by the fire.', 'I could fall asleep right here.'];
const FIRESIDE_COLD = ['Listen to that wind.', 'Glad we are in and not out there.', 'Pull your chair in closer.'];
const FIRESIDE_SNOW = ['Snow is coming down again.', 'Look at that snow. Nobody is going anywhere.'];
const FIRESIDE_KID = ['One more story?', 'Read the one about the bear.', 'Mm, hmm, hmm, hmm.', 'Can the dog come up here?'];
const FIRESIDE_ELDER = ['I remember worse winters than this one.', 'Your turn to wind the clock.'];
const PLAY = ['Tag! You are it!', 'Bet you cannot catch me.', 'Look, I built a fort.', 'Mm, hmm-hm-hmm, hm.', 'Your turn. Your turn!', 'Watch this. Watch!'];
const BED = ['Lamp out, you two.', 'Good night, everybody.', 'Sleep tight.', 'Tomorrow is another day.'];
const BED_KID = ['Can the dog sleep in here?', 'Five more minutes.', 'Leave the door open a little.'];
const LOW = ['I am not very hungry, thanks.', 'Eat something anyway. Please.', 'Long day.', 'I will sit here a while.'];

/** The line for this moment, or null when there is nothing to say (no ritual, or the pool is empty). */
export function pickHomeLine(i: LineInput): HomeLine | null {
  if (i.stance === 'alert') return { text: pick(i.kid ? ALERT_KID : i.elder ? ALERT_ELDER : ALERT_ADULT, i.seed), tone: 'scared' };
  if (i.stance === 'wary') return { text: pick(WARY, i.seed), tone: 'scared' };
  if (!i.ritual) return null;
  if (i.morale < 35 && !i.kid && i.seed % 3 === 0) return { text: pick(LOW, i.seed), tone: 'low' };
  const w = (text: string): HomeLine => ({ text, tone: 'warm' });
  switch (i.ritual) {
    case 'dinner': {
      if (i.food === 'bare') return w(pick(DINNER_BARE, i.seed));
      if (i.food === 'lean' && i.seed % 2 === 0) return w(pick(DINNER_LEAN, i.seed));
      if (i.dish && !i.kid && i.seed % 4 === 1) return w(`${i.dish[0].toUpperCase()}${i.dish.slice(1)} again, but it is hot.`);
      return w(pick(i.kid ? DINNER_KID : i.elder && i.seed % 2 === 0 ? DINNER_ELDER : DINNER, i.seed));
    }
    case 'fireside': {
      if (i.kid && i.seed % 2 === 0) return w(pick(FIRESIDE_KID, i.seed));
      if (i.elder && i.seed % 3 === 0) return w(pick(FIRESIDE_ELDER, i.seed));
      if (i.snowing && i.seed % 3 === 1) return w(pick(FIRESIDE_SNOW, i.seed));
      if (i.cold > 0.6 && i.seed % 3 === 2) return w(pick(FIRESIDE_COLD, i.seed));
      return w(pick(FIRESIDE, i.seed));
    }
    case 'play': return i.kid ? w(pick(PLAY, i.seed)) : null;
    case 'bed': return w(pick(i.kid ? BED_KID : BED, i.seed));
  }
}

/** Which ritual the last hour before sleep counts as (the lamp-out hour): kids at 8, grown-ups at 10. */
export const bedHour = (kid: boolean, hour: number): boolean => (kid ? hour >= 19.5 && hour < 20.5 : hour >= 21.5 && hour < 22);
