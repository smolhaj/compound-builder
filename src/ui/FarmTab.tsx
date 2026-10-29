/**
 * The Farm tab (sim/farmPlan.ts, sim/crops.ts, sim/kitchen.ts, sim/storage.ts): the seasonal calendar,
 * the fields and the seed, the kitchen, the animals and buildings, and the Food plan. Same patterns as the
 * rest of the HUD: sections, rows, notes in tone, small buttons with the reason on hover.
 */
import { useState, type ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { calendarOf, type GameState } from '../sim/state';
import { calendar, dateText, foodPlan, MONTH_NAMES, methodLines, monthOf, outlook, spoilageRisks, stores, thisSeason, type CalGroup } from '../sim/farmPlan';
import { CROPS, fieldRows, gardensOf, plotFor, pinField, seedOnHand, seedsOf, seedTarget, seedWarning, setSeedFirst, setSuccession, sowWindow, type CropId, type StockLine } from '../sim/crops';
import { dishLines, hasMill, hasOven, kitchenOf, toggleMethod } from '../sim/kitchen';
import { cellarCapacity, cellarKcal, cellarTempC, overflow, pantryLoad, pantryRoom } from '../sim/storage';
import { foodUnits } from '../sim/pantry';
import { ANIMALS, feedDemand, sheepRoom, sheepSheltered, winterHay, type Animal } from '../sim/livestock';
import { REGIONS } from '../sim/regions';
import { apiaries, apiaryReport, harvestHoney, harvestProblem, HIVES, stockApiary, stockProblem as bStockProblem } from '../sim/bees';
import { expectedSyrup, hasMaples, hasShack, mapleOf, sapSeason, setTaps, tapsOut, woodsTaps } from '../sim/maple';
import { butcher, butcherProblem, feedBudget, herdOf, sheltered } from '../sim/herd';
import { MATERIALS } from '../sim/materials';
import { FarmPanel } from './FarmPanel';
import { Note, Row, Section, Tabs } from './hud/common';
import { btn, DIM, TONE, type Tone } from './hud/style';

type Sub = 'season' | 'fields' | 'kitchen' | 'animals' | 'plan';
const k = (n: number) => `${Math.round(n / 1000).toLocaleString('en-US')}k kcal`;
const days = (d: number) => (!isFinite(d) ? '—' : d >= 365 ? `${(d / 365).toFixed(1)} yr` : d >= 60 ? `${Math.round(d / 30)} mo` : `${Math.round(d)} d`);
const GROUP_COLOR: Record<CalGroup, string> = { fields: '#c8b060', garden: '#78b060', preserve: '#d08a58', animals: '#b08ad0', wild: '#6aa8c8' };
const GROUP_NAME: Record<CalGroup, string> = { fields: 'Fields', garden: 'Garden & orchard', preserve: 'Kitchen', animals: 'Animals', wild: 'Wild' };

const Bar = ({ v, color = '#9cc070', title }: { v: number; color?: string; title?: string }) => (
  <div title={title} style={{ flex: 1, height: 5, background: '#333', borderRadius: 2, minWidth: 40 }}><div style={{ width: `${Math.max(0, Math.min(100, v * 100))}%`, height: '100%', background: color, borderRadius: 2 }} /></div>
);

export function FarmTab({ game }: { game: GameState }) {
  const [sub, setSub] = useState<Sub>('season');
  const plan = foodPlan(game);
  const worst: Tone | undefined = plan.some(p => p.tone === 'bad') ? 'bad' : plan.some(p => p.tone === 'warn') ? 'warn' : undefined;
  return <>
    <Tabs<Sub> tabs={[['season', 'Season'], ['fields', 'Fields'], ['kitchen', 'Kitchen'], ['animals', 'Animals'], ['plan', 'Food plan', worst]]} value={sub} set={setSub} />
    {sub === 'season' && <SeasonView game={game} />}
    {sub === 'fields' && <FieldsView game={game} />}
    {sub === 'kitchen' && <KitchenView game={game} />}
    {sub === 'animals' && <AnimalsView game={game} />}
    {sub === 'plan' && <PlanView game={game} />}
  </>;
}

// ── Season ──

function SeasonView({ game }: { game: GameState }) {
  const { doy } = calendarOf(game.clock);
  const now = thisSeason(game), items = calendar(game).filter(i => i.here);
  const cur = monthOf(doy);
  const span = (from: number, to: number, m: number): number => {
    // share of month m (0–1) inside the span
    const m0 = [1, 32, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335][m], m1 = [31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365][m];
    let n = 0;
    for (let d = m0; d <= m1; d++) if (from <= to ? d >= from && d <= to : d >= from || d <= to) n++;
    return n / (m1 - m0 + 1);
  };
  return <>
    <Section title={`Now: ${dateText(doy)}`}>
      {now.length === 0 && <Note>A quiet stretch. Nothing on the calendar for the next three weeks.</Note>}
      {now.map(d => <div key={d.item.id} style={{ fontSize: 12, padding: '2px 0', display: 'flex', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: GROUP_COLOR[d.item.group], marginTop: 4, flex: 'none', opacity: d.state === 'now' ? 1 : 0.45 }} />
        <span><b style={{ fontWeight: 600 }}>{d.item.label}</b> <span style={{ color: d.state === 'now' ? TONE.good : DIM }}>{d.state === 'now' ? 'on now' : `starts in ${d.days} days`}</span><br /><span style={{ color: DIM, fontSize: 11 }}>{d.item.note}</span></span>
      </div>)}
    </Section>
    <Section title="The year">
      <div style={{ display: 'grid', gridTemplateColumns: 'auto repeat(12, 1fr)', gap: '1px 1px', fontSize: 9.5, alignItems: 'center' }}>
        <span />
        {MONTH_NAMES.map((m, i) => <span key={m} style={{ textAlign: 'center', color: i === cur ? '#fff' : DIM, fontWeight: i === cur ? 700 : 400 }}>{m[0]}</span>)}
        {items.map(it => <FragmentRow key={it.id} label={it.label} color={GROUP_COLOR[it.group]} cells={MONTH_NAMES.map((_, m) => span(it.from, it.to, m))} cur={cur} />)}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 5, fontSize: 10.5, color: DIM }}>
        {(Object.keys(GROUP_NAME) as CalGroup[]).map(g => <span key={g}><span style={{ display: 'inline-block', width: 8, height: 8, background: GROUP_COLOR[g], marginRight: 3, borderRadius: 2 }} />{GROUP_NAME[g]}</span>)}
      </div>
    </Section>
  </>;
}

/** The year chart's label column is narrow: short names, the full one in the tooltip. */
const shortLabel = (l: string): string => l.split(':')[0].replace('Jars, dryer and crocks', 'Jars and dryer').replace('Sun-drying weather', 'Sun-drying').replace('Curing weather', 'Curing');

function FragmentRow({ label, color, cells, cur }: { label: string; color: string; cells: number[]; cur: number }): ReactNode {
  return <>
    <span style={{ fontSize: 10.5, color: DIM, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 92, paddingRight: 3 }} title={label}>{shortLabel(label)}</span>
    {cells.map((c, i) => <span key={i} style={{ height: 11, background: c > 0 ? color : 'rgba(255,255,255,0.04)', opacity: c > 0 ? 0.35 + 0.65 * c : 1, outline: i === cur ? '1px solid rgba(255,255,255,0.5)' : undefined }} />)}
  </>;
}

// ── Fields ──

const NEXT: Array<CropId | null> = [null, 'potatoes', 'beans', 'wheat', 'rest'];
function FieldsView({ game }: { game: GameState }) {
  const g = useGameStore();
  const rows = fieldRows(game), gardens = gardensOf(game), have = seedOnHand(game), sd = seedsOf(game);
  const [w0, w1] = sowWindow(game);
  const lines: Array<[StockLine, string, string]> = [['saved', 'Saved', 'Kept back from your own harvest'], ['hybrid', 'Hybrid', 'The Shop\u2019s plain seed, cheap: about 12 % more crop and a third less blight and rust the year it is sown; seed saved from it comes back at about 80 %'], ['heirloom', 'Heirloom', 'Pricier, an ordinary crop the first year, but open-pollinated: the seed you save comes true']];
  return <>
    <Section title="Fields">
      {(() => { const w = seedWarning(game); return w ? <Note tone={w.tone}>{w.text}</Note> : null; })()}
      {rows.length === 0 && <Note>No fields yet. A quarter acre of potatoes, beans and wheat is the calories a garden cannot grow (Build → Food).</Note>}
      {rows.map((r, i) => {
        const next = () => { const idx = NEXT.indexOf(r.pinned ? r.crop : null); g.money(d => pinField(d, r.id, NEXT[(idx + 1) % NEXT.length])); };
        return <div key={r.id} style={{ padding: '3px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 54, color: DIM }}>Field {i + 1}</span>
            <button style={{ ...btn(r.pinned), minWidth: 74 }} title={`${CROPS[r.crop].note}. Click to cycle: Auto, potatoes, beans, wheat, rest.`} onClick={next}>{CROPS[r.crop].name}{r.pinned ? '' : ' · auto'}</button>
            <span style={{ color: DIM, fontSize: 11 }}>after {r.prev ? CROPS[r.prev].name.toLowerCase() : 'nothing'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
            <span style={{ width: 54, color: DIM, fontSize: 11 }}>soil</span>
            <Bar v={r.fert / 1.45} color={r.fert < 0.8 ? TONE.bad : r.fert < 0.95 ? TONE.warn : '#9cc070'} title={`Fertility ${Math.round(r.fert * 100)} %`} />
            <span style={{ fontSize: 11, fontVariantNumeric: 'tabular-nums', width: 82, textAlign: 'right' }} title="This year's crop against an average field">{r.weedy ? `weedy ×${r.factor.total.toFixed(2)}` : r.factor.sown ? `crop ×${r.factor.total.toFixed(2)}` : r.crop === 'rest' ? 'resting' : 'not sown'}</span>
          </div>
          {r.note && <Note tone={r.weedy ? 'bad' : 'warn'}>{r.note}</Note>}
        </div>;
      })}
      {rows.length > 0 && <Note>Sowing runs {dateText(w0)} to {dateText(w1)}. Auto rotates beans, then potatoes, then wheat, staggered across the fields.</Note>}
    </Section>
    <Section title="Seed">
      {lines.map(([line, name, tip]) => <div key={line} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '1px 0' }}>
        <span title={tip} style={{ color: DIM }}>{name}{line === 'saved' && have.saved > 0 ? ` (${Math.round(sd.savedVigor * 100)} % vigor)` : ''}</span>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{have[line] >= 10 ? Math.round(have[line]) : have[line].toFixed(1)} units</span>
          <button style={btn(sd.first === line)} title={`Sow ${name.toLowerCase()} seed first`} onClick={() => g.money(d => { setSeedFirst(d, line); return null; })}>{sd.first === line ? 'first' : 'use first'}</button>
        </span>
      </div>)}
      <Row label="Wanted for next spring" value={`${seedTarget(game)} units`} tone={have.heirloom + have.hybrid + have.saved < seedTarget(game) ? 'warn' : 'good'} />
      <Note>Harvest days set next spring's seed aside first. Hybrid seed is the cheap bargain for a year; heirloom costs more and breeds true, so what you save from it is as good as what you bought.</Note>
    </Section>
    <Section title="Soil">
      <Row label="Manure pile" value={`${(game.stock.manure ?? 0).toFixed(1)} loads`} title="Your animals' pile; a neighbor's load is $15 in the Shop. Spread at sowing, 3 loads a field." />
      <Row label="Compost heap" value={`${(game.stock.compost ?? 0).toFixed(1)} loads`} title="Kitchen scraps, weeds and straw" />
      <Row label="Cover-crop seed" value={`${Math.floor(game.stock.seed_cover ?? 0)} fields`} title="Clover and vetch for a resting field" />
    </Section>
    {gardens.length > 0 && <Section title="Gardens">
      {gardens.map((gd, i) => {
        const p = plotFor(game, gd);
        return <div key={gd.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '2px 0' }}>
          <span style={{ width: 54, color: DIM }}>Garden {i + 1}</span>
          <Bar v={p.fert / 1.45} color={p.fert < 0.8 ? TONE.bad : '#9cc070'} title={`Fertility ${Math.round(p.fert * 100)} %`} />
          <span style={{ display: 'flex', gap: 2 }}>{[1, 2, 3].map(n => <button key={n} style={btn((p.succ ?? 1) === n)} title={n === 1 ? 'One sowing' : `${n} sowings, three weeks apart: +${7 * (n - 1)} % crop, ${8 * (n - 1)} more days of season, ${20 * (n - 1)} % more weeding`} onClick={() => g.money(d => setSuccession(d, gd.id, n))}>{n}</button>)}</span>
        </div>;
      })}
      <Note>Successions: more sowings through the spring keep the garden producing later. Cost: weeding.</Note>
    </Section>}
  </>;
}

// ── Kitchen ──

function KitchenView({ game }: { game: GameState }) {
  const g = useGameStore();
  const kt = kitchenOf(game), ms = methodLines(game), dl = dishLines(game);
  const cap = cellarCapacity(game), room = pantryRoom(game), load = pantryLoad(game);
  return <>
    <Section title="Putting the harvest by">
      {ms.map(m => <div key={m.method} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '1px 0' }}>
        <span title={m.why ?? undefined}>{m.name} <span style={{ color: m.why ? TONE.warn : DIM, fontSize: 11 }}>{m.why ? m.why : `${m.per} ${m.unit} a day`}</span></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 11, color: DIM, fontVariantNumeric: 'tabular-nums' }}>{m.yearKcal > 0 ? `${k(m.yearKcal)} this year` : ''}</span>
          <button style={btn(!m.off)} title="Turn this method on or off" onClick={() => g.money(d => { toggleMethod(d, m.method); return null; })}>{m.off ? 'off' : 'on'}</button>
        </span>
      </div>)}
      <Row label="Meat: freezer, smoker, salt, canner" value={`${k((kt.yearKcal.freezing ?? 0) + (kt.yearKcal.smoking ?? 0) + (kt.yearKcal.curing ?? 0))} this year`} />
      <Note>Jars need lids and a pressure canner for anything but tomatoes, fruit and pickles. Drying, crocks and salt need no lids and (on a sunny day) no power.</Note>
    </Section>
    <Section title="Storage">
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 86, color: DIM }}>Cellar bins</span><Bar v={cap ? cellarKcal(game) / cap : 0} color="#c8a060" title={`${k(cellarKcal(game))} of ${k(cap)}`} /><span style={{ fontSize: 11, width: 70, textAlign: 'right' }}>{cap ? `${Math.round(cellarKcal(game) / cap * 100)} %` : 'no cellar'}</span></div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 86, color: DIM }}>Pantry shelves</span><Bar v={room ? Math.min(1.2, load / room) / 1.2 : 0} color={overflow(game) > 0.05 ? TONE.warn : '#9cc070'} title={`${k(load)} of ${k(room)} of shelf room`} /><span style={{ fontSize: 11, width: 70, textAlign: 'right' }}>{room ? `${Math.round(load / room * 100)} %` : '—'}</span></div>
      {cap > 0 && <Row label="Cellar temperature" value={`${Math.round(cellarTempC(game))} °C`} />}
      <Row label="Jars on the shelf" value={`${foodUnits(game, 'home_canned').toFixed(1)} cases`} />
    </Section>
    <Section title="The table">
      <Row label="Quality" value={`${Math.round(kt.quality * 100)} %`} tone={kt.quality >= 0.55 ? 'good' : kt.quality < 0.4 ? 'warn' : undefined} title="Best three dishes the pantry can make, salt, herbs and bread" />
      {kt.dishes.length > 0 && <Note>On the table: {kt.dishes.join(', ')}.</Note>}
      {dl.map(l => <div key={l.dish.id} style={{ fontSize: 11.5, display: 'flex', justifyContent: 'space-between', gap: 6, color: l.ok ? undefined : DIM, opacity: l.ok ? 1 : 0.7 }}>
        <span>{l.ok ? '✓' : '·'} {l.dish.name}</span><span style={{ color: DIM, textAlign: 'right' }}>{l.ok ? '' : `needs ${l.missing}`}</span>
      </div>)}
      {!hasOven(game) && <Note>A wood-fired oven (Build → Food) bakes bread and roasts{hasMill(game) ? '' : '; a grain mill turns wheat into flour'}.</Note>}
    </Section>
  </>;
}

// ── Animals & the place ──

const BUTCHERABLE: Animal[] = ['goat', 'pig', 'steer', 'sheep', 'rabbit'];
function AnimalsView({ game }: { game: GameState }) {
  const g = useGameStore();
  const have = ANIMALS.filter(a => (game.stock[a] ?? 0) >= 1), h = herdOf(game);
  const fb = feedBudget(game, feedDemand(game), winterHay(game));
  const [frost0, frost1] = REGIONS[game.site.region].frost;
  const hayWinterDays = fb.hayNeed > 0 ? fb.hayBales / (fb.hayNeed / (365 - (frost1 - frost0))) : Infinity;
  // a greyed button says why on the page, not only in its tooltip
  const act = (label: string, why: string | null, run: () => void, tip: string) => <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
    <button style={{ ...btn(!why), opacity: why ? 0.55 : 1 }} title={why ?? tip} disabled={!!why} onClick={run}>{label}</button>
    {why && <span style={{ fontSize: 10.5, color: DIM, maxWidth: 140, lineHeight: 1.25 }}>{why[0].toUpperCase() + why.slice(1)}</span>}
  </span>;
  const hives = apiaries(game), bush = hasMaples(game);
  return <>
    {have.length > 0 && <Section title="Barnyard">
      {have.map(a => {
        const c = game.livestock?.condition[a] ?? 1, sick = h.sick[a] ?? 0;
        return <div key={a} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, padding: '1px 0' }}>
          <span style={{ color: DIM }}>{MATERIALS[a].name}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: c < 0.5 ? TONE.bad : c < 0.9 ? TONE.warn : undefined }}>{Math.floor(game.stock[a])} head, {Math.round(c * 100)} %</span>
            {sick > 0 && <span style={{ color: TONE.bad, fontSize: 11 }}>{sick} sick</span>}
            {BUTCHERABLE.includes(a) && act('Butcher', butcherProblem(game, a, 1), () => g.money(d => butcher(d, a, 1)), `Butcher one ${a}: the meat is put up (freezer, smoker, salt, canner); a pig gives lard`)}
          </span>
        </div>;
      })}
      <Row label="Roof for the herd" value={`${Math.round(sheltered(game) * 100)} %`} tone={sheltered(game) < 0.6 ? 'warn' : 'good'} title="Animal units under a barn, barnyard or sheep barn: fewer sick animals, no winter wasting" />
      <Row label="Pasture" value={fb.pastureAcres < 0.1 ? 'none' : `${fb.units.toFixed(1)} of ${fb.carries.toFixed(1)} animal units`} tone={fb.stocking > 1.3 ? 'bad' : fb.stocking > 1 ? 'warn' : undefined} title={`${fb.pastureAcres.toFixed(1)} acres of open grass; the grass is at ${Math.round(fb.pasture * 100)} %`} />
      <Row label="Hay" value={<span style={{ color: fb.hayBales < fb.hayNeed ? TONE.warn : undefined }}>{fb.hayBales} bales{hayWinterDays > 0 && isFinite(hayWinterDays) ? ` · ${hayWinterDays > 999 ? 'plenty' : `${Math.floor(hayWinterDays)} days`}` : ''} <span style={{ color: DIM }}>/ {fb.hayNeed} for winter</span></span>} title="Days of hay at the winter feeding rate (in summer the herd grazes and eats little, so the bales would seem to last forever)" />
      <Row label="Feed" value={<span style={{ color: fb.feedDays < 14 ? TONE.warn : undefined }}>{fb.feedBags} bags{isFinite(fb.feedDays) ? ` · ${fb.feedDays > 999 ? 'plenty' : `${Math.floor(fb.feedDays)} days`}` : ''}</span>} />
      {(game.stock.sheep ?? 0) >= 1 && <Note tone={sheepSheltered(game) < 1 ? 'warn' : 'good'}>{sheepSheltered(game) < 1 ? `Roof for ${sheepRoom(game)} of ${Math.floor(game.stock.sheep)} sheep: build a sheep barn (30) before winter.` : 'All the sheep have a roof for the winter.'}</Note>}
      <Row label="Manure pile" value={`${(game.stock.manure ?? 0).toFixed(1)} loads`} title="Goes on the fields at spring sowing" />
      {(h.butterLb > 0 || h.cheeseLb > 0 || h.milk > 0) && <Row label="Dairy this year" value={`${Math.round(h.milk / 2350)} gal milk${h.butterLb > 0 ? ` · ${Math.round(h.butterLb)} lb butter` : ''}${h.cheeseLb > 0 ? ` · ${Math.round(h.cheeseLb)} lb cheese` : ''}`} />}
      {h.meatKids > 0 && <Note>{h.meatKids} kid{h.meatKids === 1 ? '' : 's'} being raised for the November butchering.</Note>}
      {game.livestock && (game.stock.vet_kit ?? 0) < 1 && ANIMALS.some(a => (game.stock[a] ?? 0) >= 1) && <Note>No vet kit: a sick animal depends on the vet (while the phones work) or on luck.</Note>}
      {winterHay(game) > (game.stock.hay ?? 0) && <Note>Put up about {winterHay(game)} bales of hay for the winter.</Note>}
    </Section>}
    {hives.map((st, i) => {
      const r = apiaryReport(game, st.id);
      return <Section key={st.id} title={hives.length > 1 ? `Apiary ${i + 1}` : 'Apiary'}>
        <Row label="Colonies" value={`${r.colonies} of ${HIVES}${r.colonies > 0 ? ` · strength ${Math.round(r.strength * 100)} %` : ''}`} />
        {r.colonies > 0 && <>
          <Row label="Winter stores" value={<span style={{ color: r.stores < r.need * 0.7 ? TONE.warn : undefined }}>{Math.round(r.stores)} of {Math.round(r.need)} lb</span>} title="Honey the bees need to see out the winter" />
          <Row label="Honey to take" value={`${Math.floor(r.surplus)} lb`} title="Above their winter stores; taken in late summer (the family does it on day 245 if you do not)" />
          <Row label="Mites" value={<span style={{ color: r.mites > 0.5 ? TONE.bad : r.mites > 0.3 ? TONE.warn : undefined }}>{Math.round(r.mites * 100)} %{r.treated ? ' · treated this year' : ''}</span>} />
          <Row label="Forage" value={`${Math.round(r.forage * 100)} %`} title="What the garden, orchard, fields and woods give the bees" />
        </>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '3px 0' }}>
          {act('Stock a colony', bStockProblem(game, st.id), () => g.money(d => stockApiary(d, st.id)), 'Put a nucleus colony from the Shop in a hive (spring)')}
          {act('Take honey', harvestProblem(game, st.id), () => g.money(d => harvestHoney(d, st.id)), 'Take the surplus honey; the bees keep their winter stores')}
        </div>
        {r.notes.map((n, k) => <Note key={k} tone="warn">{n}</Note>)}
        {r.lostWinter > 0 && <Note>{r.lostWinter} colon{r.lostWinter === 1 ? 'y' : 'ies'} lost over the winter.</Note>}
      </Section>;
    })}
    {bush && (woodsTaps(game) > 0) && <Section title="Sugar bush">
      <Row label="Maples on the place" value={`room for about ${woodsTaps(game)} taps`} />
      <Row label="Taps out" value={tapsOut(game) > 0 ? `${tapsOut(game)} (${Math.floor(game.stock.maple_taps ?? 0)} sets)` : 'none: buy tapping sets in the Shop'} />
      <Row label="Boiler" value={hasShack(game) ? 'sugar shack (150 taps, 12 gal an hour)' : 'steam pan on blocks (40 taps, 3 gal an hour)'} />
      <Row label="Sap runs" value={`${dateText(sapSeason(game)[0])} to ${dateText(sapSeason(game)[1])}`} />
      {tapsOut(game) > 0 && <Row label="A normal season" value={`${expectedSyrup(game).toFixed(1)} gal of syrup`} />}
      {mapleOf(game).syrup > 0 && <Row label="This season" value={`${mapleOf(game).syrup.toFixed(1)} gal from ${Math.round(mapleOf(game).gathered)} gal of sap`} />}
      {mapleOf(game).sap > 1 && <Note tone="warn">{Math.round(mapleOf(game).sap)} gallons of sap waiting in the tank.</Note>}
      <div style={{ display: 'flex', gap: 4, marginTop: 3, alignItems: 'center' }}><span style={{ color: DIM }}>Tap:</span>{[null, 25, 50, 100].map(n => <button key={String(n)} style={btn(mapleOf(game).taps === n)} onClick={() => g.money(d => { setTaps(d, n); return null; })}>{n === null ? 'all I can' : n}</button>)}</div>
    </Section>}
    <FarmPanel game={game} />
  </>;
}

// ── Food plan ──

function PlanView({ game }: { game: GameState }) {
  const st = stores(game), o = outlook(game), risks = spoilageRisks(game), plan = foodPlan(game);
  return <>
    <Section title="Stores">
      <Row label="Eating" value={`${Math.round(st.needPerDay).toLocaleString('en-US')} kcal a day`} />
      {st.lines.map(l => <Row key={l.id} label={l.label} value={<span style={{ color: l.tone === 'good' ? undefined : TONE[l.tone] }}>{days(l.days)} <span style={{ color: DIM }}>· {k(l.kcal)}</span></span>} title={l.note ?? undefined} />)}
      <Row label="All put by" value={<b>{days(st.totalDays)}</b>} />
      {st.lines.filter(l => l.note).map(l => <Note key={l.id} tone={l.tone === 'good' ? undefined : l.tone}>{l.label}: {l.note}.</Note>)}
    </Section>
    <Section title="A year's food">
      <Row label="Fields" value={k(o.fieldsKcal)} />
      <Row label="Gardens" value={k(o.gardenKcal)} />
      {o.orchardKcal > 0 && <Row label="Orchards" value={k(o.orchardKcal)} />}
      {o.eggsKcal > 0 && <Row label="Hens" value={k(o.eggsKcal)} />}
      <Row label="Need for a year" value={k(o.yearNeed)} />
      <Row label="Stores + harvest" value={isFinite(o.coverage) ? `${Math.round(o.coverage * 100)} % of a year` : '—'} tone={o.coverage < 0.6 ? 'bad' : o.coverage < 0.9 ? 'warn' : 'good'} />
    </Section>
    <Section title="Spoilage risk">
      {risks.length === 0 && <Note tone="good">Nothing is about to go off.</Note>}
      {risks.map((r, i) => <Note key={i} tone={r.tone}>{r.text}</Note>)}
    </Section>
    <Section title="What to do">
      {plan.length === 0 && <Note tone="good">Nothing pressing.</Note>}
      {plan.map((r, i) => <Note key={i} tone={r.tone === 'good' ? undefined : r.tone}>{r.text}</Note>)}
    </Section>
  </>;
}
