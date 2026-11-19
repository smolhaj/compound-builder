/**
 * What a crew says at a dome, and what the family says back through the glass (owner request 2026-11-19: show raiders trying the domes, with dialogue and
 * frustration). Merged into `LINES` by sim/raidDialogue.ts; `sim/dome/domeBeats.ts` places them. Plain American English, no jargon, nothing stronger
 * than "damn". Variant keys: a temper (`desperate`, `hard`, `savage`), a crew size (`small`, `large`) and `leader`.
 */
type Variants = Partial<Record<string, readonly string[]>>;
export type DomeCtx = 'dome_scout' | 'dome_shots' | 'dome_tool' | 'dome_cut' | 'dome_airlock' | 'dome_ram' | 'dome_blast' | 'dome_skirt' | 'dome_argue' | 'dome_order' | 'dome_panic' | 'dome_vow'
  | 'dome_watch' | 'dome_fire' | 'dome_holds' | 'dome_gone' | 'dome_angry' | 'dome_bounce' | 'dome_taunt';

/** Every key of every pool, so a test can hold the planner to using each one. */
export const DOME_RAIDER_CTX: readonly DomeCtx[] = ['dome_scout', 'dome_shots', 'dome_tool', 'dome_cut', 'dome_airlock', 'dome_ram', 'dome_blast', 'dome_skirt', 'dome_argue', 'dome_order', 'dome_panic', 'dome_vow', 'dome_angry', 'dome_bounce'];
export const DOME_DEFENDER_CTX: readonly DomeCtx[] = ['dome_watch', 'dome_fire', 'dome_holds', 'dome_gone', 'dome_taunt'];
export const DOME_VARIANT_KEYS: readonly string[] = ['any', 'desperate', 'hard', 'savage', 'small', 'large', 'leader', 'kid', 'civ', 'vet', 'elder'];

export const DOME_LINES: Record<'raider' | 'defender', Partial<Record<DomeCtx, Variants>>> = {
  raider: {
    dome_scout: {
      any: ['Sealed. Lights on inside.', 'No gap. I walked the whole curve.', 'Two doors. Both shut.', 'They are in there. I saw a light move.', 'Nothing low enough to climb.'],
      small: ['Three of us. That is not enough for this.'],
      large: ['Spread out. Check every seam.', 'Two left, two right. Walk it.'],
      leader: ['Report.', 'Anything?'],
      hard: ['Sealed. They know we are here.'],
    },
    dome_shots: {
      any: ['That hit. Nothing.', 'Rounds are bouncing.', 'Again. Same spot.', 'Chipped. That is all.', 'Cease fire. You are wasting ammo.', 'One chip. Same as the rest.'],
      desperate: ['Why is nothing happening?', 'It has to give. It has to.'],
      hard: ['Hold your fire. Count your rounds.', 'Keep on it. One spot.'],
      savage: ['Keep firing! Keep firing!'],
      small: ['Save your ammo.'],
      large: ['All on one spot!', 'Same panel. Go.'],
    },
    dome_tool: {
      any: ['Not even a dent.', 'My hands are numb.', 'The blade is skating off.', 'Ten minutes, and nothing.', 'Switch off. My arms are gone.'],
      desperate: ['Come on. Come on.'],
      hard: ['Swap out. Next pair.'],
      savage: ['Harder! Put your back into it!'],
      small: ['Too few of us for this.'],
      large: ['Rotate. Next two.'],
    },
    dome_cut: {
      any: ['Blade is through the first layer.', 'Keep cutting. It is giving.', 'Panel is coming loose.', 'A few more minutes.', 'Thin stuff. Keep going.'],
      leader: ['Keep that saw moving.'],
    },
    dome_airlock: {
      any: ['Handle will not turn.', 'There is a second door behind it.', 'Locked from the inside.', 'No hinge. Nothing to grab.', 'The bar will not bite.'],
      desperate: ['Open the door. Please. We only need food.'],
      hard: ['Open the door. We know you are in there.'],
      savage: ['Open it or we burn it.'],
      small: ['Nobody is opening that.'],
      large: ['On the bar. One, two, pull!'],
    },
    dome_ram: {
      any: ['Truck bounced off.', 'Front end is crushed. The wall is fine.', 'Did not even shake.', 'Engine is smoking.', 'We are not getting that truck out.'],
      savage: ['Back it up. Again.'],
      desperate: ['Is the driver okay?'],
    },
    dome_blast: {
      any: ['It went off. A black mark. That is all.', 'The panel is still there.', 'That was everything we had.', 'The blast went nowhere.', 'Scorch. Nothing else.'],
      hard: ['We need a bigger charge.'],
    },
    dome_skirt: {
      any: ['Hit concrete at twenty feet.', 'The tunnel stops at a wall.', 'It runs along the footing. No way under.', 'Buried wall. It goes both ways.', 'Solid. Nothing to dig.'],
      leader: ['Fill it in. The door is all that is left.'],
    },
    dome_argue: {
      any: ['We are wasting time.', 'This is not what you told us.', 'Another hour and somebody calls it in.', 'It will be light soon.', 'I am almost out of rounds.'],
      desperate: ['We have nothing at home. We cannot leave.'],
      hard: ['We stay until I say.'],
      savage: ['Anyone walks off, I remember it.'],
      small: ['Just three of us. Let us go.'],
      large: ['Half of us are dry on ammo.'],
    },
    dome_order: {
      any: ['That is enough. Back to the road.', 'Fall back. We are done.', 'Stop shooting. Get in the trucks.', 'Everybody back. Now.', 'Pull out. Pull out.'],
      leader: ['We are leaving. Get your gear.', 'It is not going to open. Pack up.', 'Back to the road. I will not lose anyone else.'],
      hard: ['Back off. We do this differently.'],
      savage: ['We go. This is not finished.'],
    },
    dome_panic: {
      any: ['I am not going near it again.', 'They are watching us the whole time.', 'I want to go home.', 'This is going to get us killed.', 'I am done. I am done.'],
      desperate: ['My kid is back at camp. I cannot die here.'],
    },
    dome_vow: {
      any: ['We come back with real equipment.', 'Remember where this is.', 'More men next time.', 'Give it a month. We find a way.', 'They have to come out sometime.'],
      leader: ['We are not finished with this place.'],
      savage: ['You hear me in there? We are coming back.'],
      desperate: ['Maybe they open up when they run low. We wait.'],
      small: ['Next time we bring a dozen.'],
      large: ['We know the layout now.'],
    },
    dome_angry: {
      any: ['Open fire. All of it!', 'Come out and face us!', 'Reloading!', 'It has to break. Keep firing!'],
      hard: ['Concentrate. One spot.'],
      desperate: ['Break. Please, just break.'],
    },
    dome_bounce: {
      any: ['Who is shooting? Who is hit?', 'Something hit me. I am hit!', 'It came back! Get down!', 'Contact! Where did that come from?', 'My arm. I think it is my arm.'],
      savage: ['Who fired? Who fired?'],
      desperate: ['I am okay. I am okay. Stay down.'],
    },
  },
  defender: {
    dome_watch: {
      any: ['Two at the east door.', 'One with a sledge. Left side.', 'They are spreading out.', 'I count ten. Maybe eleven.', 'Nobody has a way up.', 'Stay back from the wall.'],
    },
    dome_fire: {
      any: ['I have the left one.', 'Contact, east side.', 'Taking the one with the sledge.', 'Reloading. Cover me.', 'Wait for a clear shot.'],
    },
    dome_holds: {
      any: ['It is holding.', 'Not a crack.', 'Barely felt that.', 'The inner door is shut.', 'They cannot get in. Stay calm.'],
    },
    dome_gone: {
      any: ['They are pulling back.', 'Going down the road. Keep watching.', 'They are leaving. Stay put.', 'That is the last of them. Check the shell at first light.', 'Stay inside until it is light.'],
    },
    dome_taunt: {
      any: ['Go home. You are not getting in.', 'Leave now.', 'It is not opening. Give it up.', 'Go on. Walk away.'],
      kid: ['Go away!', 'You cannot come in!', 'Leave us alone!'],
      civ: ['Go home! You are not getting in. Leave now.', 'There is nothing for you here. Go to hell.', 'Give it up, damn it. Go home.', 'We told you. Leave.'],
      vet: ['Back off. It is not opening.', 'You are wasting your time. Go home.', 'Eff off. We are not coming out.', 'Last warning. Walk away.'],
      elder: ['Go home, friends. It will not open.', 'Please. Go home.'],
    },
  },
};
