/**
 * What a crew says at a dome, and what the family says back through the glass (owner request 2026-11-19: show raiders trying the domes, with dialogue and
 * frustration). Merged into `LINES` by sim/raidDialogue.ts; `sim/dome/domeBeats.ts` places them. Plain American English, no jargon, nothing stronger
 * than "damn". Variant keys: a temper (`desperate`, `hard`, `savage`), a crew size (`small`, `large`) and `leader`.
 */
type Variants = Partial<Record<string, readonly string[]>>;
export type DomeCtx = 'dome_scout' | 'dome_shots' | 'dome_tool' | 'dome_cut' | 'dome_airlock' | 'dome_ram' | 'dome_blast' | 'dome_skirt' | 'dome_argue' | 'dome_order' | 'dome_panic' | 'dome_vow'
  | 'dome_watch' | 'dome_fire' | 'dome_holds' | 'dome_gone';

/** Every key of every pool, so a test can hold the planner to using each one. */
export const DOME_RAIDER_CTX: readonly DomeCtx[] = ['dome_scout', 'dome_shots', 'dome_tool', 'dome_cut', 'dome_airlock', 'dome_ram', 'dome_blast', 'dome_skirt', 'dome_argue', 'dome_order', 'dome_panic', 'dome_vow'];
export const DOME_DEFENDER_CTX: readonly DomeCtx[] = ['dome_watch', 'dome_fire', 'dome_holds', 'dome_gone'];
export const DOME_VARIANT_KEYS: readonly string[] = ['any', 'desperate', 'hard', 'savage', 'small', 'large', 'leader'];

export const DOME_LINES: Record<'raider' | 'defender', Partial<Record<DomeCtx, Variants>>> = {
  raider: {
    dome_scout: {
      any: ['It is sealed up tight, and the lights are on.', 'No gap in it anywhere. The lights are on inside.', 'I walked the whole curve. It is sealed. They are warm in there.', 'Glass all the way round, and lights on. Somebody is home.', 'Two doors that I can see, and both are shut.', 'It is a lot bigger than it looked from the road.'],
      small: ['Just the three of us and that thing is huge. Look at it.', 'We are not enough for this. Just saying.'],
      large: ['Spread out along it. Look for anything loose.', 'Check every panel. Somebody built this in a hurry, somewhere.'],
      leader: ['Report. Is there a way in or not?', 'Quiet. Tell me what you saw.'],
      hard: ['Sealed, lights on, nobody outside. They are not scared of us.'],
    },
    dome_shots: {
      any: ['Why is it not breaking? Why is it not breaking!', 'I hit it six times. Six! It just shrugs it off.', 'That should have shattered. Damn it, that should have shattered.', 'The rounds are bouncing off. Bouncing!', 'It cracked, and then nothing. It just sits there.', 'What is this stuff made of?', 'My rifle is doing nothing to this thing.'],
      desperate: ['Please just break. Please.', 'I do not understand. Glass breaks. Glass always breaks.'],
      hard: ['Do not waste any more rounds on it. Look at it.', 'Keep firing. Something has to give.'],
      savage: ['Break, you damn thing! Break!', 'I will shoot this whole thing to pieces. Keep firing!'],
      small: ['It is just scratching the paint. We are wasting our shells.'],
      large: ['Everybody on the glass! All at once!', 'Concentrate on one spot. Same spot!'],
    },
    dome_tool: {
      any: ['The sledge just bounces. Look at my hands, they are numb.', 'It does not even dent. Nothing.', 'The blade is skating right off it.', 'We have been at this ten minutes and there is not a mark.', 'I am cutting and cutting. It is like cutting a bank vault.', 'The torch only blackens it. That is all it does.', 'My arms are shaking and there is not a scratch.'],
      desperate: ['Come on. Come on. Please give a little.'],
      hard: ['Switch off. Somebody else take the sledge.'],
      savage: ['Hit it harder! Put your back into it!', 'Damn thing! Damn thing!'],
      small: ['There are too few of us for this kind of work.'],
      large: ['Rotate out. Next pair on the wall.'],
    },
    dome_cut: {
      any: ['It is giving! The blade is through the first layer!', 'Keep sawing. I can feel it going.', 'The panel is coming loose, a little at a time.', 'That is it, a few more minutes and we are in.', 'This is thin stuff. Keep cutting!'],
      leader: ['Keep that saw moving. Do not stop.'],
    },
    dome_airlock: {
      any: ['It will not open! The handle is not even turning!', 'There is a second door behind this one. The first one will not let go.', 'It is locked from inside. Damn it, it is locked from inside!', 'No keyhole, no hinge, nothing to grab. How do you open this?', 'Pry it! Get the bar in there!', 'I put my whole weight on it. It does not move.', 'It beeps, and then nothing. What does that mean?', 'Somebody built a door that you cannot kick in.'],
      desperate: ['Open up, please. We only need food.', 'Somebody open the door. Please!'],
      hard: ['Open the damn door!', 'We know you are in there. Open up.'],
      savage: ['Open it or we burn the whole thing down!', 'Open up! Open up, I said!'],
      small: ['Just us at the door. Nobody is going to open it for us.'],
      large: ['Everybody on the bar. One, two, pull!'],
    },
    dome_ram: {
      any: ['The truck just bounced off it! It bounced!', 'We hit it dead on and it did not give an inch.', 'The whole front end is crushed. And the wall is fine.', 'That was our best shot. It did not even shake.', 'Engine is smoking. We are not getting that truck going again.'],
      savage: ['Back it up and go again!', 'Again! Hit it again!'],
      desperate: ['Is anyone hurt? Is the driver okay?'],
    },
    dome_blast: {
      any: ['It went off, and all it did was leave a black mark.', 'The charge blew, and the panel is still there. How?', 'That was everything we had. Look at it. Just a scorch.', 'Where did it all go? The blast went nowhere!', 'All that for a smudge on the glass.'],
      hard: ['We need a much bigger charge than that.'],
    },
    dome_skirt: {
      any: ['We dug down twenty feet and hit concrete. Solid concrete.', 'The tunnel stops at a wall. It goes down further than we can dig.', 'It runs right along the footing. There is no way under it.', 'We hit a buried wall and it kept going both ways.', 'Somebody poured that skirt deep. We wasted two days of digging.'],
      leader: ['Fill it in. The only way left is the door.'],
    },
    dome_argue: {
      any: ['We are wasting our time here.', 'You said it would be easy. Does this look easy?', 'Another hour and they will have help up the road.', 'Look at the sun. We are going to be here all night.', 'Nobody told me about this. Nobody said a word about glass.', 'I did not sign up to stand here and get shot at by people we cannot reach.', 'Let us just go. There are easier farms.'],
      desperate: ['We have nothing at home. If we leave, we have nothing at all.'],
      hard: ['Stop whining. We stay until I say we go.'],
      savage: ['Anyone who walks off this ground, I will remember.'],
      small: ['It is just the three of us. Let us not die on this hill.'],
      large: ['Half of us are out of ammunition. That is not a plan.'],
    },
    dome_order: {
      any: ['That is enough. Pull everyone back to the road.', 'Fall back. We are done here.', 'Stop shooting. Get in the trucks.', 'Everybody back to the road, now.', 'Enough. Nobody dies for a pane of glass.'],
      leader: ['Listen to me. We are leaving. Collect your gear.', 'We are not breaking this. Pack it up.', 'Pull back. I will not lose another man to this.'],
      hard: ['Back off. We will do this on our terms, not theirs.'],
      savage: ['We go. But this is not over.'],
    },
    dome_panic: {
      any: ['I am not going near that thing again. I am not.', 'They can see us the whole time! They are just watching!', 'I want to go home. I want to go home right now.', 'It is like it is looking at us. I do not like it.', 'We are all going to die out here and they will not even come out.', 'I cannot do this. I am sorry, I just cannot.'],
      desperate: ['My kid is at the camp. I cannot get killed here.'],
    },
    dome_vow: {
      any: ['We will be back. With something bigger.', 'Remember where this is. We are coming back with a plan.', 'Next time we bring real tools. And more men.', 'Give us a month. We will find a way into that thing.', 'They will have to come out someday. We will be waiting.', 'We will learn how it is built. Everything breaks.'],
      leader: ['Mark my words, we are not finished with this place.'],
      savage: ['You hear me in there? We will be back, and we will burn it all!'],
      desperate: ['Maybe they will open up when they get hungry. We can wait.'],
      small: ['Three of us is not enough. Next time we bring a dozen.'],
      large: ['We know the layout now. Next time we come with the right gear.'],
    },
  },
  defender: {
    dome_watch: {
      any: ['They are at the east door again. Look at them.', 'Get a coffee. They are not getting through that.', 'One of them is just standing there with a sledge.', 'It is almost sad. They keep trying.', 'Look at his face. He cannot believe it.', 'They are going around the whole thing, looking for a way in.', 'I never thought I would watch a raid with a cup of tea.'],
    },
    dome_fire: {
      any: ['I have a clean shot through the glass. Taking it.', 'Stay behind the frame. I will cover the east side.', 'They cannot hit us, but we can hit them. Steady.', 'One at a time. Do not waste any rounds.', 'Aim for the one with the sledge.'],
    },
    dome_holds: {
      any: ['It is holding. It is really holding.', 'Not a crack. Not a single crack.', 'Whoever built this knew what they were doing.', 'That was a truck. A whole truck. And look at the panel.', 'Feel that? Barely a hum. Good.', 'The inner door is shut. Nobody gets through that door.'],
    },
    dome_gone: {
      any: ['They are going. They are actually going.', 'There they go, down the road. Keep watching, in case they turn around.', 'They have had enough. Let them go.', 'That is the last of them. Check the shell when it is light.', 'Somebody will have to clean those marks off tomorrow.'],
    },
  },
};
