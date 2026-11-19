# Raid dialogue: style guide

Owner request (2026-11-19): every spoken line in a raid should sound like something a real person says in that
situation. Nothing campy, no movie-villain speeches, no quips, no one-liners after a kill. This guide is what the
rewrite (branch `claude/raid-dialogue`) follows, and what new lines should follow.

Scope: text only. Pool shapes, ctx ids, seeded selection (`LineDirector`), `{n} {w} {item} {d} {c}` placeholders and the
tests that guard them are unchanged.

## 1. What real people sound like (the patterns behind the rules)

Learned from the sources in section 8. Search snippets and published excerpts only (several sites were blocked in the
build sandbox, so no long transcripts were read; nothing here is quoted at length).

1. **Under stress, speech shrinks.** Turns are one to six words. People drop subjects and verbs ("Behind the truck."
   "Got one." "Reloading."). Sentences break and restart ("I can't. I can't move."). Repeating a word is normal and
   carries the fear ("Down. Get down. Down!"). Calm full sentences appear only from people who have done this before,
   or from someone on a phone with a dispatcher.
2. **Content is facts, not feelings.** Callers and shooters give *who, where, how many, what weapon, which direction*:
   "Two of them. Front door." "He's in the kitchen." "Left side, by the shed." Feelings come out as a name, a plea
   or a single word ("Please." "No."). Nobody explains their motives mid-fight.
3. **Names and counts.** Frightened people call each other by name, over and over ("Dana. Dana, look at me."). Counts
   are approximate and get corrected ("Three. No, four.").
4. **Radio and fire-team brevity.** Trained people use a small set of words and say them the same way every time:
   "contact", "reloading", "moving", "I've got the left", "clear", "man down", "cover me", "still up". Brevity is a
   tool, not style. It is *not* a speech: a real call is under about eight words. Trained speakers are also quieter
   than untrained ones; the loudest voice in a fight is usually the scared one.
5. **Auditory narrowing.** Under fire people stop hearing and need orders repeated. Orders are repeated and shouted
   short ("Stay down! Down!"). People ask "What?" and "Where?" and answer with a pointing word ("There. The fence.").
6. **Profanity is real but it is not decoration.** Scared civilians and angry or startled people swear in the first
   seconds, when hit, or when something goes wrong (jam, grenade). Calm professionals mostly don't. Children don't. A
   devout older person prays instead. Swearing is a reaction, never a threat or a joke.
7. **Robbers and home invaders are short and loud at first, then quiet.** The reported pattern (home-invasion survivor
   accounts) is a handful of commands repeated ("Get on the ground." "Where's the safe?" "Don't look at me."),
   shouted at close range, with nervous repetition. Real intruders are often young, scared and rushed, not eloquent.
   They say what to do and how long they have, not why they deserve it.
8. **Parents sound firm and quiet.** In a hiding situation adults whisper, use the child's name, give one instruction
   at a time, and promise only what they can (the child-safety guidance recommends short familiar words, calm adults,
   not describing the threat). "Stay here. Don't make a sound." "Look at me. I'm right here." Not "Everything will be
   fine" speeches.
9. **Children ask short, literal, frightened questions.** "Is it over?" "Where's Dad?" "Is the dog okay?" Or they say
   nothing. They do not give a running report.
10. **Callers on 911 give an address, a count, a location in the house, and then stay on the line**; the call-taker
    keeps their voice low and asks one thing at a time ("Where are you right now? Can you get to a room with a lock?").
    Call-takers do not say "calm down"; they give the next small task.
11. **Negotiators speak slowly and plainly.** Open questions ("What happened tonight?"), labeling a feeling ("Sounds like
    you've been out here a long time"), repeating the last words back, long pauses, and never a threat or a lie.
    They say "I hear you" less than TV suggests; they ask and listen. The stairway order is listen, empathy, rapport,
    then influence.
12. **Aftermath is quiet and practical.** People count, check, and give small orders ("Who's hit? Say your name.").
    Grief is short ("No. No. Not him.") and then logistics ("Get a blanket." "Someone get the kids inside."). At a
    grave people say plain things about the dead, often one sentence, often unfinished.

## 2. Principles

- **One idea per line.** If a line has two ideas, split it or cut one.
- **A line must be sayable out loud in one breath at the stress level of the moment.** Fight lines: 1 to 7 words.
  Aftermath, parley, house-quiet lines: up to about 12.
- **Concrete over abstract.** A direction, a count, a name, an object. "By the woodpile." beats "Over there."
- **Say what the speaker can see or is doing, in the order they notice it.** No narrator voice.
- **No quips, no taunts, no boasting, no "you'll pay for this".** A raider with a gun says "Get down" not a paragraph.
- **Not everything needs an answer.** Lines may go unanswered; people repeat; people talk over each other.
- **Plain US English, contractions.** The engine's `contract()` fixes the common ones; write them contracted anyway.
- **No em or en dashes in pools** (the `raidDialogue.test.ts` pool guard rejects them); use periods and commas. The
  broken feel comes from short sentences, not punctuation tricks.
- **No slurs. No gore for its own sake.** Wounds are named by place and the word for how it feels ("My leg. I can't
  feel it."), not described.

## 3. Register by role

| Role | How they talk | Length | Profanity |
| --- | --- | --- | --- |
| Raider leader | Terse commands, counts, a direction, a deadline. Raises volume only to be heard. No explaining. | 2 to 7 words | Rare for `crew` (stress or contempt). Gangs and crowds more often. |
| Raider, organized crew (`crew`) | Short call-and-response ("Left." "Clear." "Moving."). Weapon status and position. | 1 to 6 | A minority of lines |
| Raider, crowd / opportunists | Louder, scattered, more repeated words, reactions, complaints about not being told. | 2 to 8 | Some, as reaction |
| Raider, scouts | Whispers. Counts and marks. Never yell. | 3 to 8 | None |
| Raider, families / desperate | Pleading, apologizing, asking for water and food, saying where the kids are. | 3 to 10 | None |
| Defender, veteran or guard | Calm, flat, the same few words every time. Position and status. | 1 to 8 | Only when hit |
| Defender, untrained adult | Fragments, names, "get down", asking where, repeating. No tactical words. | 1 to 8 | Some, as reaction |
| Defender, child | One to four words, or a question. Never tactical. | 1 to 5 | Never |
| Defender, elder | Prayer or a short plain sentence; now and then a blunt curse. | 2 to 8 | Rare |
| Parent to child | Name, one instruction, low voice. | 2 to 7 | Never in front of the child |
| Guard at the gate | Standard challenge words: stop, hands, who's there, turn around. | 2 to 6 | None |
| Negotiator / person at a parley | Slow, open questions, repeating the other side's words, no threats, no lies. | 4 to 12 | None |
| Hostage, captive | Compliance, asking about family, "okay okay". | 1 to 6 | Rare |
| Neighbor | Where they are, what they saw, what they brought. | 3 to 10 | Rare |
| Burial, grief | Plain, one sentence, unfinished is fine. | 2 to 12 | Adults may |
| Cleanup | Practical: who has the shovel, how many, what's left. | 3 to 10 | None |

## 4. Profanity limit

Owner decision 2026-11-19: organized crew raiders and elders may swear too. Children never, kind questioning never, no slurs.

- `CURSE` in `src/sim/raidDialogue.ts` is the one list: `fuck*`, `shit*`, `goddamn*`, `damn*`, `hell`, `son of a bitch`,
  `jesus christ`. Nothing stronger, no slurs. **Words are written in full** ("fuck off", "fuck you"), never masked or
  abbreviated ("f off", "f***"); `peopleVoices.test.ts` checks the crew pools for masks.
- Tests enforce who may use it and how much:
  - scared untrained adult: sometimes (more than 5 in a scene set, under 30 percent of lines);
  - crowd and opportunist raiders: more than 8 in their pools;
  - organized `crew` raiders: terse and cold, a minority (more than 5, at most 30 percent of the crew pools). Swearing on stress (a bad door, no angle,
    a man down) or contempt ("Fuck you too. We're leaving."), never in commands or at a captive;
  - veterans (defenders): only when hit (3 or fewer in their own pools);
  - elders: rare, blunt, heartfelt, mixed with prayer (at most 30 percent of their own pool, under 15 percent of what they say in a
    scene), never comic ("Not in my house. Not in my damn house." then "Lord, keep them out.");
  - children: never; kind questioning: never.
- The dome branch (PR 395) limits its captions to "damn". Keep that for dome lines.
- Rule of thumb: swear on the first shock, when hit, on a malfunction, or in contempt. Not as filler.

## 4a. Organic talk

Real speech is not a list of tidy barks. Where the pools allow (seeded, no repeats), lines should: be interrupted ("Hon, what was that? The door?"),
trail off ("I'm okay. I'm... no. No, I'm not."), repeat ("It's holding. Is it holding?"), answer the wrong thing or ask for a repeat ("Say again? Left or
right?" "What? I can't hear you."), react to what just happened (a miss: "Missed. Damn it, I missed."; a man down: "Who's hit? Is that {n}?"; the door
holding: "Door's holding."), and use names and pet names ("Hon", "kiddo", first names). Still too scripted: see the PR report.

## 5. What to avoid (and what replaces it)

| Avoid | Why | Use |
| --- | --- | --- |
| "You'll pay for this." "Nobody crosses us." | Movie villain | "Get down." "Hands." |
| "Fire in the hole!" (as a shout for a charge) | Movie phrase; real breachers say "Breaching" / "Charge" | "Charge. Get back from the wall." |
| Explaining a plan out loud mid-fight | Nobody does | A direction and a count: "Two on the left." |
| "Is everyone okay?" in a fight | TV | "Call out." "Say your name." |
| Calm narration from civilians ("I see a shadow under the door") | Unrealistic under stress | "Someone's at the door." |
| Rhetorical questions ("Did you really think...?") | Quip | Plain question: "Where are the kids?" |
| Gloating after a hit ("Got him. Next.") | Reads as cold quip | "He's down." or nothing |
| "Oh God" as every reaction | Repetition makes it a tic | Rotate: name, "No", "Please", a swear, silence |
| Stage prayers, speeches at the grave | Not how people talk | One plain sentence about the person |
| Speaking in lists of orders ("Spread out, push, flank, suppress") | Spam | One order |

## 6. Before / after (from the rewrite)

| Where | Before | After |
| --- | --- | --- |
| raider crew, first shots | "Aimed shots only. Return fire." | "Contact left. Shooting." |
| raider crowd, approach | "We only want what is ours!" | "Come out! We know you've got food!" |
| raider, retreat | "Disengage. We will come back with a plan." | "Break off. Break off. Go." |
| raider leader, order out | "Come out with your hands up, and you will be fine." | "Come out. Hands where I can see them." |
| raider, kill | "Nobody walks out of this house." | "Do it. Quick." (removed as too declamatory; hostile lines kept short and flat) |
| defender, reload | "Dry, I am dry. Reloading!" | "Reloading!" |
| defender, civ, first shots | "I didn't think they'd really shoot." | "They're shooting! Dad, get down!" |
| defender, parent hiding kids | "Close your eyes and count. I am right here." | "Stay with me. Count to a hundred. Quiet." |
| defender, kid | "I am scared." | "Mom?" |
| raider crew, retreat | "Disengage. Now." | "Fuck this. Break off. Go." |
| elder, last stand | "Please, God. Not the children." | "Not the children. Fuck you. Not the children." |
| grave | "Thank you. For every single day." | "I'll look after the place. I told you I would." |
| interrogation, harsh | "Who's coming next? Talk. You've got until the lamp burns down." | "Who's after you? How many?" |
| interrogation, kind | "I brought you a plate. Who's coming after you?" | "Eat. Then tell me who else is out there." |
| break-in | "Every light on! The sheriff is on the way!" | "I'm on the phone with the sheriff! Get out!" |
| last words | "Hold the line. Don't stop shooting." | "Keep the door. Keep the door." |
| battle hazard | "AGH, the wire, it's in my, FUCK!" | "The wire. It's in my hands. Get it off." |

## 7. Lines for the dome branch to adopt (PR 395, `raidLinesDome.ts`, `domeBeats.ts`, `ShellFx.ts`)

Not edited here. Proposed replacements and additions, in the same pool keys. Keep "nothing stronger than damn".

- **dome_scout** (whisper, facts): "Two doors. Both shut." keep. Add: "No gap on the east side." "Light moved inside. Second floor." "Nothing low enough to climb." Avoid "They know we are here." as a statement of fact; scouts say "Don't know if they saw us."
- **dome_shots**: replace "Cease fire. You are wasting ammo." with "Stop. Stop shooting." (said once, repeated). Add: "Check your rounds." "That's three mags on one spot." "Anybody see a mark?" Leaders do not explain: "Hold fire."
- **dome_tool**: real fatigue talk: "Switch." "My arms are done." "Blade's dull." "Anyone got another disc?" "Water." Drop "Put your back into it!" for savage; use "Keep going."
- **dome_airlock**: pleading, short: "Open the door. Please. We've got kids." (desperate); "We just want to talk." (hard). Replace "Open it or we burn it." with "Last time. Open it." (savage, flat). Add handle talk: "It's locked from inside." "No handle on this side."
- **dome_ram**: "Driver okay?" "Back it up. Slow." "Radiator's gone." Replace "We are not getting that truck out." with "Truck's stuck. Chain it."
- **dome_blast**: "That was it?" "Nothing." "Black mark. That's all." Leader: "How much more do we have?" (number answer: "None.")
- **dome_argue**: use real counts and clocks: "Two hours to light." "I've got six rounds." "Mike's hurt, he can't climb." "We said one hour."
- **dome_order / dome_panic / dome_vow**: orders are two words ("Back. Now." "Trucks."). Panic is a short sentence and a name ("I'm not going back up there. Tom, I'm not."). Vows should be rarer and flatter: "We'll be back." (once) rather than three variants of revenge.
- **dome_watch / dome_fire / dome_holds / dome_gone / dome_taunt** (family): counts and sightlines, no taunts. "Three at the east door." "They're on the roof panel." "It's holding. It's holding." Remove or neutralize `dome_taunt`; real families inside do not taunt, they call to the kids ("Away from the glass.") or are silent. If a taunt pool must stay, make it a plain warning: "We can see you. Go home." (said once, calm).
- **ShellFx captions**: describe what the picture shows ("Rounds spark off the panel."), not what raiders think.

## 8. Sources (patterns only, no long quotes used)

911 and home-invasion calls (whispering callers, short answers, call-taker technique):
- NBC News, Ohio couple 911 banging call: https://www.nbcnews.com/news/us-news/slain-ohio-couple-911-banging-rcna253211
- CBS News, 11-year-old in closet during burglary: https://www.cbsnews.com/news/please-help-me-orlando-florida-girl-11-calls-911-from-closet-during-burglary/
- ABC/GMA, 12-year-old calls 911 from closet: https://www.goodmorningamerica.com/news/story/12-year-calls-911-closet-home-invasion-32897533
- WSVN, 911 calls after Sunrise homeowner shoots robber: https://wsvn.com/news/local/911-calls-released-after-sunrise-homeowner-shoots-robber/
- KIRO/MyNorthwest, 911 calls reveal terror of Seattle home invasion (call-taker voice discipline): https://mynorthwest.com/local/911-calls-reveal-terror-of-seattle-home-invasion/36541
- CBS Colorado, dispatcher credits victim during home invasion: https://cbsnews.com/colorado/news/dispatcher-credits-victim-for-doing-right-thing-during-home-invasion
- City of Minneapolis redacted 911 transcripts (format only): https://www.minneapolismn.gov/media/-www-content-assets/documents/911-Call-Transcript-20-251809-Job-95124-(Redacted).pdf

Radio, bodycam and under-fire speech:
- Ohio Attorney General, radio traffic transcription and video review documents (plain-language "shots fired", "he's down"): https://ohioattorneygeneral.gov/getattachment/6d8cec39-3d84-44f9-b3fc-7bdd3ec8bdb6/Radio-Traffic-Transcription.aspx
- ABC News, Minneapolis body camera video (short, repeated calls such as "cop down"): https://abcnews.go.com/US/wireStory/body-camera-video-captures-frantic-moments-intense-gunfire-111328844
- Police Magazine, how to handle auditory exclusion: https://www.policemag.com/articles/how-to-handle-audio-exclusion
- Breach Bang Clear, the reality of auditory exclusion: https://www.breachbangclear.com/?p=39443
- Officer.com, tunnel vision and auditory exclusion are real: https://www.officer.com/article/12341177/tunnel-vision-and-auditory-exclusion-are-real
- FireRescue1, silence is safer (radio discipline): https://www.firerescue1.com/fire-command-ready/silence-is-safer-making-the-case-for-an-ics-sterile-cockpit

Room clearing and fire-team call-outs ("clear", "moving", "coming out", "reloading ... gun up", "cover"):
- Guns.com, room clearing / close-quarters battle: https://www.guns.com/news/2012/05/08/room-clearing-close-quarters-combat-battle
- Verbal-command lists from CQB training documents (unit-specific; treat as vocabulary, not doctrine): https://www.scribd.com/doc/15283515/Close-Quarter-Battle , https://www.scribd.com/doc/209091257/close-quarter-combat

Negotiation and crisis technique:
- Psychology Today, the 5 core skills of hostage negotiators: https://www.psychologytoday.com/us/blog/beyond-words/201510/the-5-core-skills-of-hostage-negotiators
- Psychology Today, active listening techniques: https://psychologytoday.com/au/blog/beyond-words/201311/active-listening-techniques-hostage-crisis-negotiators
- Wikipedia, crisis negotiation (Behavioral Change Stairway Model): https://en.wikipedia.org/wiki/Crisis_negotiation
- Gary Noesner, *Stalling for Time* (book; not read, named for follow-up).

Survivor and disaster accounts:
- Fox News, Petit home invasion survivor testimony (intruder commands): https://www.foxnews.com/us/in-testimony-the-only-survivor-of-deadly-connecticut-home-invasion-describes-night-of-terror.print
- CBS Sacramento, home invasion hostage: https://www.cbsnews.com/sacramento/news/home-invasion-sacramento-hostage
- Dallas News, Fort Worth couple held at gunpoint: https://www.dallasnews.com/news/crime/2018/08/21/fort-worth-couple-held-gunpoint-robbers-ransack-apartment
- Disaster Research Center, Univ. of Delaware, looting after Katrina (what was and was not said and done): https://udspace.udel.edu/bitstream/handle/19716/2367/Misc%20Report%2053.pdf
- NBC News, residents guard neighborhoods from looters: https://www.nbcnews.com/news/amp/wbna9464619

Talking to children:
- Head Start, stay-safe procedures for early childhood programs: https://www.headstart.gov/publication/stay-safe-procedures-early-childhood-programs
- Parents Together, what to say to kids before and after a lockdown drill: https://parents-together.org/prepare-students-without-scaring-them-what-to-say-to-kids-before-and-after-a-lockdown-drill

Limits of the research: `WebFetch` could not reach most news hosts from the build sandbox, so this guide rests on
search excerpts and the sources' own summaries, not full transcripts. A follow-up with full 911 and bodycam transcripts
(many public records releases exist) would let the pools be checked against real word counts.
