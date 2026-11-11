/**
 * What the people of the house say, by who they are (user: untrained family members do not speak like a fire team, and they talk like people, not a script).
 * Three voices for a defender line:
 *   civ    an untrained adult or teenager: short, scared, fragmentary, reactive. Contractions, names, what they see, "get the kids", pleading, swearing. Never
 *          tactical orders, and never calm narration ("I see a shadow") while people with guns are coming in.
 *   kid    a child: a word or two, frightened, or hushed. Children don't curse.
 *   vet    someone with real training (service, police, a guard, a high shot): calm and short, plain words ("Stay low", "Door", "Reloading"). A curse only when hit.
 *   elder  (a civ speaker who is old) prays instead of cursing.
 * `sim/raidDialogue.ts` picks the voice from the speaker's traits (`profileOfUnit`), merges these pools into the common ones, filters tactical talk out of the
 * common pools for the untrained, and contracts every line ("do not" -> "don't": `contract`). Realistic profanity is wanted (user decision): scared civilians,
 * hit or startled people and tense crews swear, in some lines and not all; no slurs. {n} is a name, {w} a body part.
 */
type Variants = Partial<Record<string, readonly string[]>>;

export const PEOPLE_LINES: Record<'raider' | 'defender', Record<string, Variants>> = {
  raider: {
    // (organized crews stay terse and tactical; a crowd or a crew of opportunists swears when it is shot at, or when a friend goes down)
    first_shots: { crowd: ['Fuck, they\'re shooting back!', 'Son of a bitch, they got guns!', 'Shit, get down!', 'They\'re shooting! Get down, get down!'], opportunists: ['Shit, they\'re shooting! Get down!', 'Goddamn it, nobody said they\'d shoot!', 'Fuck! Fuck, get behind something!'] },
    fight: { crowd: ['Where the hell are they shooting from?', 'Shit, I can\'t see them!', 'Keep moving, goddamn it!', 'Who\'s got eyes on him?', 'Stay low, stay low!'], opportunists: ['Come on, come on, goddamn it!', 'Somebody hit something!'] },
    raider_down: { crowd: ['Shit, man down!', 'Fuck, they hit him!', 'Jesus, he\'s bleeding bad!', 'He\'s hit! Drag him!'], opportunists: ['Oh shit, he\'s hit. He\'s hit!', 'Get him out of there!'] },
    retreat: { crowd: ['Fuck this, back to the trucks!', 'To hell with this, let\'s go!', 'Go, go, they\'ve got us!'] },
    defender_hit: { crowd: ['Got one! I got one!', 'He\'s down!'], any: ['That\'s one.'] },
  },
  defender: {
    approach: {
      civ: ['Somebody\'s coming up the road.', 'Oh God. Oh God, there\'s people out there.', 'Get the kids inside. Now!', 'They\'re at the gate. They\'ve got guns!', 'Who the hell is that?', 'Stay behind me.', 'Those are guns. Those are fucking guns.', 'Everybody get down. Please!', 'Oh shit. Oh shit, they\'re here.', 'Jesus Christ, look at them.', 'What the fuck is that?'],
      vet: ['Vehicles on the road. Count them.', 'Eyes up. They\'re early.', 'Kids inside. We\'ve got this.', 'Steady. Let them come.', 'I count ten. Stay calm.'],
      kid: ['Mom?', 'Who\'s that?', 'I\'m scared.', 'Daddy?'],
      elder: ['Lord, protect us.', 'God help us.', 'Dear God, they\'re here.'],
    },
    first_shots: {
      civ: ['They\'re shooting! They\'re shooting at us!', 'Get down! Get down!', 'Oh my God!', 'Stay down. Stay down, please!', 'I didn\'t think they\'d really shoot.', 'Dad! Are you okay?', 'Somebody help!', 'Keep your head down!', 'Jesus Christ, they\'re shooting!', 'Holy shit!', 'What the fuck! What the fuck!', 'Son of a bitch!'],
      vet: ['Contact. Stay low.', 'Stay down. Let them show themselves.', 'Wait for a target.', 'Easy. Make it count.'],
      kid: ['Mom!', 'Make it stop!', 'I want Dad!'],
      elder: ['Lord Jesus.', 'Dear God, no.', 'Oh Lord, they\'re shooting.'],
    },
    fight: {
      civ: ['I can\'t see them! Where are they?', 'He\'s behind the truck!', 'There\'s one by the fence!', 'I don\'t know where they are!', 'Oh God, oh God.', 'Did I hit him? Did I hit him?', 'Somebody help me!', 'He\'s moving! He\'s moving!', 'Where the hell are they?', 'Shit, shit, shit.', 'Come on, come on, hit something!'],
      vet: ['Left side. Stay low.', 'One at the fence.', 'Wait. Wait for it.', 'Watch the gap.', 'Steady. Breathe.'],
      kid: ['Daddy!', 'Mom!'],
    },
    defender_hit: {
      civ: ['I\'m hit! I\'m hit!', 'It hurts. Oh God, it hurts.', 'Help me. Please!', 'My arm. My arm!', 'I can\'t feel my leg!', 'Somebody help me!', 'Fuck! I\'m hit!', 'Shit, shit, it hurts!', 'Oh God, I\'ve been shot!'],
      vet: ['Hit. I can still shoot.', 'I\'m hit. Keep going.', 'Pressure on it. I\'m fine.', 'Fuck. Hit. Arm.', 'Goddamn it. I\'m hit.'],
      kid: ['It hurts!', 'Mom, I\'m bleeding!'],
      elder: ['Lord, help me.', 'Oh God, oh Lord.'],
    },
    mate_down: {
      civ: ['{n}!', 'No. No. {n}!', 'Oh God, {n}\'s down!', '{n}, answer me!', 'They shot {n}!', 'Not {n}. Please, not {n}.', 'Fuck, they got {n}!', 'Jesus, {n}!'],
      vet: ['{n}\'s down. Stay with me.', '{n}\'s hit. Stay low.'],
      kid: ['{n}!', 'Mom, {n}\'s hurt!'],
      elder: ['Oh Lord, {n}.', 'Dear God, not {n}.'],
    },
    hold_room: {
      civ: ['Stay behind me.', 'Get in the back room. Go!', 'Don\'t come in here. Please!', 'The door! Somebody get the door!', 'Get the kids. Get the kids!', 'I\'m not letting them in.', 'Stay low. Stay quiet.', 'They\'re coming in the kitchen!', 'Jesus, they\'re in the house.', 'Oh God, they\'re inside!'],
      vet: ['Door. Stay low.', 'I\'ve got the door.', 'Nobody comes through.', 'Quiet. Let them step in.'],
      kid: ['I\'m scared.', 'Mom?', 'Daddy, where are you?'],
      elder: ['Lord, keep them out.', 'Hail Mary, full of grace...'],
    },
    cover_fire: {
      civ: ['I\'m shooting! Go, go!', 'Run! I\'ll keep shooting!', 'Go! I\'ll stay here!', 'Get to the bedroom! Go!', 'Hurry! Hurry!', 'Go, go, go! Fuck, go!'],
      vet: ['Covering. Go.', 'I\'ve got you. Move.', 'Go. I\'m on them.'],
    },
    funnel: {
      civ: ['They\'re in the doorway!', 'Somebody\'s in the door!', 'Don\'t let them in!', 'Shit, they\'re coming through!'],
      vet: ['Door. One at a time.', 'Hold. Hold.', 'Wait for it.'],
    },
    last_stand: {
      civ: ['This is our home. Please!', 'There\'s nowhere else to go.', 'The kids are behind me!', 'I won\'t let them have them.', 'Please. Just leave. Please!', 'Get the fuck out of my house!'],
      vet: ['Last room. Nobody gets past me.', 'We stay here.', 'Nobody moves.'],
      kid: ['Mom?', 'I don\'t wanna die.'],
      elder: ['Please, God. Not the children.', 'Our Father, who art in heaven...'],
    },
    rally: {
      civ: ['Stay with me!', 'Stay together. Please!', 'We\'re okay. We\'re okay.', 'Breathe. Just breathe.'],
      vet: ['Stay together. Stay calm.', 'Steady, everybody.'],
    },
    pie_corner: {
      civ: ['Oh God, someone\'s in the kitchen!', 'There\'s somebody in the hall!', 'He\'s at the window! He\'s at the window!', 'Shit, someone\'s at the door!', 'Did you hear that? Did you hear that?', 'Is that them? Is that them?', 'Oh God, I heard something.'],
      vet: ['Movement in the hall.', 'One at the window.', 'Left. By the door.'],
    },
    fallback_stage: {
      civ: ['Back! Back to the bedroom!', 'Go! Everybody go!', 'Get in the back, get in the back!', 'Run! Run!', 'Come on, come on!', 'Shit, go, go!'],
      vet: ['Back to the next room. Quiet.', 'Move. I\'m last.'],
      kid: ['Mommy!', 'Wait for me!'],
    },
    wounded_fallback: {
      civ: ['{n}\'s hit! Help me carry {n}!', 'Hold on, {n}. I\'ve got you.', 'Come on, {n}. Stay with me.', 'Get {n} up! Please!'],
      vet: ['Got {n}. Pressure on the {w}.', 'I\'ve got {n}. Moving.'],
    },
    hide: { kid: ['Shh.', 'I\'m being quiet.', 'Mommy said be quiet.'] },
    freeze: { kid: ['I can\'t move.', '...'] },
    shield: { kid: ['I\'m here.', 'Don\'t let go.'] },
    come_out: { kid: ['Don\'t hurt us.', 'I\'m coming out.'] },
    captive: { kid: ['Where are they taking us?', 'Mom!'] },
    reload: {
      civ: ['I\'m out! I\'m out of bullets!', 'It\'s empty! It\'s empty!', 'Wait, wait, I gotta load it.', 'Oh God, where\'s the bullets?', 'Shit, I\'m empty!', 'Fuck, where are the bullets?'],
      vet: ['Reloading.', 'Changing mags.', 'Dry. Reloading.'],
    },
    jam: {
      civ: ['It stopped working!', 'It won\'t fire! It won\'t fire!', 'Something\'s wrong with the gun!', 'Goddamn it, it jammed!', 'Come on, you piece of shit!'],
      vet: ['Jam. Clearing it.', 'Jammed. Two seconds.'],
    },
    dry: {
      civ: ['No more bullets! No more!', 'I\'m out. I\'m out.'],
      vet: ['Dry.', 'Out. Switching.'],
    },
    breach: {
      civ: ['They\'re through the fence!', 'They\'re in! They\'re in the yard!', 'Oh God, they\'re coming in!', 'Get to the house! Run!', 'Shit, they\'re through!'],
      vet: ['They\'re through. Back to the house.', 'Wall\'s down. Back to the house.'],
    },
    fire: {
      civ: ['The barn\'s on fire!', 'Fire! Something\'s on fire!', 'They set the barn on fire!', 'Oh shit, the barn!'],
      vet: ['Fire in the yard. Watch the smoke.'],
    },
    held: {
      civ: ['Don\'t shoot. Please don\'t shoot!', 'Okay. Okay. Hands up!', 'Please. We got kids here!', 'Jesus, please don\'t shoot.'],
      kid: ['Don\'t hurt us.'],
    },
  },
};
