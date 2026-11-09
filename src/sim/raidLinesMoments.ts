/**
 * Lines for the human moments of a raid that the battle sim marks with an event but does not always voice: a reload, a jam, running dry, a man frozen with fear,
 * a friend covered or dragged, a flare going up, scouts watching, a decoy's noise, a crew pulling out. Merged into `LINES` by sim/raidDialogue.ts;
 * `sim/momentVoices.ts` places them. {n} is a name where the scene has one.
 */
type Variants = Partial<Record<string, readonly string[]>>;
export type MomentCtx = 'reload' | 'jam' | 'dry' | 'panic_freeze' | 'heroic_cover' | 'heroic_drag' | 'heroic_avenge' | 'scouting' | 'flare_up' | 'decoy' | 'envoy' | 'ambush_cry' | 'pull_out';

export const MOMENT_LINES: Record<'raider' | 'defender', Partial<Record<MomentCtx, Variants>>> = {
  defender: {
    reload: { any: ['Reloading! Cover me!', 'Changing mags, two seconds!', 'Dry, I am dry. Reloading!', 'Mag out, mag in. Hold on!', 'Reloading, somebody watch my side!', 'Give me a second, I am reloading!', 'Last one in the gun. Reloading!', 'Swapping mags!', 'Cover my sector, I am down to nothing!', 'Reloading, reloading!'] },
    jam: { any: ['Jam! My rifle jammed!', 'It is stuck. It is stuck!', 'Come on, come on, clear! Clear the jam!', 'Jammed. Give me a second!', 'Round in the chamber. I am clearing it!', 'Piece of junk. Jammed!', 'It will not feed. Cover me!', 'Stovepipe! I have a stovepipe!', 'My gun is dead. Working on it!', 'Jam, jam, I have a jam!'] },
    dry: { any: ['I am out. I am out of ammo!', 'Last round. That was my last round!', 'Anybody got a mag? Anybody?', 'Empty! I need ammunition!', 'No more rounds. Throw me a box!', 'I am dry. I am completely dry!'] },
    panic_freeze: { any: ['I cannot... I cannot move.', 'Oh God. Oh God, no.', 'Please. Please, no.', 'It is happening. It is really happening.', 'I cannot do this. I cannot do this.', 'No. No. No.', 'My hands will not stop shaking.', 'I cannot breathe.', 'Somebody help me, I cannot move my legs.', 'I want to go home.'], kin: ['That is my {n}... that is my {n}!', 'No! Not {n}! Not {n}!', 'Get up, {n}. Get up, please get up.', '{n}? {n}!'] },
    heroic_cover: { any: ['I have got you. Stay down!', 'Behind me! Get behind me!', 'Go, go, I will cover you!', 'I am on the door. Get them in!', 'Keep your head down. I have this side.', 'Nobody touches them. Move!', 'Drag them in, I will hold here!', 'Covering! Covering!'] },
    heroic_drag: { any: ['I have got you. Up, up we go!', 'Hold on to me. I am not letting go!', 'Easy, easy. I am taking you in!', 'Stay with me. Keep your eyes open!', 'Just a few more steps. I have got you.', 'Lean on me. Do not look back!', 'Up you come. Come on, up!', 'You are not dying out here. Not on my watch.'] },
    heroic_avenge: { any: ['You son of a... you shot my {n}!', 'You! You did it! You did it!', 'Get away from them! GET AWAY!', 'I will kill you! I will kill you!', 'That was my friend, you animal!', 'Come on then! Come on!'] },
    flare_up: { any: ['Flare! They sent up a flare!', 'The yard is lit up. They can see us!', 'Light on the field! Heads down!', 'They are lighting us up. Stay behind cover!', 'That is a flare, keep low!', 'Bright as day out there. Do not move!'] },
    decoy: { any: ['Shooting on the east side! Go look!', 'There is noise over by the fence. Is that a distraction?', 'Where is that coming from? East wall?', 'That is too loud. It is a decoy!', 'Do not run to the noise. Watch the other side!', 'Somebody is shooting at nothing out there. Careful.'] },
    ambush_cry: { any: ['They have got Dad! They have got him!', 'Somebody is in the field! Get in, get in!', 'The workers are outside! Cover them!', 'Run! Run for the gate!', 'Open the gate! Open it now!', 'They jumped them in the field!'] },
    envoy: { any: ['That is a white cloth. Hold your fire!', 'One man, walking. He has his hand up.', 'Nobody shoots. Let us hear what he wants.', 'He is alone. Watch the tree line!', 'Keep your rifles on the road. Let him talk.', 'White flag. I do not like it, but I see it.', 'Stay behind the wall. I will talk to him.', 'Hold your fire. Hold it!'] },
  },
  raider: {
    scouting: { any: ['Two windows lit. One dog. Mark it.', 'Count the vehicles. Do not touch the fence.', 'Tower on the east corner. Write it down.', 'See the gate? Steel. Not the wall.', 'Quiet. Just look. We were never here.', 'Weak spot by the barn. Remember it.', 'Dog is asleep. Good. Back out slow.', 'Eleven people, maybe twelve. Count them again.'] },
    envoy: { any: ['We are not here to fight. We want to talk.', 'Hold up. Hold your fire! I am unarmed!', 'Hear me out. Just hear me out.', 'Open the gate and we can settle this.', 'Nobody has to get hurt tonight.', 'We want a share. Fair is fair.', 'I am coming up slow. Look, hands out.', 'Tell your people to stand down!'] },
    decoy: { any: ['Make noise! Make as much noise as you can!', 'Keep them looking at us! Keep shooting!', 'Fire at the barn. Let them think it is the push.', 'Louder! They have to hear us on this side!', 'Keep them busy. The others are going round.', 'Shoot the lights. Shoot everything. Go!'] },
    flare_up: { any: ['Flare up! Light the yard!', 'Pop it! Let us see them!', 'There they are. Now! Now!', 'Get the light on that wall!', 'Flare is up. Move while they are blind!', 'That is bright. Use it. Go!'] },
    reload: { any: ['Reloading! Cover me!', 'Changing mags!', 'Dry! Reloading!', 'Mag! I need a mag!', 'Hold on, hold on. Reloading!', 'Two seconds. Reloading!'] },
    jam: { any: ['Jam! I have a jam!', 'My rifle jammed. Cover me!', 'Clearing a jam, hold on!', 'It will not fire. Jammed!', 'Junk gun. Jammed again!', 'Stuck round. Give me a second!'] },
    dry: { any: ['I am out! I am out of ammo!', 'Last mag. That was the last mag!', 'Anyone have rounds? Anyone?', 'No more. I have nothing left!'] },
    ambush_cry: { any: ['Grab him! Grab the one with the bucket!', 'Get the workers! Get them before they reach the gate!', 'Down! Get down on the ground!', 'Do not run. Do not run!', 'Take that one. He is worth something.', 'Quick, before the gate opens!'] },
    pull_out: { any: ['Pick him up. We take him with us!', 'Grab what you can carry and go!', 'Leader is down. That is it, move!', 'Get the wounded. Get them in the truck!', 'We are done. Take the loot and go!', 'Out the way we came. Together!'] },
  },
};
