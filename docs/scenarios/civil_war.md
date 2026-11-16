# Scenario: civil_war (the war between the Cascade Compact and the Plains Alliance)

Kind id: `civil_war` (exists, pulpy unlockable; one militia encounter and a recruiter parley today). Factions stay fictional and non-partisan (research_disasters.md rule). Conventions in `README.md`.

## 1. Real-world basis and analogs

| Analog | What happened | Figures | Lesson |
|---|---|---|---|
| Bosnia 1992 to 1995 (Sarajevo and the countryside) | Neighbors turned; ethnic checkpoints; front lines through towns; sniper alleys. | The siege of Sarajevo ran 1,425 days (Apr 5, 1992 to Feb 29, 1996), average about 329 shells a day, a peak of 3,777 on July 22, 1993; more than 11,000 civilians killed in the city. Roughly 100,000 dead nationwide, about 2.2 million displaced. | The siege-city and the village both matter. Checkpoints taxed and robbed travelers. |
| Syria, from 2011 | Fragmenting front lines among government, many rebel groups, jihadists and Kurds. | More than 500,000 dead; about 6.8 million refugees abroad and about 6.7 million internally displaced. | Territory changes hands several times; each new flag brings new rules and reprisals. |
| Lebanon 1975 to 1990 | Militias by sect, the Green Line through Beirut; checkpoints that checked the religion on ID cards. | About 120,000 to 150,000 dead, roughly 1 million displaced. | A single checkpoint with an ID card can decide life or death. Neutrality was nearly impossible but possible with local deals. |
| Spanish Civil War 1936 to 1939 | Front lines across provinces; "paseos" (extrajudicial night killings); collectivization and requisition; the 1939 retreat across the border. | Roughly 300,000 to 500,000 dead; about 465,000 refugees crossed into France in early 1939. | Requisitions of grain and livestock by both sides; neighbors denounced neighbors; the war ended in exile and reprisal. |
| Sources | [Siege of Sarajevo (N1)](https://n1info.ba/english/news/siege-of-sarajevo-began-on-this-day-in-1992-1425-days-of-terror-and-survival), [Britannica](https://www.britannica.com/event/Siege-of-Sarajevo); other figures are widely cited (UNHCR Syria, Lebanese civil war scholarship, Preston on Spain) and should be rechecked before use on screen. |

## 2. Warning signs (20 to 60 days)

- Early: the Cascade Compact refuses federal orders; armed standoffs in two capitals. Notice: radio and a TV tag on the day card; neighbor flags appear on mailboxes (a visible sign on neighbor houses: two flag colors).
- Middle: the Plains Alliance seizes a federal depot; checkpoints on the state line; ammo and fuel prices x2; the feed store gets a militia recruiting poster. Notice: a "whose side?" question asked by a neighbor (a gate card that is free, but remembered).
- Late: fighting near a regional city; the interstate cut; militia recruiters at the feed store; trucks on the county road with no plates. Notice: the road traffic profile changes to convoys; distant light flashes at night (`collapseLook`).
- The player can decide before the hit: which flag to fly (or none), which neighbors to trust, whether to move kin away.

## 3. Phase timeline

| Phase | World | Compound |
|---|---|---|
| Hit moment | "The war reaches the valley: the Plains Alliance holds the town, the Compact the passes." The territory flag is rolled: who holds the town and who holds the road (see section 10). | A day card and a flag map. A checkpoint appears on the county road within 2 miles. |
| First hour | Convoys on the highway; a helicopter. | Nothing yet. |
| Day 1 | Town "purge": the other side's officials arrested; some neighbors disappear. | A neighbor asks "whose side are you on?" |
| Week 1 | The front stabilizes ten to thirty miles away; checkpoints stop, search, tax or turn back travelers; power flickers (sabotage). | First militia patrol visit: papers, a "contribution". |
| Month 1 | Supplies tax: requisition of grain, fuel, vehicles by whoever holds the road. Refugees of the other side arrive. | Recruiter returns for sons aged 17 to 40. |
| Month 3 | The line moves; your road changes hands. New rules, reprisals against whoever cooperated. Siege hunger in the nearest city. | You may be behind the lines, on the line, or in no man's land. |
| Month 6 | Ceasefire rumors; failed truce; war weariness; desertions bring armed deserters as a new raider type. | A deserter band 4 to 8 armed men turning bandit. |
| Year 1 | Stalemate or one side winning; a "peace of exhaustion" begins in the fate `full`. | Refugee camps near the town; disease risk. |
| Year 2+ | Armistice (reprisals, amnesty lists, rebuilding) or a divided country. | The compound's allegiance is the history in the end report. |

## 4. Effects

Tracks (variant `factions`, today's curves, permanent): law C(0,20,0.1,null), grid C(10,30,0.3,null), fuel C(0,20,0.2,null), banks C(0,10,0.1,null), stores C(5,30,0.3,null), deliveries C(5,30,0.2,null), medical C(10,40,0.3,null), phone C(5,20,0.4,null). Changes proposed: add a `frontline` variable (0 safe, 1 contested, 2 held by A, 3 held by B) in `disaster.fx` that rolls on a weekly random walk; when contested, grid and phone dip to 0.1 for 3 to 7 days.

- **Prices:** a faction script (scrip) circulates; money works only if `banks` above 0.5, otherwise a "Compact dollar" and "Alliance mark" price list shows (cosmetic names in the barter list). Fuel x4, medical x5, vegetables x2 (the Sarajevo "cigarette economy": a pack of cigarettes is the unit).
- **Shops:** one store open in the town the faction holds; sells only to those with an ID of the right side (a gate: with a pass, buy at x1.5 prices; without, black market x3).
- **Neighbors:** disposition shifts by flag. Some inform. Some flee. Those who fly the other flag may be attacked (a fire at a neighbor farm, an event).
- **Health:** wounded soldiers appear; typhoid and dysentery if the water supply is hit; no medicine.
- **Food and water:** requisition; the "siege" in the town makes the compound's surplus attractive.

Encounter mix (`militia` weight 25 at the hit, falling to 10 by month 6; `patrol` 8; `requisition` 12; `refugees` 2.0x; `gang` 0.7x as militias monopolize; `trader` 0.3x; new `deserters` encounter: temper `hard`, 4 to 8):
- Militia officers: organized, polite, written receipts; want "contributions" (10 to 20% stores), recruits, vehicles, a billet for 4 soldiers. `hard` temper; they do not kill the compound for refusing at first, but they mark it.
- Deserters: armed, desperate, will take hostages or kill if cornered; some are boys of 17 and cry; they speak in broken sentences.
- Refugees: from the other side or from the city. Untrained, scared: "We have papers. Please. Our daughter is sick."
- Snipers: a persistent threat from a ridge within range; outdoor tasks in his arc have a hit chance; covered paths and berms negate (research_disasters.md rule).

## 5. Factions, checkpoints, requisitions, collaboration vs resistance

Factions: Cascade Compact (west, passes, green-gray), Plains Alliance (east, town, red-brown); local militia detachments of each; neutral committee. Standing per faction 0 to 100, in `fx`. Helping one lowers the other by half the amount. Neutrality needs a neighbor-community score of 60 or hidden stores.

Checkpoints: on the county road (the nearest `countyCrossings` gap marked as a post). Stances: `flag_pay` (toll 5% of the load, or a pack of cigarettes), `flag_pass` (papers), `flag_bluff`, `flag_shoot` (extreme, makes a faction hunt). A faction's pass (a stamped paper) is a held item for 30 days.

Requisition schedule (every 14 days from week 2): X% of visible stores (hidden caches safe unless an informant roll succeeds, p 0.15 per day if a neighbor informs), a vehicle, a spare room. A receipt (a "bond") is useless unless that faction wins the war.

Conscription: a draft notice for each adult male 18 to 45 (and later women, in the fate `never`); comply (lose labor, +Standing, family safe), hide (bunker or a false wall; discovered with p 0.1 per search), pay (a bribe of 2 to 4 silver or $2,000 early), or resist (violent). Compliance changes the person into an NPC soldier who may come home on leave at day 60 or never.

Humanity: sheltering fugitives of the other side +8 humanity, but a reprisal risk; informing on a neighbor -15; paying the militia -2; refusing wounded of either side -6.

Collaboration vs resistance paths: Collaborate (stand with the holding faction): safe now, reprisals if it loses (a 40% chance in the fate `partial`); Resist (hide, sabotage, feed partisans): reward intel and a hidden network; risk reprisal burning of outbuildings; Neutral (pay both): costs 15% stores per month, rarely safe.

## 6. Regional variation

| Region | Notes |
|---|---|
| mountain_west | Passes and the interstate held by the Compact side; Plains Alliance holds ranch country; lots of militia, long sightlines; checkpoints on every pass. |
| appalachia | Hollow feuds merge into the war; many veterans; both sides recruit; ambushes on single-lane roads. |
| desert | Open front, truck columns, drone-light nights; water convoys targeted. |
| north_woods | Rear area: refugees and deserters; little fighting; border proximity. |
| plains | The Alliance heartland, the grain depot is the prize, requisition heavy; combines taken. |
| pnw | The Compact heartland; port seizure; refugees from cities; politicized neighborhoods. |
| upper_midwest | Contested middle: front moves often; industrial towns raided for supplies. |
| new_england | Rear area for the Compact; town meetings split; draft and refugees. |
| ozarks | Guerrilla country (as in 1861 to 1865 bushwhackers); neighbors informing; reprisal burnings. |
| hill_country | Alliance side by default; German-American historic neutrality; heavy armed community. |
| rust_belt | Industrial front: the factories are the prize; both sides requisition trucks and men. |

## 7. What the player sees and hears

Radio: two rival broadcasts with different casualty counts; a cease-fire announcement then a denial; CB: "checkpoint at the grain elevator, no papers no pass"; a pastor reading a list of the missing; a ham net: "Compact column on Route 12". Day card examples: "Day 4. Artillery, far off, all night." "Day 18. Recruiter at the gate. He knew your son's name." Hit title: "The war has reached the valley."

## 8. Decisions and rich vs poor

Decide: flag (or none), whether to hide sons, whether to feed partisans, whether to leave. Rich: pay for papers (forged or bought passes $3,000 early), bribes at checkpoints, send kin out before the hit, buy fuel (before day 5), hire guards (who will switch sides if unpaid). Poor: walk the back roads (the `back_roads` stance), trade labor for papers, hide in the woods, depend on kin networks.

## 9. What makes it fun

Social and political strategy rather than a wave of raiders: reading neighbors, the checkpoint as a puzzle, the moral cost of each side. The sniper arc gives tactical building (covered walkways). The war's outcome is a hidden fate that resolves into an ending where past choices come due.

## 10. Numbers and hook seam

Add variants: `factions` (default, as above), `uprising` (shorter: warn 10 to 30, law C(0,10,0.2,[300,700],60), grid C(5,20,0.5,[200,500])), `partition` (slow: warn 40 to 90, front rarely moves, banks C(20,60,0.4,[300,900])). `frontline` holder: weekly roll `holder(t+7) = holder(t)` with 85%, flip 15%; at 'contested' tracks dip.
Hook seam, file `src/sim/disasters/civil_war.ts` plus the pure `src/sim/occupation.ts` (WP3; shared with invasion): `onHit` rolls the holder; `daily` runs requisition and conscription clocks; `encounterWeights` per section 4 with `deserters` via `ExtraEncounterKind`; `priceMods` scrip rule; `radioBulletins` two voices; `oasisWeights` (law x2, deliveries x1.5, medical x1.5) so contrast reads even when the grid is up; `look` convoys and fires. Parameters: requisition 10 to 20% of visible stores each 14 days; draft age 18 to 45; checkpoint toll 5%; sniper hit chance 0.02 per outdoor hour in arc; informant p 0.15 per day per hostile neighbor. Difficulty: Cozy halves requisition and removes the draft; Hardcore doubles requisition frequency.

## 11. Chaining

Into: `lawless` (posse consolidates), `financial` (inflation of war), `mass_exodus` (a front rolling over a county triggers refugee columns). Out of: `lawless` (when the armistice fails, 35% after year 1), `pandemic` (camps, 15%), `global_famine` (10%). Can run with `invasion` as a "foreign backing" modifier (a faction has foreign advisers: stronger militia).
