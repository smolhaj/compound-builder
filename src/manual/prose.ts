/**
 * The hand-written part of the player manual. Each section is markdown with `{{gen:name}}` where a generated table goes
 * (src/manual/gen, expanded by build.ts). Write for the player: plain words, U.S. units, no developer talk.
 * Rule (CLAUDE.md): a new player-facing system adds its entry here or a generator for it, then runs `npm run manual`.
 */
export interface ProseSection { id: string; title: string; about: string; md: string }

export const GLOSSARY: ReadonlyArray<readonly [string, string]> = [
  ['Airlock', 'A two-door chamber on a dome. People and vehicles pass through it so the air inside stays sealed.'],
  ['Board', 'The clipboard drawer (N): vitals, the wave clock, what is different today, the radio and the log.'],
  ['Chip', 'One of the status badges in the top bar: threat, cash, food, water, power, needs, defense, morale, fuel.'],
  ['Chronicle', 'The family\'s written history: births, deaths, weddings, eras. Find it in the Years drawer.'],
  ['Cozy, Standard, Hardcore', 'The three difficulty levels. Cozy warns early and nobody dies for good; Hardcore warns late, hits hard and is permadeath.'],
  ['Dome', 'A large enclosure over part of the place: earthen, geodesic, glass or arcology. It shields from weather and fallout and holds its own climate.'],
  ['Drawer', 'A panel that slides in from the right (or left) with its own hotkey. Only one is open at a time.'],
  ['Era', 'One disaster and what follows it. A family can live through several; the next era is rolled once the world settles.'],
  ['Face cord', 'A third of a cord of firewood: the unit the Shop sells it in.'],
  ['Fortress score', 'How hard the place is to take. Opportunists keep away from a hard place.'],
  ['Gate card', 'The decision that appears when someone arrives at the gate: take in, turn away, parley, warn off, defend and more.'],
  ['Hookup', 'The wiring or plumbing that joins a building to the power and water networks. The game does it for you within reach.'],
  ['Insider', 'A guard or newcomer who works for someone else and leaks the layout or opens the gate. A background check clears a person for good.'],
  ['Joiner', 'A newcomer who asks to stay. They bring cash, tools, food, sometimes a vehicle or a dog.'],
  ['Kin', 'Relatives who arrive and ask to stay.'],
  ['Operational', 'The five-line checklist: shelter, water, power, food, defense. A compound is operational when all five are in place.'],
  ['Pantry', 'The stored food, item by item, each with its own shelf life.'],
  ['Parley', 'Talking with a crew at the gate. A good negotiator can send them away for little.'],
  ['Pulpy', 'A disaster that is not grounded in real life (zombies, invasion, asteroid). Marked as such in the lists.'],
  ['Quarters', 'Where each household sleeps. Crowding causes illness and trouble.'],
  ['Quick-buy', 'The Shop\'s helper that fills the order with what the household is missing, without buying a one-time item twice.'],
  ['Ring', 'A line of defense: the outer wall, an inner yard, the house. A raid falls back ring by ring.'],
  ['Sally gate', 'A gate with two doors so a crew cannot rush through at once.'],
  ['Sandbox', 'A run that is not graded: Free build and God Mode, and the rich starts.'],
  ['Shelf life', 'How long a stored good keeps. Past it, food spoils slowly, medicine loses strength and gas goes stale.'],
  ['Track', 'One of the outside systems that fail in a disaster: grid, fuel, stores, deliveries, hospitals, police, phones, banks.'],
  ['Vetting', 'Checking arrivals at the gates before they come in, to catch a sick person, a thief or a scout.'],
  ['Wave', 'A scheduled raid. The wave clock shows how long until the next one and how big it will be.'],
];

export const PROSE: readonly ProseSection[] = [
  {
    id: 'welcome', title: 'Welcome', about: 'What the game is and how to use this manual',
    md: `Compound Builder asks you to build the family compound you would want when everything falls apart, then find out whether you were right. Building is the game: where you put the well, how thick the wall is, how far the house sits from the road. The disaster tests the build. It does not replace it.

A run has phases. **Peacetime** is a few years of cozy building under money, jobs, permits and neighbors. **Warning signs** follow: prices climb and the news gets darker. Then the **disaster**, then **survival**, and at the end a **report card** that tells you what your choices were worth. In Surprise mode you do not know which disaster is coming, so a good build hedges.

Fights are not twitch combat. A raid plays out from your walls, your sightlines, your people and your orders. The design is your skill.

This manual is generated from the game itself: every price, building, disaster, key and choice below is read from the same data the game runs on, so it stays current. The same text is in the game as the **Field Guide** (press I).`,
  },
  {
    id: 'first-hour', title: 'Your first hour', about: 'A walkthrough from an empty lot to an operational compound',
    md: `### Start the game

Pick a mode, a difficulty and a place on the new-game screen (see *Starting out* below). In Surprise mode you get several years of peace. In Scenario mode you pick the disaster and the time to prepare. The setup screen also shows the land: acreage, water, soil and whether a house stands on it.

### Read the goal card

The top of the screen shows one goal at a time, "2 of 6". The goals are the **Get operational** checklist: a roof, water, food, power, a driveway and a fence. A goal the land already meets is not listed. Each goal has a reason, a button and an honest time estimate, and says what to do when cash is short.

### Do these in order

- **A roof.** Open **Build** (B) and stake a house. The Build menu shows what each piece costs if the family builds it and with a hired crew. A county permit can add a wait before work starts.
- **Water.** A hand-dug well is cheap and slow. A drilled well gives far more water but needs power for the pump. A cistern stores rain.
- **Food.** Check **Supplies** (S). Quick-buy in the Shop (M) will top the pantry up to 30 or 90 days.
- **Power.** Solar, a generator, a battery shed. Buildings join the networks on their own when they are close enough.
- **The way in and a fence.** A drive that works in snow, and a wall or fence with a gate.

### Learn the screen

The bar at the bottom opens the panels. The bar at the top is the clock and the chips. Hover anything for a card. Panels you do not need yet appear as the game decides they matter, so the screen starts small. Press **Esc** to close the top thing.

### Before the warning signs

Keep a cash reserve. The game warns you before it lets you spend yourself below the money you need to live on. Buy food and water before the shelves empty. Read the news ticker and the Board: warning signs come in three stages, early, middle and the last days.

The checklist rows, as the game words them:

{{gen:operational}}`,
  },
  {
    id: 'pillars', title: 'The four pillars', about: 'Food, water, power and defense',
    md: `Every compound stands on four things. If one fails, the others carry it for a while and then they do not.

### Food

Food is kept item by item in the pantry, and each item has a shelf life: sealed rice and beans last decades, flour a year, cans two to five years, frozen food about a year if the freezer has power. Mice get into sacks unless you trap or build a vault. Grow what you can: gardens, fields, orchards, a greenhouse, chickens, goats, bees and a fishpond. Crops follow the season and soil, and you can preserve with canning, drying and smoking, or store in a root cellar. The **food chip** counts days of pantry at the family's pace.

Stock for a sensible number of days with Quick-buy, then work toward growing your own.

### Water

A family drinks and washes with far more water than it expects. See the numbers below. A well gives a steady supply if its pump has power; a hand pump works without it; a cistern collects rain; a pond waters the garden but is not for drinking. Ground water can be hard, or carry iron or arsenic, and some regions have deep water tables. A filter makes stored water safe. The **water chip** shows days of stored water, or "Source OK" when a working well keeps the tanks full.

{{gen:utility-facts}}

The buildings that make and store water and power:

{{gen:utility-buildings}}

### Power

Power runs the pump, the freezer, the lights and the dome's climate. You build sources (solar, a generator, wind or falling water) and storage (batteries), and the game wires buildings to the network when they are within reach. Solar follows the season and the sky; a generator needs fuel, and gasoline goes stale in about six months unless you add a stabilizer. When the grid dies, the **power chip** shows what you can make yourself. Priorities decide which loads are cut first when there is a shortfall.

### Defense

Defense is layers: a property line, walls and fences, gates, towers, lights, dogs, guards, an armory, a safe room, and the people who use them. The **defense chip** gives one number. The Defense drawer (D) breaks it into pages: the score, staff and reputation, walls and towers, the ground, houses, the road and checks. Higher walls cost more and take longer, and anything that shows food or light also tells the world you have it. A hard place makes opportunists keep away; a place with something to steal draws crews who are willing to try. See *Raids*.`,
  },
  {
    id: 'hud', title: 'Reading the screen', about: 'The top bar, the bottom bar, the drawers and every key',
    md: `### The top bar

The clock and speed buttons (pause, then 1x to 4x) sit on the left, then the chips. A chip carries a symbol as well as a color, so you never rely on color alone. Hover for the reasons and a button that opens the right place.

{{gen:chips}}

### The panels

{{gen:drawers}}

### Pages inside the panels

A long panel shows one page at a time, chosen with the row of chips under its title.

{{gen:drawer-pages}}

### Keys

Letters open panels only in the Diorama camera and not while a tool is armed or a window is up.

{{gen:hotkeys}}

### Views and cameras

The bottom bar also has building views (Walls, Cutaway, X-ray), Underground, and the cameras: Diorama (orbit and pan), Walk, Fly and Tour. The View box holds the season and weather look, graphics quality, the frame rate cap and the overlays: Blueprint, Sightlines, Terrain, Weak spots and the property line. Photo mode keeps captioned pictures in an album and the chronicle.

### Graphics quality

{{gen:quality}}

If the frame rate stays low, the game steps down one tier by itself. It never steps back up; you do that.`,
  },
  {
    id: 'starting', title: 'Starting out', about: 'Modes, difficulty, regions and the money you begin with',
    md: `### Modes

{{gen:modes}}

Peace lengths: {{gen:peace}}

### Difficulty

{{gen:difficulty}}

### Regions

Each region has its own weather, land price, soil, water, wildlife, house styles and disaster odds.

{{gen:regions}}

### The land

The lot you are offered has a shape: {{gen:lots}}.

### How the family lives

{{gen:lifestyles}}

### Rich starts

{{gen:rich-starts}}`,
  },
  {
    id: 'shop', title: 'The Shop', about: 'Every good for sale, its unit, price and buying advice',
    md: `The Shop (M) sells everything raw. Prices are 2025 rural retail prices, rounded, and they move with the news: they climb in the warning signs and in shortage. Orders arrive after a short wait. After the banks fail you pay cash from the safe, and later it is goods for goods.

**Quick-buy** helps fill an order. It never buys a one-time item twice. Its advice per good is in the last column of each table. These kits fill several shelves at once:

{{gen:shop-presets}}

### Food

{{gen:shop-food}}

### Shelves

Prices are at the start of a game on Standard.

{{gen:shop-goods}}

### Other goods

{{gen:shop-other}}`,
  },
  {
    id: 'build', title: 'The build kit', about: 'Every building, wall and line with its cost',
    md: `Open **Build** (B), pick a piece and place it. Rotate with **R**. A building shows its footprint, what it gives, and two bills: the cash if the family builds it themselves (using their own logs and labor) and the cash with a hired crew. Work takes the household's hours, so distance and skill matter. Some pieces need a county permit and a wait.

Prices below are at the start of a game on Standard. Fences, walls and lines are priced per 100 feet.

{{gen:build-kit}}`,
  },
  {
    id: 'dome', title: 'Domes', about: 'The four enclosure tiers',
    md: `A dome shelters part of the place from weather and fallout and keeps its own air and climate. It has a buried skirt so tunnelers cannot dig under it, and an airlock and sally port as its main entrance. Size it while placing with **+** and **-**. A sealed dome has a finite air supply until you add an air plant, and it needs power to hold its climate. The Utilities drawer has a Dome page for lockdown, the air clock, filtering, the closed ecology and climate.

{{gen:dome-tiers}}`,
  },
  {
    id: 'threats', title: 'Disasters and threats', about: 'Every disaster, the storms, and the yearly threats',
    md: `One main disaster hits each era, and some chain into another. The warning signs begin days or weeks before.

### What fails

A disaster is a set of curves on eight outside systems, each of which falls and may come back:

{{gen:tracks}}

### The disasters

{{gen:disasters}}

### Weather

Storms come by region and season, quite apart from the big disaster.

{{gen:storms}}

### Yearly threats

If the world has not recovered, a small new threat can arrive each autumn from a year after the hit. Cozy has none; Standard has half strength; Hardcore full.

{{gen:yearly-threats}}`,
  },
  {
    id: 'raids', title: 'Raids', about: 'Gate cards, parleys, orders and the wave clock',
    md: `Hostile crews arrive in **waves** on a schedule you can read: quiet, then warning signs (smoke on the horizon, chatter on the radio, an empty road), then the wave, then a lull and a bigger one. The wave clock is in the Board and the top bar's threat chip. A wave is an ordinary raid, with an arrival, a battle, an aftermath, and a cutscene you can watch.

Each wave grows with the collapse. A well-defended place draws a somewhat larger and better-equipped crew, but defense is never worse than none: every defensive element adds to the odds.

### At the gate

When someone arrives, a card asks what to do. The choices you see depend on who they are. Some can be talked to; a crew under a white flag has its own choices; a crew that is spotted early may be scouts.

{{gen:gate-choices}}

### Scouts

{{gen:scouts}}

### Orders in the fight

You can give orders as the fight plays. {{gen:stages}}

{{gen:orders}}

### Afterward

The aftermath covers the dead and wounded, burial, cleanup, prisoners and questioning (kind or harsh), loot, hostages and fire. Wounds last, and some of your people may not come back the same.

### Vetting arrivals

With two rings of defense you can check people at one gate, the other, or both. Each look takes guard hours and has a chance to catch a sick person, a thief or a scout; skilled medics and negotiators catch more. An inner-gate check is sharper because the person has been under watch for days.`,
  },
  {
    id: 'long-game', title: 'The long game', about: 'Eras, family, and a world that stays broken',
    md: `When the first disaster has run its course, you can keep playing. The era closes with a grade in the chronicle, and once the world settles, the next era is rolled from where this one left it. Only a wipe ends the line. The **Years** drawer (Y) holds the family's chronicle, eras and milestones, and an album.

A world that does not recover brings new threats each year (see *Disasters and threats*). Children grow up, kin arrive, joiners come and go, and neighbors remember how you treated them. Orphans may be taken in by a neighbor. On Cozy, later years bring property tax, insurance and a comfort level.

At the hamlet stage the household can hold votes on house rules. Joiners choose where to stay: a spare bed, a rig, a modular home or a place you build.`,
  },
  {
    id: 'tips', title: 'Strategy tips', about: 'What experienced players do',
    md: `- **Water and food first, defense second, beauty last.** A thirsty family leaves no matter how tall the wall.
- **Keep a reserve.** Never spend below the cash you need to live on, and fill the pantry before prices climb.
- **Hedge.** In Surprise you do not know the disaster. A well that works by hand, a stove and stored fuel help in nearly every case.
- **Make your own power early.** The grid is the first thing to go in several disasters.
- **Layer the defense.** An outer wall, a yard, and a house you can hold. Orders let you fall back ring by ring.
- **Mind the light and the smoke.** A lit greenhouse or a chimney at night tells people you have something.
- **Put towers where the road can be seen,** and read the Sightlines overlay before choosing a spot.
- **Choose people carefully.** Check arrivals at the gate; an unvetted guard can be bought.
- **Let the crew build when time is short, and build yourself when cash is short.**
- **Check the Board each morning.** It lists what is different today and what waits on you.`,
  },
  {
    id: 'glossary', title: 'Glossary', about: 'Terms used in the game',
    md: `{{gen:glossary}}`,
  },
];
