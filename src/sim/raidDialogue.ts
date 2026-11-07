/**
 * What people say in a raid cutscene, and when (user feedback: "raiders and compound people repeat the same lines as raiders approach,
 * then retreat"). Pure and seeded.
 *
 * The battle sim writes lines as it goes, from small pools tied to events (an alarm, a wound, a reload). Played scene after scene they
 * repeat, and a crew that is still creeping up the drive can be heard calling a retreat. This module is the pass over a whole staged
 * cutscene that fixes both:
 *
 *   context   every line has one: approach, first_shots, fight, raider_down, retreat, fire, breach, aftermath ... from the battle's own
 *             timeline (before the first shot, the first seconds of shooting, after the first flee, after a breach or a fallback)
 *   picker    `LineDirector` picks by context, speaker role and the crew's style and temper; a speaker never says the line they said last,
 *             and no line is used twice in one cutscene until its pool is spent
 *   keep      a line the sim wrote stays when it is new, fits the moment and fits the crew; otherwise it is replaced from the pool
 *   gaps      a quiet stretch with something to say (the crew creeping up, the first shots, a man down, the break, the fire) gets a line
 *
 * Nothing here changes an outcome; it only changes words and who says them.
 */
import type { Battle, BattleEvent } from './battleTypes';
import type { RaiderTemper } from './battle';
import type { CrewStyle } from './raiderKinds';
import { mulberry32 } from './rng';

export type Ctx = 'approach' | 'first_shots' | 'fight' | 'defender_hit' | 'mate_down' | 'raider_down' | 'retreat' | 'fire' | 'breach' | 'aftermath'
  | 'grief' | 'tend' | 'tended' | 'prisoner' | 'prisoner_reply' | 'looting' | 'held'
  // the invasion (sim/breach.ts, sim/houseAssault.ts): the truck, the charge, the door, the rooms, the dragging, the search, the leaving
  | 'ram_run' | 'ram_hit' | 'charge_set' | 'charge_call' | 'stack_door' | 'clear_room' | 'hold_room' | 'drag' | 'search' | 'leaving';
export type Role = 'raider' | 'defender';
export const RETREAT_CTX: ReadonlySet<Ctx> = new Set<Ctx>(['retreat', 'aftermath']);

type Variants = Partial<Record<string, readonly string[]>>;
/** The pools. `any` is for every crew; a style or temper key adds lines that only that kind says. */
export const LINES: Record<Role, Partial<Record<Ctx, Variants>>> = {
  raider: {
    approach: {
      scouts: ['Two windows lit. One dog.', 'Count the vehicles. Do not touch the fence yet.', 'Quiet. Look at the roofline, then the gate.', 'There is a man on the tower. Mark it.', 'Light on in the barn. Remember that.', 'Stay low. We are only looking.'],
      crowd: ['There it is! The lights are on, they are home!', 'Come out! We know you are in there!', 'Everybody spread out. Make some noise.', 'Bang on the gate. Let them hear us.', 'We only want what is ours!', 'Get the fence. Go, go!'],
      crew: ['Two left, two right. Walk it in.', 'Eyes on the roofline. Hold at the ditch.', 'No more talking. Wait for my signal.', 'Tower on the east corner. Mark it.', 'Slow. Let them be the ones to fire first.', 'Check your spacing. Five yards apart.'],
      families: ['Please, we only want water.', 'Is anybody there? We have children.', 'We are not armed. Please open the gate.', 'We have walked two days. Just a little food.', 'Hold your hands out so they can see.', 'Stay behind me. Stay close.'],
      opportunists: ['Nice setup. Check the shed first.', 'Lights off. Roll up slow.', 'Grab what you can carry and get back to the truck.', 'Anybody home? Looks quiet.', 'Kill the engine. We go on foot from here.', 'Fuel cans by the barn. See them?'],
    },
    first_shots: {
      any: ['Get down! Get down!', 'They are shooting back! Find cover!', 'Keep moving. Do not bunch up!', 'That came from the tower!', 'Return fire! Return fire!', 'Spread out, spread out!', 'Behind the truck! Go!'],
      scouts: ['Contact. They saw us. Back to the ditch.', 'That is it. They know we are here.'],
      families: ['Do not shoot! We are not armed!', 'Get the kids down! Down!', 'Please, stop! Please!'],
      crowd: ['They are firing on us!', 'Rush the fence! Now!', 'Do not stop! Keep going!'],
      crew: ['Contact left. Suppress, then move.', 'Aimed shots only. Return fire.', 'Hold your lanes. Do not waste rounds.'],
      opportunists: ['Hell, they are awake. Go, go!', 'Forget the shed, find cover!'],
    },
    fight: {
      any: ['Keep their heads down!', 'I cannot see anything past the wall!', 'Reload! Cover me!', 'Push up to the fence line!', 'Watch the left! Watch the left!', 'Stay low and keep going.', 'They have the high ground. Flank it.', 'Does anyone have eyes on the shooter?', 'Move up while they reload!', 'Keep shooting, keep them pinned!'],
      scouts: ['Do not engage. Just watch where they shoot from.'],
      families: ['Please, we only want to talk!'],
    },
    raider_down: {
      any: ['He is hit! He is hit!', 'Man down! Man down!', 'Oh no, no, they got him.', 'Somebody drag him back!', 'He is not moving. He is not moving!', 'Get him out of the open!', 'They hit him! Help him!'],
      families: ['Oh God, they shot him. They shot him!'],
      crew: ['Man down. Cover him, pull him back.'],
    },
    retreat: {
      any: ['That is it. Pull back. Pull back!', 'It is not worth it. Let us go!', 'Fall back to the road!', 'Go, go, get out of here!', 'We are done. Move!', 'Leave him! Just go!', 'Back to the road, back to the road!'],
      crew: ['Break contact. Cover each other out.', 'Withdraw by pairs. Go.', 'Disengage. We will come back with a plan.'],
      crowd: ['Run! Everybody run!', 'To hell with this, I am leaving!', 'They have too many guns!'],
      families: ['Come on, children, come on. Back to the road.', 'We should never have come here. Go, go.', 'Keep walking. Do not look back.'],
      opportunists: ['Not worth it. In the truck!', 'Floor it, floor it!', 'Forget the cans. Drive!'],
      scouts: ['We have seen enough. Back out the way we came.', 'Pull back, nice and quiet, now.'],
    },
    fire: {
      any: ['Light it up! Let them watch it burn!', 'Keep them looking at the barn!', 'That got their attention.', 'More fuel on it. Make it big.', 'While they are busy, go along the east side.'],
    },
    looting: { any: ['Hands up! Stay where you are!', 'Nobody moves. Nobody gets hurt.', 'Check the house. Find the food.', 'Grab the cans and the fuel. Fast.', 'Load it up. Move!', 'That is all we need. Let us go.'] },
    breach: { any: ['We are through! Go, go, go!', 'The wall is down! Everybody in!', 'Inside the fence! Push!', 'Get to the house!'] },
    ram_run: { any: ['Foot to the floor! Through the wall!', 'Hit it! Hit the wall, go, go!', 'Take it down. Put the truck right through it!', 'Do not slow down! Straight in!', 'Keep your foot down. Do not lift!'] },
    ram_hit: { any: ['Go, go, go! Inside!', 'It is open. Push through, push!', 'Through the gap! Spread out!', 'Move up! Take the yard!', 'Fan out. Cover the house!'] },
    charge_set: { any: ['Cover me. Setting the charge.', 'Stay low. I am planting it now.', 'Give me ten seconds on the wall.', 'Bag is on the wall. Wire it.'] },
    charge_call: { any: ['Fire in the hole! Get back!', 'Charge is set. Everybody back, back!', 'Down! Cover your ears!', 'Ten seconds. Get clear of the wall!'] },
    stack_door: { any: ['Door! Stack on the door!', 'Get on the wall by the door. Stay off the front of it.', 'Two on the hinge side, I take the other. On three.', 'Nobody stands in front of that door. Stack up!', 'Wait for it. Wait. Now!'] },
    clear_room: { any: ['Clear the kitchen!', 'Left side, left side!', 'Check the bedroom. Go!', 'Move up. I have the hall!', 'Corner! Corner on the right!', 'Flush them out of there!', 'Cover the doorway while I cross!', 'Stay off the doorway. It is a funnel!', 'Room on the left, I am going in!', 'Hold the hall. I am checking the back!'] },
    search: { any: ['Where is the food? Where is it?', 'Pull the cupboards open. Check the pantry!', 'Look under the beds. They hide things there.', 'Kitchen is clean. Try the cellar door.', 'Dump the bags out. See what they have.', 'Check the shelves. Cans, fuel, anything.'] },
    leaving: { any: ['That is all we can carry. Out, out!', 'Back to the gap. Move!', 'Take it and go. Now!', 'Out the way we came. Do not stop!', 'We are done here. Go!'] },
    prisoner_reply: {
      desperate: ['Please. I only needed food.', 'Water. Please, just some water.', 'Do not shoot. I am done. I am done.', 'It hurts. Please...', 'I did not want this. None of us did.'],
      hard: ['Go on, then. Get it over with.', 'Tell your people to back off. I am not talking.', 'You got lucky. That is all this was.', 'I will not tell you anything.', 'Do what you are going to do.'],
      savage: ['Do it. Do it, you coward.', 'Take your time. It does not change anything.', 'You will not sleep tonight. Not one of you.', 'Look at you, all lined up with your guns.'],
      families: ['My children are out on that road. Please.', 'We were so hungry. We did not want this.'],
    },
  },
  defender: {
    approach: {
      any: ['Somebody on the drive. Wake everyone.', 'Headlights at the mailbox.', 'Movement at the gate, more than one.', 'I count at least three at the fence line.', 'The dog went quiet. That is worse.', 'Lights off on the road, but I hear engines.', 'Eyes on the tree line. Something moved.', 'Nobody fires until I say.'],
      families: ['Those are kids out there. Hold your fire.', 'They have their hands out. Nobody shoot.'],
      scouts: ['Two of them. They are counting us.', 'Do not give them a reason. Stay still and stay low.'],
    },
    first_shots: { any: ['Contact! Contact at the fence!', 'They are shooting! Heads down!', 'Return fire, aim low!', 'Hold your spots. Do not chase them.', 'Shots from the left! Left side!', 'Everyone okay? Call out!', 'Stay behind the wall. Let them waste ammo.'] },
    fight: { any: ['Steady. Pick a target.', 'Watch your ammo.', 'They are trying to get round the east side.', 'Keep it tight. Do not leave your post.', 'Check your sectors. Call out if you are hit.', 'Reload, I have you covered.', 'Short bursts. Short bursts.', 'Anyone seeing the one on the left?', 'Keep your head down between shots.'] },
    raider_down: { any: ['One down!', 'I got one. He is not getting up.', 'He is down by the ditch.', 'That one is hit. Keep watching the others.', 'Got him. Next.', 'Down. He is down.'] },
    mate_down: { any: ['{n}! {n}, talk to me!', '{n} is hit! Medic!', 'No. {n}. Stay with me.', 'Cover me, I am going to {n}!', '{n} is down! Somebody help me!'] },
    defender_hit: { any: ['I am hit! I am hit!', 'Ah! My arm!', 'Got me in the leg. I can still shoot.', 'It is bad. I need help.', 'Just a graze. Keep firing.', 'I cannot feel my hand...', 'Somebody help me, I am hit.'] },
    retreat: { any: ['They are pulling back!', 'They are running! Hold your fire, hold your spots.', 'They are leaving. Do not follow them.', 'That is the last of them going down the road.', 'Stay up. It could be a trick.', 'They broke. Watch the road.'] },
    fire: { any: ['Fire! Fire behind the barn!', 'Somebody get water on that!', 'Do not leave your posts. That is what they want.', 'Watch the other side! It is a distraction!', 'Keep your eyes on the fence, not the flames.'] },
    breach: { any: ['They are through the fence! Fall back to the house!', 'The wall is gone! Back, back!', 'Get the kids to the shelter!', 'Hold the door! Hold the door!'] },
    ram_run: { any: ['Truck! They are driving at the wall. Get back!', 'That truck is not stopping. Move, move!', 'Headlights! They are coming through the wall!', 'Everybody off the fence line, now!'] },
    charge_set: { any: ['What was that? Somebody is at the wall!', 'Somebody is at the wall with a bag. Down!', 'Get away from the fence. They are going to blow it!'] },
    hold_room: { any: ['Hold the doorway. Shoot anything that comes through!', 'Stay down behind the couch!', 'Keep them out of the hall!', 'Cover the stairs. I have the door!', 'I am reloading. Cover me!', 'Do not cross the doorway. Let them come to you!', 'Keep low. They can only come one at a time!', 'Watch the corner by the kitchen!', 'Get the kids into the back room!', 'Steady. They have to come through that door!'] },
    drag: { any: ['I have got you. Come on, up. We are moving!', 'Easy, easy. Back room, we are going to the back room!', 'Stay with me. Keep your hand on it!', 'Lean on me. Do not look back!', 'Almost there. Just to the wall!'] },
    aftermath: { any: ['Is everybody alive? Count off.', 'Check the perimeter before anyone relaxes.', 'Medic to the yard, we have wounded.', 'Stay at your posts. Maybe they are not gone.', 'Put the guns down slow. It is over for now.'] },
    held: { any: ['Okay. Okay. Take what you want.', 'Please, there are kids in the house.', 'Do not shoot. We are not fighting anymore.', 'Just take it and go.', 'Easy. Hands are up. Hands are up.'] },
    tend: { any: ['Hold still. This is going to sting.', 'Press here. Harder.', 'Look at me. You are going to be fine.', 'I have the bleeding slowed. Do not move.', 'Hand me the gauze.', 'Breathe. In, out. Good.'] },
    grief: {
      any: ['{n} never complained once.', '{n} stood that wall for all of us.', 'I am so sorry, {n}.', 'Somebody bring a blanket.', 'We should have had more people on the east side.', 'Nobody goes out there tonight.'],
      partner: ['No. No, no, no. Please.', 'Look at me. Please just look at me.', 'I am right here. I am right here.', 'I cannot do this without you.'],
      family: ['Not you. Not you, {n}.', 'Come back. Please come back.', 'I should have been the one standing there.', 'I am so sorry. I am so sorry.'],
      ofChild: ['Not my child. Not my child.', 'Oh, sweetheart. Oh, no.', 'I should have kept you inside.'],
      kid: ['Please wake up.', 'Do not go. Please do not go.', 'Why is {n} not getting up?', 'Is {n} going to be okay?'],
      elder: ['{n} saw us through everything.', 'A long life, and it ends in this yard.'],
      guard: ['{n} held that gate to the very end.', '{n} was the one who stayed. We will not forget that.'],
    },
    tended: { any: ['Go see to {n}. I am fine.', 'It hurts. It really hurts.', 'Do not stop. Keep pressing.', 'I am okay. I am okay.', 'Thank you. Thank you.'] },
    prisoner: { any: ['Do not move. Keep your hands where I can see them.', 'Stay down. Do not reach for anything.', 'Easy. Nobody shoots if you stay still.', 'Where are you hit? Show me.', 'Is anyone else out there with you? Talk.'] },
  },
};

/** Phrases that are a retreat, when the crew speaks them and when the family describes them. A crew still creeping up never says these. */
export const RETREAT_RE = /fall back to the road|pull back|pulling back|pulling out|not worth it|get out of here|outta here|back in the truck|back to the (road|trucks)|break contact|withdraw|disengage|they(?:'|’)?re (?:running|leaving|breaking)|they are (?:running|leaving|pulling)|giving up|they broke|floor it|run! everybody|forget the cans/i;
/** Lines of the line giving way (the family falling back, the crew pouring in). */
const BREACH_RE = /(?:inside|through) the (?:fence|line|wall)|fall back to the (?:inner|house|next)|wall is (?:down|gone)|over the outer wall/i;
/** Lines tied to an event that the sim wrote on purpose (the wire, a dog, a grenade, a kid taken): never swapped, only deduplicated. */
const EVENT_BOUND_RE = /wire|barb|thorn|spike|electrif|\bditch|\bice\b|\bdog|grenade|rpg|rocket|\bkid|\bmom\b|\bdad\b|tie his|can dig|hands where|noise|\bdoor|sheriff|911/i;

const rolePool = (role: Role, ctx: Ctx): Variants | undefined => LINES[role][ctx];

export class LineDirector {
  private readonly used = new Set<string>();
  private readonly last = new Map<string, string>();
  private readonly r: () => number;
  constructor(seed: number) { this.r = mulberry32(seed * 7907 + 31); }
  isUsed(text: string): boolean { return this.used.has(text); }
  lastOf(speaker: string): string | undefined { return this.last.get(speaker); }
  /** Register a line that is spoken (kept from the sim, or just picked). */
  note(text: string, speaker?: string): void { this.used.add(text); if (speaker) this.last.set(speaker, text); }
  /**
   * A line for the moment: the crew's own variant first (and the temper's, for a prisoner), then the common ones; never the speaker's last line;
   * unused ones first, and only when every line of the pool has been used does it start over (still never the same line back to back).
   */
  pick(role: Role, ctx: Ctx, o: { speaker?: string; variants?: readonly string[]; vars?: Record<string, string> } = {}): string | null {
    const pool = rolePool(role, ctx);
    if (!pool) return null;
    const vs = o.variants ?? [];
    const mine = vs.flatMap(v => pool[v] ?? []);
    const all = [...new Set([...mine, ...(pool.any ?? []), ...(vs.length ? [] : Object.values(pool).flatMap(x => x ?? []))])];
    const sub = (t: string) => t.replace(/\{n\}/g, o.vars?.n ?? 'them');
    const need = (t: string) => !t.includes('{n}') || !!o.vars?.n;
    const cand = all.filter(need).filter(t => t !== (o.speaker ? this.last.get(o.speaker) : undefined));
    let fresh = cand.filter(t => !this.used.has(sub(t)));
    // the crew's own lines are the voice of the scene: favor them while any is unused
    const mineFresh = fresh.filter(t => mine.includes(t));
    if (mineFresh.length && this.r() < 0.7) fresh = mineFresh;
    const from = fresh.length ? fresh : cand;
    if (!from.length) return null;
    const text = sub(from[Math.floor(this.r() * from.length) % from.length]);
    this.note(text, o.speaker);
    return text;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Phases of a scene
// ─────────────────────────────────────────────────────────────────────────

export interface Phases {
  firstShot: number;      // Infinity: no shooting in this scene
  firstFlee: number;      // Infinity: nobody broke
  breachAt: number;
  endAt: number;
  fire: boolean;
}

export function phasesOf(b: Battle, sceneKind?: string): Phases {
  let firstShot = Infinity, breachAt = Infinity, endAt = b.duration;
  const flees: number[] = [];
  const crew = b.units.filter(u => u.side === 'raider' && !u.machine).length;
  for (const e of b.events) {
    if (e.kind === 'shot') firstShot = Math.min(firstShot, e.t);
    else if (e.kind === 'flee' && b.units.find(u => u.id === e.unit)?.side === 'raider') flees.push(e.t);
    else if (e.kind === 'breach' || e.kind === 'fallback') breachAt = Math.min(breachAt, e.t);
    else if (e.kind === 'end') endAt = e.t;
  }
  // the crew breaks when a good part of it runs (one man out of ammunition running is not a retreat)
  flees.sort((a, c) => a - c);
  const firstFlee = flees.length ? flees[Math.min(flees.length - 1, Math.max(0, Math.ceil(crew * 0.4) - 1))] : Infinity;
  return { firstShot, firstFlee, breachAt, endAt, fire: sceneKind === 'fires' };
}

/** The context of the moment `t` in a scene. */
export function ctxAt(ph: Phases, t: number): Ctx {
  if (t >= ph.endAt) return 'aftermath';
  if (t >= ph.firstFlee - 0.5) return 'retreat';
  if (t < ph.firstShot - 0.01) return 'approach';
  if (t >= ph.breachAt) return 'breach';
  if (ph.fire) return 'fire';
  if (t < ph.firstShot + 5) return 'first_shots';
  return 'fight';
}

const sideOf = (b: Battle, id?: string): 'home' | 'raider' | null => (id ? b.units.find(u => u.id === id)?.side ?? null : null);

/** Is a line the sim wrote fit for the moment, for this speaker and crew? */
function fits(text: string, ctx: Ctx, side: 'home' | 'raider', style: CrewStyle | undefined): boolean {
  const retreating = RETREAT_CTX.has(ctx);
  if (RETREAT_RE.test(text) && !retreating) return false;
  if (BREACH_RE.test(text) && ctx !== 'breach' && ctx !== 'fight') return false;
  if (side === 'raider') {
    // the sim's raider shouts are an assault crew's: scouts do not yell, a family does not "hit the house"
    if (!EVENT_BOUND_RE.test(text) && (style === 'scouts' || style === 'families') && (ctx === 'approach' || ctx === 'first_shots' || ctx === 'fight')) return false;
  }
  return true;
}

export interface VoiceScene { style?: CrewStyle; kind?: string }
export interface VoiceOpts { /** The director to use (and keep using for the wake). */ dir?: LineDirector; seed: number; temper: RaiderTemper; scenes: readonly VoiceScene[]; /** Scenes before this one were shown already: their lines only count as used. */ from?: number }

const SAY_GAP = 1.6;

/**
 * Re-voice a staged cutscene's battles, in order. Returns new battles (inputs untouched); every `say` carries its `ctx`.
 * Scenes that are not fights (a parley at the gate, a break-in) keep their written lines.
 */
export function voiceCutscene(battles: readonly Battle[], o: VoiceOpts): Battle[] {
  const dir = o.dir ?? new LineDirector(o.seed);
  const from = o.from ?? 0;
  const out: Battle[] = [];
  battles.forEach((b, i) => {
    if (i < from) {
      for (const e of b.events) if (e.kind === 'say') dir.note(e.text, e.who);
      out.push(b); return;
    }
    const sc = o.scenes[i] ?? {};
    const ph = phasesOf(b, sc.kind);
    if (ph.firstShot === Infinity) {   // a standoff or a parley: written lines, deduplicated only
      const events = b.events.map(e => { if (e.kind !== 'say') return e; dir.note(e.text, e.who); return e; });
      out.push({ ...b, events }); return;
    }
    out.push(voiceScene(b, ph, sc, o.temper, dir));
  });
  return out;
}

function voiceScene(b: Battle, ph: Phases, sc: VoiceScene, temper: RaiderTemper, dir: LineDirector): Battle {
  const style = sc.style;
  const variants = style ? [style] : [];
  const events: BattleEvent[] = [];
  const nameOf = (id: string) => b.units.find(u => u.id === id)?.personId ? id : id;
  void nameOf;
  // who is still up at time t
  const downAt = (id: string, t: number) => b.events.some(e => e.t <= t && ((e.kind === 'death' || e.kind === 'flee' || e.kind === 'taken') && e.unit === id));
  const upAt = (side: 'home' | 'raider', t: number) => b.units.filter(u => u.side === side && !u.machine && !u.bystander && !u.civilian && !downAt(u.id, t));
  const spoke: number[] = [];
  const nearSpoke = (t: number) => spoke.some(x => Math.abs(x - t) < SAY_GAP);

  // 1. the sim's own lines: keep the fit and the new, re-pick the rest
  for (const e of b.events) {
    if (e.kind !== 'say') { events.push(e); continue; }
    const side = sideOf(b, e.who);
    if (!side) { dir.note(e.text); events.push({ ...e, ctx: ctxAt(ph, e.t) }); continue; }   // narration
    const ctx = ctxAt(ph, e.t);
    const role: Role = side === 'home' ? 'defender' : 'raider';
    const repeat = dir.isUsed(e.text) || dir.lastOf(e.who!) === e.text;
    if (!repeat && fits(e.text, ctx, side, style)) { dir.note(e.text, e.who); spoke.push(e.t); events.push({ ...e, ctx }); continue; }
    // a replacement for the moment (an event-bound line that merely repeats is swapped for the same kind of moment's line)
    const useCtx: Ctx = ctx === 'fight' && side === 'home' && /\b(hit|arm|leg|head)\b/i.test(e.text) ? 'defender_hit' : ctx === 'fight' && side === 'raider' && /hit|down/i.test(e.text) ? 'raider_down' : ctx;
    const line = dir.pick(role, useCtx, { speaker: e.who, variants: side === 'raider' ? variants : [] }) ?? dir.pick(role, 'fight', { speaker: e.who });
    if (line) { spoke.push(e.t); events.push({ ...e, text: line, ctx: useCtx }); }
  }

  // 2. gaps worth a line
  const add = (t: number, side: 'home' | 'raider', ctx: Ctx, extra: { vars?: Record<string, string> } = {}) => {
    if (t < 0.3 || nearSpoke(t)) return;
    const who = upAt(side, t);
    if (!who.length) return;
    const u = side === 'raider' ? (who.find(x => x.id === 'r0') ?? who[0]) : who[Math.floor(who.length / 2)];
    const text = dir.pick(side === 'home' ? 'defender' : 'raider', ctx, { speaker: u.id, variants: side === 'raider' ? variants : [], ...extra });
    if (!text) return;
    spoke.push(t);
    events.push({ t: Math.round(t * 100) / 100, kind: 'say', text, who: u.id, ctx });
  };
  const hasSay = (side: 'home' | 'raider', t0: number, t1: number) => events.some(e => e.kind === 'say' && e.who && sideOf(b, e.who) === side && e.t >= t0 && e.t <= t1);
  if (ph.firstShot > 6 && !hasSay('raider', 0, ph.firstShot)) add(Math.min(ph.firstShot - 3, 4), 'raider', 'approach');
  if (!hasSay('home', ph.firstShot, ph.firstShot + 4)) add(ph.firstShot + 1.4, 'home', 'first_shots');
  // a raider hit by the family: a comrade calls it, the shooter confirms
  const downs = b.events.filter(e => e.kind === 'death' && sideOf(b, e.unit) === 'raider');
  let last = -99;
  for (const d of downs.slice(0, 3)) {
    if (d.t - last < 9) continue;
    last = d.t;
    add(d.t + 0.9, 'raider', 'raider_down');
    add(d.t + 2.6, 'home', 'raider_down');
  }
  if (ph.firstFlee < Infinity) {
    if (!hasSay('raider', ph.firstFlee - 1, ph.firstFlee + 3)) add(ph.firstFlee + 0.3, 'raider', 'retreat');
    if (!hasSay('home', ph.firstFlee, ph.firstFlee + 5)) add(ph.firstFlee + 2.6, 'home', 'retreat');
  }
  if (ph.fire) { add(4, 'raider', 'fire'); add(7, 'home', 'fire'); }
  if (ph.breachAt < Infinity) { add(ph.breachAt + 0.4, 'raider', 'breach'); if (!hasSay('home', ph.breachAt - 1, ph.breachAt + 4)) add(ph.breachAt + 1.8, 'home', 'breach'); }
  if (ph.endAt < Infinity && !hasSay('home', ph.endAt, ph.endAt + 6)) add(ph.endAt + 1.2, 'home', 'aftermath');
  void temper;
  events.sort((a, c) => a.t - c.t);
  return { ...b, events };
}

/** Pick a prisoner's lines by temper and style (used by the wake). */
export function prisonerVariants(temper: RaiderTemper, style: CrewStyle | undefined): string[] {
  return [temper, ...(style === 'families' ? ['families'] : [])];
}
