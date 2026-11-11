/**
 * What the people of the house say, by who they are (user: untrained family members do not speak like a fire team). Three voices for a defender line:
 *   civ   an untrained adult or teenager: short, scared, fragmentary, reactive. Names, what they see, "get the kids", pleading, praying. Never tactical orders.
 *   kid   a child: a word or two, frightened, or hushed.
 *   vet   someone with real training (service, police, a guard, a high shot): calm and short, plain words ("Stay low", "Door", "Reloading").
 * `sim/raidDialogue.ts` picks the voice from the speaker's traits (`profileOfUnit`) and merges these pools into the common ones; an untrained speaker also
 * has every tactical line filtered out of the common pools (TACTICAL), and a child speaks only from `kid` (or says nothing). {n} is a name, {w} a body part.
 */
type Variants = Partial<Record<string, readonly string[]>>;

export const PEOPLE_LINES: Record<'raider' | 'defender', Record<string, Variants>> = {
  raider: {
    // (organized crews stay terse and tactical; a crowd or a crew of opportunists swears when it is shot at, or when a friend goes down)
    first_shots: { crowd: ['Fuck, they are shooting back!', 'Son of a bitch, they have guns!', 'Shit, get down!'], opportunists: ['Shit, they shoot! Get down!', 'Goddamn it, nobody said they would shoot!'] },
    fight: { crowd: ['Where the hell are they shooting from?', 'Shit, I cannot see them!', 'Keep moving, goddamn it!'], opportunists: ['Come on, come on, goddamn it!'] },
    raider_down: { crowd: ['Shit, man down!', 'Fuck, they hit him!', 'Jesus, he is bleeding bad!'], opportunists: ['Oh shit, he is hit. He is hit!'] },
    retreat: { crowd: ['Fuck this, back to the trucks!', 'To hell with this, let us go!'] },
  },
  defender: {
    approach: {
      civ: ['Somebody is coming up the road.', 'Oh God. There are people out there.', 'Get the kids inside. Now.', 'I see them. I see people at the gate.', 'Who are they? Who is that?', 'Stay behind me.', 'Those are guns. They have guns.', 'Everybody get down. Please.', 'Oh shit. Oh shit, they are here.', 'Jesus Christ, look at them.', 'What the fuck is that?'],
      vet: ['Vehicles on the road. Count them.', 'Eyes up. They are early.', 'Kids inside. We have this.', 'Steady. Let them come.', 'I count ten. Stay calm.'],
      kid: ['Mom?', 'Who is that?', 'I am scared.', 'Daddy?'],
      elder: ['Lord, protect us.', 'God help us.', 'Dear God, they are here.'],
    },
    first_shots: {
      civ: ['They are shooting! They are shooting at us!', 'Get down! Get down!', 'Oh my God.', 'Stay down. Stay down, please.', 'I did not think they would really shoot.', 'Dad! Are you okay?', 'Somebody help.', 'Keep your head down!', 'Jesus Christ, they are shooting!', 'Holy shit!', 'What the fuck! What the fuck!', 'Son of a bitch!'],
      vet: ['Contact. Stay low.', 'Stay down. Let them show themselves.', 'Wait for a target.', 'Easy. Make it count.'],
      kid: ['Mom!', 'Make it stop.', 'I want Dad.'],
      elder: ['Lord Jesus.', 'Dear God, no.', 'Oh Lord, they are shooting.'],
    },
    fight: {
      civ: ['I cannot see them. Where are they?', 'He is behind the truck!', 'There is one by the fence!', 'I do not know where they are!', 'Oh God, oh God.', 'Did I hit him?', 'Somebody help me!', 'He is moving! He is moving!', 'Where the hell are they?', 'Shit, shit, shit.', 'Come on, come on, hit something!'],
      vet: ['Left side. Stay low.', 'One at the fence.', 'Wait. Wait for it.', 'Watch the gap.', 'Steady. Breathe.'],
      kid: ['Daddy!', 'Mom!'],
    },
    defender_hit: {
      civ: ['I am hit! I am hit!', 'It hurts. Oh God, it hurts.', 'Help me. Please.', 'My arm. My arm!', 'I cannot feel my leg.', 'Somebody help me!', 'Fuck! I am hit!', 'Shit, shit, it hurts!', 'Oh God, I am shot!'],
      vet: ['Hit. I can still shoot.', 'I am hit. Keep going.', 'Pressure on it. I am fine.', 'Fuck. Hit. Arm.', 'Goddamn it. I am hit.'],
      kid: ['It hurts!', 'Mom, I am bleeding!'],
      elder: ['Lord, help me.', 'Oh God, oh Lord.'],
    },
    mate_down: {
      civ: ['{n}!', 'No. No. {n}!', 'Oh God, {n} is down!', '{n}, answer me!', 'They shot {n}!', 'Not {n}. Please, not {n}.', 'Fuck, they got {n}!', 'Jesus, {n}!'],
      vet: ['{n} is down. Stay with me.', '{n} is hit. Stay low.'],
      kid: ['{n}!', 'Mom, {n} is hurt!'],
      elder: ['Oh Lord, {n}.', 'Dear God, not {n}.'],
    },
    hold_room: {
      civ: ['Stay behind me.', 'Get in the back room. Go!', 'Do not come in here. Please.', 'The door! Somebody get the door!', 'Get the kids. Get the kids!', 'I am not letting them in.', 'Stay low. Stay quiet.', 'They are coming in the kitchen!', 'Jesus, they are in the house.'],
      vet: ['Door. Stay low.', 'I have the door.', 'Nobody comes through.', 'Quiet. Let them step in.'],
      kid: ['I am scared.', 'Mom?', 'Daddy, where are you?'],
      elder: ['Lord, keep them out.', 'Hail Mary, full of grace...'],
    },
    cover_fire: {
      civ: ['I am shooting! Go, go!', 'Run! I will keep shooting!', 'Go! I will stay here!', 'Get to the bedroom! Go!', 'Hurry! Hurry!'],
      vet: ['Covering. Go.', 'I have you. Move.', 'Go. I am on them.'],
    },
    funnel: {
      civ: ['They are in the doorway!', 'Somebody is in the door!', 'Do not let them in!'],
      vet: ['Door. One at a time.', 'Hold. Hold.', 'Wait for it.'],
    },
    last_stand: {
      civ: ['This is our home. Please.', 'There is nowhere else to go.', 'The kids are behind me.', 'I will not let them have them.', 'Please. Just leave. Please.'],
      vet: ['Last room. Nobody gets past me.', 'We stay here.', 'Nobody moves.'],
      kid: ['Mom?', 'I do not want to die.'],
      elder: ['Please, God. Not the children.', 'Our Father, who art in heaven...'],
    },
    rally: {
      civ: ['Stay with me!', 'Stay together. Please.', 'We are okay. We are okay.', 'Breathe. Just breathe.'],
      vet: ['Stay together. Stay calm.', 'Steady, everybody.'],
    },
    pie_corner: {
      civ: ['Someone is in the kitchen!', 'I hear somebody in the hall.', 'There is a man at the window!', 'I see a shadow by the door.', 'Shh. Listen.'],
      vet: ['Movement in the hall.', 'One at the window.', 'Left. By the door.'],
    },
    fallback_stage: {
      civ: ['Back! Back to the bedroom!', 'Go! Everybody go!', 'Get in the back, get in the back!', 'Run! Run!', 'Come on, come on!', 'Shit, go, go!'],
      vet: ['Back to the next room. Quiet.', 'Move. I am last.'],
      kid: ['Mommy!', 'Wait for me!'],
    },
    wounded_fallback: {
      civ: ['{n} is hit! Help me carry {n}!', 'Hold on, {n}. I have you.', 'Come on, {n}. Stay with me.', 'Get {n} up! Please!'],
      vet: ['Got {n}. Pressure on the {w}.', 'I have {n}. Moving.'],
    },
    hide: { kid: ['Shh.', 'I am being quiet.', 'Mommy said be quiet.'] },
    freeze: { kid: ['I cannot move.', '...'] },
    shield: { kid: ['I am here.', 'Do not let go.'] },
    come_out: { kid: ['Do not hurt us.', 'I am coming out.'] },
    captive: { kid: ['Where are they taking us?', 'Mom!'] },
    reload: {
      civ: ['I am out! I am out of bullets!', 'It is empty! It is empty!', 'Wait, wait, I have to load it.', 'Oh God, where are the bullets?', 'Shit, I am empty!', 'Fuck, where are the bullets?'],
      vet: ['Reloading.', 'Changing mags.', 'Dry. Reloading.'],
    },
    jam: {
      civ: ['It stopped working!', 'It will not fire! It will not fire!', 'Something is wrong with the gun!', 'Goddamn it, it jammed!', 'Come on, you piece of shit!'],
      vet: ['Jam. Clearing it.', 'Jammed. Two seconds.'],
    },
    dry: {
      civ: ['No more bullets! No more!', 'I am out. I am out.'],
      vet: ['Dry.', 'Out. Switching.'],
    },
    breach: {
      civ: ['They are through the fence!', 'They are in! They are in the yard!', 'Oh God, they are coming in!', 'Get to the house! Run!', 'Shit, they are through!'],
      vet: ['They are through. Back to the house.', 'Wall is down. Back to the house.'],
    },
    fire: {
      civ: ['The barn is on fire!', 'Fire! Something is on fire!', 'They set the barn on fire!', 'Oh shit, the barn!'],
      vet: ['Fire in the yard. Watch the smoke.'],
    },
    held: {
      civ: ['Do not shoot. Please do not shoot.', 'Okay. Okay. Hands up.', 'Please. We have kids here.', 'Jesus, please do not shoot.'],
      kid: ['Do not hurt us.'],
    },
  },
};
