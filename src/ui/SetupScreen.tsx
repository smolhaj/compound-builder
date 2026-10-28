import { useState, type CSSProperties, type ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { useWorldStore } from '../store/worldStore';
import { newGame } from '../sim/state';
import { fullName, HOUSEHOLD_NAME, JOB_POOL, jobDef, randomJobId, variedFamily } from '../sim/family';
import { FUNDS_RANGE, startFunds } from '../sim/startFunds';
import { difficultySummary } from '../sim/difficulty';
import { DISASTERS, type Difficulty, type DisasterKind, type Mode, type PeaceLength } from '../sim/disaster';
import { saveGame, AUTOSAVE } from '../sim/save/saveSystem';
import { affordable, ANY_WISH, builtFacts, LIFESTYLE, listings, siteFacts, type Acres, type LandWish, type Lifestyle, type Site } from '../sim/site';
import { PLAYABLE, REGION_IDS, REGIONS, type RegionDef, type RegionId, type StormKind } from '../sim/regions';

const MODES: Array<[Mode, string, string]> = [
  ['surprise', 'Surprise', 'Three to six years of peace, and you don\'t know what is coming. Watch the news, the prices, the neighbors.'],
  ['scenario', 'Scenario', 'Pick the disaster and how long you have to get ready.'],
  ['sandbox', 'Free build', 'Nothing happens until you say so. Trigger any disaster from the side panel.'],
];
const DIFFS: Array<[Difficulty, string, string]> = [['cozy', 'Cozy', 'Long warning, gentle raids, nobody dies for good'], ['standard', 'Standard', 'The intended game'], ['hardcore', 'Hardcore', 'Little warning, more and bigger raids, worse wounds, a slow recovery, permadeath']];
const PEACE: Array<[Exclude<PeaceLength, 'random'>, string]> = [['short', '18 months'], ['medium', '3 years'], ['long', '5 years']];

const C = { bg: 'rgba(22,24,20,0.98)', card: 'rgba(255,255,255,0.045)', line: 'rgba(255,255,255,0.09)', gold: '#d8c9a0', dim: 'rgba(238,238,238,0.62)', good: '#a8d080', bad: '#f0a080' };
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const usdK = (n: number) => (n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2).replace(/0$/, '')}M` : `$${Math.round(n / 1000)}k`);
const month = (doy: number) => new Date(2027, 0, doy).toLocaleString('en-US', { month: 'short' });
const tile = (on: boolean, off = false): CSSProperties => ({
  textAlign: 'left', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${on ? C.gold : C.line}`,
  background: on ? 'rgba(216,201,160,0.12)' : C.card, color: '#eee', cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.45 : 1,
});
const chip = (on: boolean): CSSProperties => ({ padding: '5px 11px', borderRadius: 999, border: `1px solid ${on ? C.gold : C.line}`, background: on ? 'rgba(216,201,160,0.18)' : 'transparent', color: '#eee', cursor: 'pointer', fontSize: 12.5 });
const H = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.8, color: C.dim, margin: '14px 0 8px' }}>{children}</div>;

/** A row of choices (the land filters, difficulty, peacetime). */
function Chips<T extends string | number>({ label, value, opts, set }: { label: string; value: T; opts: Array<[T, string]>; set: (v: T) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
      <span style={{ width: 62, color: C.dim, fontSize: 12.5 }}>{label}</span>
      {opts.map(([v, l]) => <button key={String(v)} style={chip(value === v)} onClick={() => set(v)}>{l}</button>)}
    </div>
  );
}

function ListingCard({ l, on, pick, budget }: { l: Site; on: boolean; pick: () => void; budget: number }) {
  const ok = affordable(l, budget);
  return (
    <button style={{ ...tile(on, !ok), display: 'flex', flexDirection: 'column', gap: 8 }} onClick={() => ok && pick()} title={ok ? undefined : 'Over budget'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 16, fontWeight: 700 }}>{l.acres} acres</span>
        <span style={{ fontSize: 16, fontWeight: 700, color: ok ? C.gold : C.bad }}>{usd(l.price)}</span>
      </div>
      <div style={{ fontSize: 12, color: C.dim, marginTop: -6 }}>{l.name} · {usd(Math.round(l.price / l.acres))}/acre</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 3, fontSize: 12.5 }}>
        {siteFacts(l).map(f => [
          <span key={f.label + 'l'} style={{ color: C.dim }}>{f.label}</span>,
          <span key={f.label + 'v'} style={{ color: f.tone === 'good' ? C.good : f.tone === 'bad' ? C.bad : '#eee' }}>{f.value}</span>,
        ])}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 3, fontSize: 12.5, borderTop: `1px solid ${C.line}`, paddingTop: 6 }}>
        {builtFacts(l).map((f, k) => [
          <span key={k + 'l'} style={{ color: C.dim }}>{f.label}</span>,
          <span key={k + 'v'} style={{ color: f.tone === 'good' ? C.good : f.tone === 'bad' ? C.bad : '#eee', fontSize: f.label ? 12.5 : 11.5 }}>{f.value}</span>,
        ])}
      </div>
      <div style={{ fontSize: 12, color: ok ? C.dim : C.bad, borderTop: `1px solid ${C.line}`, paddingTop: 6 }}>
        {ok ? `Leaves ${usd(budget - l.price)} to build with` : 'Over budget'}
      </div>
    </button>
  );
}

const STEPS = ['Region', 'Land', 'Family & play'] as const;

const STORM_NAME: Record<StormKind, string> = {
  blizzard: 'blizzards', tornado: 'tornadoes', derecho: 'derechos', hail: 'hail', heat_wave: 'heat', flood: 'floods', lightning_fire: 'wildfire',
  ice_storm: 'ice storms', hurricane_remnants: 'hurricane remnants', flash_flood: 'flash floods', windstorm: 'windstorms',
};
/** The region's three likeliest storms over a year (chance a day × the length of its season). */
function stormList(r: RegionDef): string {
  const len: Partial<Record<StormKind, number>> = { blizzard: 105, ice_storm: 90, windstorm: 125, tornado: 110, derecho: 110, hail: 100, heat_wave: 60, flood: 110, lightning_fire: 80, hurricane_remnants: 70, flash_flood: 75 };
  return (Object.entries(r.storms) as Array<[StormKind, number]>).sort((a, b) => b[1] * (len[b[0]] ?? 90) - a[1] * (len[a[0]] ?? 90)).slice(0, 3).map(([k]) => STORM_NAME[k]).join(', ');
}

/** New game, in three steps: the region, the land (what you want, then the listings), the family and how it plays. */
export function SetupScreen() {
  const g = useGameStore();
  const seed = useWorldStore(s => s.seed);
  const [step, setStep] = useState(0);
  const [region, setRegion] = useState<RegionId>('mountain_west');
  const [wish, setWish] = useState<LandWish>(ANY_WISH);
  const [batch, setBatch] = useState(0);
  const [life, setLife] = useState<Lifestyle>('fulltime');
  const [famRoll, setFamRoll] = useState(0);
  // each adult's occupation: undefined = whatever the roll gave; a pool id = chosen or shuffled
  const [picks, setPicks] = useState<Array<string | undefined>>([]);
  const [shuffles, setShuffles] = useState(0);
  const { kind: household, people: family } = variedFamily(seed, famRoll, picks);
  const funds = startFunds(family, life, seed, famRoll);
  const budget = funds.budget;
  const lots = listings(seed + batch * 1013, region, wish, 6, budget);
  const [lotId, setLotId] = useState<string | null>(null);
  // the family's money moves with their jobs: a land pick that no longer fits is dropped, not swapped behind your back
  const picked = lotId ? lots.find(l => l.id === lotId) : undefined;
  const lot = picked ? (affordable(picked, budget) ? picked : null) : lots.find(l => affordable(l, budget)) ?? null;
  const [mode, setMode] = useState<Mode>('surprise');
  const [kind, setKind] = useState<DisasterKind>('grid_down');
  const [peace, setPeace] = useState<Exclude<PeaceLength, 'random'>>('medium');
  const [diff, setDiff] = useState<Difficulty>('standard');
  const workers = family.filter(p => !p.kid && !p.elder);
  let unlocked = false;
  try { unlocked = localStorage.getItem('cb.unlocked') === '1'; } catch { /* storage blocked */ }
  const start = () => {
    if (!lot) return;
    const game = newGame(seed, 105, 2027, { site: lot, lifestyle: life, mode, peace: mode === 'scenario' ? peace : 'random', kind: mode === 'scenario' ? kind : null, dayJobs: LIFESTYLE[life].jobs, difficulty: diff, grid: true, family, funds });
    g.load(game);
    g.openSetup(false);
    void saveGame(AUTOSAVE, game);
  };
  const setW = (w: Partial<LandWish>) => { setWish({ ...wish, ...w }); setLotId(null); };
  const R = REGIONS[region];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,9,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 12, padding: 16 }}>
      <div style={{ background: C.bg, color: '#eee', borderRadius: 14, width: 860, maxWidth: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', fontSize: 13.5, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        {/* header: title and the steps */}
        <div style={{ padding: '18px 24px 12px', borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 700 }}>Compound Builder</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {STEPS.map((s, i) => (
                <button key={s} onClick={() => (i < 2 || lot) && setStep(i)} style={{ ...chip(step === i), opacity: i <= step ? 1 : 0.6 }}>{i + 1}. {s}</button>
              ))}
            </div>
          </div>
          <div style={{ color: C.dim, marginTop: 2 }}>Build the place you'd want when everything falls apart. Then find out if you were right.</div>
        </div>

        {/* body */}
        <div style={{ padding: '4px 24px 16px', overflowY: 'auto', flex: 1 }}>
          {step === 0 && <>
            <H>Where to look for land</H>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
              {REGION_IDS.map(id => {
                const r = REGIONS[id], ok = PLAYABLE.has(id);
                return (
                  <button key={id} style={tile(region === id, !ok)} onClick={() => ok && (setRegion(id), setLotId(null))} title={ok ? undefined : 'This region\'s world is still being built'}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontSize: 15 }}>{r.name}</span>
                      {!ok && <span style={{ fontSize: 11, color: C.dim }}>coming</span>}
                    </div>
                    <div style={{ fontSize: 12, color: C.dim, margin: '2px 0 6px' }}>{r.where}</div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.35, marginBottom: 8 }}>{r.blurb}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', columnGap: 10, rowGap: 2, fontSize: 12 }}>
                      <span style={{ color: C.dim }}>Land</span><span>~{usd(r.perAcre)}/acre</span>
                      <span style={{ color: C.dim }}>Frost-free</span><span>{month(r.frost[0])} to {month(r.frost[1])}</span>
                      <span style={{ color: C.dim }}>Zone</span><span>{r.zone} · {r.frost[1] - r.frost[0]} days</span>
                      <span style={{ color: C.dim }}>Winter</span><span>{r.cold >= 1.25 ? 'Bitter' : r.cold >= 0.9 ? 'Cold' : r.cold >= 0.5 ? 'Mild' : 'Short, mild'} · lows {r.janLowF}°F · {Math.round(r.snowCm / 2.54)} in of snow</span>
                      <span style={{ color: C.dim }}>Summer</span><span>highs {r.julyHighF}°F · {Math.round(r.rainMm / 25.4)} in of rain a year</span>
                      <span style={{ color: C.dim }}>Storms</span><span>{stormList(r)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>}

          {step === 1 && <>
            <H>How the family will live</H>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8, marginBottom: 6 }}>
              {(['fulltime', 'independent', 'weekend'] as Lifestyle[]).map(id => {
                const L = LIFESTYLE[id];
                return <button key={id} style={tile(life === id, !L.ready)} onClick={() => L.ready && (setLife(id), setLotId(null))} title={L.ready ? undefined : 'Coming: being away from the place during the week is still being built'}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><span style={{ fontWeight: 700 }}>{L.name}</span>{!L.ready && <span style={{ fontSize: 11, color: C.dim }}>coming</span>}</div>
                  <div style={{ fontSize: 12, color: C.dim, margin: '3px 0 6px', lineHeight: 1.35 }}>{L.blurb}</div>
                  <div style={{ fontSize: 12.5 }}>{usdK(FUNDS_RANGE[id][0])} to {usdK(FUNDS_RANGE[id][1])} to spend{L.passive ? ' · investment income' : L.jobs ? ' · two wages' : ''}</div>
                  {life === id && <div style={{ fontSize: 12, color: C.gold, marginTop: 2 }}>This family: {usd(budget)}</div>}
                </button>;
              })}
            </div>
            <H>What you're looking for in {R.name}</H>
            <Chips label="Size" value={wish.acres} set={v => setW({ acres: v as Acres | 'any' })} opts={[['any', 'Any'], [5, '5 acres'], [20, '20'], [40, '40'], [80, '80']]} />
            <Chips label="Water" value={wish.water} set={v => setW({ water: v })} opts={[['any', 'Any'], ['creek', 'Creek'], ['spring', 'Spring'], ['dry', 'Dry (cheaper)']]} />
            <Chips label="Timber" value={wish.timber} set={v => setW({ timber: v })} opts={[['any', 'Any'], ['open', 'Open'], ['some', 'Some'], ['heavy', 'Heavy']]} />
            <Chips label="Town" value={wish.town} set={v => setW({ town: v })} opts={[['any', 'Any'], ['near', 'Close in'], ['far', 'Way out']]} />
            <Chips label="Built" value={wish.built ?? 'any'} set={v => setW({ built: v })} opts={[['any', 'Any'], ['raw', 'Raw land'], ['house', 'With a house']]} />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '14px 0 8px' }}>
              <span style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.8, color: C.dim }}>Listings · {usd(budget)} to spend <span style={{ textTransform: 'none', letterSpacing: 0 }}>(from this family\u2019s savings; see step 3)</span></span>
              <button style={chip(false)} onClick={() => { setBatch(batch + 1); setLotId(null); }}>More listings</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 }}>
              {lots.map(l => <ListingCard key={l.id} l={l} budget={budget} on={lot?.id === l.id} pick={() => setLotId(l.id)} />)}
            </div>
            {!lot && <div style={{ color: C.bad, marginTop: 8 }}>{picked ? 'That place is over this family\u2019s budget now: pick another.' : 'Nothing here fits the budget: widen the search or look at more listings.'}</div>}
          </>}

          {step === 2 && <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 8px', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.8, color: C.dim }}>The family · {HOUSEHOLD_NAME[household]}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button style={chip(false)} onClick={() => { setShuffles(shuffles + 1); setPicks(workers.reduce<string[]>((a, _, i) => [...a, randomJobId(seed, famRoll, i, shuffles + 1, i ? a[0] : undefined)], [])); }} title="Draw new occupations for the adults; the rest of the family stays">Shuffle jobs</button>
                <button style={chip(false)} onClick={() => { setFamRoll(famRoll + 1); setPicks([]); }} title="Another family">Reroll family</button>
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 8 }}>
              {family.map(p => {
                const slot = workers.indexOf(p);
                const def = jobDef(p.job?.id);
                return (
                  <div key={p.id} style={{ ...tile(false), cursor: 'default', padding: '8px 12px' }}>
                    <div style={{ fontWeight: 600 }}>{fullName(p)}, {p.age}</div>
                    {slot >= 0 && p.job ? <>
                      <div style={{ display: 'flex', gap: 4, margin: '4px 0 3px' }}>
                        <select aria-label={`Occupation of ${p.first}`} value={p.job.id ?? ''} onChange={e => setPicks(workers.map((_, i) => (i === slot ? e.target.value : picks[i])))}
                          style={{ flex: 1, minWidth: 0, background: '#2a2c26', color: '#eee', border: `1px solid ${C.line}`, borderRadius: 6, padding: '3px 6px', fontSize: 12.5, textOverflow: 'ellipsis' }}>
                          {JOB_POOL.map(j => <option key={j.id} value={j.id} title={`${j.title}, $${j.wage}/day`}>{j.short ?? j.title}</option>)}
                        </select>
                        <button style={{ ...chip(false), padding: '3px 8px' }} title="Random occupation for this one" aria-label={`Random occupation for ${p.first}`}
                          onClick={() => { setShuffles(shuffles + 1); setPicks(workers.map((_, i) => (i === slot ? randomJobId(seed, famRoll, i, shuffles + 1, i ? workers[0].job?.id : undefined) : picks[i]))); }}>{'\u21BB'}</button>
                      </div>
                      <div style={{ fontSize: 12, color: C.dim }}>{def ? `${def.title}. ` : ''}{LIFESTYLE[life].jobs ? `Paid $${p.job.wage}/day` : 'Former career'}{def ? `: ${def.good}` : ''}</div>
                    </> : <div style={{ fontSize: 12, color: C.dim }}>{p.elder ? 'Grandparent, retired' : p.kid ? (p.age < 6 ? 'little one' : p.age < 13 ? 'kid' : 'teen') : 'at home'}</div>}
                    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 2 }}>{(Object.entries(p.skills) as Array<[string, number]>).filter(([, v]) => v >= 4).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`).join(' \u00B7 ') || 'learning'}</div>
                  </div>
                );
              })}
            </div>
            <H>Where the money came from</H>
            <div style={{ ...tile(false), cursor: 'default', padding: '10px 14px' }}>
              {funds.lines.map(l => (
                <div key={l.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '1px 0' }}>
                  <span style={{ color: C.dim }}>{l.label}</span><span style={{ color: l.usd < 0 ? C.bad : '#eee' }}>{l.usd < 0 ? '\u2212' : ''}{usd(Math.abs(l.usd))}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 700, borderTop: `1px solid ${C.line}`, marginTop: 5, paddingTop: 5 }}>
                <span>To spend on land and building</span><span style={{ color: C.gold }}>{usd(budget)}</span>
              </div>
              {funds.passive > 0 && <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>Plus about {usd(funds.passive)} a year in investment income.</div>}
              <div style={{ fontSize: 11.5, color: C.dim, marginTop: 3 }}>{LIFESTYLE[life].name} families start with {usdK(FUNDS_RANGE[life][0])} to {usdK(FUNDS_RANGE[life][1])}; better jobs, age and a bit of luck raise it, debts take it down.</div>
              {!lot && <div style={{ color: C.bad, fontSize: 12.5, marginTop: 6 }}>The place you picked is over this budget: go back to Land and pick another.</div>}
            </div>
            <H>How it plays</H>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }}>
              {MODES.map(([m, name, blurb]) => (
                <button key={m} style={tile(mode === m)} onClick={() => setMode(m)}>
                  <div style={{ fontWeight: 700, marginBottom: 3 }}>{name}</div>
                  <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.35 }}>{blurb}</div>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              {mode === 'scenario' && <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                  <span style={{ width: 62, color: C.dim, fontSize: 12.5 }}>Disaster</span>
                  <select value={kind} onChange={e => setKind(e.target.value as DisasterKind)} style={{ background: '#2a2c26', color: '#eee', border: `1px solid ${C.line}`, borderRadius: 6, padding: '4px 8px' }}>
                    {(Object.keys(DISASTERS) as DisasterKind[]).map(k => <option key={k} value={k} disabled={DISASTERS[k]!.pulpy && !unlocked}>{DISASTERS[k]!.name}{DISASTERS[k]!.pulpy && !unlocked ? ' (finish a run to unlock)' : ''}</option>)}
                  </select>
                </div>
                <Chips label="Peace" value={peace} set={setPeace} opts={PEACE} />
              </>}
              <Chips label="Difficulty" value={diff} set={setDiff} opts={DIFFS.map(([d, l]) => [d, l] as [Difficulty, string])} />
              <div style={{ marginLeft: 68, marginBottom: 6, fontSize: 12, color: C.dim }}>{DIFFS.find(x => x[0] === diff)![2]}. Against Standard: {difficultySummary(diff).join(', ')}.</div>
            </div>
          </>}
        </div>

        {/* footer: the choice so far and the way on */}
        <div style={{ padding: '12px 24px', borderTop: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, color: C.dim, fontSize: 12.5, minWidth: 200 }}>
            {R.name} · {LIFESTYLE[life].name}{lot ? ` · ${lot.acres} acres for ${usd(lot.price)} · ${usd(budget - lot.price)} left` : ''}
          </div>
          {g.setupCanClose && <button style={chip(false)} onClick={() => g.openSetup(false)}>Back to my game</button>}
          {step > 0 && <button style={chip(false)} onClick={() => setStep(step - 1)}>Back</button>}
          {step < 2 && <button style={{ ...chip(true), fontWeight: 600, padding: '7px 16px', ...(step === 1 && !lot ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }} disabled={step === 1 && !lot} onClick={() => setStep(step + 1)}>Next</button>}
          {step === 2 && <button style={{ ...chip(true), fontWeight: 700, padding: '7px 18px', ...(!lot ? { opacity: 0.4, cursor: 'not-allowed' } : {}) }} disabled={!lot} onClick={start}>Buy it and start</button>}
        </div>
      </div>
    </div>
  );
}
