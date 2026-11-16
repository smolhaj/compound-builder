# Scenario: Financial collapse (`financial`)

A banking crisis, sovereign default or currency failure. The power stays on, mostly. This is the disaster where the goods still exist and you cannot buy them with money you trust. **Owner default:** cash becomes **very dear but not worthless**, so gold, silver, food, tools and barter matter more, but a dollar still buys something. That design turns the existing "crash and bail-in" into a **purchasing-power curve**, which the audit flags as missing (`priceFactor` reads only `stores` and `deliveries`).

Confidence tags: **(v)** verified, **(c)** commonly cited, **(d)** design estimate.

## 1. Real-world basis and analogs

| Event | Figures | Lesson |
|---|---|---|
| Great Depression bank holiday, March 6 to 13, 1933 | Roosevelt closed all US banks for 8 days; about 9,000 banks failed in 1930 to 1933 (c); 1933 gold-clause and gold-holding order: citizens had to turn in gold coin at $20.67 an ounce, then the price was reset to $35 (c). | A bank holiday is survivable if it ends. Gold can be confiscated. |
| Weimar Germany, 1923 | The mark fell from about 4.2 trillion to the dollar in Nov 1923 (c); at the peak prices doubled about every 3.7 days (Cagan 1956, c); wages were paid twice a day, people carried cash in wheelbarrows; savers and pensions were wiped out; farmers hoarded and city dwellers walked to the countryside to trade household goods for food. | Those with real goods and debts in marks won; savers lost. |
| Zimbabwe, 2007 to 2008 | Monthly inflation peaked about 79.6 billion percent in Nov 2008 (Hanke, c); the 100-trillion-dollar note; dollarized in 2009 with US dollars and rand. | The final form is dollarization: foreign hard currency became money. |
| Venezuela, 2013 to 2020 | Inflation above 1,000,000% in 2018 by IMF estimate (c); 72 to 74% of people lost weight, about 8.7 kg on average in 2016 (v, in `research_disasters.md`); an estimated 7 million people left the country by 2022 (c); price controls led to empty shelves; dollars and remittances became the real economy. | Controls hollow out shelves; the dollar and remittances ran the markets. |
| Argentina, Dec 2001 | The **corralito**: withdrawals capped at 250 pesos a week from Dec 1, 2001; riots Dec 19 to 20 killed 39 and the president resigned (v, in `research_disasters.md`); dollar deposits were forcibly converted (pesification) at 1.4 pesos per dollar while the market rate went to about 3.9 (c); GDP fell about 11% in 2002; poverty above 50% (c). Barter clubs (trueque) at their peak had millions of members (c). | Savers were hit by conversion. Barter clubs formed. |
| Lebanon, 2019 to 2022 | The lira lost about 90% of its value (v, in `research_disasters.md`); banks capped withdrawals; the state grid fell to 3 to 4 hours a day and diesel generator owners ("generator mafias") filled the gap, in dollars. | Dollars mattered; private power was a business. |
| Cyprus, March 2013 | A bail-in: insured deposits spared, uninsured deposits above 100,000 euros in the largest banks lost about 47.5% (c) and capital controls on withdrawals for two years (c). | This is the real model for the bail-in already in the sim (30% over $250,000). |
| Black Monday, 1987 and 2008 | -22.6% in a day (1987); the S&P fell about 57% from 2007 to 2009 (c). | A crash is not the same as a bank holiday. |

## 2. Warning signs and how to notice them

Warning 30 to 90 days (`warn: [30, 90]`), the longest of the grounded kinds apart from drought. Signs are slow and public, which is the point: the player can see and decide.

- Two or three regional banks fail; a line outside a branch; "temporary" withdrawal limits.
- Grocery prices up 3 to 5% a month; shrinkflation, then specific shortages (formula, eggs).
- Gold at a record; the pawn shop is buying and the coin shop is out of silver eagles (price premiums over spot, `d`: 20% rising to 60% in the last month).
- The mill lays off a shift; a local business closes; a neighbor is laid off.
- Fuel price whipsaw. The local credit union posts a notice.
- In-game: the Bank screen shows "Interest rate 14%", "Limit $500 per day" and a "Run" meter; a stock ticker on the store's TV.

## 3. Phase-by-phase timeline

| Phase | World | Compound |
|---|---|---|
| **Hit** | Banks do not open: accounts frozen "until further notice" (bank_holiday) or the currency's purchasing power starts to evaporate (hyperinflation). | Savings and cash in the bank (checking accounts) frozen or limited; cash on hand is valid. |
| **First hour** | ATMs say "temporarily unavailable"; card readers fail or are limited. | Wallet cash is the only spendable money. |
| **Day 1** | Panic buying; stores accept cash only. Fuel lines. | A shopping window opens. |
| **Week 1** | Withdrawal cap ($250 a week, Argentina). Prices repriced daily; some stores close because they cannot reprice. Pot-banging protests. | Cash buys less each day: `cashFactor` falls 3 to 10% a week in `bank_holiday`, 20 to 60% a week in `hyperinflation` (d). |
| **Month 1** | Price controls lead to shortages. Riots in cities. Bail-in: the sim's existing 30% over $250,000 and safe-deposit fees; forced conversion of dollar accounts. | Gold and silver become the first hedge; premiums high; coins are sold for goods at a discount to melt value. |
| **Month 3** | A dual economy: dollar (or euro), barter, and a local script. Skilled trades paid in goods. Crime up: burglary of unattended homes, livestock rustling. | A "WealthSignal" from visible new builds draws attention. |
| **Month 6** | Inflation (if hyperinflation) in the thousands of percent per year; wages and pensions lag; emigration. Imports (medicine, parts, tires) vanish. | Parts and imported medicine are the scarce things; the compound's workshop and garden produce barter goods. |
| **Year 1** | A new currency or dollarization; or a long grind. Rolling blackouts begin as the maintenance budget dies. | Debts: if the player has a mortgage, hyperinflation shrinks it; bail-in or repossession threatens. |
| **Year 2+** | Slow normalization; infrastructure decays; the compound sits in a hollowed economy. | Skills, tools, and production decide income. |

## 4. Effects on tracks, prices, shops, barter, neighbors, raiders, health, food and water

Tracks (existing curves): `banks` collapses first (bank_holiday: `C(0,1,0.05,[90,300],60)`); `stores`, `deliveries`, `fuel` follow over 3 to 40 days to floors near 0.25 to 0.4; `medical` slowly (imports); `law` declines (corruption); **`grid` and `phone` stay up** (this is the point: `financial` should not drop grid below 0.7 for the first 6 months), later brownouts.

New: a **cash purchasing power** factor `cashPower(day)` (1 at the hit):
- bank_holiday: falls to 0.6 over 60 days and 0.35 by 12 months;
- hyperinflation: 0.8 at week 1, 0.3 at month 1, 0.08 at month 3, 0.02 at month 6, then dollarization (the player's cash stays a foreign hard currency: the "cash" is **dollars** and keeps value; a **local** currency becomes worthless). **Owner default: cash is very dear but not worthless**, so floor `cashPower` at 0.15 in both variants (the player's dollars buy something at barter-adjacent prices) and make the item value of gold, silver, food, tools and ammo 3 to 5 times the cash price on the barter market (`barter.ts`).

Shops: stores take cash at repriced numbers, or only barter; imported goods vanish; local food (eggs, milk) and labor stay. Barter: the Argentine trueque, Weimar farmers trading eggs for pianos; the compound's surplus is the currency. Neighbors: layoffs, desperation; a neighbor with debts asks for work. Raiders: **burglary** and **rustling** dominate (sustained low-level crime, not hordes); "isolated rural homesteads were most vulnerable to long violent home invasions" (c); the player's compound is attacked when unattended; corrupt deputies ask for a "fee". Health: imported medicine runs out (insulin, antibiotics), malnutrition in the cities (Venezuela's 8.7 kg). Food and water: food exists but costs; rural advantage.

## 5. What fails, what protects, the wealth principle

| Thing | Fate | What protects |
|---|---|---|
| Savings and bank balance | Frozen, converted, or bailed-in (30% over $250,000 in the sim) | Cash in a safe (small bills), gold and silver coin, land, tools, food stock |
| Pensions and fixed income | Eroded | Income from production |
| Paper investments | Crash 45% (existing) | Hard assets; cash flows |
| Debts | Hyperinflation shrinks them; bank holiday does not | Pay down when the hit is certain? (a decision) |
| Imported parts and medicine | Scarce | Stockpile in advance |
| Gold | Hard to spend for small things (Selco: "not very valuable at all") | Silver in small units, 90% silver junk coin, lead and copper for ammunition |

**Wealth principle.** In a currency collapse money in the bank dies and money turned into stuff survives. The rich compound moved wealth into land, tools, stockpiles, fuel, spare parts, and gold and silver coin, in advance; it can pay the hired hand in silver, pay the mechanic in diesel, and ride out a year. The poor compound has little to lose in the bank and little to trade: it survives by labor and production (eggs, firewood, repair work). **Showing wealth is a risk**: a new truck draws attention (`WealthSignal` for 30 days).

## 6. Regional variation

| Region | Effect |
|---|---|
| Rust Belt (odds x1.4, `lawless` x1.2) | Hit first and hardest: layoffs, bank fragility; close to desperate cities; best barter market. |
| Hill Country, Mountain West | Land-rich, cash-poor; ranches trade stock; Hill Country fuel prices spike with Texas energy swings. |
| Plains | Farmers hold grain (a real hedge); price controls may hit sellers. |
| Appalachia, Ozarks | Poverty already high; barter already normal; remittances and informal trade soften. |
| New England, PNW, Upper Midwest | Higher cost of living, high property values; a bail-in on large accounts hits more players. |
| Desert | Retirees on pensions; water costs; imported goods vulnerable. |
| North Woods | Isolation helps, but fuel costs drive winter. |

## 7. What the player sees and hears

Radio and day cards: T-60 "Two regional banks closed Friday." T-30 "Treasury says deposits are safe." T-10 "Withdrawal limits of $500 a day announced." Hit "The banks did not open Monday." Week 2: "Bread price: $9 a loaf." Month 2: "Government ties the dollar to 4,000 to one pound of flour" (a made-up price control example). Month 4: "Silver at $85 an ounce; the coin shop is closed." Month 8: "A new currency introduced; the old notes are worthless in 30 days." Comms: phone and radio work, which is the point: information flows, but trust in it falls. Neighbors on the road tell stories (a barter board at the feed store).

## 8. Player decisions and strategies

Sell or hold; pay down debt or keep it; what to buy with limited cash in the warning window (food, fuel, parts, ammo, seed, silver) versus staying liquid; whether to go to the bank on day 1; whether to hide production from the requisition officer; whether to hire labor; how to trade (silver for diesel, eggs for repairs). Keep the compound staffed (burglary).

## 9. What makes it fun and not just punishing

The player has **agency for a long time**: 30 to 90 days of warning, a visible economic dial, and real choices about which asset to hold. The barter economy turns a homestead into a shop: the repair bench, the egg stand, the forge. Seeing a Weimar-style price list on the radio is dramatic without cutting power. A player who invested in skills and tools becomes locally powerful. Punishment is slow and fair: nothing explodes at midnight, but the choice you made in the warning window compounds for a year.

## 10. Suggested parameters and the hook seam

| Variant | weight | banks | stores | deliveries | fuel | grid | law | `cashPower` |
|---|---|---|---|---|---|---|---|---|
| bank_holiday (existing) | 3 | C(0,1,.05,[90,300],60) | C(3,20,.3,[60,200],60) | C(5,25,.4,[60,200],60) | C(10,30,.4,[60,220],60) | none (>= .9) | slow | 1 -> .6 (60 d) -> .35 (365 d) |
| hyperinflation (existing) | 2 | C(0,20,0,[200,500],90) | C(10,40,.25,[150,450],90) | C(10,40,.3,[150,450],90) | C(15,30,.3,[150,450],90) | none | slow | .8 / .3 / .08 / .02 at 7 / 30 / 90 / 180 d, floor .15 |
| sovereign_default (new) | 1 | C(0,3,.2,[120,500],60) | C(15,60,.5,[200,500]) | C(15,60,.5,[200,500]) | C(10,40,.4,[200,500]) | late brownouts | slower | .5 / .25 / .15 floor |
| bail_in (new, short, Cyprus) | 1 | C(0,0,.2,[30,120],30) | none | none | none | none | none | .85 (floor), 30% over $250,000 gone, capital controls 120 d |

Fate odds existing `[0.40, 0.42, 0.18]`.

Hook seam:
- `onWarning`: ramp `cashPower` slightly; coin premium rises; withdrawal-limit banners; a "Run" meter.
- `onHit`: freeze account share (for bank_holiday: 90% of bank balance frozen until fate says; cash in hand unaffected); apply bail-in; raise `WealthSignal` rules; set `fx.cashPower0 = 1`.
- `daily`: update `cashPower`; apply to all `priceMods` via a `cashMultiplier` (a single multiplier on every cash price: price shown = base / cashPower, capped x6); requisition officer visit at day 20 and then monthly if `law` is corrupt.
- `encounterWeights`: `burglar_when_unattended` and `rustler` x2; gangs only with chain.
- `priceMods`: imports (medicine x5, parts x4, tires x4, fuel x3), local food x1.3; gold and silver in barter at 3 to 5 times cash value.
- `medical`: imported drugs scarcity.
- `radioBulletins`: price lists, rate announcements, bank news.
- `oasisWeights`: banks and stores weigh double; grid weighs less.
- `look`: unchanged (power on); optionally a "closed" sign on store props.

## 11. Chaining possibilities

- `lawless` 50% after 45 to 120 days (existing).
- `grid_down` (rolling blackouts as maintenance dies; the late tail): 25% after 180 to 400 days.
- `cyberattack` (cause of the bank holiday): a variant of `cyberattack.md` links directly.
- `civil_war` (pulpy): 10% after a year.
- `oil_shock` and `financial` often travel together (1973 to 1979 stagflation analog).
