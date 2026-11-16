# Scenario: Coordinated cyberattack (`cyberattack`)

A state actor or a criminal group attacks the control systems of the grid, water, fuel pipelines, and the banking and payment networks. The defining feel is **uncertainty and partial failure**: things work, then do not, and nobody knows what is true. Today this is the most toothless kind in the audit (a grid-down with banks hit). This doc gives it its own mechanics: smart-device bricking, payment blackouts, rumors, and a recovery that is as much about trust as repair.

Confidence tags: **(v)** verified, **(c)** commonly cited, **(d)** design estimate.

## 1. Real-world basis and analogs

| Event | Figures | Lesson |
|---|---|---|
| Ukraine grid, Dec 23, 2015 | About 225,000 customers off for 1 to 6 hours across three distribution companies; attackers took over operator consoles, opened breakers, bricked serial-to-Ethernet converter firmware, and jammed the call center (v, CCDCOE). Restored by sending staff to switch breakers by hand. | Manual operation saved them. A US grid has fewer manual operators. |
| Ukraine, Dec 2016 (Industroyer / CrashOverride) | A Kyiv transmission substation, about 200 MW (about a fifth of the city's load), an hour off (c). | A rehearsal for a bigger weapon. |
| Colonial Pipeline, May 7 to 12, 2021 | The 5,500-mile line that carries about 45% of East Coast fuel was shut by its operator after ransomware hit the billing side; the ransom was 75 bitcoin (about $4.4 million, about $2.3 million recovered); panic buying emptied up to about 69% of North Carolina stations (v, in `research_disasters.md`); 6 days (c). | Fear and hoarding do the damage; the pipeline was shut as a precaution. |
| NotPetya, June 2017 | Disguised as ransomware, it wiped about 600 firms; Maersk's loss about $300 million (it rebuilt 4,000 servers and 45,000 PCs, using one surviving domain controller in Ghana (c)), Merck about $870 million; global damage estimated near $10 billion (c). | Even without power loss, a wiper stops commerce, ports, pharma, and mail. |
| Oldsmar, Florida water plant, Feb 2021 | An intruder raised sodium hydroxide dosing to 100 times normal; an operator reversed it (c). | A human watching saved them. |
| Viasat KA-SAT, Feb 24, 2022 | A wiper bricked tens of thousands of modems across Europe, including remote control of about 5,800 wind turbines in Germany (c). | Consumer devices are infrastructure. |
| Volt Typhoon (2023 to 2024) | CISA, FBI and NSA warned of pre-positioned malware in US utilities, pipelines and ports (c). | The attack may be in place years before it is used. |
| Scale benchmark | Lights Out (Koppel 2015) argues a grid attack in a US interconnection could take weeks to months to recover, with no national plan (c). | Plausible tail risk. |

Key distinction from `grid_down`: the equipment may be intact, but **its software is bricked, and nobody can trust the network**. Recovery is a rebuild of firmware, trust and supply chains, in days to months, not a replacement of copper.

## 2. Warning signs and how to notice them

Warning window 5 to 20 days (`warn: [5, 20]`). Realistic warning is soft.

- A ransomware attack shuts a regional hospital or a county government (news).
- Card payment outages at a big retail chain: the self-checkout flashes "cash only" at the farm store.
- A pipeline operator announces "an incident" and shuts a line; panic buying: the gas station has a line (Colonial pattern).
- A neighbor's bank app shows a zero balance for a few hours "temporarily".
- Wi-Fi cameras and smart plugs act odd; a smart thermostat resets. (The player's own devices: a `SmartDevices` panel on the Home screen flags "firmware update failed" on the smart well controller; a warning icon is available to a player who bothers to look.)
- CISA warns utilities. The radio news calls it "a pattern".
- False alarm texts: a bogus emergency alert (a rumor engine seed).

## 3. Phase-by-phase timeline

| Phase | World | Compound |
|---|---|---|
| **Hit** | Many systems fail at once: grid in two or three regions, card and bank networks, water treatment, pipelines, GPS and routing, partial phones. | Smart devices roll a `CyberFailure`: smart well controller, Wi-Fi cameras and locks, inverter app (the inverter itself works without the app), smart thermostat. Dumb equivalents are untouched. |
| **First hour** | Confusion. Radios report conflicting causes. Some places have power, some not. | A text card: "The map shows three counties dark. The next county is lit. Nobody can say why." |
| **Day 1** | Cards and ATMs dead or flaky; cash only; gas stations closed (pumps are networked); a rush on cash and fuel. | Cash window: stores accept cash only for about a week; after that, shelves are empty. A player with small bills buys now. |
| **Week 1** | Utility crews restore by hand where manual operation is possible; rumors of a "FEMA distribution point" draw crowds (a false rumor leads to an ambush or a crowd). | A ham or GMRS contact lets you `Verify` rumors at the cost of time. False rumors cost fuel and exposure. |
| **Month 1** | Partial restoration and repeat attacks. Information chaos: forged alerts, deepfakes. Banking records corrupted: balances uncertain. | Electricity returns in pieces; banks fail to reconcile; cash is king; payroll jobs stall. |
| **Month 3** | A cash-and-barter economy in some regions; banks reopen with limits; fuel restored to priority users. | The compound's spare inverter and a dumb well pump look prescient. |
| **Month 6** | Most services restored with rolling blackouts; distrust of anything networked. Analog redundancy returns to practice. | A normalization period; the player decides what to reconnect. |
| **Year 1** | Fate `full` (65%): restored. `partial`: a patchwork. `never` (8%): a deeper grid-down. | Rebuild with a smaller smart footprint. |
| **Year 2+** | An analogue-first society: paper ledgers, manual overrides, cash. | |

## 4. Effects on tracks, prices, shops, barter, neighbors, raiders, health, food and water

Tracks: **banks fall first** (hour 0), **phone** next (partially), then **fuel** (pipeline and pump networks), then **grid** (regional), then **deliveries** (routing, GPS), then **stores** (JIT inventory). **medical** is hit by record systems (electronic charts down, pharmacy dispensing delayed), then falls more slowly. **law** holds but stretched (no dispatch). The distinctive curve: **partial and flickering** (a track that bounces: a daily jitter of plus or minus 15% on grid, phone and banks for the first month, `d`). Prices: panic spike in the first 3 days (fuel x2 to x3, food x1.4), then scarcity. Shops: cash only; some shops accept hand-written IOUs. Barter: fuel, cash in small bills, ammo, batteries, a working radio, **printed maps** (GPS down). Neighbors: initially calm; fuel rush at the gas station; rumors; community watch around day 10. Raiders: law holds more than in grid-down; the main danger is **misinformation** (false distribution point, rumor of your stockpile): ambush encounters from false tips. Health: electronic health records down; patients on pumps and ventilators at risk; water plant dosing errors (boil notices, 2 to 14 days). Food and water: municipal water uncertain; wells with smart controllers bricked unless a manual override exists.

## 5. What fails, what protects, the wealth principle

| Thing | Fate | What protects |
|---|---|---|
| Smart well controller, smart lock, cameras, thermostat, app-only inverter | `CyberFailure` chance 55% (Hardcore 70%, Cozy 35%) (d) | The dumb version, a manual override, a physical key, a spare controller kept offline |
| Payment cards, phone banking | Dead | Cash in small bills; barter; a ledger |
| Router, modem, and cloud-tied backups | Compromised | Offline backup, paper manuals |
| GPS-routed tractors and trucks | Degrade | Paper maps, compass, a local guide |
| Old equipment with no firmware (mechanical pumps, relays, a wood stove) | Immune | Keep one |
| Radios | Fine (unless internet-tied) | Ham, GMRS, crank AM; verify news |

**Wealth principle.** Money buys redundancy: a dumb well pump alongside the smart one, a manual valve bypass on every system, offline spares, a safe full of small bills, a ham license. The rich compound runs a two-tier setup (smart for convenience, dumb for safety). The poor compound already has the old gear and no smart devices: it is, ironically, resilient but has no remote cameras or comfort. **Cash is the only hedge here**: an hour before the hit it buys nothing; a week before the hit it buys everything. After the first week, the cash window closes.

## 6. Regional variation

| Region | Effect |
|---|---|
| Rust Belt, New England, Upper Midwest | Dense and interconnected, heavy reliance on payment rails; the Colonial-type fuel rush is worst in the Eastern states (Appalachia, Rust Belt, New England: the Colonial and Northeast corridors); fuel supply `x1.3` severity (d). |
| Appalachia, Ozarks | Fewer smart devices, more manual operation; recover faster; co-ops are small. |
| Mountain West, Plains, North Woods | Long lines, co-op SCADA; fewer attacks but hard to repair remote sites; a single failing pump stops a ranch's water. |
| Desert | Water SCADA and pumping is the killer (Phoenix, Tucson); heat. |
| Hill Country | ERCOT islanded: independent restoration, no help from the rest. |
| PNW | Hydro control networks and ports; bridges. |

## 7. What the player sees and hears

News is an event in itself: a **rumor** with a hidden truth value. Radio and day cards: T-5: "Ransomware shuts a hospital in the city." T-1: "A pipeline operator reports an incident." Hit: "Multiple outages; officials say cause is under investigation." Day 1: "Banks advise customers to use cash." Day 3: "A distribution point at the county fairgrounds, 8 a.m." (TRUE or FALSE, `Verify` needed). Week 2: "Government attributes the attack to a foreign state; no retaliation announced." Month 2: "Another attack: the lights go out again in the east." Comms degrade as: phone flaky for days; the internet poisoned with false info; **radio becomes the verification tool**; ham nets cross-check. Forged alerts: an emergency alert in text with a false instruction ("shelter in place" during a safe window, costing the player a day of chores or a trip).

## 8. Player decisions and strategies

Which smart devices to keep; whether to install manual overrides; how much cash to hold in small bills; whether to verify rumors by radio (time) or act (risk); whether to share power and information with neighbors; whether to reconnect after restoration. A paper journal of verified facts becomes a game item (a notebook that reduces rumor cost).

## 9. What makes it fun and not just punishing

The rumor engine is a mystery game: each bulletin is a puzzle, and a ham contact turns uncertainty into knowledge. The smart-vs-dumb choice is a real build decision from the first day. Compared to grid-down, nothing is certain: some days the lights are on and you must choose whether to trust it. The player who prepared with analog redundancy feels clever. Failures are partial and recoverable, so the drama is about attention, not endurance.

## 10. Suggested parameters and the hook seam

| Variant | weight | grid | fuel | stores | deliveries | medical | law | phone | banks |
|---|---|---|---|---|---|---|---|---|---|
| payments_and_pipeline (new) | 3 | C(0,0,.8,[7,30]) | C(0,3,.3,[7,45]) | C(2,6,.5,[10,50]) | C(1,5,.5,[10,50]) | C(3,6,.7,[10,50]) | C(20,30,.7,[20,60]) | C(0,2,.5,[5,30]) | C(0,0,0,[10,60],20) |
| existing `cyberattack` | 6 | (existing, banks floor 0.3) | | | | | | | |
| grid_and_water (new, severe) | 2 | C(0,0,.1,[14,120],30) | C(0,2,.1,[16,125]) | C(1,4,.2,[20,130]) | C(0,2,.2,[20,130]) | C(3,8,.25,[20,130]) | C(10,25,.4,[30,140]) | C(0,2,.3,[10,100]) | C(0,0,0,[14,120]) |
| wiper (NotPetya-like, new) | 1 | C(0,0,.9,null) | C(0,0,.8,[7,30]) | C(2,5,.5,[20,90]) | C(0,2,.3,[20,90]) | C(1,4,.6,[20,90]) | none | C(0,1,.7,[5,40]) | C(0,0,0,[20,100],30) |

Fate odds existing `[0.65, 0.27, 0.08]`. Flicker: grid, phone and banks multiply by `1 + 0.15 * sin(day * 1.7 + seed)` for 30 days (d).

Hook seam:
- `onWarning`: add `SmartDevices` panel flags and a "firmware update failed" hint; seed a rumor feed; raise the cash price premium of small bills? (no; keep cash steady).
- `onHit`: per smart device roll `CyberFailure` (55%); mark the well controller bricked unless a manual override or a spare exists; set `fx.cashWindowDays = 7`; end payroll jobs (income from outside jobs stops); set `fx.rumors = [...]` with truth flags.
- `daily`: the rumor queue releases items; `Verify` costs 1 hour of the radio operator; acting on false rumors triggers `ambush_tip` or `fuel_wasted` events.
- `encounterWeights`: `ambush_tip` x1.5 early; `fuel_thief` x2 at the gas rush; refugees low.
- `priceMods`: a fuel spike day 0 to 7 (panic), cash-only premium.
- `medical`: dosing errors at municipal water plants set a boil notice.
- `radioBulletins`: the list above plus forged alerts.
- `oasisWeights`: banks and phone count double; "smart house" vs "dumb house" contrast panel in the report card.
- `buildingDamage`: none.

## 11. Chaining possibilities

- `financial` 40% after 14 to 60 days: banks corrupted records become a bank holiday (research doc: strongly linked).
- `grid_down` as the escalation (the severe variant is grid-down with firmware damage).
- `lawless` 25% after 30 to 90 days (existing).
- `oil_shock` (the pipeline variant with repeat attacks).
- `satellite_loss` (GPS spoofing and satellite attacks): 15%.
