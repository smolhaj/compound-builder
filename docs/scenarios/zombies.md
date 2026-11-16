# Scenario: Zombies (`zombies`)

Design doc, not code. Status today: kind exists (pulpy, Scenario / Free build only, warning 5-15 days, no chain, one variant "the outbreak"). Its whole mechanical content is: a `horde` encounter at weight `60 x (0.5 + visibility / 100)` in `whoComes`, traders x0.2, refugees x0.5, requisition 0, savage battle behavior for `horde` crews (`battle.ts`, `crewMercy.ts`), market closes for good, mind stress 12. Ranked 8 of 16 most toothless in `docs/DISASTER_TEETH.md`: "No infection or bite, no night wandering, no noise or light lure, no walkers on the road to the gate beyond the generic lead, no turned neighbors." WP4 reserves `src/sim/disasters/zombies.ts` and a new pure `src/sim/walkers.ts` ("infection from bites and from the dead, night wandering that lures to light and noise (reads `stealth`), horde size that grows with the town's population, a daily walker count at the wall feeding the wall-damage and ammo sinks").

This doc takes the genre seriously: it picks an infection model, gives the walkers senses and a body, and then works out how every defense the game already has (walls, ditches, dogs, the bunker, hiding, stealth, gate vetting, guards, the siege-wave clock) reads against them. It is deliberately **not** a re-skinned raid: a walker is not a raider. A raider is a person with goals, fear and a price; a walker is a **force of nature with a very simple brain**, and the game it creates is about **noise, light, pressure and attrition**, with the *human* threat layered on top.

Evidence tags: **(verified)**, **(commonly cited)**, **(design)**. Almost everything about the walkers is **design**; the real-world material is the biology and crowd physics it borrows from.

---

## 1. Real-world and genre basis

### 1.1 Real analogs (what the infection can borrow)

| Real thing | Figures | What it gives the game |
|---|---|---|
| **Rabies** | Once symptoms begin, fatality is essentially 100%; about 59,000 human deaths a year worldwide (WHO); transmitted by **saliva through a bite or broken skin**; incubation typically 1-3 months but from days to over a year; the virus drives aggression and the urge to bite and (in "furious" rabies) hydrophobia and agitation (WHO, CDC; commonly cited). | The model for **bite transmission, agitation and a fatal end**. The genre's "rage" and slow zombies are rabies with the dials turned. Real rabies is slow: the game compresses incubation to hours (design). |
| **Zombie-ant fungus, *Ophiocordyceps unilateralis*** | A fungus that steers carpenter ants to bite a leaf vein at solar noon and die; the fruiting body grows from the head (Hughes et al., *BMC Ecology* 2011). | A pathogen that **changes behavior to spread**; the *Last of Us* cordyceps model: **spores and fruiting bodies** as a late stage (optional variant). |
| **Kuru and prion diseases** | Fore people of Papua New Guinea; incubation up to 40 years; endocannibalism; (commonly cited). | The chilling *origin story* flavor for a transmitted brain disease. |
| **Haitian zombification (Wade Davis, 1985)** | A contested hypothesis (tetrodotoxin and datura) that a drug creates a compliant "zombie". (commonly cited, disputed) | Folk-origin flavor for radio rumor, never an actual mechanic. |
| **Munz et al., "When Zombies Attack!: Mathematical Modelling of an Outbreak of Zombie Infection" (2009)** | An SZR (susceptible-zombie-removed) model; finds that a *basic* outbreak spreads to the whole population unless quarantine and eradication are early and aggressive: "only quick, aggressive attacks can stave off the doomsday scenario" (Munz et al., in *Infectious Disease Modelling Research Progress*; commonly cited). | The world-level dynamics are a *race*: a whole county's population is gone in 10-20 days if not contained. Supports a short warning and a hard day-0. |
| **CDC "Preparedness 101: Zombie Apocalypse" (2011)** | A real CDC public-health communications blog using zombies to teach emergency kits: water (1 gallon per person a day), food, tools, first aid, documents. (verified; widely known) | The game's own readiness checklist is *already* the zombie checklist. A nice, truthful radio bulletin. |
| **Crowd crush** | Crowd pressure can reach about **4,500 N per meter, roughly 300 lb per foot** of frontage in dense crowds; fatal crowd forces (Fruin; Helbing et al., Hajj 2006 *Transportation Science* 2007; commonly cited); walls and barriers have failed under crowds. | The physics for **walkers at a wall**: not one at a time but a standing crowd pressing, row on row. |
| **Decomposition** | Body decomposition runs through fresh, bloat, active decay, advanced decay and dry remains; rate depends on temperature (roughly doubling per 18 F rise: the Q10 rule of thumb) and moisture; cold (below about 32 F) halts it; a body in a cold dry climate mummifies (forensic taphonomy; commonly cited). | The **walker lifespan** and **seasonal behavior**: they freeze, thaw, rot, dry and finally fail. The game has a built-in end to the plague, and a spring "thaw" scare. |

### 1.2 Genre touchstones (why each dial is where it is)

- **Romero (*Night of the Living Dead* 1968, *Dawn* 1978, *Day* 1985):** slow, shambling, bite-spread, headshot kills; the horror is the **crowd and the failure of the humans** (the mall, the bunker, the farmhouse). The living are the problem. -> default speed and the human-threat layer.
- **The Zombie Survival Guide (Max Brooks 2003) and *World War Z* (2006):** the **Solanum virus**; slow, no pain, no fear, no heartbeat; **"the Redeker Plan"**, the failure of the Battle of Yonkers (a modern army overwhelmed by *noise and mass*); hordes **frozen on the Great Plains and Siberia and thawing in spring**; the "great panic" and refugee migrations; the lesson that *sound and sight* are the lures and *mass* is the weapon. -> noise attraction, the freeze-thaw cycle, the horde-as-flow.
- ***The Walking Dead* (2010-):** **everyone is already infected**: any death reanimates; bites kill by fever; walkers are drawn by noise and moving light; **"smell like the dead" camouflage** (covering yourself in walker gore to pass through a herd); herds follow noise for miles; the walls and the ethics of the group. -> the `everyone_turns` variant, herds, the gore-camouflage trick.
- ***28 Days Later* (2002):** the infected are **alive, fast, and burn out** (they starve in weeks); the ending of the plague is biological, a hopeful tail; the soldiers are the bigger menace. -> the `rage` variant.
- ***The Last of Us*:** a fungal brain infection; stages (runner, stalker, clicker, bloater); **spores in the air** in some places; clickers hunt by sound, so *stealth* is mechanical. -> optional spore zones and a stealth-first game.
- ***Train to Busan*:** fast, mindless, **blind in the dark and in tunnels**; they respond to sound and light. -> darkness hides you if you are quiet.
- ***Fear the Walking Dead*, *Z Nation*, *Zombieland*:** safe-zone fraud, military abandonment, zany survival rules.
- **Planetary-scale tone:** the *Resident Evil* and *Dead Rising* family of mall sets, helicopters, a government cover-up.

### 1.3 The infection model the game uses (decided here, for the owner to confirm)

Three variants so one scenario plays three ways (weights 3 / 2 / 1; Free build lets the player pick):

| Variant id | Name | Rule |
|---|---|---|
| `outbreak` (w3) | **Bite-borne, the dead rise** (Romero-like; the default) | A **bite or deep scratch with saliva or blood into a wound or mucous membrane** infects with probability by severity (section 5.2). The infected sicken (fever, then collapse) and **die**, then **rise** as walkers. People who die of other causes **stay dead** (a funeral is safe). Walkers are slow (shamble). |
| `everyone_turns` (w2) | **The sleeper pathogen** (Walking Dead-like) | The agent is already in *everyone*; **any death reanimates** within 3-30 minutes unless the brain is destroyed or the body burned. A bite still kills by fever and sepsis in 12-48 hours; but now **every death in the compound is a hazard**: the old, the injured, a fall, a raid casualty, a stillbirth. Burial duty becomes a night-watch task. Speed: slow. |
| `rage` (w1; Hardcore flavor) | **The Rage** (28 Days-like) | The infected are **alive**, enraged, **fast (about 8 mph sprint, 3 mph sustained)**, bite-spread within **seconds to 10 minutes** of exposure (fast incubation), and **do not eat or drink**: they **burn out in 14-35 days** (starve, dehydrate, collapse). They are poor climbers, see in the dark badly, but hear far. The danger is the **first month**; the world then goes quiet and the human threat is what is left. No resurrection. |

An optional **`spore`** modifier (Hardcore/Free build only, 10% of `outbreak` runs): in a region's damp low ground (valley floors, caves, a flooded basement) a **spore zone** makes breathing without a respirator infect; the compound's low and wet buildings (root cellar, the moat edge, the bunker) are the hazard, and the **filtered bunker air** (existing fallout filter) matters.

## 2. Warning signs and how the player notices

Warning 5-15 days at Standard (Cozy 8-24; Hardcore 2-6). The existing hints are good and are kept; this section says what each *does*.

| Stage | Existing hint (kept) | What the player can notice and do |
|---|---|---|
| Early (T-15 to T-8) | "Riot at a hospital in the city: patients 'attacking staff'." "A strange rabies-like illness in the news." | Radio reports "violent incidents at three hospitals." Price movement is small; only the **ammo and canned food** lines tick up. The CDC blog line appears as a **news chuckle** (the CDC zombie-preparedness post is real; the radio can read it as a joke, then as not). The *shortwave* picks up a doctor's panic. Buy now: ammunition, **quiet weapons** (a crossbow, a bow, long poles), lumber, wire, fencing, bleach, rope. |
| Middle (T-8 to T-3) | "The National Guard is in the city. Footage is being taken down." "Neighbors say the interstate is closed east of here." | The **interstate** (the nearest `scavenge` place) shows a column of cars; the county road gets more passers (`roadPassers`) walking with injuries; the first **bite-check** moment: a relative arrives with a bandage. The Sheriff announces a **curfew** (`law` still up). |
| Late (T-3 to T-1) | "The city has gone quiet on the radio." "Something is walking up the county road." | The first lone walker is **seen on the road** (`roadLead`: seen walking up the road before the card, existing for non-raid encounters). Dogs bark at the road at night. The player gets about a day to finish the walls. |

Notice-ability rule: **every warning stage carries an action the player can do with money, hours or both**: build, stock, drill the family on the **quiet rules** (section 8).

Cozy: the sheriff's emergency broadcast includes the actual rule ("aim for the head; do not let them bite you"); Hardcore: the rule is not given, and the radio rumors are wrong 40% of the time (a rumor claims "they can't see in the dark": false).

## 3. Timeline (Standard, variant `outbreak`; other variants in section 5.5)

"The hit" is the day walkers appear in the player's county in numbers, not the first case (that began about 10 days earlier in cities).

| Phase | The world | The compound |
|---|---|---|
| **Hit moment** | "They're here. The dead are walking out of town." Sirens in the county seat; headlights on the road; the emergency system tone. A distant fire. | Headline card. First decision (gate card): **"Lock down and stay quiet, or go to the road?"** Dusk. Night 1 begins within hours for a Mountain West winter. |
| **First hour** | The phone network jams; the first walkers move along the road toward lit windows. The sheriff's last transmission. | **Lights out** (stealth: a dark house); the generator off (noise 300 feet); dogs inside; the gate chained. A walker is **at the road gate**, then another. |
| **Day 1 (first night)** | A rolling event: the town's sirens (noise: the walkers in town are drawn *to town's noise*), then silence at dawn; the main road is dotted with slow figures. The first neighbor call. | **Stragglers at the wall:** 1-5 at the road line; more at the lit window. First kills: **quiet kill window** or a gunshot that brings 12 more in 20 minutes (the lesson). The first bitten stranger at the gate. |
| **Week 1** | The Guard retreats; a **safe-zone broadcast** on the radio ("Fort Collins and Salt Lake City safe zones are accepting survivors"). Roads fill with refugees then empty. `deliveries` and `stores` are gone by day 3-7 (existing curves: medical C(2,7), stores C(3,7), deliveries C(2,5)). The grid holds for 2-4 weeks (grid C(14,30)). | **The wall and the count:** `wallCrowd` climbs to 10-60. The compound's first **neighbor turns** (night 3-6): a knock at 3 a.m. Burn pit and drag duty start. Rotation of night watch. **First casualty** to a mistake (a bite, a fall at the wall). |
| **Month 1** | Walker density stabilizes in towns (fresh stage) and **thins on the roads** as they follow noise; the power dies (day 14-44), then **gas** (existing fuel curve C(5,15)); fires burn in the city; planes overhead once, then never; the radio is a loop. **Raiders arrive** (law at zero; the raid cadence is the existing `law` read). | The compound's resources: **ammo, quiet kill supplies, wall repair, labor hours for body disposal**. A **horde** (40+ walkers aggregated) passes on the road: hide, or be drawn. The first human crew shows up, using the walkers (section 4.4). |
| **Month 3** | If it is autumn-winter: **the freeze** (see 5.4): walkers outdoors stiffen below about 20 F and stop moving below about 10 F; **the dead stay where they fell** until the thaw. Rotting stage (30-180 days): slower (70% speed), weaker. Many are lost in rivers and in ditches. **Safe-zone collapse rumor**. | The calm: **the false peace**: the compound relaxes; hardcore **thaw** is the bait. The human threat (gangs) is at its peak. Salvage runs into frozen towns: **walkers frozen in doorways** (a thrilling and risky quiet-work mini-game: they thaw if you light a fire next to them). |
| **Month 6** | Spring thaw (if the hit was in autumn): a **burst of mobile walkers** from the snow (the WWZ trope: a "spring wave" event, count x2 for 14 days). Otherwise: rotting-stage dominance and fewer hordes. Radio stations: a few ham operators; a rumor of a cure. | The compound counts the dead at the wall and the pile of **ash**; rebuilds sections; the human community (neighbors who survived) begins to form. |
| **Year 1** | **Desiccated stage** (180-540 days): slow (40%), brittle, **bones**; the density is down by 60-90% from the peak through decay, fires, and being killed; remaining walkers cluster at **the last noise source** (the church bell; a car alarm on a dead battery; a stuck radio). | Walker pressure is manageable and *chronic*. The compound can **clear a perimeter** to farm; hunters return to fields; a **return of the school bus**: a wonder. |
| **Year 2+** | **Spent stage** (540+ days; 18 months): inert bones, still dangerous underfoot but not mobile; a "last herd" (a lone event with a huge count preserved in a frozen valley or mine). In `everyone_turns`, **fresh reanimation risk is permanent** (every death). The world is the humans' again: raiders, warlords, settlements. | The long game: expansion, trade, building a community; the *chronicle* remembers who died at the wall. |

## 4. Effects by system

### 4.1 Service tracks (existing curves kept, with notes)

Existing single variant `outbreak`: law C(3,10,0), medical C(2,7,0), stores C(3,7,0), deliveries C(2,5,0), grid C(14,30,0), fuel C(5,15,0), banks C(5,10,0), phone C(10,30,0), all `back: null`. Keep (the world does not repair itself: nobody is coming), with these per-variant tweaks:

| Variant | Changes |
|---|---|
| `outbreak` | as above |
| `everyone_turns` | same; `medical` C(1,5,0), because even hospital deaths rise; `grid` C(10,25,0) |
| `rage` | `law` C(2,7,0.05, [60, 120]), `grid` C(10,20,0.1, [40, 90]), `stores` C(2,6,0.1, [40, 100]): *the world partly recovers after the infected burn out*: `back` set (a hopeful variant; fate `partial` is possible, `never` is rare 20%) |

The **grid fall is slow** relative to the supermarket: for 2-6 weeks the player has power and lights, which is exactly when **light discipline** matters most (section 5.3).

### 4.2 Money, prices, shops

- Market closes for good (existing). **No shops, no orders** from day 3. The barter market (`barter.ts`) pays for **quiet weapons, ammo, bleach, rope, wire, boots** and **people with skills**. A good melee weapon and a pole are worth more than a handgun in week 2 (the gun is loud).
- **Ammo** is an *attention currency*: every shot costs the compound noise (section 5.3).
- Fuel: liquid fuel stores get a *noise* meaning: starting a truck or a generator is a decision, not a convenience.
- Houses of the dead (the empty neighbors' places, the town store) become **salvage sites** with a walker-risk roll (`scavenge.riskOf` gets a `walkers` component): a pharmacy in the town center has 15-40 walkers inside; a farm outbuilding has 0-3.

### 4.3 Neighbors

- Every neighbor household has a **fate** by the second night: 35% turn or die, 25% flee, 30% fort up (alive; they ask for help or stay quiet), 10% become **hostile** (looting). This sets the *turned neighbor* encounters: the neighbor who knocks at the gate.
- **Neighbor requests** (`neighbor_help`): "We hear them at the fence; can you send two with rifles?" (loud). **Turned neighbor at your fence** (a unique encounter: "the Hendersons' boy, in his pajamas, standing at the gate with his head tilted"): a moral beat, with a rule: *do you put him down quietly, or tell his mother?*
- **Bond system** (`bonds.ts`): shared nights on the wall create real friendships; a bonded person who dies at the wall hurts.
- Neighbors who survive cluster into a hamlet; the `rules.ts` votes (hamlet stage) are about **noise rules, wall duty and who gets in**.

### 4.4 Raiders and the encounter mix: the human threat on top

The walkers are the **weather**; the people are the **war**. Replace the single `horde` weight with a *derived* set of encounters:

| Encounter | Source | Notes |
|---|---|---|
| `stragglers` (ambient, not a card) | `wallCrowd` | 1-30 walkers at the wall: handled by the daily duty, not a card. The Kill Window and the pike (5.3) turn this into attrition, not a fight. |
| `horde` (card) | a mass of 40+ walkers aggregated and moving along the road or drawn by noise | The existing encounter kind, now sized by `wallCrowd` and the county's turned count, and *conditional* on a stimulus (noise/light). The crowd pressure model governs the wall. |
| `bitten_arrival` (new) | refugees, relatives, joiners | A person at the gate who is **bitten and hiding it** (section 5.6) or who is bitten and *begging*: the **24-hour hold** rule applies. |
| `turned_neighbor` (new) | neighbor deaths | See 4.3. |
| `lure_raid` (new raid opener; reuses `raidOpeners.diversion`) | gangs | Raiders **use walkers as a weapon**: they drive a truck with the horn taped down past the compound; throw a flare; set a siren at the far end of the property; or *herd* a horde with a bell. The defenders face walkers *and* the crew that followed in the confusion. |
| `looters` / `gang` (existing) | `law` 0 from day 10 | Cadence from the existing `law` track. **Crews are smaller and warier of noise** (they avoid firing guns near the road too; their *own* raids are limited by the same noise rule), so the typical raid is **quiet**: a crew with crossbows and knives at night, trying to open the gate. |
| `militia` / `requisition` | the Guard, a survivalist group | Military "safe zone" convoys that **collect** survivors; some are real, some are fraud (section 4.4 below). Requisition is off (existing). |
| `refugees` (existing x0.5) | the county | Families walking out of town. Each person rolls `bitten` (5% in the first week, falling to 1%). |
| `trader` (existing x0.2) | scavengers | Traders who survive are **night-walkers with blackened faces**: rare, valuable, usually armed. |

Specific human problems the scenario creates:

1. **Hidden bites** (5.6): refugees and *your own people* conceal a bite. The rule of the genre: **someone is lying**.
2. **The family member who is bitten** (the heartbreak): a scene, a card, a choice (section 8). In `everyone_turns`, any death of a family member needs a watch, and this is both horror and ritual.
3. **Weaponized lures** (above).
4. **Safe-zone fraud and the military.** A mid-month radio bulletin directs survivors to "the FEMA camp at the fairgrounds". It can be real (a refuge for the poor family who gives up the land: an *ending* path), a trap (a slaver crew), or already overrun. The player sends a scout to learn which. The compound can **host** a refugee group or **join** a hamlet.
5. **Cults and sympathizers**: "the dead are just sick" groups that keep walkers chained (a gruesome, sad encounter: a woman with her husband in the barn).
6. **Insiders** (`insider.ts`): an unvetted guard or joiner **opens the gate at night** to draw walkers in, or to let a crew in; a bitten insider hides his bite.
7. **Scavenger competition** on the town salvage; a "rival hamlet".

Law and cadence: the existing track makes raids come as the world empties; because walkers draw crews' attention too, add **a quiet-hours rule**: no raid starts in the first 3 days (everyone is inside), and **cadence x1.3** in months 1-2 (the first raid is week 3).

### 4.5 Health, food and water

- **Bites and wounds** are the unique health system (5.2). All other illness is normal; the **medical** track is gone.
- **Contamination:** dead bodies at the wall rot; the water (a creek, a shallow well) downstream is a hazard (`water.ts`, bunker rule of 200 feet); **dysentery** from the pile (existing `medical.ts`). The burn pit is also a smoke signal (noise 0, **light and smoke** attract; burn at dawn or in a closed incinerator, the "smokeless" stealth mode).
- **Sleep and nerves:** the nights at the wall cost **stress** (existing `mind.ts` amt 12); a night of walkers moaning at the fence (the *sound* is a stress source) with a "quiet night" recovery if the wall holds.
- **Food:** nothing special; the garden and animals feed the family; **animals make noise** (roosters crow at dawn: a rooster in a zombie apocalypse is a liability: stealth `noise` already counts animals) and **pigs squeal**; the livestock sit in the barn with the compound's noise; the Hunting skill matters (a bow is silent).

## 5. Infection, senses and the interplay of defenses

### 5.1 The walker (the unit)

Design numbers, US units; the **fresh** stage is the baseline.

| Stat | Fresh (0-30 d) | Rotting (30-180 d) | Desiccated (180-540 d) | Spent (540+ d) |
|---|---|---|---|---|
| Speed (shamble) | 1.2 mph | 0.9 mph | 0.5 mph | 0 |
| Strength (push per walker) | 35 lb sustained | 28 lb | 15 lb | 0 |
| Hit points to destroy | head: one blow with a hammer; body: effectively unkillable until the brain is destroyed | head: easier (skull softened) | head: crumbles | n/a |
| Bite infection chance | 100% of the standard table | 100% | 50% | 0 |
| Hearing and sight | below | 0.8x | 0.5x | 0 |
| Pain / fear | none | none | none | n/a |
| Decay speed | baseline x climate (see 5.4) | | | |

- Walkers cannot climb ladders, open latched doors or use tools, but **press, push and climb over their own fallen** (the pile ramp) and **fall into pits**. They cannot swim well (they sink and walk the bottom in the genre; the game says a **moat of 5+ feet deep and 8+ feet wide holds them**: they drop, struggle and *stay in the water*, accumulating at the bottom; an eventual filled moat is a bridge, see 5.3). They cannot cross a 2-foot-wide, 4-foot-deep **trench** without falling in.
- They **follow other walkers** (herding): a few walkers drawn by a noise pull many more on the way (the "snowball"). They do **not** sleep, **so night is not safer; it is only quieter and darker**, which is exactly why the lights and the noise decide everything.
- **Mind:** a walker has a **last-stimulus point** and a **stay timer**: it goes to the loudest or brightest thing it perceived and stays there for 6-30 days after the stimulus ends, then drifts (random walk biased along roads, creeks and the lines of least resistance: 3-10 miles in a month).

### 5.2 Infection: bite, exposure, incubation, turning

Exposure events per person: a walker **bite** (grapple at the wall, a breach, a house fight, a scavenging run); a **scratch with fluids**; a **splash of blood or saliva to eye, nose or an open wound**; a **fight with a freshly bitten person** (a turning person's saliva).

| Event | Infection chance (Standard) | Notes |
|---|---|---|
| Bite through bare skin | 85% | The base case |
| Bite through heavy clothes (a canvas coat, jeans) | 40% | Clothing and armor matter: a heavy jacket, leather chaps, a **neck guard**, a dog-handler's **bite sleeve** |
| Bite through leather or padded gear (a **bite suit**, a chain-mail-and-leather vest) | 10% | Rare, **a player craft** (the forge, existing) |
| Deep scratch with saliva | 25% | |
| Blood splash to eye or open cut | 10% | Goggles and gloves cut it to 1% |
| Contact with intact skin | 0% | Safe: you may handle bodies with gloves |
| Cooked meat from a walker, or water the bodies lay in | 0% (this is not a prion) | Disease from rot is the other (normal) hazard |

Cozy halves these; Hardcore adds +10 points. **Family members and children** are the same.

**Timeline of an infection (outbreak variant; design):** exposure -> **incubation 2-18 hours (median 8; shorter for a head/neck bite, longer for a hand)** -> **fever and collapse 2-10 hours** (the person is feverish, confused, then sinks) -> **death** -> **rises 3-20 minutes later** as a walker. The whole span is **under 24 hours in 95% of cases** (a few late ones to 36 hours: the game's rule of thumb is the **24-hour rule**).

- **Early amputation** of the bitten limb within the first 1-2 hours saves **40%** of the time (design; Cozy 60%, Hardcore 15%): a **grim emergency card** needing a saw, a tourniquet, antiseptic and a steady hand (Medic skill). It is both a heroic and a gruesome option, and can *fail* (bleeding out).
- **No cure, no vaccine**, no effective antibiotic; **a rare natural immune** (about 0.3% of the population; Standard): a *rumor on the radio* and one possible joiner (a bitten stranger who *did not turn* after 48 hours) as a gift.
- **Fever reducers** hide symptoms for about 2 hours: a hidden bite is easier to conceal.
- **Cozy rule** (existing: nobody dies for good): a bitten **family member** is **not** infected by the Turn: they get a severe fever and **recover in a week** (a gentle reinterpretation: "an infection that did not take"); strangers and neighbors still turn. The player still feels the fear, because the family does not know which they are at the moment of the bite. Hardcore keeps permadeath.
- **`everyone_turns`:** *any* death turns; so after a death, a **watcher** must destroy the brain within about 20 minutes (a quiet **spike or hammer** by a loved one: a heavy scene) or the body must be bound or burned. This is a game of rites and one of the most powerful emotional beats in the genre.
- **`rage`:** incubation 5 seconds to 10 minutes; no resurrection; **a bitten person is a berserk attacker in minutes**; the threat is fast and concentrated early, then ends by day 14-35.

### 5.3 Noise, light, scent: what attracts them and how far

All ranges are **design numbers in feet** (US units); the game's `stealth.ts` already tracks noise and light give-aways (`soundK`, `SMOKE_K`, quiet hours, dark house, the lit response). The walker model reads those *directly*.

| Stimulus | Attraction radius (a walker within this distance turns to it) | Notes |
|---|---|---|
| **Rifle shot** (unsuppressed) | 5,000 ft (about 1 mile) | The classic loud mistake; suppressors cut to 1,500 ft (existing armory) |
| **Handgun or shotgun** | 3,000 ft | |
| **Small caliber (.22) suppressed or subsonic** | 600 ft | The poor family's pistol and a hunter's rifle: cheap quiet kills |
| **Vehicle engine** | 2,500 ft; a diesel truck at idle 1,500 ft | A road trip is a **parade** |
| **Generator** (existing sound) | 500-1,000 ft depending on the model; **inverter generators** 300 ft; a **muffler box** and **a buried exhaust** cuts 40% | The **grid-less** compound with solar and batteries is the **quietest** |
| **Chainsaw, power tools** | 2,000 ft | Cut wood in daylight in short bursts |
| **Axe and hand tools** | 400 ft | |
| **Loud talk, shouting** | 500 ft; a **scream** 1,500 ft; a baby's cry 700 ft | The kids' rules are part of the household. |
| **Normal talk** | 80 ft | |
| **A barking dog** | 1,200 ft | A trained **quiet dog** (existing `dogsQuiet`, the trainer's fee) 150 ft |
| **Rooster, goat, pig squeal** | 1,000-1,500 ft | The animals' noise (existing `stock` noise in `stealth.ts`) |
| **Car alarm, siren, church bell** | 5,000 ft | Used in a **lure** (4.4) |
| **Campfire at night** | light: 800 ft; smoke: seen in daytime at 3 miles but not a lure (walkers do not follow smoke); **firelight** is | Burn in a dug pit with a lid or a **smokeless** stove |
| **Flashlight (moving)** | 300 ft | A held light, moving in the dark, is the strongest *light* lure for its size |
| **Floodlight / AI-sensor floodlight (existing `lit response`)** | 1,500 ft | **The existing floodlights are a liability here**, not an asset: a system feature that flips in this scenario (the **lit response** is an *option to turn off*) |
| **Window lamp (a lit window)** | 400 ft at night (ten times a candle's) | **Blackout curtains** (a cheap, strong measure; the existing `dark house`) |
| **Moonlight and starlight reflections off glass** | 200 ft | A shiny roof matters, a painted roof does not |
| **Cooking smells, latrines, rot** | not a lure (walkers do not smell the living beyond about 30 ft); *the scent-camouflage trick* (smearing yourself with walker gore to move through a herd) works for about **20 minutes** until a rain washes it or a walker notices, with 10% a minute chance of a "tell" at close range | A genre signature; costs a disgusting card and an infection roll if you have a cut |

Modifiers: **wind** (downwind carries noise 1.5x at 3 mph or more), **rain** (reduces noise radius by 30% and light by 40%), **snow** (30%), **night** (light radius x2.5 vs day; noise x1.2 because the world is quieter), **terrain** (a ridge or a dense stand of timber blocks about 50% of line-of-sight light; sound diffracts), **walls** (a masonry wall cuts noise from inside by 50%), **underground** (a bunker's noise to the surface is 15%: a **vent pipe** is the leak).

**The mechanic in a sentence:** each night the compound emits a `signature` = sum of its noise and light, in feet; every walker (or horde) within `signature` of the compound heads for it; the **count at the wall** grows by the number of walkers inside that disc plus a small leakage from beyond; the more local walkers there are (a town nearby), the more the compound's own quiet matters.

**Walkers at the wall (the daily number):**

```
wallCrowd[t+1] = wallCrowd[t]
               + arrivals(t)                      // walkers inside signature disc x 0.12/night (stimulated) + leakage 0.4% of turned in 10 mi/night
               - kills(t)                         // from kill window, pikes, fire, shooting
               - dispersal(t)                     // 7%/day when silent for 3+ days, else 0
```

- County turned count `T = 0.55 x county population` at day 14 (a rural county of 4,000 gives T about 2,200, spread over towns and roads), drifting and decaying by stage.
- **Example:** town of 3,000 six miles away: T_local about 1,650. A quiet compound at day 7 gets about 2 to 4 walkers a night; a compound running a generator and floodlights gets 10 to 40 a night and a **growing crowd** which then *itself* draws more by herding. The player controls their own number.
- Hordes (>=40 aggregated) show up as `horde` encounter cards with a heading and an ETA seen on the road (the existing `roadLead`).

### 5.4 The walls, the ditch and the crowd: how defenses read

A wall stops a walker unless it fails by **load** (crowd pressure) or is **bypassed** (a gate, a weak spot, a breach). The unit is **load in pounds per foot of wall**, from the walkers pressing: each walker in the front rank contributes about 35 lb (fresh) over a frontage of about 1.5 feet; additional rows add (a 2nd row +60%, 3rd +40%, 4th +25%). Shoulder-to-shoulder crowd pressure can reach about 300 lb per foot (the crowd-crush figure); a **four-row press of fresh walkers is about 130 to 170 lb per foot**.

| Defense | Rating (lb per foot before failure) | Walker-specific notes |
|---|---|---|
| Existing chain-link 4 ft | 60 | Fails to 3 rows; they can also **grab the mesh**; climbing is not possible but the fence leans and breaks at posts |
| Woven wire + T-posts, barbed | 90 | Bent flat by a press; barbed wire does nothing to walkers (they feel no pain) |
| Wood board fence 6 ft | 180 | |
| **Palisade** of set logs (existing) | 450 | Excellent, sees through gaps (a killing slit) |
| Welded steel panels | 600 | |
| CMU block 8 in reinforced | 1,500 | Needs no maintenance |
| Poured concrete | 2,500 | |
| Gates (wood, steel) | 150 / 400 | The weak point by far; **gates are what the crowd leans on** (the existing `weak spots` overlay) |
| **Moat** (existing, 8+ ft wide, 5+ ft deep, water) | holds them; **a moat fills** at 60 walkers per 100 feet of ditch (sunk and stacked); then the **bodies are a causeway** | Burn or drag them out of a filled ditch (heavy labor: 1.5 person-hours a body) |
| **Dry ditch 4 ft deep, 3 ft wide** | holds them; fills at **24 per 10 feet** | Drained: walkers pile, ramp, then walk across the bodies |
| **Spikes and spiked ditch** | Kills nothing unless they pass the head | A **spiked pit** with a head-height spike does destroy a walker at 20% on a fall (design) |
| **Vehicle yard / bollards** | irrelevant | A truck is not a wall; a crowd can **pile around a vehicle** |
| **Raised walkway / catwalk behind the wall** (the existing wall-top kit) | gives the defenders a **killing platform** | a pike or spear over the top; the **Kill Window** below |

- **Piles.** Dead walkers at the foot of the wall are a **ramp**: after about 15 dead per 10 feet of wall, a 6-foot wall is effectively **4 feet** to the next walker: **drag and burn** them daily (a labor task: 0.5 person-hours a body; the burn pit is a smoke tell).
- **Quiet kill methods** (the poor family's superpower): **pike or spear through a slit or over the top** (a pole of 8-10 feet: zero noise, zero exposure, 0.15 person-hours a kill, skill-based: Melee 2+ for 90% brain hits), **a long-handled hammer**, **a crossbow or compound bow** (a 300-ft noise cost: close to zero), **a suppressed .22**. **Loud methods:** rifles and shotguns (a kill costs 1,500-5,000 ft of noise; each shot at the wall draws walkers from farther away, so **ammo creates demand**). The decision "shoot or pike" at each wall is the repeated micro-decision of the scenario.
- **Dogs** (existing `pets`, guard dogs): *Pros:* they **detect walkers at 2-3x range** (smell and hearing: warning at 600 to 1,200 ft) and can be trained to alert **quietly** (the existing trainer's fee, `dogsQuiet`); *Cons:* untrained barking is a **1,200-ft lure**; a dog at the wall gets **bitten and dies** (walkers do not turn animals in the default rule: animals are not infected, but are killed); a dog that goes outside the wall is lost. A **perimeter dog run inside the wall** is the best use. Dogs are also **comfort**: stress -3.
- **The bunker and hiding** (existing `bunkerHide.ts`, `bunkerLife.ts`, `bunkerEntrances.ts`):
  - A bunker is **excellent against walkers**: they cannot open a hatch or a steel lid; a hardened door holds forever.
  - But **sound and vibration leak**: a vent fan and a generator (the vent pipe is a noise source), talking, a baby's cry. At the surface, **a crowd forms at the hatch** (they go to the *last noise point*, and the hatch is the point): after a few days the **pile above the hatch** can **seal it with weight** (a steel lid under 15+ walkers cannot be lifted from below: a **hard lockout**). The family must wait: dispersal 7%/day only if silent for 3+ days (a quiet, cold, dark week with supplies running: the existing hiding cost of food and water for every person: 2,400 kcal and about 2.6 gallons a day).
  - Mitigation: **two entrances** (the tunnel exit; the existing `tunnels.ts` and a *collapse* option), **a vent baffled** (a muffler; a long hose), a **silence discipline** (a bunker rule), and a **sound-proofed room**. A bunker's *hiding* role against **human** crews is the existing mechanic; against walkers its role is **a refuge for hours or days**, not for months.
  - Against **both** at once: a crew finds the hatch while walkers gather: the crew is attacked by the crowd (a nice reversal).
- **Hiding in the house** (stealth posture): walkers pass through; a **horde passing** (3 hours at 1 mph over a mile-long column of 300) calls a `hide` mini-event: noise events (a cough, a stomach, a door, a cat, a clock) are rolled; the stealth posture (dark house, quiet hours, curtains, dogs quiet, no cooking smoke) lowers it; it fails if one *sees* movement behind glass. A hidden compound that survives a horde pass is a *triumph beat*.
- **Gate and vetting** (`gateVetting.ts`, `guards.ts`, `insider.ts`): the **bite check**: with a strip search (a gate-side screen: remove coat and shirt in front of a guard) 70% of bites seen (a medic 90%); **hidden** bites in a bandage are caught at 40%. The **24-hour quarantine** (a cabin or a locked shed; a person inside a locked room) is the **perfect filter** (the 24-hour rule catches 95% of turnings): a bitten stranger turns *in a locked room*, on one's own terms. The cost: the cabin, a watcher, a quiet-kill backup, food and the moral weight.
- **Guards and towers** (existing): night guards on the wall are a **bite risk** at a low point and a **noise** if they shoot; *crossbow guards* are the poor-compound equivalent of snipers. A tower gives **early warning** of an approaching horde (visibility by terrain).
- **Insulation from the sight and the light**: tall opaque walls (a palisade with no slits) block line-of-sight so a walker sees no movement; **a wall with a gap** shows a person's movement to every walker facing it, so the **killing slit** is also a *lure* (the existing `sightlines` overlay shows exposure).
- **Seasons** (the climate engine):
  - Freezing: below **20 F** walkers stiffen (speed x0.4); below **10 F** they stop; they **thaw** above 25 F over 2-3 days: *the thaw wave*. In the Mountain West and North Woods the winter is a **quiet respite** from walkers and a **stress** from cold and hunger, and it ends with the thaw.
  - Heat: decay x1.6 above 85 F; desiccation quick in the desert (x1.5): walkers last 120 days, not 540. **Humidity** (Appalachia, Ozarks, PNW): decay x1.3, **mold and dysentery** from the dead.
  - Rain: reduces noise radius 30%; mud slows walkers (x0.8).
- **Fire**: walkers burn; the existing `raidFire.ts` arson and the wildfire model apply. A **fire line** or a **burning trench** (a tire or oil fire) kills walkers and *draws the horde at night* (light lure 1,500 ft), but consumes fuel. Burn the pile; **do not burn near the barn**.

### 5.5 Variants in one line each

- **outbreak (w3):** slow, bite-borne, only the bitten rise; the *classic* siege + noise puzzle; 2-year arc.
- **everyone_turns (w2):** every death is a hazard; heavy funerals; slow; the same noise rules.
- **rage (w1):** fast, alive, burning out in a month; the compound is a **short-term fortress** and then the game is human; the shortest and most brutal.

### 5.6 The hidden bite and the 24-hour rule

The core of the human drama: *a bite is a death sentence in 24 hours, and everyone knows it, so everyone hides it*. The game gives that a system:

- `bitten` is a hidden flag on any person (arrival, joiner, family member, guard) with a `since` time.
- **Detection:** strip search at the gate (a time cost and a dignity cost), a medic's exam, a **fever check** (a thermometer: a bitten person is 101-104 F by hour 6), the person's own confession, and **behavior** (a bitten guard becomes pale, sweats, hides his arm: a visible tell the stealth/bond system can notice: `bonds.ts` friends spot it first).
- **The family bite scene:** a card when a family member is bitten at the wall: *(a)* amputate now (Medic), *(b)* seclude in a locked room with a loved one beside them (a bedside scene; the player chooses who sits with them), *(c)* **put them down** before they turn, *(d)* deny and hide (the worst option: the turn happens in the house). In Cozy: *the bitten recovers after a bad week* (see above).
- **Joiner and neighbor requests**: "Please, I'm not bitten." Right half the time.

## 6. Regional variation

Walker pressure = **local population within 10 miles x the climate decay factor x the open sight**. The 11 regions:

| Region | Population pressure | Climate effect | Notes |
|---|---|---|---|
| Mountain West | Low (20 per sq mi near towns, 3 in the hills) | **Long freeze (Nov-Mar)**; dry; high-elevation sun; walkers frozen on the passes | The **thaw** is the signature; **tourist towns and interstates** funnel the turned along highways (I-80, I-90); long sight lines (a horde seen at 5 miles); best for a quiet compound; fewest raiders. |
| Appalachia | Moderate; scattered hollows | Humid: decay x1.3, mold; fog | Hollows **trap** walkers (a dead-end valley fills with them: a hazard); dense forest hides approach; **poor sight lines**; tight communities help each other. |
| Desert Southwest | Low-moderate with big cities (Phoenix, Albuquerque, Tucson) | **Heat desiccates walkers fast** (180-day lifespan); open sight lines; flash floods | Water is the real problem; walkers drawn to **a scarce water point** (a well pump's sound); the **heat** limits human movement at noon. |
| North Woods | Low | **Deep freeze**; lakes; few roads | Excellent isolation; walkers freeze on lakes; the thaw wave in April; winter is a refuge; wood heat smoke is the tell. |
| Great Plains | Low and flat | Dry; **long sight and sound** (no terrain to block); wind carries noise 1.5x | Open land means seen early (good) and **heard far** (bad); farm vehicle noise; grain elevators and silos as **fortresses**; **tornado and hail** as separate threats. |
| Pacific Northwest | High on the west side (Seattle-Portland) | Rain (noise x0.7), fog; decay x1.2; moss and mud | Rain masks sound; forests hide; the **I-5 corridor** pushes hordes; the best region for stealth, the worst for a *clear view*. |
| Upper Midwest | Moderate; Great Lakes cities | Deep freeze; lake-effect snow | Strong freeze-thaw cycle; **corn at full height hides** walkers in summer (a field crowd); Detroit and Milwaukee are sources of hordes. |
| New England | High (dense towns, Boston corridor) | Cold winters; stone walls; coastal humidity | **Old stone walls** and cellars are free defenses; towns are close; the *first* region to see a big refugee push; ocean and islands are refuges (a boat). |
| Ozarks | Moderate; many small towns | Humid; caves; heat | **Caves** hide and *hold walkers* (a cave mouth is a horde sink); karst sinkholes swallow them; forested. |
| Hill Country | Moderate, and an urban front (Austin, San Antonio) | Hot; limestone; flash floods | **Flash flood events** sweep walkers into the creek: a gift and a horror; heat desiccation; exurb sprawl nearby means **big counts** on the roads. |
| Rust Belt edge | **Highest** | Cold winters; industrial ruins | The biggest hordes; abandoned plants as fortress or trap; the compound is a target of the largest gangs; the freeze is a respite. |

(Existing `odds` for `zombies` is in the Scenario list only; regional odds are not needed unless the owner puts it in Surprise.)

## 7. What the player sees and hears (text only)

All through `radio.ts` bulletins, the day card, the CollapseChip, the wall report, and the cutscene overlay (captions).

- **Radio by phase** (the radio truth/rumor split applies; rules are *taught* by the radio):
  - Warning: "Hospitals in three cities report violent patients. Officials urge calm." "The CDC reminds you that a good emergency kit includes water, food, a radio and a flashlight" (the real CDC zombie post, said with a straight face).
  - First day: "Do not approach anyone who appears ill. Do not let them bite you. If someone is injured, keep them apart." (Emergency Alert, official.)
  - First week: "Reports from the city say the dead are walking. This is not a drill. Stay indoors. Aim for the head." (a ham operator, the first rule leaked). "Fort Collins safe zone is accepting survivors" (uncertain). "The Guard has fallen back to the river."
  - Month 1: ham chatter, long silences, *counts* ("My wall had 41 last night."), a **numbers message** on a loop; a farmer's tip ("they come to the light, not the smoke").
  - Month 6: "The thaw is on. Expect them off the high passes." A rumor of a cure. A settlement's broadcast: "Hamlet at Cedar Ridge, 60 people, trade fair on Saturdays."
  - Year 1: the first ordinary human transmissions; a church bell.
- **Day cards:** the **night report**: "Night 12. Walkers at the wall: 23. Kills: 9 (pike 8, rifle 1). New arrivals after the shot: 14." "Noise: moderate (generator off, dog quiet). Light: dark." "Pile: 6 dead at the east wall (drag and burn)." "Fuel: 40%. Ammo: 211." Short, concrete, countable.
- **Wall overlay** (Blueprint): a **crowd density heatmap** along the walls, load in lb per foot per segment, weak spots flagged (the existing weak-spot overlay), the **signature disc** (noise and light radius ring), and the sightline arrows.
- **Visuals** (`collapseLook` existing: green glow, fires; add): a slow, shuffling silhouette pack on the road at dusk, fog at dawn with shapes, **fires on the horizon**, a **town's lit windows going out one by one**, a solitary figure at the fence line with a **tilted head**, frozen walkers in snow, bones in the field in year 2. Silhouettes; the figure kit has existing person models; walkers use a **gait and color** (grey desaturated, torn clothes) variation in the instanced people (no new assets; procedural); gore is **not shown**: death is implied by the camera and the caption.
- **Sound as text**: "A moan from the east wall." "The dog stops barking." (since there is no audio, the *log lines* carry it).

## 8. Player decisions and strategies; rich vs. poor

### The decisions

1. **Before the hit:** wall type and gate; a kill window; **blackout curtains and no windows toward the road**; quiet weapons; a **bite-check station** and a **24-hour quarantine shed**; dogs trained quiet; water and food for **stay-in**; a **two-entrance bunker** (`tunnels.ts`); firewood and a burn pit **away from the barn**.
2. **Noise discipline** each day: generator or not; shoot or pike; dogs inside or at the wall; chop wood at noon or not; **a bell** to call people.
3. **Light discipline** each night: dark house; floodlights off (the lit response off); lamps shielded; a **red lamp** inside.
4. **The gate:** who comes in (bite check, 24-hour hold), who is turned away, who is shot at the gate (a *bitten supplicant*).
5. **The bitten family member** (5.6).
6. **The salvage run:** quiet entry, a hand tool, back before dusk; a rope line; a **truck is loud**; go on foot or by bicycle; walkers are the *risk* and the humans the other.
7. **When to open** and **to move**: the month-6 thaw; a **safe zone** (real or fraud); a hamlet; leaving the land (a rare ending).
8. **Humans:** negotiate with a crew (existing `negotiation.ts`), hide, fight; **use the walkers** against raiders (a *lure of your own*: the compound sets a siren far away to pull a horde onto a crew camped in the field: a morally gray, effective trick); **protect the neighbors** and share night watch.
9. **The ethical rules** of the house: who sits with the dying; whether to put the turned neighbor down.

### Rich vs. poor

| | Rich | Poor |
|---|---|---|
| Walls | Concrete or CMU walls, a **steel gate with a sally port**, a **catwalk**; floods the perimeter with lights (a *mistake* here) or uses **IR cameras and thermal scopes** (silent: *they see walkers* at 800 ft with no light). | A palisade of set logs, a ditch, a hog-wire apron, a *pike and a hammer*. No lights. |
| Noise | **Suppressed rifles** (a $1,000 can plus a rifle), **crossbows**, a quiet **electric** vehicle and a solar array with a **battery**, a soundproofed bunker; a **generator in a buried room**. | A bow, a long pole, a quiet dog, a muffled generator or none, and **animals kept silent** (no rooster). |
| Bunker | A filtered, two-entrance, soundproofed bunker; supplies for 12 months. | A root cellar with a trapdoor under the rug and 2 weeks of food. |
| People | A paid guard team (existing `guards.ts`) and a vetting protocol, a physician; **an insider risk**. | The family and the neighbors; trust; **no insider**. |
| Failure | Reliance on *loud tech* (generators, floodlights, guns) that **draws the horde**; the fortress is a **lure**; a rich compound also draws bigger *human* crews (its fortress reputation); the money buys **speed** (hours of construction) and **capacity** (a bigger wall) but each is a signature. | A thin wall under crowd pressure; labor-intensive nights; no margin for a mistake; a single bite hits hard (a quarter of the household). |
| Edge | Can **build the answer before the hit**. | Can **be quiet from the start** and does not need to *change* its habits. |

Both win; the rich-compound lesson is "quiet beats loud", the poor-compound lesson is "wall and pike and patience".

## 9. What makes it fun, not just punishing

- **A new verb: managing your signature.** Not "defend" but "be unseen and unheard and still get things done": a sound-and-light budget like a stealth game; the night report is a scoreboard of discipline.
- **Each night is a short, readable puzzle** (the wall report): how many, from where, what the signature was, what to do; a nightly loop that rewards attention.
- **Strong choices with no right answer**: the bitten child; the neighbor at the fence; the safe-zone broadcast; the truck-horn lure for a raid crew.
- **The seasons give a story arc**: the first night, the false peace, the frost, **the thaw**, the bones; a *plague with an end* that rewards patience (in contrast to the other, endless scenarios).
- **Quiet competence is rewarded**: a pike through a slit that kills without a sound feels better than a shotgun; the poor compound's low-tech path is *actually superior* in stealth.
- **Counter-trope rewards**: an immune joiner; the gore-camouflage run (a risky stunt); the **killing wall** built into a trap; a **dog that warns early**.
- **Variety**: three variants (the Romero slow, the Walking Dead everyone-turns, the Rage burn-out) and regions that change the plot (a thaw in Montana vs. a dry decay in Arizona).
- **Hope**: the *plague ends*: bones in year 2; hamlets, the first bus, the church bell.
- Cozy: **no family member dies for good** (the bitten recover; the unlucky are **wounded**, not turned), `signature` effects x0.6, walls x1.5 stronger, a longer warning; **Hardcore**: permadeath, no radio rule, +10 bite points, `rage` available.
- **Cutscene use** (existing raid cutscene pipeline): *walker pressure* at the wall can be a **cutscene scene type** (`captions` only; no gore): the gate holds, the gate bends, the gate gives.

## 10. Suggested numeric parameters and the hook seam

| Parameter | Cozy | Standard | Hardcore |
|---|---|---|---|
| Warning days | 8-24 | 5-15 | 2-6 |
| County turned share of pop at day 14 | 0.40 | 0.55 | 0.65 |
| Walker speed (fresh) | 1.0 mph | 1.2 mph | 1.5 mph (`rage`: 8 mph sprint) |
| Arrival rate inside the signature disc | 0.08 per night | 0.12 | 0.18 |
| Leakage from beyond | 0.2% | 0.4% | 0.7% |
| Dispersal when silent 3+ days | 10%/day | 7%/day | 4%/day |
| Bite infection (bare / clothed / suit) | 45 / 20 / 5 % | 85 / 40 / 10 % | 95 / 55 / 20 % |
| Incubation (hours, median) | 12 | 8 | 5 |
| Amputation save (within 2 h) | 60% | 40% | 15% |
| Family death for good | never (bitten recover) | by roll | permadeath |
| Noise and light radii | x0.7 | x1.0 | x1.25 |
| Wall rating | x1.3 | x1.0 | x0.85 |
| Decay stage lengths | x0.7 | x1.0 | x1.3 |
| Immune natural fraction | 1% | 0.3% | 0.1% |
| Quiet days before the first raid | 6 | 3 | 1 |
| Fate | (services never return; `rage` only: full 20 / partial 40 / never 40) | same | same |

KindFx mapping (WP4: `src/sim/disasters/zombies.ts` and a new pure `src/sim/walkers.ts` plus `walkers.test.ts`; shares `signature` inputs with `src/sim/stealth.ts`):

| Hook | Zombies implementation |
|---|---|
| `onWarning` | Seed the world's turned count `T` and its drift; rumor and CDC lines; ammo and tool price ramp; the first **road walker** (via `roadLead`) in the last 24 hours. |
| `onHit` | Set variant and decay clock; day-0 gate card; initial `wallCrowd`; kill the market (existing) and set the existing track curves. |
| `daily` | Update the signature (`stealth`); arrivals/dispersal/kills for `wallCrowd`; wall load per segment and damage (`WP6`'s `structureDamage` helper: **fail a wall segment** when load > rating; the existing `buildingDamage` seam); decay stages; freeze and thaw by temperature; **bitten** persons progress through incubation, fever, death, rise; neighbor fates; horde spawn on road; pile growth; body disposal labor. |
| `encounterWeights` | Replace `horde 60` with a derived weight from `wallCrowd` and stimulus; add `bitten_arrival`, `turned_neighbor`, `lure_raid`; refugees x0.5 (existing), traders x0.2 (existing), requisition 0 (existing); `cadence` x1.3 months 1-2. |
| `priceMods` | Barter list for quiet weapons, ammo, rope, bleach, boots; market closed (existing). |
| `buildingDamage` | Wall, gate and fence segments by crowd load (the new piece and the *first* disaster to make the compound's own wall take damage from the disaster itself). |
| `medical` | The bite and incubation model; amputation emergency; hidden-bite state; stress from night moaning; no cure. |
| `radioBulletins` | Section 7. |
| `oasisWeights` | Weight `law` and the *wall crowd density* so the compound reads as a lit island in a dead county. |
| `look` | Existing green glow and fires, plus walker silhouettes on the road at dusk, fog shapes, lit windows going out, the frozen-in-snow figure, bones in year 2. |

Instanced walkers: the world already instances people (`engine/world/people`, `game/people/`): add a **walker material and gait** (a second color, a head tilt animation, a stagger), with a **cap by quality** (High 250, Medium 120, Low 40 visible; the rest are numbers), within the existing perf budget (instanced and merged; no new draw-call growth beyond the existing people batch). Procedural art only.

State in the `fx` bag (no extra save field beyond WP0's): `fx.walkers = { T, stage mix (fresh, rot, dry), wallCrowd per segment, hordes[], signatureLog, bitten[], pile[], thawDay }`.

## 11. Chaining

- **From:** `pandemic` / `bioweapon` (the sick **never** become walkers in the base game; *a joke rumor only*), an unknown event (`unknown`: optional "the lights in the sky" origin; 5%).
- **Into (existing: none; proposed):**
  - **`lawless`**: already built in (law C(3,10,0)); no chain needed.
  - **`wildfire`** (10%, day 5-40): burning cities and the military's scorched-earth policy; the compound is fine behind a cleared perimeter, or not (a fire front chain).
  - **`grid_down`** (the existing `grid` curve): already included.
  - **`nuclear`** (3%, day 20-70): a **military last resort** on the largest cities (the Redeker analog): fallout instead of walkers in the second month. A very rare and dramatic chain.
  - **`civil_war` / `invasion`** (5%, day 60+): the surviving states and foreign powers; sees the *human* order forming.
  - **`crop_blight` / `drought`** (low): an unattended, unirrigated year: farm abandonment; **hunger** years follow the first summer (and `crop_blight`'s neighbor-hunger beat).
- **Second wave mode**: a **mutation** event (month 8-14): **the fast ones** (a faster stage in 5% of the new turnings) or **a spore zone**; a late-season **"new hit"** (a fresh outbreak in a nearby settlement because someone buried a dead body unburned).

## 12. Sources

- WHO, "Rabies" fact sheet (about 59,000 deaths a year; nearly 100% fatal after symptoms); CDC, "About Rabies" (incubation range).
- Hughes DP et al., "Behavioral mechanisms and morphological symptoms of zombie ants dying from fungal infection," *BMC Ecology* 11:13 (2011).
- Munz P, Hudea I, Imad J, Smith RJ, "When zombies attack!: mathematical modelling of an outbreak of zombie infection," in *Infectious Disease Modelling Research Progress* (2009).
- CDC Public Health Matters blog, "Preparedness 101: Zombie Apocalypse" (May 2011).
- Helbing D, Johansson A, Al-Abideen HZ, "Dynamics of crowd disasters: an empirical study," *Physical Review E* 75 (2007); Fruin J, *Pedestrian Planning and Design* (1971) (crowd pressure estimates).
- Brooks M, *The Zombie Survival Guide* (2003) and *World War Z* (2006); Romero G, *Night of the Living Dead* (1968), *Dawn of the Dead* (1978); Darabont, Kirkman, *The Walking Dead* (2010-); Boyle D, Garland A, *28 Days Later* (2002); Druckmann N, *The Last of Us* (2013-).
- Forensic taphonomy: Mann, Bass and Meadows, "Time since death and decomposition of the human body" (1990), for temperature and moisture effects.
- Internal: `src/sim/{disaster,encounters,battle,crewMercy,stealth,stealthState,bunkerHide,bunkerLife,gateVetting,guards,insider,pets,roadLead,scavenge,mind,medical,tunnels}.ts`; `docs/DISASTER_TEETH.md`; `docs/research_disasters.md` section 11.
