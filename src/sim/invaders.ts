/**
 * The invasion's occupier is a real state (owner decision, docs/DECISIONS.md and docs/scenarios/invasion.md "Invaders"):
 * which one depends on the region, and each has its own wording, paperwork, currency and checkpoint habits. The three-tier
 * mechanics (checkpoints and requisitions, curfew and papers, informants and forced labor) are the same for all of them.
 *
 * Tone rule: the villain is the occupying STATE APPARATUS (officers, political officers, security services). The people
 * of that country, conscripts and decent soldiers included, stay human. No caricature, no mocking of accents or
 * languages, a few short translated words at most. Pure data; every string is player-facing American English.
 */
import type { RegionId } from './regions';

export type InvaderId = 'china' | 'russia' | 'axis';
/** Free build / Scenario variant ids that force an invader (they play like the plain occupation). */
export const INVADER_VARIANT: Record<string, InvaderId> = { pacific: 'china', northern: 'russia', axis_coalition: 'axis' };
export const INVADER_VARIANTS = Object.keys(INVADER_VARIANT);

/** Where each region's occupation comes from: shares of [china, russia, axis], and whether it reaches the county by road after the coasts fall. */
export const REGION_LEAN: Record<RegionId, { w: [number, number, number]; byRoad: boolean }> = {
  pnw: { w: [0.9, 0.1, 0], byRoad: false },
  desert: { w: [0.9, 0, 0.1], byRoad: false },
  mountain_west: { w: [0.85, 0.15, 0], byRoad: true },
  north_woods: { w: [0.05, 0.95, 0], byRoad: false },
  upper_midwest: { w: [0, 0.92, 0.08], byRoad: false },
  new_england: { w: [0, 0.92, 0.08], byRoad: false },
  rust_belt: { w: [0, 0.9, 0.1], byRoad: true },
  appalachia: { w: [0, 0.6, 0.4], byRoad: true },
  plains: { w: [0.15, 0.6, 0.25], byRoad: true },
  ozarks: { w: [0, 0.2, 0.8], byRoad: true },
  hill_country: { w: [0.1, 0, 0.9], byRoad: false },
};
const IDS: InvaderId[] = ['china', 'russia', 'axis'];
/** The region's most likely invader. */
export const primaryInvader = (region: RegionId): InvaderId => { const w = REGION_LEAN[region].w; return IDS[w.indexOf(Math.max(...w))]; };

const unit = (seed: number, key: string): number => {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
};
/** Who invades: a forcing variant wins; otherwise the region's lean, rolled on the run's seed (stable for a seed). */
export function pickInvader(region: RegionId, variant: string | undefined, seed: number): InvaderId {
  if (variant && INVADER_VARIANT[variant]) return INVADER_VARIANT[variant];
  const w = REGION_LEAN[region].w; let x = unit(seed, 'invader') * (w[0] + w[1] + w[2]);
  for (let i = 0; i < 3; i++) { x -= w[i]; if (x < 0) return IDS[i]; }
  return primaryInvader(region);
}
export const arrivesByRoad = (region: RegionId): boolean => REGION_LEAN[region].byRoad;

export interface InvaderDef {
  id: InvaderId;
  /** "the Chinese occupation". */
  name: string;
  /** The army, the occupation government, the security service and how the officers are described. */
  force: string; authority: string; security: string; officer: string; politicalOfficer: string;
  /** The identity paper, the travel pass, the replacement currency and the decree lines (half value, a quarter). */
  idDoc: string; idDocPlural: string; passDoc: string; currency: string; decreeHalf: string; decreeQuarter: string;
  /** Titles of the cards. */
  quotaTitle: string; quotaWord: string; checkpointTitle: string; laborWord: string;
  /** Short words in the occupier's language, with the English beside them (a notice header, a checkpoint line). */
  phrase: { documents: [string, string]; cooperate: [string, string]; thanks: [string, string] };
  /** What the occupier says, in order: quota, papers, receipts, curfew. */
  voice: string[];
  /** Checkpoint habits, one is told on the card. */
  habits: string[];
  /** The checkpoint scene (one sentence), and how papers are stamped / refused. */
  post: string; stamped: string; refused: string;
  /** Option wording. */
  showPapers: string; bribe: string; bribeBlurb: string; exemptionNote: string; laborPrice: string;
  /** Poster and loudspeaker lines. */
  propaganda: string[];
  /** Radio bulletins: proclamation, ration, curfew, post, hostages. */
  radio: { proclamation: string; ration: string; curfew: string; post: string; hostages: string };
  /** The hit headline by arrival (landing / by road), the Proclamation No. 1 news line, and the tier-up lines. */
  hit: { landing: string; road: string }; proclamation: string; tier2: string; tier3: string;
  /** Day card: a sentence on who is here. */
  dayLine: string;
  /** The people the player meets: the neighbor's ask, the lone soldier, the punitive column. */
  informantAsk: string; lostSoldier: [string, string, string]; reprisalLine: string; informantPost: string;
  /** What the quota notice and the receipt say. */
  receipt: string; quotaIntro: string;
}

const CHINA: InvaderDef = {
  id: 'china', name: 'the Chinese occupation',
  force: 'the People\'s Liberation Army', authority: 'the Pacific Military Administration', security: 'the State Security Bureau',
  officer: 'a lieutenant colonel with an interpreter', politicalOfficer: 'a political officer',
  idDoc: 'household register card', idDocPlural: 'register cards', passDoc: 'travel permit', currency: 'occupation yuan',
  decreeHalf: 'Order of the Pacific Military Administration: old dollars are accepted at half their value. Occupation yuan are issued at the post office.',
  decreeQuarter: 'Order of the Pacific Military Administration: old dollars are accepted at a quarter of their value. Occupation yuan only for the ration card.',
  quotaTitle: 'A procurement notice from the Pacific Administration', quotaWord: 'procurement notice', checkpointTitle: 'The register post at the bridge', laborWord: 'a labor service detail',
  phrase: { documents: ['Zhengjian', 'documents'], cooperate: ['Qing peihe', 'please cooperate'], thanks: ['Xiexie', 'thank you'] },
  voice: ['Please provide the quantities on the notice by Friday. Qing peihe: please cooperate.', 'Your register cards. Every adult in the household.', 'Receipts are paid in occupation yuan at the office on Main Street.', 'The curfew is posted at the post office. It will be enforced.'],
  habits: ['A soldier scans the code on each card and compares the photograph with your face.', 'A clerk copies every name in the household into a register, then asks who lives at the next farm.', 'The line moves slowly; a loudspeaker repeats the same instructions in two languages.'],
  post: 'a post at the bridge: barriers, floodlights, a tablet on a folding table and a lieutenant colonel with an interpreter',
  stamped: 'The clerk scanned the card, looked at your face, and stamped it. "Renew in thirty days. Xiexie."', refused: 'The scanner would not take it. A soldier wrote your name in the register. "Come back with a valid card."',
  showPapers: 'Show your register cards', bribe: 'Pay an administrative fee', bribeBlurb: 'A "fee" to a clerk with a ledger', exemptionNote: 'The fee went into a desk drawer. A stamp, a signature, and the truck left empty.', laborPrice: 'a "fee" at the labor office',
  propaganda: ['A poster on the church door: "Order and Rebuilding. Register your household."', 'A loudspeaker at the crossroads reads the morning notices in two languages.', 'A banner at the courthouse: "The administration serves everyone who cooperates."'],
  radio: {
    proclamation: 'Notice No. 1 of the Pacific Military Administration, read in two languages: weapons surrendered by Friday, register cards on every road.',
    ration: 'ration notices from the Administration: flour one sack a household; old dollars are taken at the posted rate, occupation yuan preferred.',
    curfew: 'the curfew: eight p.m. to five a.m., enforced by the Administration\'s patrols.',
    post: 'register posts on the bridge and the crossroads: cards required to cross the county line.',
    hostages: 'the Administration reads a list of hostages from the courthouse steps, forty-one names.',
  },
  hit: { landing: 'Chinese troops came ashore on the coast last week and are in the valley now. Register posts on every road.', road: 'The coast fell last month. Today a Chinese column is on the county road, and register posts go up at every bridge.' },
  proclamation: 'Notice No. 1 of the Pacific Military Administration: weapons are to be surrendered by Friday, register cards are required on the county roads, procurement notices will follow.',
  tier2: ' Curfew from eight to five. Household register cards. House inspections by the Security Bureau.', tier3: ' Informants are paid by the Security Bureau. One adult from each household for the labor service. A list of hostages is posted at the courthouse.',
  dayLine: 'The Pacific Military Administration is in the county seat. Officers say they are here to restore order.',
  informantAsk: 'They are asking, friendly enough, about your radio, how much you have put by, and who has been visiting. "The block committee asks every household. Just so the register is complete."',
  lostSoldier: ['A boy in a conscript\'s coat, rifle slung muzzle-down, a long way from home. He asks for water in his own language, then points at the tap and tries to smile.', 'If a patrol finds him here, you will answer for it. If he is found dead on your road, you will answer for that too.', 'He is somebody\'s son. The Security Bureau does not care whose.'],
  reprisalLine: 'The Security Bureau sends the column. Somebody ambushed a patrol within three miles.', informantPost: 'the register office',
  receipt: 'The receipt is in occupation yuan.', quotaIntro: 'A lieutenant colonel and four soldiers with a truck. The interpreter reads the notice.',
};

const RUSSIA: InvaderDef = {
  id: 'russia', name: 'the Russian occupation',
  force: 'the Russian Army', authority: 'the Northern Military Command', security: 'the Federal Security Service',
  officer: 'a captain with an interpreter', politicalOfficer: 'a political officer',
  idDoc: 'occupation passport', idDocPlural: 'occupation passports', passDoc: 'propusk', currency: 'occupation rubles',
  decreeHalf: 'Decree of the Northern Military Command: old dollars are accepted at half their value. Occupation rubles are issued at the commandant\'s office.',
  decreeQuarter: 'Decree of the Northern Military Command: old dollars are accepted at a quarter of their value. Occupation rubles only for the ration card.',
  quotaTitle: 'A requisition order from the commandant\'s office', quotaWord: 'requisition order', checkpointTitle: 'The filtration post at the bridge', laborWord: 'a labor mobilization detail',
  phrase: { documents: ['Dokumenty', 'documents'], cooperate: ['Pozhaluysta', 'please'], thanks: ['Spasibo', 'thank you'] },
  voice: ['Dokumenty. Documents, please. Every adult in the household.', 'You will deliver the quantities on the order by Friday.', 'Receipts are paid in occupation rubles at the commandant\'s office.', 'The curfew is posted. Patrols will enforce it.'],
  habits: ['A soldier takes each phone, scrolls through the photos and messages, and hands it back without a word.', 'A man in a plain coat from the security service asks the same questions three ways, writing nothing down.', 'The line is split in two: papers in order on the left, everyone else to the tent.'],
  post: 'a post at the bridge: concrete blocks, a tent, an armored car and a captain with an interpreter',
  stamped: 'The soldier checked your documents, your phone and your face, and wrote a number in the book. "Renew in thirty days. Spasibo."', refused: 'They sent you to the tent. A man in a plain coat copied your name from your phone. "Come back with proper documents."',
  showPapers: 'Show your documents and your phone', bribe: 'Pay the commandant\'s clerk', bribeBlurb: 'A "gift" for the commandant\'s clerk', exemptionNote: 'The envelope went into a coat pocket. The captain signed a slip and the truck turned round empty.', laborPrice: 'the commandant\'s clerk',
  propaganda: ['A poster on the church door: "Stability and Order. Report to the commandant\'s office."', 'A truck with a loudspeaker drives the county road reading notices at noon.', 'A banner on the grain elevator: "Together we rebuild."'],
  radio: {
    proclamation: 'Order No. 1 of the Northern Military Command, read in two languages: weapons surrendered by Friday, documents on every road.',
    ration: 'ration notices from the commandant\'s office: flour one sack a household; old dollars taken at the posted rate, occupation rubles preferred.',
    curfew: 'the curfew: eight p.m. to five a.m., enforced by military patrols.',
    post: 'filtration posts on the bridge and the crossroads: documents and phones checked at the county line.',
    hostages: 'the commandant\'s office reads a list of hostages in the town square, forty-one names.',
  },
  hit: { landing: 'Russian troops are in the valley. Filtration posts on every road, and a commandant\'s office in the county seat.', road: 'The coast fell weeks ago. Today a Russian column came down the county road, and the filtration posts went up at every bridge.' },
  proclamation: 'Order No. 1 of the Northern Military Command: weapons are to be surrendered by Friday, documents are required on the county roads, requisition orders will follow.',
  tier2: ' Curfew from eight to five. Occupation passports. House searches by the security service.', tier3: ' Informants are paid by the security service. One adult from each household for the mobilization detail. A list of hostages is posted at the commandant\'s office.',
  dayLine: 'The Northern Military Command has opened a commandant\'s office in the county seat. Officers say the soldiers are here to keep order.',
  informantAsk: 'They are asking, friendly enough, about your radio, how much you have put by, and who has been visiting. "The commandant wants a list of every household. Just a formality."',
  lostSoldier: ['A boy in a conscript\'s coat, rifle slung muzzle-down, a long way from home. He asks for water in his own language, then holds up his empty canteen.', 'If a patrol finds him here, you will answer for it. If he is found dead on your road, you will answer for that too.', 'He is somebody\'s son. The security service does not care whose.'],
  reprisalLine: 'The commandant sends the column. Somebody ambushed a patrol within three miles.', informantPost: 'the commandant\'s office',
  receipt: 'The receipt is in occupation rubles.', quotaIntro: 'A captain and four soldiers with a truck. The interpreter reads the order.',
};

const AXIS: InvaderDef = {
  id: 'axis', name: 'the coalition occupation',
  force: 'the Combined Command (Russian, Chinese and Iranian forces)', authority: 'the Combined Command', security: 'the Joint Security Directorate',
  officer: 'a major with a liaison officer from each partner', politicalOfficer: 'a political officer',
  idDoc: 'joint registry card', idDocPlural: 'registry cards', passDoc: 'joint pass', currency: 'settlement notes',
  decreeHalf: 'Directive of the Combined Command: old dollars are accepted at half their value. Settlement notes are issued at the district office.',
  decreeQuarter: 'Directive of the Combined Command: old dollars are accepted at a quarter of their value. Settlement notes only for the ration card.',
  quotaTitle: 'A requisition directive from the Combined Command', quotaWord: 'requisition directive', checkpointTitle: 'The joint checkpoint at the bridge', laborWord: 'a labor allocation detail',
  phrase: { documents: ['Dokumenty, Zhengjian, Madarek', 'documents, in three languages'], cooperate: ['Pozhaluysta', 'please'], thanks: ['Spasibo', 'thank you'] },
  voice: ['Documents. Dokumenty. Zhengjian. Madarek. Every adult in the household.', 'The quantities on the directive are due by Friday.', 'Receipts are paid in settlement notes at the district office.', 'The curfew is posted in three languages. It will be enforced.'],
  habits: ['Three flags fly over the post, and a liaison officer for each stands behind the same table.', 'Every notice is posted three times, in three languages, and the translations do not always agree.', 'The partners argue quietly over whose form to use while the line waits.'],
  post: 'a joint post at the bridge: three flags on one pole, floodlights, an armored car and a major flanked by liaison officers',
  stamped: 'Three stamps in three inks, one after another. "Renew in thirty days." A soldier nodded you through.', refused: 'The liaison officers conferred and shook their heads. A soldier wrote your name in the book. "Come back with proper documents."',
  showPapers: 'Show your registry cards', bribe: 'Pay the liaison office', bribeBlurb: 'A payment to a liaison office that does not keep receipts', exemptionNote: 'Nobody could say which partner took the envelope. The directive was stamped void and the truck left empty.', laborPrice: 'the liaison office',
  propaganda: ['A poster on the church door, in three languages: "Against hunger and disorder. For a new order."', 'A loudspeaker truck reads the morning notices once in each language.', 'A banner on the courthouse: "Partners in rebuilding."'],
  radio: {
    proclamation: 'Directive No. 1 of the Combined Command, read in three languages: weapons surrendered by Friday, registry cards on every road.',
    ration: 'ration notices from the Combined Command: flour one sack a household; old dollars taken at the posted rate, settlement notes preferred.',
    curfew: 'the curfew: eight p.m. to five a.m., enforced by joint patrols.',
    post: 'joint checkpoints on the bridge and the crossroads: registry cards required at the county line.',
    hostages: 'the Combined Command reads a list of hostages in the town square, forty-one names.',
  },
  hit: { landing: 'A coalition landing on the Gulf coast is in the valley. What the radio calls the Axis is here: joint checkpoints on every road.', road: 'The Gulf coast fell weeks ago. Today the coalition columns reached the county, and joint checkpoints went up at every bridge.' },
  proclamation: 'Directive No. 1 of the Combined Command: weapons are to be surrendered by Friday, registry cards are required on the county roads, requisition directives will follow.',
  tier2: ' Curfew from eight to five. Joint registry cards. House searches by the Joint Security Directorate.', tier3: ' Informants are paid by the Joint Security Directorate. One adult from each household for the labor allocation. A list of hostages is posted at the district office.',
  dayLine: 'The Combined Command, a coalition of three states, has opened a district office in the county seat. Officers say the soldiers are here to keep order.',
  informantAsk: 'They are asking, friendly enough, about your radio, how much you have put by, and who has been visiting. "The district office keeps a registry of every household. Just a formality."',
  lostSoldier: ['A boy in a conscript\'s coat, rifle slung muzzle-down, a long way from home. He asks for water in his own language, then in another one, and neither is English.', 'If a patrol finds him here, you will answer for it. If he is found dead on your road, you will answer for that too.', 'He is somebody\'s son. The Joint Security Directorate does not care whose.'],
  reprisalLine: 'The Joint Security Directorate sends the column. Somebody ambushed a patrol within three miles.', informantPost: 'the district office',
  receipt: 'The receipt is in settlement notes.', quotaIntro: 'A major, three liaison officers and four soldiers with a truck. Nobody agrees on who reads the directive.',
};

export const INVADERS: Record<InvaderId, InvaderDef> = { china: CHINA, russia: RUSSIA, axis: AXIS };
/** The invader of a run: chosen at the hit (`fx.invader`); a save from before that falls back to the region's pick. */
export const invaderOfRun = (region: RegionId, variant: string | undefined, seed: number, chosen?: InvaderId): InvaderDef => INVADERS[chosen ?? pickInvader(region, variant, seed)];
/** All the player-facing strings of one invader (for the lint tests). */
export const invaderStrings = (d: InvaderDef): string[] => {
  const out: string[] = [];
  const walk = (v: unknown) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(d); return out;
};
