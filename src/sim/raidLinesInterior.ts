/**
 * The lines for the fight inside the house and what comes after it (user: "about 10 distinct lines per moment, name-aware"). Merged into
 * `LINES` by sim/raidDialogue.ts. A pool has `any` (every crew) and keys for the crew's temper (`hostile` / `merciful`), its discipline
 * (`disciplined` / `rush`) and its style. Placeholders: {n} the person spoken to or about, {d} the one who just fell, {w} a wound
 * ("arm", "leg"), {item} what is being carried, {c} a count. A line with a placeholder is only used when the scene can fill it.
 */
type Variants = Partial<Record<string, readonly string[]>>;
export type InteriorCtx =
  | 'kick_door' | 'stack_door' | 'pie_corner' | 'room_clear' | 'fallback_stage' | 'wounded_fallback' | 'cover_fire' | 'hide' | 'plead' | 'freeze' | 'shield'
  | 'found' | 'order_out' | 'come_out' | 'spare' | 'kill' | 'captive' | 'loot_item' | 'arson' | 'tribute' | 'passage' | 'funnel' | 'last_stand' | 'rally';

export const INTERIOR_LINES: Record<'raider' | 'defender', Partial<Record<InteriorCtx, Variants>>> = {
  raider: {
    kick_door: {
      any: ['Kick it. Kick it in!', 'Again. Harder, by the lock.', 'It is barred. Put your shoulder in it!', 'One more and it goes.', 'Stand clear, I am breaking it.', 'Get that door open!', 'They wedged something behind it. Push!', 'Hit it by the latch, not the middle.', 'It is giving. Once more!', 'Break it down. They are right behind it.'],
      disciplined: ['Breacher up. On my count.', 'Hold the stack. Door first, then we go.'],
      rush: ['Just bust it! Bust it!', 'Everybody push! Now!'],
    },
    stack_door: {
      any: ['Door! Stack on the door!', 'Get on the wall by the door. Stay off the front of it.', 'Two on the hinge side, I take the other. On three.', 'Nobody stands in front of that door. Stack up!', 'Wait for it. Wait. Now!', 'Tight on the wall. Shoulder to shoulder.', 'Point man, you go first. I have your back.', 'Stay out of the doorway until I say.', 'Number two, take the left corner. Number three, the right.', 'Quiet. Listen at the frame.'],
    },
    pie_corner: {
      any: ['Corner! Corner on the right!', 'I have the left side. Nothing yet.', 'Slice it slow. Slow. Do not rush the angle.', 'Movement behind the couch!', 'Clear on the left. Check the right.', 'Table by the window. Two of them behind it.', 'See a muzzle in the back corner.', 'Show me the next corner. Tell me what you see.', 'Hold there. I am working the angle.', 'Door on the far wall. Closed.'],
      disciplined: ['Eyes on the corners first, then the middle.', 'Cut the pie. Do not step into the open.'],
    },
    funnel: {
      any: ['Do not bunch in the door! It is a funnel!', 'They have the doorway covered! Back out of the line!', 'Get out of the doorway, get out!', 'Do not stand there, move through!', 'Everybody through at once, do not stop in the door!', 'Keep going, do not stop at the frame!'],
      rush: ['Go, go, go, push them back!', 'Through the door! Through the door!', 'Do not stop, they cannot hit us all!'],
      disciplined: ['Nobody crosses that line until we flash it.', 'Off the door. We do this a different way.'],
    },
    room_clear: {
      any: ['Room clear!', 'Clear. Nothing in here.', 'Kitchen is clear. Moving on.', 'Clear left. Clear right. Move up.', 'That room is ours. Next door.', 'Bedroom is empty. Check the closet.', 'Clear! Hold here while I look behind the bed.', 'All clear. Stack on the next door.', 'No one in here. Keep moving.', 'This one is done. Who has the hall?'],
    },
    rally: {
      any: ['Stay with me! We are almost through!', 'Do not stop! Push!', 'Keep going, almost there!', 'On me! On me, all of you!', 'Hold together. We take it room by room.', 'Nobody leaves until we have the house!', 'We are closing in, keep it tight!', 'One more room and it is ours!', 'Do not let up now!', 'Stay together, stay loud!'],
    },
    cover_fire: {
      any: ['Suppress that corner!', 'Keep their heads down while we move!', 'Fire at the table! Put rounds on it!', 'Lay it on the doorway!', 'I have the window. Go!', 'Covering! Go, go!', 'Shoot the couch. They are behind it!', 'Pour it on them, I am moving!', 'Put rounds on that window!', 'Keep the pressure on the left side!'],
    },
    found: {
      any: ['Got one! In the closet!', 'Someone is behind the door. Come out!', 'I hear breathing. Back of the room.', 'Found them. Bedroom closet.', 'Under the bed! Under the bed!', 'Hands! Show me your hands!', 'Cellar hatch is warm. Someone is down there.', 'There. Behind the curtain.', 'They are hiding in the pantry.', 'Open it. Open it slowly.'],
      hostile: ['Dig them out.', 'Drag them out of there.', 'Nobody hides from us.'],
    },
    order_out: {
      any: ['Come out slowly. Nobody is going to hurt you.', 'Everyone out of the closet. Hands where I can see them.', 'We do not shoot people who come out. Come on.', 'Walk out, keep your hands up. That is all.', 'Kids first. Come on out, it is okay.', 'Nobody has to get hurt. Step out now.', 'Come out with your hands up, and you will be fine.', 'We just want the food. Come on out.', 'Easy. Come out where I can see you.', 'Stay calm. Walk to the kitchen.'],
      merciful: ['Not the children. Nobody touches the children.', 'Anyone unarmed, sit by the wall. You will be left alone.'],
    },
    spare: {
      merciful: ['Go sit with the others. Stay out of the way.', 'You are not our problem. Stay down and stay quiet.', 'Take the kids to the back room. Go.', 'Leave them. They are kids.', 'Put your hands down. Sit there and do not move.', 'Get the little ones out of here. Now.', 'We are not here for you. Stay put.', 'Nobody shoots an unarmed man. Over there.', 'You did right to come out. Sit.', 'Go on. Get out of my sight.'],
      any: ['Leave that one. No threat to us.', 'Sit down over there.'],
    },
    kill: {
      hostile: ['No witnesses.', 'Finish it.', 'Do not leave anybody behind us.', 'They saw our faces. Do it.', 'Nobody walks out of this house.', 'Put them down and move on.', 'Make it quick. We are not done here.', 'They would have done it to us.', 'Not one of them.', 'Shut that noise up.'],
      any: ['Do it. We do not have all night.'],
    },
    captive: {
      hostile: ['You, with me. Move!', 'Take that one. We might need him.', 'Tie his hands. He is coming with us.', 'Drag her out. She walks or she gets dragged.', 'The young one comes. The rest stay.', 'Keep walking. Do not look back.', 'Grab him. He is worth something.', 'Get her to the truck. Quiet!', 'Hands behind you. Move.', 'No one follows us, or this one pays for it.'],
      any: ['You come with us. Walk.'],
    },
    loot_item: {
      any: ['Grab the {item}. All of it.', 'Take the {item}, leave the rest.', 'Got the {item}. Let us move.', 'That {item} is ours now.', 'Load the {item} on the truck.', 'Help me carry the {item}!', 'Do not drop the {item}.', 'Check for more {item} in the back.', 'This is what we came for. The {item}.', 'Bag the {item}. Quickly.'],
      crowd: ['It is ours! Take everything!', 'Mine! I saw it first!'],
    },
    arson: {
      hostile: ['Burn it. Burn all of it.', 'Light the barn. Let them watch.', 'Pour it on the porch. Fire!', 'Toss the rag in. Back up!', 'Let it burn. They can have the ashes.', 'Set the house. We are leaving.', 'Good. Watch it go up.', 'Get the fuel can. Soak the door.', 'Nothing left for the next ones.', 'Light it!'],
    },
    tribute: {
      any: ['That is enough. We take that and go.', 'Hand it over and nobody else gets hurt.', 'Put the {item} on the ground and step back.', 'This settles it. Do not follow us.', 'We have a deal. Remember it.', 'Count it out. All of it.', 'Fair enough. Walk away from this.', 'You keep the house. We keep the {item}.', 'Okay. That is what we asked for. No more.', 'We will not come back if this is the last of it.'],
    },
    passage: {
      any: ['We only want to pass. Open the gate and we go on.', 'Let us through to the road. That is all.', 'Open the gate and we are out of your lives.', 'We walk out the way we came. Agreed?', 'Clear a way and we leave. No trouble.', 'Put the guns down and let us leave.', 'Safe passage to the county road. Then we are gone.', 'We take our wounded and go. Do not shoot.', 'Fair. Back off the gate and we move.', 'Let us carry our dead out of here.'],
    },
    wounded_fallback: {
      any: ['Get him out of here! Cover them!', 'Take him back to the gap!', 'Help me drag him, pick up his feet!', 'I have him. Go, go!', 'Stay with me, stay awake!', 'Somebody help me with him!', 'Leave the rifle, grab his arm!', 'Pull him behind the truck.', 'Hold on, I am taking you out.', 'Do not leave him in the house!'],
    },
  },
  defender: {
    pie_corner: {
      any: ['Watch the doorway. Do not move.', 'Wait for the first one. Wait.', 'Let them come into the room.', 'Do not fire until he steps in.', 'I see a shadow under the door.', 'Steady. Steady. Not yet.', 'They are at the door. Quiet now.', 'Aim at the frame. First one through is yours.', 'Stay behind the table and breathe.', 'They are slow. They are being careful.'],
    },
    funnel: {
      any: ['They are bunching in the door! Fire!', 'Shoot the doorway! They cannot spread!', 'Hit the door, hit the door!', 'One at a time, they have to come through that frame!', 'Keep it on the door!', 'That is the choke. Keep shooting there.', 'They cannot get past the door!', 'Fire into the doorway!', 'Hold the line of the door!', 'They are stacked up in the hall!'],
    },
    fallback_stage: {
      any: ['Back to the next room! I will cover!', 'Fall back to the kitchen, go!', 'Next room! Move, move!', 'We cannot hold this one. Back!', 'Go, I have the door!', 'Everyone fall back to the hall!', 'Into the bedroom, keep low!', 'Stairs next! Up the stairs!', 'Back to the cellar door, now!', 'Get to the back room, I am right behind you!'],
    },
    wounded_fallback: {
      any: ['I have {n}. Cover us!', 'Lean on me, {n}. We are moving.', '{n}, hold your {w} and walk!', 'Come on, {n}, back to the next room.', 'Somebody help me with {n}!', 'Get {n} out of the line of the door!', 'Keep pressure on that {w}, {n}!', 'I am not leaving you, {n}.', 'On three we lift {n}. One, two, three.', 'Drag {n} behind the couch!'],
    },
    cover_fire: {
      any: ['Covering fire, go!', 'I have the door, move!', 'Keep their heads down while we move!', 'Shoot over the table, keep shooting!', 'Go on, I am right behind you!', 'Empty it at the doorway!', 'Fire at the hall!', 'Hold them here until the others are clear.', 'Two of you shoot, two of you move!', 'Make them keep their heads down!'],
    },
    last_stand: {
      any: ['This is the last room. Nobody gets past.', 'No more room to fall back to.', 'We hold here, whatever happens.', 'The kids are behind that door. Nobody goes through.', 'Everything we have is in this house.', 'We stand here.', 'Keep firing until they stop coming.', 'This is our home. Hold!', 'Whatever happens, nobody goes past this door.', 'Stay low and make every shot count.', 'The kids are right behind us. Hold.'],
    },
    hide: {
      any: ['Shh. Quiet. Do not make a sound.', 'Stay in the closet. Do not come out for anything.', 'Get down. Stay down.', 'Under the bed, quickly!', 'Down the cellar, pull the hatch shut.', 'Hold your breath. They are close.', 'Do not cry, please do not cry.', 'Stay with me. Do not move.', 'Behind the clothes. Go, go.', 'Close your eyes and count. I am right here.'],
    },
    freeze: {
      any: ['I cannot move. I cannot move.', '...', 'Please. Please. Please.', 'Oh God, they are inside.', 'I cannot breathe.', 'My legs will not work.', 'Somebody help me.', 'No, no, no.', 'I want to go home.', 'Make it stop.'],
    },
    shield: {
      any: ['Get behind me. Stay behind me.', 'Cover your head, {n}, I have you.', 'I have got you, {n}. Do not look.', 'Stay under me. Do not move.', 'Not her. Take me.', 'Duck down, {n}, I am right on top of you.', 'Hold on to me. Hold on.', 'Stay close. Do not let go.', 'Close your eyes, sweetheart.', 'I will not let them. I will not.'],
    },
    plead: {
      any: ['Please, there are children here.', 'Do not shoot. Please do not shoot.', 'We have nothing. Take it and go.', 'Please, he is only ten.', 'I am not armed. Look, I am not armed.', 'Take the food. Just let the kids be.', 'We give up. We give up.', 'I have a family. Please.', 'I will do whatever you say.', 'Not the baby. Please, not the baby.'],
      kid: ['Mommy?', 'I want my dad.', 'Please do not hurt us.', 'I am scared.', 'Is it over?', 'I did not do anything.'],
    },
    come_out: {
      any: ['Okay. We are coming out. Do not shoot.', 'Hands up. See? Hands up.', 'We are coming out. There are kids with me.', 'Do not shoot, we are coming out slow.', 'Okay, okay, I am standing up.', 'Take your hands off the door, we are coming.', 'Here. Look. Nothing in our hands.', 'We surrender. Nobody is armed.', 'Easy. Coming out. Coming out.', 'Do not hurt them. Please.'],
    },
    spare: {
      any: ['Thank you. Thank you.', 'God bless you. Thank you.', 'Come on, kids, over here. Quietly.', 'Stay close to me. Do not look at them.', 'Is it over? Are they leaving?', 'Thank you for not...', 'Stay down. Wait until they leave.', 'Breathe. We are all right.', 'I thought we were dead.', 'Keep your hands where they can see them.'],
    },
    kill: {
      any: ['No! No, please!', 'Oh God, no!', 'Not him!', 'Stop! Stop it!', 'She is just a child!', 'You monsters!', 'No, no, no!', 'Please, no!', 'Do not! Do not!', 'Somebody help!'],
    },
    captive: {
      any: ['Let go of me!', 'Where are you taking him?', 'Take me instead!', 'Do not take her! Please!', 'I will come, I will come. Leave the kids.', 'Let him go! He is just a boy!', 'Bring him back!', 'Do not hurt him!', 'Please. Please.', 'We will pay. Name it, we will pay.'],
    },
    arson: {
      any: ['They are burning the house!', 'Fire! They set the barn on fire!', 'Get the buckets, the barn is burning!', 'The porch is on fire, get out!', 'They lit the roof!', 'Put it out! Put it out!', 'Everything is going up!', 'Smoke! Everybody out!', 'Our home... they burned our home.', 'We have to get the animals out!'],
    },
    loot_item: {
      any: ['That is our {item}. That is all we have.', 'Not the {item}, we need it.', 'They are taking the {item}.', 'Let them have the {item}. Just let them go.', 'That {item} was for the winter.', 'They have the {item}. Let them leave.', 'Our whole {item}... gone.', 'Let it go. It is only {item}.', 'They took the {item} out the back.', 'Count what they took. The {item} first.'],
    },
    tribute: {
      any: ['Here. Take it. That is all we have.', 'This is the {item}. Now go.', 'That is the deal. You leave and we do not follow.', 'Take the {item} and go. We never saw you.', 'We agreed to this. Honor it.', 'This is what you wanted. Now leave us alone.', 'Fair. Take it and go.', 'That is it. We have nothing else.', 'Let the kids go inside first. Then we hand it over.', 'We will not come after you. Go.'],
    },
    passage: {
      any: ['Open the gate. Let them through.', 'Let them go. Nobody shoots.', 'They are leaving. Do not stop them.', 'Let them carry their wounded out.', 'Hold your fire. They are going.', 'Walk them to the road, nobody fires.', 'Let them pass. It is over.', 'Gate is open. Go on.', 'They keep their word, so do we.', 'Stand down. They are going.'],
    },
    rally: {
      any: ['Hold on! They are tiring!', 'We can do this. Hold the line!', 'Keep fighting, keep fighting!', 'Do not give them an inch of this house!', 'For the kids. Hold!', 'This is our home, hold it!'],
    },
  },
};
