# Scenario: lawless (the end of the rule of law)

Kind id: `lawless` (exists, in the Surprise pool; chain target of 8 other kinds). Today it is the `law` track alone. This doc maps what it should be. Conventions (tracks, encounter kinds, tempers, humanity) are in `README.md`.

## 1. Real-world basis and analogs

| Analog | What happened | Figures | Lesson for the game |
|---|---|---|---|
| Argentina, Dec 2001 | Bank withdrawal cap (the corralito, Dec 1, about $250 a week), supermarket looting from Dec 18, a state of siege on Dec 19, president resigned Dec 20, five presidents in about two weeks. | At least 39 killed in the riots (later count; early reports said 16 to 25). Peso went from 1:1 to roughly 3.9:1 by mid-2002. Poverty passed 50%. Barter clubs (trueque) grew to millions of members. | Collapse of order starts as a money event. Cities riot, countryside organizes barter. |
| Los Angeles, Apr 29 to May 4, 1992 | Riots after the King verdict; police withdrew from South LA for the first night. | 63 dead, about 2,400 injured, about 12,000 arrests, about $1 billion damage; roughly 10,000 Guard and federal troops brought in. Korean-American shopkeepers defended stores with rifles from rooftops. | A power vacuum of 6 hours to 2 days is enough for armed self-defense to appear. Order returned in 6 days because the state still existed. |
| New Orleans, Katrina, Aug 29, 2005 | Levees failed, about 80% of the city flooded, communications and police command broke down. | About 1,800 deaths in the storm, about 1 million displaced, roughly 30,000 in the Superdome. Many officers absent or quit; neighborhood vigilante groups formed (Algiers Point); police at Gretna blocked a bridge to evacuees. | Rumor outran fact (reports of mass murder in the Superdome were mostly false). Checkpoints by neighbors appeared in 48 hours. |
| Venezuela, 2013 to 2021 | Slow state failure: hyperinflation (IMF estimate over 100,000% in 2018), colectivos (armed pro-government gangs), prison gangs, kidnappings, a national blackout March 7, 2019 lasting days. | GDP fell about 75% 2013 to 2021; more than 7 million emigrated. | Not one day but a decade. Cash becomes worthless first, then power, then police become one more gang. |
| Somalia, from Jan 1991 | The Barre regime fell; clan militias; no central government for decades. | The 1991 to 1992 famine killed roughly 250,000 to 300,000. Road checkpoints (tolls) run by clan militias; customary law (xeer) and the mobile phone network worked without a state. | Where no state exists, clan and kin become the law. Tolls at roadblocks are the economy of the road. |
| Bosnia, 1992 (Selco's accounts) | First weeks chaotic, then armed groups controlled food and movement. | See `civil_war.md`. | Having a group was the difference between life and death. |

Sources: [Argentina December 2001 riots (Wikipedia)](https://www.wikipedia.org/wiki/Argentinazo), [UPI, Dec 20, 2001](https://www.upi.com/Archives/2001/12/20/Argentinas-president-resigns/9021008824400/), [Taipei Times, Dec 21, 2001](https://www.taipeitimes.com/News/front/archives/2001/12/21/0000116692); LA, Katrina, Venezuela, Somalia figures are commonly cited public numbers (Los Angeles Times 1992 coverage, FEMA/NOAA Katrina reports, IMF WEO 2019, UN 1992 famine reports) and should be rechecked before they go on screen. Existing research: `docs/research_disasters.md` section 3.

## 2. Warning signs and how the player notices them (7 to 20 days)

- Days 20 to 12 (hint stage 1): police union overtime dispute; sheriff on the radio asking people to "be patient"; a neighbor's quad stolen and no deputy comes. Notice: radio news line, a neighbor card on the day card.
- Days 12 to 5: looting in the city, deputies stop answering past the county line, the pawn shop is out of guns and ammo, price of ammunition up 3x at the farm store (market tab). Notice: shop prices, a "no stock" tag on ammo.
- Last 5 days: sheriff's office closed "until further notice", a gang working farms east of town, neighbors set up a roadblock at the bridge. Notice: a new map marker (the neighbor roadblock at the nearest county crossing), a night glow on the town horizon (`collapseLook` warm smoke).
- Distinguishing tell per variant (so a careful player can infer the shape): walkout has "unpaid" and "budget" lines; jailbreak has "released early" and "escaped" lines; failed state has "currency" and "ministry" lines.
- The player never sees the variant name. The report card names it.

## 3. Phase timeline (default variant, the walkout)

| Phase | World | Compound |
|---|---|---|
| Hit moment | Sheriff's dispatch goes silent; the highway patrol cars are gone from the interstate overpass. A text headline: "Nobody is coming." | A day card, 1 pause. No physical change: grid, phone, banks all up. |
| First hour | Town traffic jams; the grocery has a line out the door. | Nothing at the gate yet. The player sets watch and closes gate by choice. |
| Day 1 | Town looting: pharmacy, gun store, liquor store, big-box. | Phone calls from kin; a "kin" encounter may ask to come. |
| Week 1 | Rural quiet (criminals hit dense, easy targets). Neighbors form a watch. Gas stations run dry by day 3 to 5 in town. | First "probing" visit (a man looking for a lost dog). The first outbuilding theft. |
| Month 1 | Gangs form around drug crews and ex-cons; roadblocks, some community, some predatory. Delivery trucks stop on the county road. | Raids of 3 to 6 at dusk or dawn; first tolls demanded at the bridge. |
| Month 3 | A strongman or posse controls the town and the feed store. Protection "taxes" on farms. Kidnapping for ransom begins. | Organized raids 6 to 12; ransom encounters; neighbors split into allies and marks. |
| Month 6 | Bank, grid and stores slowly return in the fate "full" case; otherwise a county militia government forms. | Watch fatigue is the main killer: 4 adults cannot hold 24 hours. |
| Year 1 | A deal with the militia or a returning state with reprisals and amnesties. | Compound is a landmark: either an ally of the order or a target of it. |
| Year 2+ | Stable local order (warlord, committee, or sheriff returns). | Trade routes open if you chose a side; the humanity grade is the legacy. |

## 4. Effects by track, prices, and people

Tracks (default walkout; law falls at day 0 over 10 days to 0, back at 180 to 540; stores/deliveries/banks fall slowly to 0.1 as supply chains stop being safe, grid/phone mostly fine):

- **grid**: up (1.0) unless a chained kind hits it. Lawless alone leaves power on, which is the honest feel of Argentina 2001 and LA 1992. Utility crews are the first thing the roadblocks stop: a "line down" repair takes 3x longer (daily roll).
- **fuel**: 0.9 to 0.5 over a month; stations run dry because tankers do not drive unescorted, not because oil is gone.
- **stores**: slow fall (5 days) to 0.1: panic buying, then shoplifting and closure.
- **deliveries**: to 0.1 in 3 days (trucks hijacked on the interstate). `canOrder` false from about day 4.
- **medical**: 0.6 floor; ERs only treat paying or armed patrons; gunshot cases cost 2 supplies.
- **law**: to 0 by day 10. This is the lever for raid cadence.
- **phone**: up. Dispatch calls to 911 answer with a recording (day-card line); a "call_911" stance resolves as "no one comes" with a humanity-neutral message.
- **banks**: to 0.1 over 3 days (branches closed, ATMs empty). `moneyWorks` false at stores or banks under 0.5, so barter prices take over around day 5.

Prices: ammo, fuel, antibiotics 3x by day 7, 8x by month 3 in cash; in barter (silver, 5.56, a pound of coffee) a gallon of gas is about 2 rounds of .22 per quart at month 1. Salt, matches, and batteries are the small-change goods (Argentina barter clubs, Sarajevo).

People: neighbors split three ways (watch pact, hoarders, predators). With `law` below 0.5 groups form: neighbor raids begin day 14 as already coded.

Health: wounds, infection, no ambulance; stress (watch fatigue). Food and water unaffected at first.

Encounter mix (multipliers on the `whoComes` baseline; temper by month):
- **looters** 2.0x early (day 3 to 30): desperate, 2 to 4 people, take food, leave if shot at. Temper `desperate`: spare children, flee when 25% down.
- **gang** 2.5x from week 3: 5 to 12, armed, want trucks, fuel, women's and children's things not sold, meds. Temper `hard`. Some take captives for ransom (`ransom` kind). `savage` crews (Road-style) appear from month 4 only if the fate is "never", weight rises with `law` still at 0: they kill all but take children, who can be rescued via `rescue.ts`.
- **militia** (posse, "neighborhood watch gone wrong"): from month 2: offer protection for a tithe of 10% of stores (the Somali toll, Rhodesian farm net).
- **trader** 0.4x: only escorted caravans, and they want silver, ammo.
- **refugees** 1.2x as towns fall; **kin** appear.
- Untrained civilians (the scared neighbor, a family of four from town) speak in short, broken lines: "Please. Not mine. Kids in the car." Gang members speak in clipped, flat lines; hard leaders speak courteously with a price.

## 5. Factions, checkpoints, choices, humanity

Factions: (1) the neighbor watch (the Maple Road committee) , (2) the strongman's posse, (3) the remnant sheriff and 4 deputies, (4) the drifter gangs. Each has a `Standing` number (0 to 100) stored in the `disaster.fx` bag (WP0).

Checkpoints: the county road bridge (uses `countyCrossings` gaps, consumer only). Roadblock resolves with existing `flag_pay`, `flag_pass`, `flag_bluff`, `flag_shoot`.

Requisition-like choices: the posse's protection tithe (accept: stores -10% a month, raiders -50% from other gangs, humanity -2 because you fund them; refuse: raids x1.5; fight: you may break them if the watch pact is formed).

Humanity: take in strangers +6, turn away -8 (existing). Add: shooting a looter child at the fence -25, paying ransom for a stranger +4, salvaging an abandoned house: if the owners are dead no change, if the owners are in hiding -6 (found later).

## 6. Regional variation (all 11 regions)

| Region | Notes |
|---|---|
| mountain_west | Thin population, long response times already; sheriff shut means ranch militias and elk poachers; fewer gangs but more hunters; mountain passes plugged by toll gangs. |
| appalachia | Strong kin networks, meth and feud histories; crews are local and know you; stills and shine are barter; hollows hide. |
| desert | Smuggling corridors; cartel-adjacent crews, fuel and water hijack; open sightlines. |
| north_woods | Very few people, very few raiders; cold is the enemy; snowmobiles as raider vehicles; small townships govern themselves. |
| plains | Open, sightlines long, farm tractors and grain are targets; Agric-Alert style radio nets (Rhodesian pattern) work well. |
| pnw | Dense towns to the west; homeless camps and a lot of arrivals; rain and fog help raiders approach; port city refugees. |
| upper_midwest | Industrial towns, union culture, good community watch; lake-effect snow limits mobility. |
| new_england | Town meetings keep order longer (law falls slower, floor 0.15), stone walls, many second homes empty (salvage). |
| ozarks | Hollows, hunters, militia culture; many armed neighbors so fewer gangs but more standoffs. |
| hill_country | Texas ranch culture, high gun ownership, wealthy retirees as targets; border proximity raises raid weight. |
| rust_belt | Highest raid cadence (x1.4): idle factories, many exhausted towns, opioid crews; also most scrap, tools and salvage. |

## 7. What the player sees and hears (text only)

Radio: the sheriff's last message; a county commissioner meeting that breaks into shouting; a church network announcing a watch roster; a trucker CB line "toll at mile 41, 2 gallons or a rifle"; a ham net naming which towns hold and which fell. Later bulletins: "The Maple Road committee has an agreement with the posse." Day card: "Day 9. Smoke over town. A shot, then three." Title card at the hit: "Nobody is coming."

## 8. Decisions and strategies; rich vs poor

- Fortify and hold (cost: watch labor, ammo), join a pact (cost: autonomy, risk of the pact betraying you), pay the toll (cost: stores), go gray (no light at night, hide stock; costs yield), or leave (cost: the compound).
- Rich: prepaid armed guards (hire 2 contractors for $400 a day in the first week; they leave at day 20 unless paid in silver), armored gate, pre-stocked 6 months, bribes at the bridge (a $500 envelope buys a free pass for 30 days while banks work), a generator and a radio net. Money buys speed and safe passage in weeks 1 to 3; after bank failure only silver and goods matter.
- Poor: slower by hand; labor-intensive watch; trade labor for protection with a richer neighbor (a work-for-shelter deal), cheaper hides (cellar false wall).

## 9. What makes it fun

The choices are social: who you trust, what you pay. The raiders are not a wave: they are the neighbors, the sheriff's deputy turned collector, the scared family. Small victories: a barter ring, a pact, a rescued child. Gating the punishment: the first two weeks are quiet, which gives time to prepare; Cozy difficulty lengthens it to 14 days and lowers `savage` weight to 0.

## 10. Suggested numeric parameters and the hook seam

Variants (replace the single `collapse` variant):
- `walkout` weight 3: law C(0,10,0,[180,540],60); stores C(0,5,0.1,[150,500]); deliveries C(0,3,0.1,[150,500]); banks C(0,3,0.1,[150,500]); fuel C(2,20,0.4,[120,420]); medical C(5,30,0.6,[200,500]).
- `blackout_of_order` (Katrina, short and hot) weight 2: law C(0,2,0,[20,60],14); stores C(0,2,0.1,[25,70]); deliveries C(0,2,0,[25,70]); grid C(0,1,0.2,[10,45]); phone C(0,1,0.3,[10,40]); fate leans `full` (70%).
- `drift` (Venezuela/Somalia) weight 1: law C(0,30,0.02,null); banks C(0,10,0.05,null); stores C(10,60,0.2,null); grid C(40,90,0.4,null); phone C(60,90,0.4,null); permanent.
Warn 7 to 20 unchanged (hyperinflation variant of financial is the Argentina route).

Hook seam (`KindFx` in `src/sim/disasterFx.ts`, file `src/sim/disasters/lawless.ts`):
- `encounterWeights`: the multipliers in section 4; adds an extra encounter kind `tollkeeper` through `ExtraEncounterKind` (WP0 rule).
- `daily`: neighbor groups form, posse tithe demand every 30 days, repair times x3, watch pact roll.
- `priceMods`: ammo, fuel, antibiotics curves above; cash discount tied to the `banks` track.
- `radioBulletins`: the lines in section 7. `oasisWeights`: weight `law` x2 and `stores` x1.5 so the contrast reads even with the grid up.
- `look`: warm smoke, no blackout. Teeth test: Econ, Raiders, NPC, Med, UI, Oasis columns all R.

## 11. Chaining

Into: `financial` (50%), `grid_down` (35%), `nuclear` (60%), `ash_winter` (40%), `solar_flare` (45%), `pandemic` (20%), `cyberattack` (25%). Out of: `civil_war` (posse consolidates, 25% after month 6), `mass_exodus` (towns empty, 30%), `global_famine` (month 4 if the fate is `never`, 20%). Chained lawless inherits the parent's grid, so "lawless + grid_down" is the harsh case; chained after a disaster, shorten the warning to 0 and use the `drift` variant at 30%.
