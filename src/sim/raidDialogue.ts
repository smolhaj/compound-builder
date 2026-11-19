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
import type { Battle, BattleEvent, BattleUnit } from './battleTypes';
import type { RaiderTemper } from './battle';
import type { CrewStyle } from './raiderKinds';
import { mulberry32 } from './rng';
import { INTERIOR_LINES, type InteriorCtx } from './raidLinesInterior';
import { MOMENT_LINES, type MomentCtx } from './raidLinesMoments';
import { PEOPLE_LINES } from './raidLinesPeople';

export type Ctx = 'approach' | 'first_shots' | 'fight' | 'defender_hit' | 'mate_down' | 'raider_down' | 'retreat' | 'fire' | 'breach' | 'aftermath'
  | 'grief' | 'tend' | 'tended' | 'prisoner' | 'prisoner_reply' | 'looting' | 'held'
  // the invasion (sim/breach.ts, sim/houseAssault.ts): the truck, the charge, the door, the rooms, the dragging, the search, the leaving
  | 'ram_run' | 'ram_hit' | 'charge_set' | 'charge_call' | 'stack_door' | 'clear_room' | 'hold_room' | 'drag' | 'search' | 'leaving' | InteriorCtx | MomentCtx;
export type Role = 'raider' | 'defender';
export const RETREAT_CTX: ReadonlySet<Ctx> = new Set<Ctx>(['retreat', 'aftermath']);

type Variants = Partial<Record<string, readonly string[]>>;
/** The pools. `any` is for every crew; a style or temper key adds lines that only that kind says. */
export const LINES: Record<Role, Partial<Record<Ctx, Variants>>> = {
  raider: {
    approach: {
      scouts: ['Two windows lit. One dog.', 'Count the vehicles. Stay off the fence.', 'Quiet. Roofline first, then the gate.', 'Man on the tower. Mark it.', 'Light in the barn. Remember that.', 'Stay low. Just looking.', 'Don\'t know if they saw us.', 'Back a little. Slow.'],
      crowd: ['Lights are on. They\'re home.', 'Come out! We know you\'ve got food!', 'Spread out. Make some noise.', 'Bang on the gate. Let them hear.', 'We\'re hungry, damn it! Open up!', 'Get the fence. Go.'],
      crew: ['Two left, two right. Walk it in.', 'Eyes on the roofline. Hold at the ditch.', 'No talking. Wait for me.', 'Tower, east corner. Marked.', 'Slow. Let them fire first.', 'Five yards apart. Check your spacing.', 'Damn dogs. Slow down.', 'Fuck. Wire on the left. Mark it.', 'Gate\'s chained. Note it.', 'Truck at the barn. Count it.', 'Quiet. Wait for the signal.', 'Lights in the upstairs. Note it.'],
      families: ['Please. We just need water.', 'Anybody there? We have kids.', 'We\'re not armed. Please open the gate.', 'Two days on foot. Just a little food.', 'Hands out where they can see. Slow.', 'Stay behind me. Close.'],
      opportunists: ['Nice setup. Check the shed first.', 'Lights off. Roll up slow.', 'Grab what you can carry.', 'Anybody home? Looks quiet.', 'Kill the engine. We walk from here.', 'Fuel cans by the barn. See them?'],
    },
    first_shots: {
      any: ['Down! Get down!', 'They\'re shooting back. Cover!', 'Keep moving. Don\'t bunch up.', 'From the tower!', 'Shoot back. Shoot back!', 'Spread out!', 'Behind the truck. Go!'],
      scouts: ['Contact. They saw us. Back to the ditch.', 'They know. Go.'],
      families: ['Don\'t shoot! We\'re not armed!', 'Kids down! Down!', 'Stop! Please, stop!'],
      crowd: ['They\'re shooting at us!', 'Rush the fence! Now!', 'Keep going! Don\'t stop!'],
      crew: ['Contact left. Shooting.', 'Single shots. Pick a target.', 'Stay in your lane. Watch your rounds.', 'Shit. Contact left. Down.', 'They shot first. Fine. Fuck it, shoot back.', 'Left lane. Hold it.', 'Reloading. Cover.', 'Moving. Cover left.', 'Tower. Put rounds on the tower.', 'Steady. Aimed shots.'],
      opportunists: ['Hell, they\'re awake. Go!', 'Forget the shed. Cover!'],
    },
    fight: {
      any: ['Say again? Left or right?', 'Who\'s firing? Was that us?', 'What? I can\'t hear you!', 'Missed him. Again.', 'Heads down on that wall!', 'Can\'t see past the wall.', 'Reloading. Cover me.', 'Up to the fence line.', 'Left. Watch the left.', 'Stay low.', 'He\'s on the high ground. Go around.', 'Who\'s got him? Anybody?', 'They\'re reloading. Move.', 'Keep shooting. Keep them down.'],
      scouts: ['Don\'t shoot. Just see where they shoot from.'],
      crew: ['Where the hell is he? Anyone?', 'Damn it. No angle from here.', 'Left side. Anyone?', 'Hold your lanes.', 'Moving up on the left.', 'Get the truck between us and the wall.'],
      families: ['Please! We only want to talk!'],
    },
    raider_down: {
      any: ['He\'s hit. He\'s hit!', 'Man down!', 'Oh no. They got him.', 'Who? Who\'s hit?', 'Wait. Wait, he\'s moving. No. No, he\'s not.', 'Drag him back!', 'He\'s not moving.', 'Get him out of the open.', 'Help him. Somebody help him!'],
      families: ['They shot him. They shot him!'],
      crew: ['Man down. Cover. Pull him back.', 'Shit. Man down. Cover him.', 'Hit. Where? Say where.', 'Get him behind the truck.', 'Tourniquet. Now.'],
    },
    retreat: {
      any: ['Pull back. Pull back!', 'Not worth it. Go!', 'Fall back to the road!', 'Go, go, get out of here!', 'We\'re done. Move!', 'Leave him! Go!', 'Back to the road!'],
      crew: ['Break contact. Cover each other out.', 'Withdraw by pairs. Go.', 'Disengage. Now.', 'Fuck this. Break off. Go.', 'Fuck you too. We\'re leaving.', 'Pairs. Go. Leave the truck.', 'Count off at the road.', 'Move. Move. Count at the trucks.'],
      crowd: ['Run! Everybody run!', 'To hell with this, I\'m leaving!', 'Too many guns!'],
      families: ['Come on, kids. Back to the road.', 'We never should have come. Go.', 'Keep walking. Don\'t look back.'],
      opportunists: ['Not worth it. In the truck!', 'Floor it!', 'Forget the cans. Drive!'],
      scouts: ['Seen enough. Out the way we came.', 'Pull back. Quiet.'],
    },
    fire: {
      any: ['Light it. Keep them on the barn.', 'More fuel on it.', 'That got their attention.', 'Make it bigger.', 'While they\'re busy, east side.'],
    },
    looting: { any: ['Hands up! Stay where you are!', 'Nobody move.', 'Check the house. Find the food.', 'Grab the cans and the fuel. Fast.', 'Load it up.', 'That\'s all we need. Let\'s go.'] },
    breach: { any: ['Are we through? We\'re through.', 'Who\'s inside? Anybody?', 'Wait for the rest. Wait.', 'We\'re through! Go!', 'Wall\'s down. Everybody in!', 'Inside the fence. Push!', 'Get to the house!', 'Spread out across the yard.', 'Keep moving. Not in the open.', 'Porch. Get to the porch!', 'Go, go, don\'t stop!'] },
    ram_run: { any: ['Is it clear? Is the wall clear?', 'Wait for it. Wait. Go!', 'They see us. Hit it anyway.', 'Foot down. Through the wall!', 'Hit it!', 'Put the truck right through.', 'Don\'t slow down!', 'Don\'t lift. Don\'t lift!'] },
    ram_hit: { any: ['It went! It went. Go!', 'Is that all of it? Is it open?', 'Hold on. Hold on, don\'t bunch.', 'Go! Inside!', 'It\'s open. Push through.', 'Through the gap. Spread out.', 'Move up. Take the yard.', 'Fan out. Cover the house.'] },
    charge_set: { any: ['Is that the right wall? Check it.', 'How long is the fuse? Tell me again.', 'Cover me. Setting the charge.', 'Stay low. Planting it.', 'Ten seconds on the wall.', 'Bag\'s on the wall. Wire it.'] },
    charge_call: { any: ['Everybody back? Count heads.', 'Who\'s still at the wall? Get back!', 'Charge! Get back from the wall!', 'It\'s set. Back, back!', 'Down! Cover your ears!', 'Ten seconds. Clear of the wall!'] },
    stack_door: { any: ['Door! Stack on the door.', 'On the wall by the door. Not in front.', 'Two on the hinge side, I take the other. On three.', 'Nobody in front of that door.', 'Wait. Wait. Now!'] },
    clear_room: { crew: ['Damn it. Door\'s stuck.', 'Stairs. Watch the top.', 'Hall clear. Next.', 'Two in, one on the door.'], any: ['Kitchen. Go.', 'Left side. Left!', 'Bedroom. Check it.', 'I\'ve got the hall. Move up.', 'Corner. Right corner!', 'Flush them out.', 'Cover the doorway while I cross.', 'Stay off the doorway.', 'Room on the left. Going in.', 'Hold the hall. I\'m checking the back.', 'Watch the window. I\'m on the door.', 'Two on the stairs, one on the hall.', 'Spread out. Don\'t bunch.', 'Eyes on the doors.', 'I\'m going left. Come in behind me.', 'Wall side. Slow.', 'Listen. Anyone moving?', 'One door at a time.'] },
    search: { crew: ['Where the hell is it? Keep looking.', 'Empty. Next room.', 'Cellar. Check it.', 'Upstairs. Check the closets.'], any: ['Where\'s the food? Where is it?', 'Pantry. Pull it open.', 'Look under the beds.', 'Try the cellar door.', 'Dump the bags.', 'Shelves. Cans, fuel, anything.', 'Trunk at the foot of the bed.', 'Behind the stove.', 'Boots, blankets, anything warm.', 'Cellar. Attic. Wherever they keep it.', 'Empty the drawers.', 'Look for a safe. A box. A false wall.'] },
    leaving: { any: ['That\'s all we can carry. Out.', 'Back to the gap.', 'Take it and go.', 'Out the way we came.', 'We\'re done. Go.'] },
    prisoner_reply: {
      desperate: ['I only... I just needed food. That\'s all it was.', 'Is my brother... did he get out? Did anyone see?', 'Please. I only needed food.', 'Water. Please. Just water.', 'Don\'t shoot. I\'m done. I\'m done.', 'It hurts. Please.', 'I didn\'t want this. None of us did.'],
      hard: ['What do you want me to say?', 'You think I know? I just drive. I...', 'Go ahead. Get it over with.', 'Tell your people to back off. I\'m not talking.', 'You got lucky.', 'I\'m not telling you anything.', 'Do what you\'re going to do.'],
      savage: ['Ask somebody else.', 'I told you. No. ...No.', 'Go on. Do it.', 'It won\'t change anything.', 'You\'ll see. Someone comes next.', 'Lined up with your guns. Okay.'],
      families: ['My kids. They\'re still out on the road. Did you...', 'We were hungry. We were just... please.', 'My kids are out on that road. Please.', 'We were so hungry. We didn\'t want this.'],
    },
  },
  defender: {
    approach: {
      any: ['Somebody on the drive. Wake everyone.', 'Headlights at the mailbox.', 'Two at the gate. Maybe three.', 'I count three at the fence line.', 'Dog went quiet. That\'s worse.', 'Lights off on the road, but I hear engines.', 'Tree line. Something moved.', 'Nobody fires till I say.'],
      families: ['Those are kids out there. Hold your fire.', 'Hands out. Nobody shoot.'],
      scouts: ['Two of them. They\'re counting us.', 'Stay low. Don\'t give them a reason.'],
    },
    first_shots: { any: ['Contact! At the fence!', 'They\'re shooting! Heads down!', 'Return fire. Aim low.', 'Stay on your spot. Don\'t chase.', 'Shots from the left!', 'Everybody okay? Call out.', 'Behind the wall. Let them waste ammo.'] },
    fight: { any: ['Steady. Pick one.', 'Watch your ammo.', 'They\'re working round the east side.', 'Stay on your post.', 'Call out if you\'re hit.', 'Reload. I\'ve got you.', 'Short bursts.', 'Anybody see the one on the left?', 'Head down between shots.', 'Say again? Left or right?', 'Missed. Missed him. Again.', 'What? I can\'t hear you. Say it again.', 'Was that you? Who fired?'] },
    raider_down: { any: ['One down.', 'Got one. He\'s not getting up.', 'He\'s down by the ditch.', 'That one\'s hit. Watch the rest.', 'Down. He\'s down.', 'One by the gate. Not moving.'] },
    mate_down: { any: ['Who\'s hit? Is that {n}?', '{n}! {n}, talk to me!', '{n}\'s hit! Medic!', 'No. {n}. Stay with me.', 'Cover me. Going to {n}.', '{n}\'s down! Somebody help!'] },
    defender_hit: { any: ['I\'m hit. I\'m hit!', 'My arm!', 'Leg. I can still shoot.', 'It\'s bad. I need help.', 'Graze. Keep firing.', 'I can\'t feel my hand.', 'Somebody help me. I\'m hit.'] },
    retreat: { any: ['They\'re pulling back.', 'They\'re running. Hold your spots.', 'They\'re leaving. Don\'t follow.', 'Last of them going down the road.', 'Stay up. Could be a trick.', 'They broke. Watch the road.'] },
    fire: { any: ['Fire! Behind the barn!', 'Somebody get water on that!', 'Stay on your posts. That\'s what they want.', 'Watch the other side. It\'s a distraction.', 'Eyes on the fence, not the flames.'] },
    breach: { any: ['Are they in? Are they in the yard?', 'Where\'s the little one? Where\'s she?', 'They\'re through the fence! Back to the house!', 'Wall\'s gone. Back!', 'Kids to the shelter!', 'Hold the door!', 'Everybody inside. Lock it!', 'Yard\'s lost. Get in the house.', 'They\'re in the yard!', 'Bar the door. Now.', 'Away from the windows!', 'Wounded first. Get them in.', 'Into the house!', 'Kids to the back room. Go.'] },
    ram_run: { any: ['Is that a truck? That\'s a truck!', 'Which way? Where\'s it going?', 'Truck! Coming at the wall. Back!', 'It\'s not stopping. Move!', 'Headlights! Through the wall!', 'Off the fence line. Now!'] },
    charge_set: { any: ['Did you hear that? Something at the wall.', 'Who\'s out there? Somebody\'s... get back!', 'What was that? Somebody\'s at the wall.', 'Somebody\'s at the wall with a bag. Down!', 'Get off the fence. They\'re going to blow it.'] },
    hold_room: { any: ['Hold the doorway.', 'Stay down behind the couch.', 'Keep them out of the hall.', 'Cover the stairs. I\'ve got the door.', 'Reloading. Cover me.', 'Don\'t cross the doorway. Let them come.', 'Keep low. One at a time.', 'Watch the corner by the kitchen.', 'Get the kids in the back room.', 'They have to come through that door.', 'Stay behind cover. Shoot when you see them.', 'Count your rounds.', 'Nobody moves.', 'Did you hear that? Hold on.', 'Door\'s holding. It\'s holding.', 'Low and quiet. They don\'t know where we are.', 'Eyes on the doorway.', 'Breathe. Aim. Wait.'] },
    drag: { any: ['I\'ve got you. Up. We\'re moving.', 'Easy. Back room. Almost there.', 'Stay with me. Hand on it.', 'Lean on me. Don\'t look back.', 'Just to the wall. Come on.'] },
    aftermath: { any: ['Everybody alive? Count off.', 'Check the perimeter first.', 'Medic to the yard. We have wounded.', 'Stay on your posts. They may not be gone.', 'Guns down. Slow. It\'s over for now.'] },
    held: { any: ['Okay. Okay. Take it.', 'There are kids in the house.', 'Don\'t shoot. We\'re done.', 'Take it and go.', 'Easy. Hands are up.'] },
    tend: { any: ['Hold still. This will sting.', 'Press here. Harder.', 'Look at me. You\'ll be fine.', 'Bleeding\'s slowed. Don\'t move.', 'Gauze. Hand me the gauze.', 'Breathe. In. Out.'] },
    grief: {
      any: ['He was just... he was right here.', 'Somebody say something. Anybody.', '{n} never complained once.', '{n} stood that wall for all of us.', 'I\'m so sorry, {n}.', 'Somebody bring a blanket.', 'We needed more on the east side.', 'Nobody goes out there tonight.'],
      partner: ['No. No, no. Look at me. Look... hey.', 'Don\'t. Don\'t you. Not now.', 'No. No, no, no. Please.', 'Look at me. Please look at me.', 'I\'m here. I\'m right here.', 'I can\'t do this without you.'],
      family: ['{n}? No. Come on. {n}...', 'I told you to stay down. I told you.', 'Not you. Not you, {n}.', 'Come back. Please.', 'That should have been me.', 'I\'m sorry. I\'m so sorry.'],
      ofChild: ['Not my child. Not my child.', 'Oh, sweetheart. No.', 'I should have kept you inside.'],
      kid: ['Please wake up.', 'Don\'t go. Please.', 'Why won\'t {n} get up?', 'Is {n} going to be okay?'],
      elder: ['{n} saw us through everything.', 'A long life. And it ends in this yard.', 'Goddamn it, {n}. Lord, take {n} home.'],
      guard: ['{n} held that gate to the end.', '{n} stayed. We won\'t forget it.'],
    },
    tended: { any: ['Go see to {n}. I\'m fine.', 'It hurts. It really hurts.', 'Don\'t stop. Keep pressing.', 'I\'m okay. I\'m okay.', 'Thank you. Thank you.'] },
    prisoner: { any: ['What\'s your name? Your name.', 'How many more? I asked how many.', 'Don\'t talk. Just... don\'t move.', 'Don\'t move. Hands where I can see them.', 'Stay down. Don\'t reach for anything.', 'Easy. Nobody shoots if you stay still.', 'Where are you hit? Show me.', 'Anyone else out there with you?'] },
  },
};

// the interior fight and the aftermath pools join the rest (a context both files define keeps both pools' keys)
for (const role of ['raider', 'defender'] as const) {
  for (const [ctx, pool] of [...Object.entries(INTERIOR_LINES[role]), ...Object.entries(MOMENT_LINES[role]), ...Object.entries(PEOPLE_LINES[role])]) {
    const have = (LINES[role] as Record<string, Variants | undefined>)[ctx] ?? {};
    const merged: Record<string, string[]> = {};
    for (const [k, v] of [...Object.entries(have), ...Object.entries(pool as Variants)]) merged[k] = [...new Set([...(merged[k] ?? []), ...(v ?? [])])];
    (LINES[role] as Record<string, Variants>)[ctx] = merged;
  }
}


/**
 * Spoken, not written: "do not" -> "don't", "I am" -> "I'm", "they are" -> "they're", "let us" -> "let's" and the like (user: real people use contractions and
 * fragments). Only after pronouns and plain words where it is natural; a noun and "is" ("the wall is down") is left alone, other lines match on those phrases.
 */
export function contract(text: string): string {
  const keep = (to: string) => (m: string) => (m[0] === m[0].toUpperCase() && m[0] !== m[0].toLowerCase() ? to[0].toUpperCase() + to.slice(1) : to);
  const RULES: Array<[RegExp, string]> = [
    [/\bcannot\b/gi, "can't"], [/\bdo not\b/gi, "don't"], [/\bdoes not\b/gi, "doesn't"], [/\bdid not\b/gi, "didn't"], [/\bwill not\b/gi, "won't"], [/\bwould not\b/gi, "wouldn't"],
    [/\bcould not\b/gi, "couldn't"], [/\bshould not\b/gi, "shouldn't"], [/\bis not\b/gi, "isn't"], [/\bare not\b/gi, "aren't"], [/\bwas not\b/gi, "wasn't"], [/\bwere not\b/gi, "weren't"],
    [/\bhave not\b/gi, "haven't"], [/\bhas not\b/gi, "hasn't"], [/\blet us\b/gi, "let's"],
    [/\bI am\b/g, "I'm"], [/\bI will\b/g, "I'll"], [/\bwe are\b/gi, "we're"], [/\bwe will\b/gi, "we'll"], [/\byou are\b/gi, "you're"], [/\byou will\b/gi, "you'll"],
    [/\bthey are\b/gi, "they're"], [/\bthey will\b/gi, "they'll"], [/\bit is\b/gi, "it's"], [/\bthat is\b/gi, "that's"], [/\bthere is\b/gi, "there's"], [/\bhe is\b/gi, "he's"],
    [/\bshe is\b/gi, "she's"], [/\bwhat is\b/gi, "what's"], [/\bwho is\b/gi, "who's"], [/\bhere is\b/gi, "here's"], [/\bI have not\b/g, "I haven't"],
  ];
  let out = text;
  for (const [re, to] of RULES) out = out.replace(re, keep(to));
  return out;
}
for (const role of ['raider', 'defender'] as const) {
  for (const pool of Object.values(LINES[role] as Record<string, Variants | undefined>)) {
    if (!pool) continue;
    for (const k of Object.keys(pool)) pool[k] = [...new Set((pool[k] ?? []).map(contract))];
  }
}

/**
 * What the last raid(s) said, so back-to-back raids do not open with the same words (user: no repeats within a scene or across consecutive raids).
 * Module memory only (never saved): `rotateRaidMemory` is called once per new raid; every director built after it shares the raid's set.
 */
const RECENT: { key: number | null; current: Set<string>; previous: Set<string> } = { key: null, current: new Set(), previous: new Set() };
export function rotateRaidMemory(key: number): void {
  if (RECENT.key === key) return;
  RECENT.previous = RECENT.current; RECENT.current = new Set(); RECENT.key = key;
}
/** Test hook. */
export function resetRaidMemory(): void { RECENT.key = null; RECENT.current = new Set(); RECENT.previous = new Set(); }

/** Phrases that are a retreat, when the crew speaks them and when the family describes them. A crew still creeping up never says these. */
export const RETREAT_RE = /fall back to the road|pull back|pulling back|pulling out|not worth it|get out of here|outta here|back in the truck|back to the (road|trucks)|break contact|withdraw|disengage|they(?:'|’)?re (?:running|leaving|breaking)|they are (?:running|leaving|pulling)|giving up|they broke|floor it|run! everybody|forget the cans/i;
/** Lines of the line giving way (the family falling back, the crew pouring in). */
const BREACH_RE = /(?:inside|through) the (?:fence|line|wall)|fall back to the (?:inner|house|next)|wall is (?:down|gone)|over the outer wall/i;
/** Lines tied to an event that the sim wrote on purpose (the wire, a dog, a grenade, a kid taken): never swapped, only deduplicated. */
const EVENT_BOUND_RE = /wire|barb|thorn|spike|electrif|\bditch|\bice\b|\bdog|grenade|rpg|rocket|\bkid|\bmom\b|\bdad\b|tie his|can dig|hands where|noise|\bdoor|sheriff|911/i;

/** Who is speaking, for a defender: a child, an untrained adult or teenager, or someone with real training (service, police, a guard, a high shot). */
export type Profile = 'vet' | 'civ' | 'kid';
export function profileOfUnit(u: { civilian?: boolean; traits?: BattleUnit['traits'] } | undefined): Profile {
  if (!u) return 'civ';
  if (u.civilian) return 'kid';
  const t = u.traits;
  if (t && (t.veteran || t.experience >= 6 || t.history.some(h => h === 'veteran' || h === 'police' || h === 'guard'))) return 'vet';
  return 'civ';
}
/** Tactical talk: what an untrained person never says (the user's list: covering fire, suppressing, flank, tango, breach, perimeter, and the like). */
export const TACTICAL = /covering fire|cover fire|suppress|flank|tango|breach|perimeter|sector|contact|\bpie\b|slice|angle|funnel|stack|overwatch|fall ?back|rally|hold the (line|doorway|door|hall|room)|cover me|cover my|pinned|keep (their|his|her) heads? down|fire lane|move up|\bclear\b|watch the (left|right)|eyes on|on my count/i;
/** Swearing (owner, 2026-11-19): a scared adult may; an organized crew may, coldly and rarely; an elder may, rarely and bluntly, mixed with prayer; a child never. Words are written in full, never masked. */
export const CURSE = /\b(fuck\w*|shit\w*|goddamn\w*|damn\w*|hell|son of a bitch|jesus christ)\b/i;
const PROFILE_KEYS = ['vet', 'civ', 'kid', 'elder'];

export const rolePool = (role: Role, ctx: Ctx): Variants | undefined => LINES[role][ctx];

export class LineDirector {
  private readonly used = new Set<string>();
  private readonly last = new Map<string, string>();
  private readonly r: () => number;
  constructor(seed: number) { this.r = mulberry32(seed * 7907 + 31); }
  isUsed(text: string): boolean { return this.used.has(text); }
  lastOf(speaker: string): string | undefined { return this.last.get(speaker); }
  /** Register a line that is spoken (kept from the sim, or just picked). */
  note(text: string, speaker?: string): void { this.used.add(text); RECENT.current.add(text); if (speaker) this.last.set(speaker, text); }
  /** Count the lines already in a battle as said (so the planners that add lines later never repeat them). */
  noteAll(b: Battle): void { for (const e of b.events) if (e.kind === 'say') this.note(e.text, e.who); }
  private readonly units = new Map<string, BattleUnit>();
  /** Tell the director who is who (a battle's units), so a defender's line is chosen for the person: a child, an untrained adult, a veteran. */
  noteUnits(us: readonly BattleUnit[]): void { for (const u of us) this.units.set(u.id, u); }
  /**
   * A line for the moment: the crew's own variant first (and the temper's, for a prisoner), then the common ones; never the speaker's last line;
   * unused ones first, and only when every line of the pool has been used does it start over (still never the same line back to back).
   */
  pick(role: Role, ctx: Ctx, o: { speaker?: string; variants?: readonly string[]; vars?: Record<string, string> } = {}): string | null {
    const pool = rolePool(role, ctx);
    if (!pool) return null;
    const vs = o.variants ?? [];
    let mine = vs.flatMap(v => pool[v] ?? []);
    let base = [...(pool.any ?? []), ...(vs.length ? [] : Object.entries(pool).filter(([k]) => !PROFILE_KEYS.includes(k)).flatMap(([, x]) => x ?? []))];
    // a defender speaks as who they are (an untrained adult or a child never gives tactical orders; a veteran keeps it short and plain)
    if (role === 'defender') {
      const prof = profileOfUnit(o.speaker ? this.units.get(o.speaker) : undefined), own = pool[prof] ?? [];
      const elder = prof === 'civ' && !!(o.speaker && this.units.get(o.speaker)?.traits?.history.includes('elder'));
      if (prof === 'vet') mine = [...mine, ...own];
      else if (prof === 'civ') {
        base = base.filter(t => !TACTICAL.test(t)); mine = [...mine.filter(t => !TACTICAL.test(t)), ...own];
        if (elder) mine = [...mine.filter(t => !CURSE.test(t)), ...(pool.elder ?? [])];   // (an old, devout person prays, and swears only in their own few lines)
      } else { base = []; mine = [...mine.filter(t => !TACTICAL.test(t) && !CURSE.test(t)), ...own]; }
    }
    const all = [...new Set([...mine, ...base])];
    const vars = o.vars ?? {};
    const sub = (t: string) => t.replace(/\{(\w+)\}/g, (_m, k: string) => vars[k] ?? (k === 'n' ? 'them' : k === 'item' ? 'supplies' : k));
    const need = (t: string) => [...t.matchAll(/\{(\w+)\}/g)].every(m => !!vars[m[1]]);
    const cand = all.filter(need).filter(t => t !== (o.speaker ? this.last.get(o.speaker) : undefined));
    // never a line this scene used; then not one the previous raid used; only when the pool is spent does it start over
    let fresh = cand.filter(t => !this.used.has(sub(t)));
    const unseen = fresh.filter(t => !RECENT.previous.has(sub(t)));
    if (unseen.length) fresh = unseen;
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
    dir.noteUnits(b.units);
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
    // a dying person's last words (sim/defenderTraits.ts) are the sim's own and are kept as they are: they name the people they love
    if (e.ctx === 'last_words') { dir.note(e.text, e.who); spoke.push(e.t); events.push(e); continue; }
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
  // no long quiet in the fight itself: a line whenever seven seconds pass between the first shot and the end without one
  if (ph.firstShot < Infinity) {
    const stop = Math.min(ph.endAt, b.duration) - 1.5;
    for (let guard = 0; guard < 40; guard++) {
      const ts = events.filter(e => e.kind === 'say' && e.who && e.t >= ph.firstShot - 1).map(e => e.t).sort((x, y) => x - y);
      let prev = ph.firstShot - 1, gapAt = -1;
      for (const t of [...ts, stop]) { if (t - prev > 7 && t > prev) { gapAt = prev + 3.5; break; } prev = t; }
      if (gapAt < 0 || gapAt >= stop) break;
      const before = events.length;
      const side: 'home' | 'raider' = guard % 2 ? 'raider' : 'home';
      const c = ctxAt(ph, gapAt);
      if (c === 'approach') break;
      add(gapAt, side, c);
      if (events.length === before) add(gapAt + 0.2, side === 'home' ? 'raider' : 'home', c);
      if (events.length === before) break;
    }
  }
  void temper;
  events.sort((a, c) => a.t - c.t);
  return { ...b, events };
}

/** Pick a prisoner's lines by temper and style (used by the wake). */
export function prisonerVariants(temper: RaiderTemper, style: CrewStyle | undefined): string[] {
  return [temper, ...(style === 'families' ? ['families'] : [])];
}
