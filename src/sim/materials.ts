/**
 * Materials: what the family buys, stockpiles and builds with. Abstract
 * bulk units a pickup / flatbed load is counted in. Prices are 2025 rural
 * retail (lumber yard, farm store, contractor quotes), rounded: a bundle of
 * about 50 boards and sheets ~$650, ready-mix ~$190 a yard, a cased 200 ft
 * well ~$11,000, a steel blast door ~$14,000.
 */
import { litersText } from './format';
export type MaterialId = 'lumber' | 'logs' | 'firewood' | 'fieldstone' | 'concrete' | 'roofing' | 'hardware' | 'wire' | 'seedlings' | 'container'
  | 'pipe' | 'cable' | 'fixtures' | 'pump' | 'drilling' | 'solar_panel' | 'battery' | 'inverter' | 'generator' | 'fuel' | 'tank' | 'septic_tank'
  | 'rebar' | 'membrane' | 'excavator' | 'blast_door' | 'nbc_filter' | 'spoil' | 'culvert' | 'egress_hatch'
  | 'lead_sheet' | 'faraday_mesh' | 'blast_valve' | 'filter_set'
  | 'fresh' | 'frozen' | 'canned' | 'staples' | 'meds' | 'seed' | 'lids' | 'plow' | 'stabilizer' | 'traps' | 'hygiene' | 'gun_safe' | 'gun_cleaning' | 'fishing_gear' | 'snares' | 'smoker' | 'goat' | 'pig' | 'steer' | 'rabbit' | 'hay' | 'feed' | 'water_jugs' | 'ibc_tote' | 'water_trailer' | 'water_filter' | 'ro_system' | 'softener' | 'greywater'
  | 'plate_carrier' | 'ifak' | 'nvg' | 'thermal' | 'radios' | 'cameras' | 'thermal_cam' | 'driveway_alarm' | 'floodlights' | 'blackout_curtains' | 'gen_baffles' | 'gen_vault' | 'tripwire' | 'dog' | 'puppy' | 'kibble' | 'dogbed' | 'doghouse' | 'steel_door' | 'window_bars' | 'sandbags' | 'safe_room' | 'sw_radio' | 'ham_rig' | 'helmet' | 'soft_armor'
  | 'grenades' | 'rpg_launcher' | 'rpg_rounds' | 'suppressor'
  | 'mines' | 'greenhouse_kit' | 'fruit_trees' | 'ground_sensor' | 'passage_hatch' | 'vehicle_parts'
  | 'bugout_bag' | 'bugout_cache' | 'security_door' | 'window_shutters' | 'ballistic_panels' | 'safe_room_hardened'
  | 'gun_mount' | 'turret_head' | 'ai_sensor_module'
  | 'tent' | 'sleeping_bag'
  | 'poly_film' | 'tunnel_kit_small' | 'tunnel_kit_high' | 'aqua_kit' | 'tilapia_fry'
  | 'hydro_set' | 'penstock' | 'wind_turbine' | 'tilt_tower'
  | 'greenhouse_pro_kit' | 'trout_fry' | 'crayfish_stock' | 'fish_feed' | 'sheep'
  // farm & kitchen (sim/crops.ts, sim/kitchen.ts)
  | 'seed_heirloom' | 'seed_saved' | 'seed_cover' | 'canner' | 'dehydrator' | 'crocks' | 'grain_mill' | 'manure' | 'compost'
  // the household's evenings and learning (sim/mind.ts, sim/skills.ts)
  | 'games' | 'instrument' | 'novels' | 'manuals'
  // the evenings' wear and restock goods, kids' things (sim/evenings.ts)
  | 'game_pieces' | 'guitar_strings' | 'music_player' | 'batteries' | 'paperbacks_bag' | 'toys' | 'picture_books'
  // classes and courses (sim/courses.ts): a book set (with a DVD) for each
  | 'course_firstaid' | 'course_ham' | 'course_engines' | 'course_welding' | 'course_carpentry' | 'course_wiring' | 'course_gardening' | 'course_husbandry' | 'course_canning'
  // medical depth (sim/medical.ts)
  | 'antibiotics' | 'splints' | 'ors' | 'dental_kit' | 'midwife_kit' | 'medical_books'
  // the herd, the bees and the sugar bush (sim/herd.ts, sim/bees.ts, sim/maple.ts)
  | 'cow' | 'cheese_kit' | 'vet_kit' | 'bee_nuc' | 'hive_supplies' | 'beeswax' | 'maple_taps';

export interface MaterialDef {
  id: MaterialId;
  name: string;
  /** What one unit is. */
  unit: string;
  /** Price per unit when bought (null = can't be bought). */
  price: number | null;
}

export const MATERIALS: Record<MaterialId, MaterialDef> = {
  lumber: { id: 'lumber', name: 'Lumber', unit: 'bundle (≈ 50 boards)', price: 650 },
  logs: { id: 'logs', name: 'Logs', unit: 'log', price: null },
  firewood: { id: 'firewood', name: 'Firewood', unit: 'rick (⅓ cord), seasoned, delivered', price: 110 },
  fieldstone: { id: 'fieldstone', name: 'Fieldstone', unit: 'pallet', price: 300 },
  concrete: { id: 'concrete', name: 'Concrete', unit: 'cubic yard (ready-mix)', price: 190 },
  roofing: { id: 'roofing', name: 'Metal roofing', unit: 'bundle of sheets', price: 450 },
  hardware: { id: 'hardware', name: 'Doors, windows & hardware', unit: 'kit: a door or a couple of windows, hinges, locks, fasteners', price: 900 },
  wire: { id: 'wire', name: 'Fence wire', unit: 'roll (400 m barbed / 100 m woven)', price: 140 },
  greenhouse_kit: { id: 'greenhouse_kit', name: 'Greenhouse kit', unit: '12 × 24 ft aluminum-frame greenhouse, twin-wall polycarbonate, door, vents, benches', price: 4500 },
  greenhouse_pro_kit: { id: 'greenhouse_pro_kit', name: 'Production greenhouse kit', unit: '9 × 24 m gutter-connected steel-hoop house, twin-wall polycarbonate, roof vents, a heater and thermal curtain', price: 24000 },
  fruit_trees: { id: 'fruit_trees', name: 'Fruit trees', unit: 'a bare-root semi-dwarf apple, pear, cherry or plum tree', price: 40 },
  seedlings: { id: 'seedlings', name: 'Hedge whips', unit: 'bundle of 25 bare-root', price: 75 },
  container: { id: 'container', name: 'Shipping container', unit: '40 ft used, delivered', price: 4800 },
  pipe: { id: 'pipe', name: 'PEX pipe & fittings', unit: '30 m coil + fittings', price: 150 },
  cable: { id: 'cable', name: 'Electrical cable', unit: '30 m direct-burial + conduit', price: 380 },
  fixtures: { id: 'fixtures', name: 'Plumbing fixtures', unit: 'sink, shower, water heater, toilet set', price: 2500 },
  pump: { id: 'pump', name: 'Well pump & pressure tank', unit: 'submersible pump kit', price: 2000 },
  drilling: { id: 'drilling', name: 'Well drilling', unit: 'contractor, ~60 m (200 ft) bore, cased', price: 11000 },
  solar_panel: { id: 'solar_panel', name: 'Solar panels', unit: '400 W panel', price: 260 },
  battery: { id: 'battery', name: 'Batteries', unit: '5 kWh LiFePO4 pack', price: 1900 },
  inverter: { id: 'inverter', name: 'Inverter / charger', unit: '6 kW off-grid', price: 2400 },
  generator: { id: 'generator', name: 'Generator', unit: '7 kW gas, electric start', price: 1300 },
  fuel: { id: 'fuel', name: 'Fuel', unit: '20 L jerry can', price: 22 },
  tank: { id: 'tank', name: 'Water tank', unit: '10,000 L poly tank', price: 3000 },
  septic_tank: { id: 'septic_tank', name: 'Septic tank', unit: '4,000 L concrete tank + leach pipe', price: 2400 },
  rebar: { id: 'rebar', name: 'Rebar', unit: 'bundle (20 × 6 m #4 bars, ties)', price: 240 },
  membrane: { id: 'membrane', name: 'Waterproofing membrane', unit: 'roll (≈ 20 m²)', price: 400 },
  excavator: { id: 'excavator', name: 'Excavator hire', unit: 'day (mini-excavator, delivered)', price: 650 },
  blast_door: { id: 'blast_door', name: 'Blast door', unit: 'steel blast door and frame', price: 14000 },
  nbc_filter: { id: 'nbc_filter', name: 'NBC air filter', unit: 'filtration unit, hand crank, blast valves', price: 9500 },
  spoil: { id: 'spoil', name: 'Spoil (dug earth)', unit: 'm³', price: null },
  culvert: { id: 'culvert', name: 'Tunnel vault', unit: '6 m of poured arch: forms, rebar, concrete', price: 3600 },
  egress_hatch: { id: 'egress_hatch', name: 'Egress hatch', unit: 'steel lid, collar, inside drop-bolts, ladder', price: 4500 },
  lead_sheet: { id: 'lead_sheet', name: 'Lead sheet', unit: '1 × 2 m sheet, 6 mm (≈ 135 kg)', price: 650 },
  faraday_mesh: { id: 'faraday_mesh', name: 'Faraday mesh', unit: 'roll of welded copper-clad mesh + bonding strap', price: 420 },
  blast_valve: { id: 'blast_valve', name: 'Blast valve', unit: 'spring-loaded vent valve', price: 2200 },
  fresh: { id: 'fresh', name: 'Fresh food', unit: 'basket (≈ 2,000 kcal: eggs, greens, roots)', price: null },
  frozen: { id: 'frozen', name: 'Freezer meat', unit: '5 kg (≈ 10,000 kcal)', price: 70 },
  canned: { id: 'canned', name: 'Canned food', unit: 'case of 12 (≈ 6,000 kcal)', price: 38 },
  staples: { id: 'staples', name: 'Bulk staples', unit: 'rice, beans, flour, oil (≈ 80,000 kcal, 25 kg)', price: 85 },
  meds: { id: 'meds', name: 'Medical supplies', unit: 'kit: dressings, antibiotics, painkillers', price: 160 },
  seed: { id: 'seed', name: 'Hybrid field seed', unit: 'a season for a quarter acre of certified hybrid seed potatoes, beans and wheat: about 12 % more crop the year it is sown and a third less hurt by blight and rust, but seed saved from it comes back at only about 80 %', price: 160 },
  seed_heirloom: { id: 'seed_heirloom', name: 'Heirloom field seed', unit: 'a season for a quarter acre of open-pollinated seed: an ordinary crop the first year, but the seed you save comes true and the line adapts to your place', price: 360 },
  seed_saved: { id: 'seed_saved', name: 'Saved seed', unit: 'a season for a quarter acre, kept back from your own harvest', price: null },
  seed_cover: { id: 'seed_cover', name: 'Cover-crop seed', unit: 'clover and vetch for one resting field: fixes nitrogen and builds the soil', price: 30 },
  canner: { id: 'canner', name: 'Pressure canner', unit: '23-quart dial-gauge pressure canner: the only safe way to can vegetables, meat and fish (water-bath is for tomatoes, fruit and pickles)', price: 320 },
  dehydrator: { id: 'dehydrator', name: 'Food dehydrator', unit: 'nine-tray electric dehydrator (about 600 W): dried fruit, vegetables and herbs that keep a year or two', price: 190 },
  crocks: { id: 'crocks', name: 'Fermenting crocks', unit: 'stoneware crocks with weights and airlocks: sauerkraut, pickles, kimchi. No lids, no canner, no power', price: 90 },
  grain_mill: { id: 'grain_mill', name: 'Grain mill', unit: 'a burr mill with a hand crank: wheat berries to flour, corn to meal', price: 120 },
  cow: { id: 'cow', name: 'Dairy cow', unit: 'a bred Jersey cow, fresh: about 3 gallons of milk a day for ten months, a calf each spring (hay, grain, a stall in winter)', price: 1800 },
  cheese_kit: { id: 'cheese_kit', name: 'Cheese-making kit', unit: 'press, molds, cheesecloth, cultures and rennet: hard cheese from the milk the family cannot drink', price: 70 },
  vet_kit: { id: 'vet_kit', name: 'Vet kit', unit: 'ten doses of dewormer, antibiotics, electrolytes and hoof and udder care for the barnyard', price: 90 },
  bee_nuc: { id: 'bee_nuc', name: 'Bee colony', unit: 'a five-frame nucleus colony with a laying queen, delivered in spring: honey, wax and pollination (needs an apiary)', price: 220 },
  hive_supplies: { id: 'hive_supplies', name: 'Hive supplies', unit: 'a year for the apiary: frames and foundation, mite strips, sugar for a lean fall, a smoker and a veil', price: 75 },
  beeswax: { id: 'beeswax', name: 'Beeswax', unit: 'a pound of cleaned wax: candles, salves, polish, trade', price: null },
  antibiotics: { id: 'antibiotics', name: 'Antibiotics', unit: 'a full course for one person, from the vet-and-farm supply or a prescription (scarce once the pharmacy shuts)', price: 70 },
  splints: { id: 'splints', name: 'Splint and bandage set', unit: 'moldable splints, elastic wraps, a sling and tape: sets about three broken limbs', price: 45 },
  ors: { id: 'ors', name: 'Rehydration salts', unit: 'a box of ten packets: a day of fluids for ten sick people', price: 25 },
  dental_kit: { id: 'dental_kit', name: 'Emergency dental kit', unit: 'temporary filling, dental instruments and a how-to sheet: one tooth', price: 80 },
  midwife_kit: { id: 'midwife_kit', name: 'Birthing kit', unit: 'clean sheets, gloves, cord clamps and a midwife\'s handbook: one delivery', price: 120 },
  medical_books: { id: 'medical_books', name: 'Medical books', unit: 'a home medical reference and a nursing handbook: the medic is a level better, and learns faster', price: 140 },
  games: { id: 'games', name: 'Cards and board games', unit: 'a box of decks, dice, checkers and board games: evenings for about four people', price: 60 },
  instrument: { id: 'instrument', name: 'A guitar', unit: 'acoustic guitar with a strap, spare strings and a songbook', price: 220 },
  novels: { id: 'novels', name: 'Paperbacks', unit: 'a box of fifty used novels and children\'s books', price: 90 },
  game_pieces: { id: 'game_pieces', name: 'Cards, dice and game pieces', unit: 'new decks, a bag of dice, tokens and the pieces the old games lost: makes a worn-out games box whole again', price: 15 },
  guitar_strings: { id: 'guitar_strings', name: 'Guitar strings and a tuner', unit: 'three sets of strings, a tuner and picks: a guitar with dead strings plays badly', price: 14 },
  music_player: { id: 'music_player', name: 'Radio and music player', unit: 'a battery speaker with a radio, a card slot and a big folder of music: plays from the house power or from batteries', price: 65 },
  batteries: { id: 'batteries', name: 'Batteries', unit: 'a bulk pack of 48 AA and AAA cells for the music player, the lanterns and the toys', price: 22 },
  paperbacks_bag: { id: 'paperbacks_bag', name: 'Used paperbacks', unit: 'a bag of twenty used paperbacks and magazines to swap in for the ones that fell apart', price: 28 },
  toys: { id: 'toys', name: 'Kids\' toys', unit: 'blocks, dolls, a ball, a jump rope, puzzles, crayons and paper: something to do for the little ones, who wear it out', price: 45 },
  picture_books: { id: 'picture_books', name: 'Picture books', unit: 'a crate of picture books and early readers for the little ones, to read aloud at bedtime', price: 32 },
  course_firstaid: { id: 'course_firstaid', name: 'First aid course', unit: 'workbooks, a CPR practice dummy and a DVD set: a first-aid and first-responder course (about 20 hours)', price: 45 },
  course_ham: { id: 'course_ham', name: 'Ham radio licence guide', unit: 'the licence study guide, practice exams and a code-practice set: radio licence study (about 20 hours)', price: 35 },
  course_engines: { id: 'course_engines', name: 'Small engines course', unit: 'a shop manual set and a teardown DVD course for chainsaws, mowers and generators (about 30 hours)', price: 48 },
  course_welding: { id: 'course_welding', name: 'Welding course', unit: 'a welding handbook, practice coupons and a DVD course: stick and wire basics (about 40 hours)', price: 60 },
  course_carpentry: { id: 'course_carpentry', name: 'Carpentry course', unit: 'framing and finish carpentry books with a DVD course (about 30 hours)', price: 42 },
  course_wiring: { id: 'course_wiring', name: 'Wiring and solar course', unit: 'a home-wiring and off-grid solar workbook set with a DVD course (about 30 hours)', price: 52 },
  course_gardening: { id: 'course_gardening', name: 'Gardening course', unit: 'a market-garden and seed-saving book set with a DVD course (about 24 hours)', price: 32 },
  course_husbandry: { id: 'course_husbandry', name: 'Animal husbandry course', unit: 'a homestead livestock handbook set with a DVD course: feeding, birthing, hooves, sickness (about 24 hours)', price: 38 },
  course_canning: { id: 'course_canning', name: 'Canning and cooking course', unit: 'a preserving and from-scratch cooking book set with a DVD course (about 20 hours)', price: 30 },
  manuals: { id: 'manuals', name: 'How-to manuals', unit: 'a shelf of repair, garden, building, cooking and field guides: skills come on faster', price: 180 },
  maple_taps: { id: 'maple_taps', name: 'Maple taps', unit: '25 spiles with buckets and lids for the sugar bush', price: 120 },
  manure: { id: 'manure', name: 'Manure', unit: 'a pickup load of aged manure (your own stock makes it for free)', price: 15 },
  compost: { id: 'compost', name: 'Compost', unit: 'a barrow load of finished compost from kitchen scraps, weeds and straw', price: null },
  stabilizer: { id: 'stabilizer', name: 'Fuel stabilizer', unit: 'a bottle: keeps ten cans of gas good for two years', price: 15 },
  hygiene: { id: 'hygiene', name: 'Hygiene supplies', unit: 'a person-month: soap, toilet paper, toothpaste, shampoo, pads', price: 25 },
  plate_carrier: { id: 'plate_carrier', name: 'Plate carrier', unit: 'a carrier with a pair of level III plates', price: 600 },
  helmet: { id: 'helmet', name: 'Ballistic helmet', unit: 'a level IIIA helmet (stops pistol rounds and fragments, not a rifle)', price: 450 },
  soft_armor: { id: 'soft_armor', name: 'Soft body armor', unit: 'a level IIIA vest: stops pistol rounds and buckshot, not a rifle', price: 400 },
  ifak: { id: 'ifak', name: 'IFAK', unit: 'individual first-aid kit: tourniquet, chest seal, pressure dressing', price: 90 },
  nvg: { id: 'nvg', name: 'Night vision', unit: 'gen 3 monocular and a head mount', price: 3500 },
  thermal: { id: 'thermal', name: 'Thermal monocular', unit: 'handheld thermal: people and deer in the dark', price: 2200 },
  radios: { id: 'radios', name: 'GMRS radios', unit: 'a pair of handheld radios with chargers', price: 150 },
  sw_radio: { id: 'sw_radio', name: 'Emergency radio', unit: 'hand-crank AM/FM/shortwave receiver with a solar panel', price: 60 },
  ham_rig: { id: 'ham_rig', name: 'Ham radio (HF)', unit: 'HF transceiver, wire antenna and tuner (needs power and someone who knows radio)', price: 1200 },
  cameras: { id: 'cameras', name: 'Security cameras', unit: '4 IR night-vision cameras and a recorder (needs power)', price: 450 },
  thermal_cam: { id: 'thermal_cam', name: 'Thermal camera', unit: 'a fixed thermal security camera on the drive (needs power)', price: 2800 },
  driveway_alarm: { id: 'driveway_alarm', name: 'Driveway alarm', unit: 'wireless motion sensors along the drive, a base unit in the house', price: 150 },
  floodlights: { id: 'floodlights', name: 'Motion floodlights', unit: 'a set of motion floodlights for the yard (needs power)', price: 220 },
  gen_baffles: { id: 'gen_baffles', name: 'Generator baffles', unit: 'an insulated, vented enclosure and exhaust muffler for the generator shed: about half the noise and light', price: 900 },
  gen_vault: { id: 'gen_vault', name: 'Generator vault', unit: 'a buried, lined generator room with an exhaust silencer and a baffled intake: the generator is not heard or seen from the road', price: 6500 },
  blackout_curtains: { id: 'blackout_curtains', name: 'Blackout curtains', unit: 'heavy light-blocking curtains and tracks for one house: the room stays lit, the window stays dark', price: 140 },
  vehicle_parts: { id: 'vehicle_parts', name: 'Vehicle parts', unit: 'kit: filters, belts, hoses, plugs, a fuel pump and a battery for one truck or tractor', price: 260 },
  ground_sensor: { id: 'ground_sensor', name: 'Ground sensors', unit: 'a string of buried geophones along about 120 m of wall and a base unit: hears digging days out (needs power)', price: 1400 },
  passage_hatch: { id: 'passage_hatch', name: 'Passage hatch', unit: 'steel blast hatch, collar and locks from both sides (one for each end of an underground passage)', price: 3800 },
  ai_sensor_module: { id: 'ai_sensor_module', name: 'AI sensor module', unit: 'a chip and lens for one floodlight: tells people from animals, so the light comes on for people only (needs the light powered; fit it in Defense)', price: 180 },
  tripwire: { id: 'tripwire', name: 'Tripwire alarms', unit: 'tripwire noisemakers for the trails into the place', price: 60 },
  dog: { id: 'dog', name: 'Dog (trained adult)', unit: 'a named, trained adult dog: a family pet who also barks at strangers. It must be fed, watered, walked and doctored, and it will grieve and be grieved', price: 600 },
  puppy: { id: 'puppy', name: 'Puppy', unit: 'a named puppy: needs vaccines, training and a lot of time, and grows into a better guard and a closer friend', price: 250 },
  kibble: { id: 'kibble', name: 'Dog food', unit: '18 kg bag of kibble (≈ 63,000 kcal: two months for one dog)', price: 45 },
  dogbed: { id: 'dogbed', name: 'Dog bed', unit: 'a cheap bed or a folded blanket for a dog kept outside or with no home yet (inside a furnished home dogs use the beds, sofa and rugs)', price: 20 },
  doghouse: { id: 'doghouse', name: 'Doghouse', unit: 'an insulated doghouse for a dog kept outside in the cold', price: 140 },
  steel_door: { id: 'steel_door', name: 'Steel entry door', unit: 'a steel door in a steel frame, installed', price: 1200 },
  window_bars: { id: 'window_bars', name: 'Window bars', unit: 'security bars for the house windows', price: 900 },
  sandbags: { id: 'sandbags', name: 'Sandbags', unit: '100 bags (fill them with your own dirt) for a fighting position', price: 300 },
  security_door: { id: 'security_door', name: 'Security door', unit: 'a reinforced steel door: deadbolts into the frame, a welded strike plate and hinge pins that cannot be knocked out (replaces a steel entry door)', price: 2600 },
  window_shutters: { id: 'window_shutters', name: 'Steel roll-down shutters', unit: 'steel roll-down shutters for every window, closed from inside; they also keep wildfire embers out (they go over the bars)', price: 3400 },
  ballistic_panels: { id: 'ballistic_panels', name: 'Ballistic window panels', unit: 'level III ballistic panels behind the glass of the house, bolted into the studs (they go over shutters)', price: 7400 },
  safe_room_hardened: { id: 'safe_room_hardened', name: 'Hardened safe room', unit: 'a poured safe room: ballistic lining, a vault door, a filtered air vent, a water drum and a bunk (replaces the safe room)', price: 24000 },
  bugout_bag: { id: 'bugout_bag', name: 'Bug-out bag', unit: 'a packed 72-hour pack for one person: water filter, dried food, shelter, first aid, map and a light (about 18 kg)', price: 260 },
  bugout_cache: { id: 'bugout_cache', name: 'Bug-out cache', unit: 'sealed drums buried at a second site, a day or two away: two weeks of food and water, fuel, a medical kit and tools for the family', price: 2200 },
  safe_room: { id: 'safe_room', name: 'Safe room', unit: 'a reinforced interior room: steel door, lined walls, supplies shelf', price: 8500 },
  // for the watch towers' top tiers (sim/towers.ts)
  gun_mount: { id: 'gun_mount', name: 'Ring mount & machine gun', unit: 'a pintle ring on a pedestal with a registered belt-fed 7.62 machine gun and a feed tray', price: 9500 },
  turret_head: { id: 'turret_head', name: 'Remote turret head', unit: 'a gyro-stabilised remote weapon station: gun cradle, servos, optics and a controller (needs power and cameras)', price: 26000 },
  // somewhere to sleep when there are more people than beds (sim/housing.ts)
  tent: { id: 'tent', name: 'Dome tent', unit: '4-person dome tent with a rain fly and a footprint: sleeps 3 (fine in mild weather, miserable in a storm or a freeze)', price: 180 },
  sleeping_bag: { id: 'sleeping_bag', name: 'Sleeping bag', unit: '20°F bag and a foam pad: for the floor, a couch or a tent', price: 70 },
  // Black market only (sim/blackMarket.ts): price null, so the catalog never sells them.
  grenades: { id: 'grenades', name: 'Hand grenades', unit: 'grenade', price: null },
  rpg_launcher: { id: 'rpg_launcher', name: 'RPG-type launcher', unit: 'launcher tube', price: null },
  rpg_rounds: { id: 'rpg_rounds', name: 'Launcher rounds', unit: 'round', price: null },
  suppressor: { id: 'suppressor', name: 'Suppressor (unregistered)', unit: 'can', price: null },
  mines: { id: 'mines', name: 'Improvised mines (after the collapse only)', unit: 'a buried charge on a pressure switch, rigged on the place (see battle.rigMines)', price: null },
  water_jugs: { id: 'water_jugs', name: 'Drinking water', unit: 'a 5-gallon jug (19 L), sealed', price: 9 },
  ibc_tote: { id: 'ibc_tote', name: 'IBC tote', unit: '1,000 L food-grade tote on a pallet: more storage', price: 180 },
  water_trailer: { id: 'water_trailer', name: 'Water trailer', unit: 'a 1,000 L tank on a utility trailer: haul from the standpipe or the creek', price: 2800 },
  water_filter: { id: 'water_filter', name: 'Gravity water filter', unit: 'ceramic gravity filter, about a year of cartridges for a family', price: 350 },
  ro_system: { id: 'ro_system', name: 'Reverse osmosis', unit: 'under-sink reverse osmosis for drinking water (takes out arsenic)', price: 1200 },
  softener: { id: 'softener', name: 'Water softener', unit: 'for hard water: saves the pump and the pipes', price: 900 },
  greywater: { id: 'greywater', name: 'Greywater system', unit: 'diverter, surge tank and mulch basins: sink and shower water to the garden', price: 900 },
  fishing_gear: { id: 'fishing_gear', name: 'Fishing gear', unit: 'rods, reels, tackle box, waders', price: 120 },
  snares: { id: 'snares', name: 'Snares', unit: 'a dozen wire snares for rabbits and grouse', price: 40 },
  goat: { id: 'goat', name: 'Dairy goat', unit: 'a bred doe in milk: about 2 quarts a day (hay and a little grain)', price: 350 },
  pig: { id: 'pig', name: 'Feeder pig', unit: 'a weaned feeder pig: to the butcher in November (bagged feed)', price: 150 },
  steer: { id: 'steer', name: 'Beef steer', unit: 'a weaned steer calf: beef after a summer on grass (hay in winter)', price: 1800 },
  rabbit: { id: 'rabbit', name: 'Meat rabbit', unit: 'a meat rabbit for the hutch: a buck and two does make a colony', price: 35 },
  sheep: { id: 'sheep', name: 'Sheep', unit: 'a ewe in lamb: wool each spring, a lamb or two, mutton in the fall (needs a sheep barn in winter)', price: 300 },
  poly_film: { id: 'poly_film', name: 'Greenhouse film', unit: '6 mil UV-stabilized four-year poly, 32 x 100 ft roll', price: 380 },
  tunnel_kit_small: { id: 'tunnel_kit_small', name: 'Polytunnel hoop kit', unit: '6 x 12 m galvanized hoop frame with purlins, baseboards, door frames and end walls', price: 1400 },
  tunnel_kit_high: { id: 'tunnel_kit_high', name: 'High tunnel frame kit', unit: '9 x 30 m gothic galvanized frame with roll-up side hardware, end walls and a double door', price: 7900 },
  aqua_kit: { id: 'aqua_kit', name: 'Aquaponics kit', unit: 'four 1,000 L fish tanks, 20 m2 of media grow beds, a sump, pump, air pump, plumbing and bell siphons', price: 4600 },
  tilapia_fry: { id: 'tilapia_fry', name: 'Tilapia fingerlings', unit: 'a bag of 100 tilapia fingerlings, delivered live (warm water only)', price: 85 },
  hydro_set: { id: 'hydro_set', name: 'Micro-hydro turbine set', unit: 'Turgo runner with two nozzles, 3 kW permanent-magnet alternator, controller and diversion load (Powerspout / Harris class)', price: 7800 },
  penstock: { id: 'penstock', name: 'Penstock pipe', unit: '50 m of 150 mm HDPE, butt-fused, with intake screen fittings', price: 2100 },
  wind_turbine: { id: 'wind_turbine', name: 'Wind turbine', unit: '5 kW three-blade turbine (5.5 m rotor), furling tail, controller and dump load (Bergey Excel class)', price: 14500 },
  tilt_tower: { id: 'tilt_tower', name: 'Tilt-up tower kit', unit: '18 m guyed tilt-up tower with anchors, guy wire and a gin pole', price: 5200 },
  trout_fry: { id: 'trout_fry', name: 'Trout fingerlings', unit: 'a bag of 100 rainbow trout fingerlings, delivered live (cold water only)', price: 90 },
  crayfish_stock: { id: 'crayfish_stock', name: 'Crayfish breeders', unit: '50 red-swamp or signal crayfish breeders, delivered live', price: 120 },
  fish_feed: { id: 'fish_feed', name: 'Fish feed', unit: 'a 50 lb bag of floating trout pellets', price: 45 },
  hay: { id: 'hay', name: 'Hay', unit: 'a 50 lb small square bale (cheapest bought at the fall cutting)', price: 12 },
  feed: { id: 'feed', name: 'Livestock feed', unit: 'a 50 lb bag of pellets and grain for pigs, goats, rabbits', price: 20 },
  smoker: { id: 'smoker', name: 'Smoker', unit: 'a smokehouse kit and curing salt: jerky that keeps without a freezer', price: 300 },
  gun_safe: { id: 'gun_safe', name: 'Gun safe', unit: '24-gun fire-rated safe, bolted down', price: 1800 },
  gun_cleaning: { id: 'gun_cleaning', name: 'Gun cleaning kit', unit: 'rods, brushes, solvent, oil, patches: about a year', price: 60 },
  traps: { id: 'traps', name: 'Traps & bait stations', unit: 'snap traps, bait stations and bait: about two months', price: 35 },
  plow: { id: 'plow', name: 'Plow blade', unit: 'a snowplow blade for the truck (keep the drive open)', price: 3500 },
  lids: { id: 'lids', name: 'Canning lids', unit: 'sleeve of 12 lids (one case of quarts put up; the jars come back, the lids don\'t)', price: 6 },
  filter_set: { id: 'filter_set', name: 'HEPA filter set', unit: 'HEPA cartridges + hand-crank blower', price: 1100 },
};

export const MATERIAL_IDS = Object.keys(MATERIALS) as MaterialId[];

export type Stock = Record<MaterialId, number>;

export function emptyStock(): Stock {
  // every material at zero (new goods need no edit here)
  return Object.fromEntries(MATERIAL_IDS.map(k => [k, 0])) as Stock;
}

/** Cost of a bill of materials at retail (unbuyable items count 0). */
export function billCost(bill: Partial<Stock>): number {
  let c = 0;
  for (const [id, n] of Object.entries(bill) as Array<[MaterialId, number]>) c += (MATERIALS[id].price ?? 0) * n;
  return c;
}

/** Does `stock` cover `bill`? */
export function hasAll(stock: Stock, bill: Partial<Stock>): boolean {
  for (const id in bill) if (!(stock[id as MaterialId] >= (bill[id as MaterialId] as number))) return false;
  return true;
}

/** What is still missing from `stock` to cover `bill`. */
export function shortfall(stock: Stock, bill: Partial<Stock>): Partial<Stock> {
  const out: Partial<Stock> = {};
  for (const [id, n] of Object.entries(bill) as Array<[MaterialId, number]>) if (stock[id] < n) out[id] = n - stock[id];
  return out;
}

/** A quantity for people to read: whole numbers from 10 up, one decimal to 1, two below; null when it rounds to nothing. */
export function qtyText(n: number): string | null {
  if (n < 0.005) return null;
  if (n >= 10) return String(Math.round(n));
  if (n >= 1) return String(Math.round(n * 10) / 10);
  return (Math.round(n * 100) / 100).toString();
}

/** "3 lumber, 0.5 field seed": a bill or shortfall as text, skipping what rounds to zero. */
export function billText(bill: Partial<Stock>): string {
  return (Object.entries(bill) as Array<[MaterialId, number]>)
    .map(([k, n]) => {
      const q = qtyText(n);
      if (q === null) return null;
      // fuel is stocked in 20 L cans: say liters, not "1.1 fuel"
      if (k === 'fuel') return `${litersText(n * 20)} of fuel`;
      return `${q} ${MATERIALS[k].name.toLowerCase()}`;
    })
    .filter(Boolean).join(', ');
}

/** "Waiting for ..." for a shortfall; a sliver that rounds to nothing still says so. */
export const waitingFor = (miss: Partial<Stock>): string => `Waiting for ${billText(miss) || 'a little more material'}`;
