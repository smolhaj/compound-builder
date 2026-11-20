/**
 * Lines for the human moments of a raid that the battle sim marks with an event but does not always voice: a reload, a jam, running dry, a man frozen with fear,
 * a friend covered or dragged, a flare going up, scouts watching, a decoy's noise, a crew pulling out. Merged into `LINES` by sim/raidDialogue.ts;
 * `sim/momentVoices.ts` places them. {n} is a name where the scene has one.
 */
type Variants = Partial<Record<string, readonly string[]>>;
export type MomentCtx = 'reload' | 'jam' | 'dry' | 'panic_freeze' | 'heroic_cover' | 'heroic_drag' | 'heroic_avenge' | 'scouting' | 'flare_up' | 'decoy' | 'envoy' | 'ambush_cry' | 'pull_out';

export const MOMENT_LINES: Record<'raider' | 'defender', Partial<Record<MomentCtx, Variants>>> = {
  defender: {
    reload: { any: ['Reloading! Cover me!', 'Changing mags. Two seconds.', 'Dry. Reloading.', 'Mag out, mag in. Hold on.', 'Reloading. Watch my side.', 'Give me a second. Reloading.', 'Last one in the gun. Reloading.', 'Swapping mags.', 'Cover my side. I\'m empty.', 'Reloading, reloading.'] },
    jam: { any: ['Jam. It\'s jammed.', 'Stuck. It\'s stuck.', 'Clearing it. Clearing.', 'Jammed. Give me a second.', 'Round in the chamber. Clearing it.', 'Piece of junk. Jammed.', 'It won\'t feed. Cover me.', 'Stovepipe. I have a stovepipe.', 'Gun\'s dead. Working on it.', 'Jam, jam. I have a jam.'] },
    dry: { any: ['I\'m out. Out of ammo.', 'That was my last round.', 'Anybody got a mag?', 'Empty. I need ammo.', 'No more rounds. Throw me a box.', 'I\'m dry. Completely dry.'] },
    panic_freeze: { any: ['I can\'t. I can\'t move.', 'Oh God. Oh God, no.', 'Please. Please, no.', 'It\'s happening. It\'s really happening.', 'I can\'t do this.', 'No. No. No.', 'My hands won\'t stop shaking.', 'I can\'t breathe.', 'I can\'t move my legs.', 'I want to go home.'], kin: ['That\'s my {n}. That\'s my {n}!', 'No! Not {n}!', 'Get up, {n}. Please get up.', '{n}? {n}!'] },
    heroic_cover: { any: ['I\'ve got you. Stay down.', 'Behind me. Get behind me.', 'Go. I\'ll cover you.', 'I\'m on the door. Get them in.', 'Head down. I\'ve got this side.', 'Nobody touches them. Move.', 'Drag them in. I\'ll hold here.', 'Covering. Covering.'] },
    heroic_drag: { any: ['I\'ve got you. Up. Up we go.', 'Hold on to me. I\'m not letting go.', 'Easy. I\'m taking you in.', 'Stay with me. Eyes open.', 'A few more steps. I\'ve got you.', 'Lean on me. Don\'t look back.', 'Up you come. Come on.', 'Not out here. You\'re not dying out here.'] },
    heroic_avenge: { any: ['You shot my {n}!', 'You! You did it!', 'Get away from them!', 'I\'ll kill you!', 'That was my friend!', 'Come on then. Come on!'] },
    flare_up: { any: ['Flare! They sent up a flare!', 'The yard\'s lit. They can see us.', 'Light on the field. Heads down.', 'They\'re lighting us up. Stay behind cover.', 'Flare. Keep low.', 'Bright as day out there. Don\'t move.'] },
    decoy: { any: ['Shooting on the east side. Go look.', 'Noise at the fence. Is that a distraction?', 'Where\'s that coming from? East wall?', 'Too loud. It\'s a decoy.', 'Don\'t run to the noise. Watch the other side.', 'Somebody\'s shooting at nothing. Careful.'] },
    ambush_cry: { any: ['They\'ve got Dad!', 'Somebody\'s in the field! Get in!', 'The workers are outside. Cover them!', 'Run! Run for the gate!', 'Open the gate! Open it!', 'They jumped them in the field!'] },
    envoy: { any: ['White cloth. Hold your fire.', 'One man, walking. Hand up.', 'Nobody shoots. Let\'s hear him.', 'He\'s alone. Watch the tree line.', 'Rifles on the road. Let him talk.', 'White flag. I don\'t like it. But I see it.', 'Stay behind the wall. I\'ll talk to him.', 'Hold your fire. Hold it.'] },
  },
  raider: {
    scouting: { any: ['Two windows lit. One dog. Mark it.', 'Count the vehicles. Stay off the fence.', 'Tower, east corner. Write it down.', 'Gate\'s steel. Not the wall.', 'Quiet. Just look.', 'Weak spot by the barn. Remember it.', 'Dog\'s asleep. Back out slow.', 'Eleven people. Maybe twelve. Count again.'] },
    envoy: { any: ['We\'re not here to fight. We want to talk.', 'Hold your fire! I\'m unarmed!', 'Hear me out. Just hear me out.', 'Open the gate and we can settle this.', 'Nobody has to get hurt tonight.', 'We want a share. That\'s all.', 'Coming up slow. Hands out.', 'Tell your people to stand down.'] },
    decoy: { any: ['Make noise. As much as you can.', 'Keep them looking at us. Keep shooting.', 'Shoot at the barn. Let them think it\'s the push.', 'Louder. They have to hear us on this side.', 'Keep them busy. The others are going round.', 'Shoot the lights. Anything. Go.'] },
    flare_up: { any: ['Flare up. Light the yard.', 'Pop it. Let\'s see them.', 'There they are. Now!', 'Light on that wall.', 'Flare\'s up. Move while they\'re blind.', 'That\'s bright. Use it. Go.'] },
    reload: { any: ['Reloading! Cover me!', 'Changing mags.', 'Dry. Reloading.', 'Mag. I need a mag!', 'Hold on. Reloading.', 'Two seconds. Reloading.'] },
    jam: { any: ['Jam. I have a jam.', 'Rifle jammed. Cover me.', 'Clearing a jam. Hold on.', 'It won\'t fire. Jammed.', 'Junk gun. Jammed again.', 'Stuck round. Give me a second.'] },
    dry: { any: ['I\'m out. Out of ammo.', 'Last mag. That was the last.', 'Anyone got rounds?', 'Nothing left. Nothing.'] },
    ambush_cry: { any: ['Grab him. The one with the bucket.', 'Get the workers before they reach the gate.', 'Down. Get down on the ground.', 'Don\'t run. Don\'t run.', 'That one. He\'s worth something.', 'Quick. Before the gate opens.'] },
    pull_out: { any: ['Pick him up. He comes with us.', 'Grab what you can carry and go.', 'Leader\'s down. That\'s it. Move.', 'Get the wounded in the truck.', 'We\'re done. Take the loot.', 'Out the way we came. Together.'] },
  },
};
