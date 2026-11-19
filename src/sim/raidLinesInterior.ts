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
      any: ['Did it move? It moved.', 'Again? It\'s not going.', 'Hold on. Somebody\'s behind it.', 'Kick it.', 'Again. By the lock.', 'It\'s barred. Shoulder.', 'One more.', 'Stand back. Breaking it.', 'Get it open.', 'They wedged something. Push.', 'Latch. Not the middle.', 'It\'s giving.', 'Again. They\'re right behind it.'],
      disciplined: ['Breacher up. On three.', 'Hold the stack. Door, then us.'],
      crew: ['Fuck. It\'s barred. Again.', 'Latch. Hit the latch.', 'One more. Together.', 'Wedged. Back off, I\'ll shoot the lock.'],
      rush: ['Just bust it!', 'Everybody push!'],
    },
    stack_door: {
      any: ['Which door? This one?', 'Is it locked? Try it. Easy.', 'I said wait. Wait for the count.', 'Door. Stack up.', 'On the wall by the door. Not in front of it.', 'Two on the hinge side. I\'ve got the other. On three.', 'Nobody in front of that door.', 'Wait. Wait. Now.', 'Tight on the wall. Shoulder to shoulder.', 'Point, you go first. I\'m behind you.', 'Stay out of the doorway till I say.', 'Two, take the left corner. Three, the hall.', 'Quiet. Listen at the door.'],
    },
    pie_corner: {
      any: ['Corner. Right corner.', 'I\'ve got the left. Nothing yet.', 'Slow. Slow. Don\'t rush the angle.', 'Movement behind the couch.', 'Left clear. Check right.', 'Table by the window. Two behind it.', 'Muzzle. Back corner.', 'Tell me what you see.', 'Hold there. Working the angle.', 'Far wall. Door. Closed.'],
      disciplined: ['Corners first. Then the middle.', 'Cut it slow. Don\'t step out.'],
      crew: ['Shit. Movement left.', 'Table. Two behind it.', 'Left clear. Hold.', 'Eyes on the far corner.'],
    },
    funnel: {
      any: ['Don\'t bunch in the door!', 'They\'ve got the doorway. Off the line!', 'Get out of the doorway!', 'Don\'t stand there. Move through.', 'Everybody through. Don\'t stop in the door.', 'Keep going. Don\'t stop at the frame.'],
      rush: ['Go, go, push!', 'Through the door!', 'Don\'t stop. They can\'t hit us all.'],
      disciplined: ['Nobody crosses till we flash it.', 'Off the door. We do it different.'],
    },
    room_clear: {
      any: ['Room clear.', 'Clear. Nothing in here.', 'Kitchen clear. Moving.', 'Left clear. Right clear. Move up.', 'That room\'s done. Next door.', 'Bedroom empty. Check the closet.', 'Clear. Hold. Checking behind the bed.', 'All clear. Stack on the next door.', 'Nobody in here. Keep moving.', 'This one\'s done. Who has the hall?'],
    },
    rally: {
      any: ['Stay with me. Almost through.', 'Keep pushing.', 'Keep going. Almost.', 'On me. On me!', 'Room by room. Together.', 'Nobody leaves till we have the house.', 'Close it up. Keep it tight.', 'One more room.', 'Don\'t let up.', 'Stay together. Stay loud.'],
    },
    cover_fire: {
      any: ['Suppress that corner.', 'Keep their heads down. I\'m moving.', 'Table. Put rounds on it.', 'Doorway. Keep it covered.', 'I\'ve got the window. Go.', 'Covering. Go, go.', 'Couch. They\'re behind it.', 'Keep shooting. I\'m moving.', 'Window. Put rounds on it.', 'Keep the pressure on the left.'],
    },
    found: {
      any: ['Got one. Closet.', 'Somebody\'s behind the door. Come out.', 'I hear breathing. Back of the room.', 'Found them. Bedroom closet.', 'Under the bed. Under the bed.', 'Hands. Show me your hands.', 'Cellar hatch is warm. Someone\'s down there.', 'There. Behind the curtain.', 'Pantry. They\'re in the pantry.', 'Open it. Slow.'],
      hostile: ['Get them out.', 'Drag them out of there.', 'Come on. Out.'],
    },
    order_out: {
      any: ['Come out. Slow.', 'Everyone out of the closet. Hands up.', 'Nobody shoots if you come out.', 'Walk out. Hands where I can see.', 'Kids first. Come on.', 'Step out. Nobody has to get hurt.', 'Hands up. Come out.', 'We just want the food. Come out.', 'Easy. Come out one at a time.', 'Out. Now. Slow.'],
      merciful: ['Not the kids. Don\'t touch the kids.', 'Unarmed, sit by the wall. You\'ll be left alone.'],
    },
    spare: {
      merciful: ['Go sit with the others. Stay out of the way.', 'You\'re not the problem. Stay down. Stay quiet.', 'Take the kids to the back room.', 'Leave them. They\'re kids.', 'Hands down. Sit there.', 'Get the little ones out of here.', 'Not here for you. Stay put.', 'He\'s unarmed. Over there.', 'You did right. Sit.', 'Go on. Over there with the others.'],
      any: ['Leave that one. No threat.', 'Sit down over there.'],
    },
    kill: {
      hostile: ['Just do it.', 'Finish it.', 'Don\'t leave anybody behind.', 'He saw my face.', 'Get it done.', 'Quick. We\'re not done here.', 'Don\'t let him talk.', 'Not one.', 'Shut him up.', 'Do it outside.'],
      any: ['Do it. We don\'t have all night.'],
    },
    captive: {
      hostile: ['You. With me.', 'Take that one. We might need him.', 'Tie his hands. He comes.', 'Get her up. She walks or gets dragged.', 'The young one comes. The rest stay.', 'Keep walking. Don\'t look back.', 'Grab him. He\'s worth something.', 'Get her to the truck. Quiet.', 'Hands behind you. Move.', 'Nobody follows us. Or this one pays.'],
      any: ['You come with us. Walk.'],
    },
    loot_item: {
      any: ['Is that all the {item}? Check again.', 'Where\'d the rest of the {item} go?', 'Leave it. Too heavy. Take the {item}.', 'Grab the {item}. All of it.', 'Take the {item}. Leave the rest.', 'Got the {item}. Let\'s go.', 'That {item}\'s ours now.', 'Load the {item} on the truck.', 'Help me carry the {item}.', 'Don\'t drop the {item}.', 'More {item} in the back?', 'That\'s what we came for. The {item}.', 'Bag the {item}. Fast.'],
      crowd: ['It\'s ours! Take the {item}, take everything!', 'Mine! I saw the {item} first!'],
      crew: ['Fuck, that {item} is heavy. Two on it.', 'Not that {item}. The next one.', 'Take the {item}. Mark the rest.', 'Count the {item}. Then go.'],
    },
    arson: {
      hostile: ['Burn it.', 'Light the barn.', 'Pour it on the porch.', 'Throw the rag in. Back up.', 'Let it burn.', 'Set the house. We\'re leaving.', 'Watch it go.', 'Get the fuel can. Soak the door.', 'Leave nothing for the next ones.', 'Light it.'],
    },
    tribute: {
      any: ['That\'s all of it? Count it again.', 'Is that everything? Don\'t lie to me.', 'Okay. That\'s fine. That\'s... fine.', 'That\'s enough. We take that and go.', 'Hand it over and nobody else gets hurt.', 'Put the {item} on the ground. Step back.', 'That settles it. Don\'t follow us.', 'We have a deal. Remember it.', 'Count it out. All of it.', 'Fair enough. Walk away from this.', 'You keep the house. We keep the {item}.', 'That\'s what we asked for. No more.', 'We won\'t be back if this is all of it.'],
    },
    passage: {
      any: ['You\'ll let us through? Just like that?', 'Is it a trick? Watch the wall.', 'Open it slow. Slow.', 'We only want to pass. Open the gate.', 'Let us through to the road.', 'Open the gate. We\'re gone.', 'We walk out the way we came. Agreed?', 'Clear a way and we leave.', 'Put the guns down. Let us leave.', 'Safe passage to the county road.', 'We take our wounded and go. Don\'t shoot.', 'Back off the gate. We\'ll go slow.', 'Hold your fire. We\'re leaving.'],
    },
    wounded_fallback: {
      any: ['Get him out of here. Cover them.', 'Take him back to the gap.', 'Help me. Grab his feet.', 'I\'ve got him. Go.', 'Stay with me. Stay awake.', 'Somebody help me with him.', 'Leave the rifle. Get his arm.', 'Behind the truck.', 'Hold on. I\'m taking you out.', 'Don\'t leave him in the house.'],
    },
  },
  defender: {
    pie_corner: {
      any: ['Watch the doorway. Don\'t move.', 'Wait for the first one.', 'Let them come into the room.', 'Don\'t fire till he steps in.', 'Shadow under the door.', 'Steady. Not yet.', 'They\'re at the door. Quiet.', 'Aim at the frame. First one through.', 'Behind the table. Breathe.', 'They\'re slow. Careful.'],
    },
    funnel: {
      any: ['They\'re bunching in the door!', 'Doorway! Shoot the doorway!', 'Hit the door!', 'One at a time through that frame.', 'Keep it on the door!', 'That\'s the choke. Keep shooting there.', 'They can\'t get past the door!', 'Into the doorway!', 'Hold the door!', 'They\'re stacked up in the hall!'],
    },
    fallback_stage: {
      any: ['Back to the next room. I\'ll cover.', 'Kitchen. Go!', 'Next room. Move!', 'We can\'t hold this one. Back!', 'Go. I\'ve got the door.', 'Everyone to the hall!', 'Bedroom. Stay low.', 'Stairs. Up the stairs!', 'Cellar door. Now.', 'Back room. I\'m right behind you.'],
    },
    wounded_fallback: {
      any: ['I\'ve got {n}. Cover us!', 'Lean on me, {n}. We\'re moving.', '{n}, hold your {w} and walk.', 'Come on, {n}. Next room.', 'Somebody help me with {n}!', 'Get {n} out of the doorway!', 'Keep pressure on that {w}, {n}.', 'I\'m not leaving you, {n}.', 'On three we lift {n}. One, two, three.', 'Drag {n} behind the couch!'],
    },
    cover_fire: {
      any: ['Covering. Go!', 'I\'ve got the door. Move.', 'Keep their heads down while we move.', 'Over the table. Keep shooting.', 'Go. I\'m right behind you.', 'Empty it at the doorway.', 'Hall! Shoot the hall!', 'Hold them till the others are clear.', 'Two shoot, two move.', 'Keep their heads down!'],
    },
    last_stand: {
      any: ['Last room. Nobody gets past.', 'Nowhere left to go.', 'We hold here.', 'The kids are behind that door.', 'Everything we have is in this house.', 'We stay here.', 'Keep shooting till they stop.', 'This is our home.', 'Nobody goes past this door.', 'Low. Make every shot count.', 'The kids are in there. Nobody.'],
    },
    hide: {
      any: ['Shh. Not a sound.', 'Stay in the closet. Don\'t come out for anything.', 'Down. Stay down.', 'Under the bed. Quick.', 'Down the cellar. Pull the hatch shut.', 'Hold your breath. They\'re close.', 'Don\'t cry. Please don\'t cry.', 'Stay with me. Don\'t move.', 'Behind the clothes. Go.', 'Eyes shut. Count. I\'m right here.'],
    },
    freeze: {
      any: ['I can\'t move. I can\'t move.', '...', 'Please. Please. Please.', 'Oh God. They\'re inside.', 'I can\'t breathe.', 'My legs won\'t work.', 'Somebody help me.', 'No, no, no.', 'I want to go home.', 'Make it stop.'],
    },
    shield: {
      any: ['Behind me. Stay behind me.', 'Head down, {n}. I\'ve got you.', 'I\'ve got you, {n}. Don\'t look.', 'Stay under me. Don\'t move.', 'Not her. Take me.', 'Down, {n}. I\'m right on top of you.', 'Hold on to me.', 'Stay close. Don\'t let go.', 'Eyes shut, sweetheart.', 'No. No. Not them.'],
    },
    plead: {
      any: ['Please. There are children here.', 'Don\'t shoot. Please.', 'We have nothing. Take it and go.', 'He\'s ten. Please.', 'I\'m not armed. Look.', 'Take the food. Leave the kids.', 'We give up. We give up.', 'I have a family. Please.', 'I\'ll do what you say.', 'Not the baby. Please.'],
      kid: ['Mommy?', 'I want my dad.', 'Don\'t hurt us.', 'I\'m scared.', 'Is it over?', 'I didn\'t do anything.'],
    },
    come_out: {
      any: ['Okay. Coming out. Don\'t shoot.', 'Hands up. See? Hands up.', 'Coming out. Kids with me.', 'Don\'t shoot. Coming out slow.', 'Okay, okay. Standing up.', 'Hands off the door. We\'re coming.', 'Look. Nothing in our hands.', 'We give up. Nobody\'s armed.', 'Easy. Coming out.', 'Don\'t hurt them. Please.'],
    },
    spare: {
      any: ['Thank you. Thank you.', 'God bless you.', 'Come on, kids. Over here. Quiet.', 'Stay close. Don\'t look at them.', 'Is it over? Are they leaving?', 'Thank you for not...', 'Stay down. Wait till they go.', 'Breathe. We\'re all right.', 'I thought we were dead.', 'Keep your hands where they can see.'],
    },
    kill: {
      any: ['No! No, please!', 'Oh God, no!', 'Not him!', 'Stop! Stop it!', 'She\'s a child!', 'No, no, no!', 'Please, no!', 'Don\'t! Don\'t!', 'Somebody help!', 'Leave him alone!'],
    },
    captive: {
      any: ['Let go of me!', 'Where are you taking him?', 'Take me instead!', 'Not her! Please!', 'I\'ll come. Leave the kids.', 'Let him go. He\'s a boy!', 'Bring him back!', 'Don\'t hurt him!', 'Please. Please.', 'We\'ll pay. Name it.'],
    },
    arson: {
      any: ['They\'re burning the house!', 'Fire! The barn!', 'Buckets! The barn\'s burning!', 'The porch! Get out!', 'The roof\'s on fire!', 'Put it out!', 'It\'s all going up!', 'Smoke! Everybody out!', 'Our home. They burned our home.', 'The animals. Get the animals out!'],
    },
    loot_item: {
      any: ['Not that. Please, not the... take the {item}.', 'Hon, let it go. It\'s only {item}.', 'That\'s... that was the last of the {item}.', 'That\'s our {item}. That\'s all we have.', 'Not the {item}. We need it.', 'They\'re taking the {item}.', 'Let them have the {item}. Just let them go.', 'That {item} was for winter.', 'They have the {item}. Let them leave.', 'All our {item}. Gone.', 'Let it go. It\'s only {item}.', 'They took the {item} out the back.', 'Count what they took. The {item} first.'],
    },
    tribute: {
      any: ['That\'s all of it. I swear that\'s all.', 'Is that enough? Is it enough?', 'Take it. Take... what are you waiting for?', 'Here. Take it. That\'s all we have.', 'That\'s the {item}. Now go.', 'That\'s the deal. You leave, we don\'t follow.', 'Take the {item} and go.', 'We agreed. Keep to it.', 'That\'s what you wanted. Leave us alone.', 'Fine. Take it.', 'That\'s it. Nothing else.', 'Kids go inside first. Then we hand it over.', 'We won\'t come after you. Go.'],
    },
    passage: {
      any: ['You sure? Are you sure about this?', 'Open it. Open it slow.', 'Watch them. Watch their hands.', 'Open the gate. Let them through.', 'Let them go. Nobody shoots.', 'They\'re leaving. Don\'t stop them.', 'Let them carry their wounded out.', 'Hold your fire. They\'re going.', 'Walk them to the road. Nobody fires.', 'Let them pass.', 'Gate\'s open. Go on.', 'They kept their word. So do we.', 'Stand down. They\'re going.'],
    },
    rally: {
      any: ['Hold on. They\'re tiring.', 'We can do this. Hold.', 'Keep shooting.', 'Not an inch of this house.', 'For the kids. Hold.', 'This is our home. Hold it.'],
    },
  },
};
