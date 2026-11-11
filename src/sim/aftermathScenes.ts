/**
 * The scenes after the shooting stops (stage D of the cutscene work). Pure and seeded; the cutscene (sim/raidDrama.ts) and the Hud call these.
 *
 *   burialWords        what the mourners say at the grave once it is filled
 *   graveCaptions      the captions of the burial: each is for something drawn when it shows (the dig, the carrying, the laying in, the mound)
 *   cleanupCaptions    the captions of the cleanup: only for work that is shown (a rake over the stain, planks across the breach)
 *   traumaBeats        the people who are still shaking: frozen where they stand, hands to the face
 *   raiderFace         a face for the raider on the drive or in the cellar: age, scars, a story he tells (the same man always gets the same face)
 *   interrogationScene the questioning of a prisoner as a spoken conversation, with the choices kept for the player (`sim/interrogation.ts` decides the answer)
 *
 * Rule: a caption says only what the picture shows. No line is used twice in one scene, and none is empty.
 */
import { mulberry32 } from './rng';
import { QUESTION_NAME, type Approach, type Question } from './interrogation';

export interface SceneLine { dt: number; text: string; who?: string; kind: 'say' | 'caption' }
type Rng = () => number;
const pickOut = (pool: readonly string[], used: Set<string>, r: Rng): string => {
  const free = pool.filter(l => !used.has(l));
  const l = (free.length ? free : pool)[Math.floor(r() * (free.length ? free.length : pool.length))];
  used.add(l); return l;
};
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

export interface Mourner { id: string; name: string; kid?: boolean; kin?: boolean }
export interface BurialInput { name: string; age: number; kid: boolean; elder: boolean; mourners: readonly Mourner[]; seed: number }

const WORDS_KIN = ['"I do not know what to say. You were here, and now you are not."', '"{n}, I will keep the place. I promise you that."', '"Thank you. For every single day."'];
const WORDS_KID = ['"Is {n} cold down there?"', '"Can I put this on top? It was {n}\'s."', '"I will not make noise anymore. Please come back."'];
const WORDS_ANY = ['"Rest now. We have it from here."', '"{n} did not run. Remember that."', '"Lord, take {n}. We have nothing else to give."'];

export function burialWords(inp: BurialInput): SceneLine[] {
  const r = mulberry32(inp.seed * 31 + 7), used = new Set<string>(), v = { n: inp.name };
  const speakers = [...inp.mourners].sort((a, b) => Number(!!b.kin) - Number(!!a.kin)).slice(0, 3);
  return speakers.map((m, i) => {
    const pool = m.kid ? WORDS_KID : m.kin || i === 0 ? WORDS_KIN : WORDS_ANY;
    return { dt: i * 2.6, kind: 'say' as const, who: m.id, text: fill(pickOut(pool, used, r), v) };
  });
}

export function graveCaptions(name: string, diggers: readonly string[]): { dig: string; carry: string; lower: string; fill: string } {
  const who = diggers.length > 1 ? `${diggers[0]} and ${diggers[1]}` : diggers[0] ?? 'Someone';
  return {
    dig: `${who} dig the grave.`,
    carry: `They carry ${name} to the grave.`,
    lower: `They lay ${name} in the ground.`,
    fill: `${who} fill it in and set a marker at the head.`,
  };
}

export function cleanupCaptions(raker: string, fallen: string, hammerer: string): { stain: string; repair: string } {
  return { stain: `${raker} rakes sand over the place where ${fallen} fell.`, repair: `${hammerer} nails planks across the breach in the wall.` };
}

export interface Shaken { id: string; name: string; trauma: number }
const FLINCH = ['{c} stands frozen, hands to the face.', '{c} cannot move. The shaking will not stop.', '{c} stopped where they stood, and cannot start again.', '{c} stares at nothing, hands over the mouth.'];
/** The people who are still shaking: trauma at 25 or above, the worst first, at most three. */
export function traumaBeats(people: readonly Shaken[], seed: number): Array<SceneLine & { kind: 'caption' }> {
  const r = mulberry32(seed * 13 + 5), used = new Set<string>();
  return [...people].filter(p => p.trauma >= 25).sort((a, b) => b.trauma - a.trauma).slice(0, 3)
    .map((p, i) => ({ dt: i * 3, kind: 'caption' as const, who: p.id, text: fill(pickOut(FLINCH, used, r), { c: p.name }) }));
}

export interface Face { age: number; skin: number; hair: number; eyes: number; scar: boolean; beard: boolean; story: string }
const SKIN = [0xf1d3b8, 0xe0b48f, 0xc68a5f, 0x9a6540, 0x6e4529], HAIR = [0x1c1410, 0x3b2a1c, 0x6b4a2a, 0x9a8a6a, 0x777777], EYES = [0x3a2a1c, 0x2d4a63, 0x5a6b3a, 0x6a6a6a];
const STORIES = ['He had a farm two counties over until the bank and the drought took it.', 'He was a trucker. The road shut and his company stopped answering the radio.', 'He says his little sister is waiting for him in a camp up north, and that is why he went along.', 'He was a deputy once. He does not like to say what happened to the badge.', 'He joined the crew for a meal and a rifle. He is nineteen.', 'He worked at a grain elevator. He says he never wanted this part.'];
/** The same man always gets the same face and the same story. */
export function raiderFace(name: string, seed: number): Face {
  let h = seed >>> 0; for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619) >>> 0;
  const r = mulberry32(h);
  const age = 17 + Math.floor(r() * 36);
  return { age, skin: SKIN[Math.floor(r() * SKIN.length)], hair: HAIR[Math.floor(r() * HAIR.length)], eyes: EYES[Math.floor(r() * EYES.length)], scar: r() < 0.35, beard: age > 22 && r() < 0.5, story: STORIES[Math.floor(r() * STORIES.length)] };
}

export interface Exchange { who: 'you' | 'note'; text: string }   // (his answers are the sim's own lines, told in the third person: notes, not quotes)
const ASK_KIND: Record<Question, string[]> = {
  next_crew: ['"I brought you a plate. Who is coming after you?"', '"Sit. Eat. Is there another crew behind yours?"'],
  who_sent: ['"I am not going to hurt you. Who runs your outfit?"', '"Somebody gave the orders. Who?"'],
  stash: ['"You took things from other places. Where is it kept?"', '"I would like to know where the food went. Will you tell me?"'],
};
const ASK_HARSH: Record<Question, string[]> = {
  next_crew: ['"Who is coming next? You have until the lamp burns down."', '"Tell me who else is out there, or you spend the night in the cold."'],
  who_sent: ['"Name. Now. Who gave the order?"', '"I will ask once. Who sent you?"'],
  stash: ['"Where is the loot? Do not make me ask the rope."', '"Where did you hide it?"'],
};
const SILENT_KIND = ['He looks at the floor. "I do not know. I am sorry."', 'He shakes his head slowly and will not meet your eye.'];
const SILENT_HARSH = ['He spits on the boards and says nothing.', 'His jaw is tight. He stares at the wall.'];
const LINE = ['He thinks about it a long moment.', 'He wets his lips.'];

/** The questioning as lines on a screen: your question, then his answer (the sim's own words) or his silence. */
export function interrogationScene(name: string, q: Question, approach: Approach, result: { ok: boolean; lines: readonly string[] }, seed: number): Exchange[] {
  const r = mulberry32(seed * 11 + QUESTION_NAME[q].length);
  const ask = (approach === 'harsh' ? ASK_HARSH : ASK_KIND)[q];
  const out: Exchange[] = [{ who: 'you', text: ask[Math.floor(r() * ask.length)] }];
  if (result.ok) { out.push({ who: 'note', text: LINE[Math.floor(r() * LINE.length)] }); for (const l of result.lines) out.push({ who: 'note', text: l }); }
  else if (result.lines.length) for (const l of result.lines) out.push({ who: 'note', text: l });
  else out.push({ who: 'note', text: (approach === 'harsh' ? SILENT_HARSH : SILENT_KIND)[Math.floor(r() * 2)].replace('He', name.split(' ')[0]) });
  return out;
}
