/**
 * What a crew says at a dome, and what the family says back through the glass (owner request 2026-11-19: show raiders trying the domes, with dialogue and
 * frustration). Merged into `LINES` by sim/raidDialogue.ts; `sim/dome/domeBeats.ts` places them. Plain American English, no jargon, nothing stronger
 * than "damn". Variant keys: a temper (`desperate`, `hard`, `savage`), a crew size (`small`, `large`) and `leader`.
 */
type Variants = Partial<Record<string, readonly string[]>>;
/** The heavy-weapon beats (docs/ux/arcology-heavy-fire): what a crew says when an RPG, a tank round, a machine gun, a mortar, a torch, a charge or a truck bomb does nothing to the sealed shell. */
export type HeavyCtx = 'dome_heavy_rpg' | 'dome_heavy_tank' | 'dome_heavy_mg' | 'dome_heavy_mortar' | 'dome_heavy_thermite' | 'dome_heavy_charge' | 'dome_heavy_vbied'
  | 'dome_disbelief' | 'dome_quiet' | 'dome_young_asks' | 'dome_never_seen' | 'dome_leave' | 'dome_curse';
export type HeavyWeapon = 'rpg' | 'tank' | 'hmg' | 'amr' | 'mortar' | 'thermite' | 'charge' | 'vbied';
/** Which pool follows which weapon's strike. */
export const HEAVY_BEAT: Record<HeavyWeapon, HeavyCtx> = { rpg: 'dome_heavy_rpg', tank: 'dome_heavy_tank', hmg: 'dome_heavy_mg', amr: 'dome_heavy_mg', mortar: 'dome_heavy_mortar', thermite: 'dome_heavy_thermite', charge: 'dome_heavy_charge', vbied: 'dome_heavy_vbied' };
/** The crew's disbelief, in the order it grows as the heavy weapons fail: shock, a young one asking, an old hand who has never seen it, the leader going quiet, a curse, then someone says to leave. */
export const HEAVY_ESCALATION: readonly HeavyCtx[] = ['dome_disbelief', 'dome_young_asks', 'dome_never_seen', 'dome_curse', 'dome_quiet', 'dome_leave'];
export const DOME_HEAVY_CTX: readonly (HeavyCtx | 'dome_react_heavy')[] = [...Object.values(HEAVY_BEAT).filter((c, i, a) => a.indexOf(c) === i), ...HEAVY_ESCALATION, 'dome_react_heavy'];

export type DomeCtx = 'dome_scout' | 'dome_shots' | 'dome_tool' | 'dome_cut' | 'dome_airlock' | 'dome_ram' | 'dome_blast' | 'dome_skirt' | 'dome_argue' | 'dome_order' | 'dome_panic' | 'dome_vow'
  | 'dome_watch' | 'dome_fire' | 'dome_holds' | 'dome_gone' | 'dome_angry' | 'dome_bounce' | 'dome_taunt' | 'dome_react_swing' | 'dome_react_bounce' | 'dome_react_limp' | 'dome_cross' | 'dome_spectate'
  | HeavyCtx | 'dome_react_heavy';

/** Every key of every pool, so a test can hold the planner to using each one. */
export const DOME_RAIDER_CTX: readonly DomeCtx[] = ['dome_scout', 'dome_shots', 'dome_tool', 'dome_cut', 'dome_airlock', 'dome_ram', 'dome_blast', 'dome_skirt', 'dome_argue', 'dome_order', 'dome_panic', 'dome_vow', 'dome_angry', 'dome_bounce', 'dome_cross'];
export const DOME_DEFENDER_CTX: readonly DomeCtx[] = ['dome_watch', 'dome_fire', 'dome_holds', 'dome_gone', 'dome_taunt', 'dome_react_swing', 'dome_react_bounce', 'dome_react_limp', 'dome_spectate'];
export const DOME_VARIANT_KEYS: readonly string[] = ['any', 'desperate', 'hard', 'savage', 'small', 'large', 'leader', 'kid', 'civ', 'vet', 'elder', 'young'];

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
      savage: ['We are coming back. You hear me?'],
      desperate: ['Maybe they open up when they run low. We wait.'],
      small: ['Next time we bring a dozen.'],
      large: ['We know the layout now.'],
    },
    dome_angry: {
      any: ['Open fire. All of it!', 'Reloading!', 'It has to break. Keep firing!'],
      hard: ['Concentrate. One spot.'],
      desperate: ['Break. Please, just break.'],
    },
    dome_bounce: {
      any: ['Who fired that?', 'It bounced right back!', 'It came back! Get down!', 'Cease fire, you idiot!', 'My arm. That nearly took my arm.'],
      savage: ['Who fired? Who the hell fired?'],
      desperate: ['I am okay. I am okay. Stay down.'],
    },
    dome_cross: {
      any: ['What? What did you say?', 'I said keep on it, I... never mind.', 'Not now.', 'Who has the bar? Who... give me the bar.', 'Say that again.', 'Shut up, I am counting.', 'Me? I did not... it was him.', 'Wait. Wait, listen.'],
      hard: ['Eyes on the dome, not on me.'],
      desperate: ['I cannot... I cannot do this.'],
    },
    dome_heavy_rpg: {
      any: ['That was a direct hit.', 'Hit it again.', 'I saw it hit. I saw it.', 'Where did it go? It hit.', 'Reload. Same spot.', 'Direct hit. Why is it still there?'],
      leader: ['Again. Same place.', 'Load another.'],
      young: ['Did that do anything?', 'Is that all it does?'],
    },
    dome_heavy_tank: {
      any: ['That should have gone through.', 'That was a tank round.', 'Not a crack. Not one.', 'Say again? Where is the hole?', 'Load another. Load another one.', 'Gun is fine. We hit it. We hit it.'],
      leader: ['Again.', 'Same point. Fire.'],
      hard: ['What the fuck is that thing made of?'],
      young: ['It did not even shake.'],
    },
    dome_heavy_mg: {
      any: ['Rounds are just bouncing off it.', 'Fifty cal. Nothing.', 'I am hitting it. I am hitting it.', 'Check your sights. Check them.', 'Cease fire. Cease fire.', 'It just throws them back at us.'],
      leader: ['Hold your fire.', 'Stop. Stop shooting at it.'],
      young: ['Are we even hitting it?'],
    },
    dome_heavy_mortar: {
      any: ['That landed right on it.', 'Was that short? That was not short.', 'Dust. That is all we got.', 'Again. Walk it up.', 'Right on the base. Nothing.'],
      leader: ['Adjust. One more.'],
      hard: ['Shit. That was dead on.'],
    },
    dome_heavy_thermite: {
      any: ['It has been burning a full minute.', 'Look at the metal. It is cold.', 'Nothing under it. Nothing.', 'Hot on top and cold underneath.', 'Burned the whole canister. Not a mark.'],
      young: ['Is it supposed to take this long?'],
    },
    dome_heavy_charge: {
      any: ['Charge went. The gate did not move.', 'That was the whole breaching charge.', 'Not even scratched.', 'Gate is still shut. Still shut.', 'Dust off the gate. That is all.'],
      leader: ['That was our best charge.'],
      hard: ['Goddamn gate.'],
    },
    dome_heavy_vbied: {
      any: ['Where is the damage?', 'There is not a mark on it.', 'That was a ton of explosive.', 'Look at it. Not one mark.', 'It is all still there. All of it.'],
      leader: ['That was everything.'],
      young: ['It is still standing.'],
    },
    dome_disbelief: {
      any: ['That is not possible.', 'No. No, that is not possible.', 'What is it made of?', 'Nothing does that. Nothing.', 'It is just standing there.', 'I do not understand it.', 'It cannot be that strong.'],
      young: ['How is it still there?'],
    },
    dome_quiet: {
      any: ['...', 'Nobody say anything.'],
      leader: ['Give me a minute.', 'Let me think.', 'Hold on.'],
    },
    dome_young_asks: {
      any: ['Is it even glass?', 'Is that really glass?', 'What is it made of?', 'Is it glass? It looks like glass.'],
      young: ['Why is it not breaking?', 'What is that stuff?', 'Is it really made of glass?'],
    },
    dome_never_seen: {
      any: ['I have never seen anything like it.', 'Twenty years. Never seen anything like it.', 'I have seen bunkers fall to less than that.', 'Nobody told us it was like this.'],
      leader: ['I have never seen a thing like it.'],
    },
    dome_leave: {
      any: ['We should go.', 'This is not working. Let us go.', 'Boss, we should leave.', 'Nothing here for us. Go.', 'I am not staying for another one.'],
      leader: ['Pack it up. We are leaving.'],
      young: ['Can we go home?'],
    },
    dome_curse: {
      any: ['Fuck this thing.', 'Damn thing.', 'Goddamn thing. Open up.', 'Shit. It is not even scratched.', 'What the fuck is this thing?'],
      hard: ['Fuck. Fuck this.'],
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
    dome_react_swing: {
      any: ['He is hitting it again. That is a sledge, that is...', 'Listen to that. Just listen.', 'Is it going to... no. No, it is fine.', 'Is it supposed to ring like that?', 'Every time he swings I... okay. It is okay.'],
      kid: ['Mom, he is hitting it!', 'Is that a hammer?', 'Why does he keep... why does he keep doing that?'],
      civ: ['Stop that! Stop it!', 'He is going to break his hands, the idiot.'],
      vet: ['Let him swing. It is not going anywhere.'],
    },
    dome_react_bounce: {
      any: ['Did you see... it came right back at him.', 'Did he just get hit? Was that his own?', 'Wait. He is down. He is... no, he is getting up.', 'That was his round. His own.'],
      kid: ['Did it bounce?', 'Why did he fall down?'],
      civ: ['Serves him right. Damn fool.', 'Oh God. Is he... okay. He is up.'],
      vet: ['Ricochet. Stay back from the wall.'],
    },
    dome_spectate: {
      any: ['Still at it.', 'They are not getting anywhere.', 'Look at him. Same spot again.', 'How long are they going to do this?', 'He is going to hurt his hands.', 'Nothing is happening. Good.'],
      kid: ['Are they still there?', 'He hit it again!', 'Can I see?', 'They look so small.'],
      civ: ['Pour me another. Long night.', 'Seven now. No, eight.', 'Does not even scratch it.', 'Look at that one. Sat down already.', 'Told you it would hold.'],
      vet: ['Keep an eye on the east side.', 'They are tired. Look how they stand.'],
      elder: ['Poor fools. All that work.', 'Let them wear themselves out.'],
    },
    dome_react_limp: {
      any: ['He is leaving. Is he leaving? He is limping.', 'That one is hurt. Look at him.', 'They are... are they going?', 'Is that one... is he all right?'],
      civ: ['Good. Go.', 'Do not come back, you hear me?'],
      vet: ['Watch the rest. One going does not mean all of them.'],
    },
    dome_gone: {
      any: ['They are pulling back.', 'Going down the road. Keep watching.', 'They are leaving. Stay put.', 'That is the last of them. Check the shell at first light.', 'Stay inside until it is light.'],
    },
    dome_react_heavy: {
      any: ['That one was louder.', 'Stay back from the glass.', 'It is okay. It is okay.', 'Nothing moved. Look.', 'Are they still out there?', 'Same as before. It is holding.'],
      kid: ['That was loud.', 'Did it hurt the glass?', 'Mom, did you feel that?'],
      civ: ['Pour the tea. They will tire.', 'Keep eating. It is fine.', 'Hear that? Nothing. Not a sound inside.'],
      vet: ['It is holding. Same as before.', 'Eyes on the east side.'],
      elder: ['Lord, give them sense.', 'Let them wear themselves out.'],
    },
    dome_taunt: {
      any: ['Go home. You are not getting in.', 'Leave now.', 'It is not opening. Give it up.', 'Go on. Walk away.'],
      kid: ['Go away!', 'You cannot come in!', 'Leave us alone!'],
      civ: ['Go home! You are not getting in. Leave now.', 'There is nothing for you here. Go to hell.', 'Give it up, damn it. Go home.', 'Get the hell off our land.', 'Fuck off. You are not getting in.', 'Fuck off. It is not opening, so fuck off.', 'We told you. Leave.'],
      vet: ['Back off. It is not opening.', 'You are wasting your time. Go home.', 'Fuck off. We are not coming out.', 'Last warning. Walk away.'],
      elder: ['Go home, friends. It will not open.', 'Please. Go home.'],
    },
  },
};
