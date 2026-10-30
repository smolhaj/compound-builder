/**
 * Supplies → Greenhouses, orchards, pond, yard: the self-sufficient interior (sim/greenhouse.ts,
 * sim/pond.ts, sim/farm.ts). Each section shows only when the place has the building. Same patterns
 * as the rest of Supplies: a section, rows, notes in tone, small buttons with the reason on hover.
 */
import { useGameStore } from '../store/gameStore';
import type { GameState } from '../sim/state';
import { calendarOf } from '../sim/state';
import { finishedOf, greenhouseCareOf, hasWorkshop, YARD_BAYS, yardBays } from '../sim/farm';
import { GH_TIER, greensFactor, greenhouseGreens, inGreensSeason, isHeated, heatNeed, GH_WOOD_RICKS } from '../sim/greenhouse';
import { FRUIT, orchardPest, plotReport } from '../sim/orchard';
import { pollination } from '../sim/bees';
import { harvestPond, harvestProblem, pondReport, stockPond, stockProblem, TABLE_G } from '../sim/pond';

import { Note, Row, Section } from './hud/common';
import { btn, DIM, TONE } from './hud/style';
import { regionFor } from '../sim/climate';
import { AQUA, aquaReport, harvestAqua, harvestProblem as aquaHarvestProblem, stockAqua, stockProblem as aquaStockProblem } from '../sim/aquaponics';
import { isTunnel, tunnelNote, tunnelPestLoss } from '../sim/tunnels';

const oxygenWord = (o: number): [string, 'good' | 'warn' | 'bad'] => (o >= 0.7 ? ['fresh', 'good'] : o >= 0.45 ? ['low', 'warn'] : ['gasping', 'bad']);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MONTH_START = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
/** A day of the year as 'May 12'. */
const dayText = (doy: number): string => { const d = ((Math.round(doy) - 1) % 365 + 365) % 365; let m = 11; while (m > 0 && d < MONTH_START[m]) m--; return `${MONTHS[m]} ${d - MONTH_START[m] + 1}`; };
const kcal = (n: number) => `${Math.round(n).toLocaleString('en-US')} kcal`;

export function FarmPanel({ game }: { game: GameState }) {
  const g = useGameStore();
  const houses = finishedOf(game, 'greenhouse', 'greenhouse_heated', 'polytunnel', 'high_tunnel');
  const bays = finishedOf(game, 'aquaponics');
  const orchards = finishedOf(game, 'orchard', 'orchard_grove', 'orchard_terraced');
  const ponds = finishedOf(game, 'pond');
  const yards = finishedOf(game, 'equipment_yard');
  const { doy, year } = calendarOf(game.clock);
  const cold = regionFor(game.site).cold;
  const act = (label: string, why: string | null, run: () => void, tip: string) => <button style={{ ...btn(!why), opacity: why ? 0.55 : 1 }} title={why ?? tip} disabled={!!why} onClick={run}>{label}</button>;
  return <>
    {houses.length > 0 && <Section title="Greenhouses">
      {houses.map(st => {
        const tier = GH_TIER[st.kind], care = greenhouseCareOf(game, st.id), warm = isHeated(game, st);
        const winter = inGreensSeason(doy);
        const perDay = winter ? tier.kcal * greensFactor(cold, warm) : 0;
        return <div key={st.id} style={{ marginBottom: 4 }}>
          <Row label={tier.name} value={winter ? `${kcal(perDay)} a day` : 'summer: in the garden season'} />
          {st.kind === 'greenhouse_heated'
            ? <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                <span style={{ color: DIM }}>Heat: <span style={{ color: care.by === 'none' && heatNeed(game) > 0.08 ? TONE.bad : TONE.good }}>{heatNeed(game) <= 0.08 ? 'not needed' : care.by === 'electric' ? 'electric' : care.by === 'wood' ? 'wood boiler' : 'COLD'}</span></span>
                <span style={{ display: 'flex', gap: 4 }}>
                  {(['electric', 'wood'] as const).map(m => <button key={m} style={btn(care.heat === m)} title={m === 'electric' ? 'Electric heat from the compound\'s power: up to about 34 kWh a day in a hard January. Falls back to wood when the power fails.' : `A wood boiler: about ${GH_WOOD_RICKS} rick a day at full demand`} onClick={() => g.money(d => { greenhouseCareOf(d, st.id).heat = m; return null; })}>{m === 'electric' ? 'Electric' : 'Wood'}</button>)}
                </span>
              </div>
            : isTunnel(st.kind) ? <Note>{tunnelNote(game, st)} {(() => { const p = tunnelPestLoss(game, year); return p.loss > 0 ? `${p.name[0].toUpperCase()}${p.name.slice(1)} this year: up to ${Math.round(p.loss * 100)} % of the greens (tend the vents to halve it).` : 'No outbreak this year.'; })()}</Note>
            : <Note>{warm ? 'Heated by the cabin\'s power.' : cold > 1 ? 'Unheated: the winter benches freeze back. Wire it for power.' : 'Unheated.'}</Note>}
        </div>;
      })}
      <Row label="Winter greens now" value={`${kcal(greenhouseGreens(game))} a day`} />
    </Section>}
    {orchards.length > 0 && <Section title="Orchards">
      {orchards.map(st => {
        const r = plotReport(game, st, pollination(game).orchard);
        const site = r.site.pocket ? 'in a cold-air pocket: late frosts take the blossom here' : r.site.drained ? 'on a slope that drains the cold air away' : null;
        return <div key={st.id} style={{ marginBottom: 6 }}>
          <Row label={`${r.trees} trees`} value={r.unpruned ? 'unpruned this year' : 'a row each of apple, pear, cherry and plum'} tone={r.unpruned ? 'warn' : undefined} />
          {site && <Note tone={r.site.pocket ? 'warn' : 'good'}>This plot stands {site}.</Note>}
          {r.fruits.map(f => <Row key={f.fruit} label={`${FRUIT[f.fruit].name}s (${f.trees})`}
            value={f.bearing > 0 ? `bearing ${Math.round(f.bearing * 100)} %${f.lostThisYear >= 0.05 ? ` · frost took ${Math.round(f.lostThisYear * 100)} %` : ''}` : `${Math.max(1, f.yearsToFruit)} ${f.yearsToFruit <= 1 ? 'year' : 'years'} to first fruit`}
            title={`Blossom ${dayText(f.bloom[0])} to ${dayText(f.bloom[1])}, picked ${dayText(f.pick[0])} to ${dayText(f.pick[1])}. A hard frost in an ordinary year takes about ${Math.round(f.risk * 100)} % of the crop here.${f.kcal > 0 ? ` About ${kcal(f.kcal)} this year.` : ''}`}
            tone={f.risk >= 0.15 ? 'warn' : undefined} />)}
          <Note>{r.bees ? 'The hives set more of the blossom: cherries and pears most.' : 'No hives: the wild bees carry the usual crop. An apiary adds up to a fifth, the cherries most.'}</Note>
        </div>;
      })}
      {(() => { const p = orchardPest(game.seed, year); return <Note tone={p.loss > 0 ? 'warn' : undefined}>{p.loss > 0 ? `${p.name[0].toUpperCase()}${p.name.slice(1)} this year (up to ${Math.round(p.loss * 100)} % of the pome and stone fruit it hits); pruning and hens hold it down.` : 'No bad pests this year.'} Prune January to the buds breaking; water the young trees through the dry months: the Garden duty does both.</Note>; })()}
    </Section>}
    {bays.map(st => {
      const r = aquaReport(game, st);
      return <Section key={st.id} title="Aquaponics">
        <Row label="Tilapia" value={r.fish > 0 ? `${Math.floor(r.fish).toLocaleString('en-US')} · ${Math.round(r.fishG)} g each${r.table ? ' · table size' : ''} · ${r.kg.toFixed(0)} kg` : 'none'} title={`Table size is ${AQUA.TABLE_G} g; the tanks hold ${AQUA.TANK_KG} kg`} />
        <Row label="Water" value={<span>{Math.round(r.tempC)} C · {r.powered ? 'pumps and heater on' : <span style={{ color: TONE.bad }}>no power</span>}</span>} />
        <Row label="Greens" value={`${kcal(r.plantsKcal)} a day`} />
        {r.fish > 0 && <Row label="Feed" value={Number.isFinite(r.feedDays) ? `${Math.floor(game.stock.fish_feed ?? 0)} bags · ${Math.floor(r.feedDays)} days` : '—'} tone={r.feedDays < 7 ? 'warn' : undefined} />}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
          {act('Stock tilapia', aquaStockProblem(game, st.id), () => g.money(d => stockAqua(d, st.id)), 'A bag of 100 fingerlings')}
          {act('Harvest tilapia', aquaHarvestProblem(game, st.id), () => g.money(d => harvestAqua(d, st.id)), 'Up to 30 table-size tilapia')}
        </div>
        {r.notes.map(n => <Note key={n}>{n}</Note>)}
      </Section>;
    })}
    {ponds.map(st => {
      const r = pondReport(game, st), [ow, ot] = oxygenWord(r.oxygen);
      return <Section key={st.id} title="Pond">
        <Row label="Trout" value={r.trout > 0 ? `${r.trout.toLocaleString('en-US')} · ${Math.round(r.troutG)} g each${r.table ? ' · table size' : ''}` : 'none'} title={`Table size is ${TABLE_G} g`} />
        <Row label="Crayfish" value={r.crayfish > 0 ? r.crayfish.toLocaleString('en-US') : 'none'} />
        <Row label="Water" value={<span>{Math.round(r.tempC)} C · oxygen <span style={{ color: TONE[ot] }}>{ow}</span>{r.aerated ? ' · aerator on' : ''}</span>} />
        {r.trout > 0 && <Row label="Feed" value={Number.isFinite(r.feedDays) ? `${Math.floor(game.stock.fish_feed ?? 0)} bags · ${Math.floor(r.feedDays)} days` : '—'} tone={r.feedDays < 7 ? 'warn' : undefined} />}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 3 }}>
          {act('Stock trout', stockProblem(game, st.id, 'trout'), () => g.money(d => stockPond(d, st.id, 'trout')), 'A bag of 100 fingerlings')}
          {act('Stock crayfish', stockProblem(game, st.id, 'crayfish'), () => g.money(d => stockPond(d, st.id, 'crayfish')), 'A pack of 50 breeders')}
          {act('Harvest trout', harvestProblem(game, st.id, 'trout'), () => g.money(d => harvestPond(d, st.id, 'trout')), 'Up to 60 table-size trout')}
          {act('Trap crayfish', harvestProblem(game, st.id, 'crayfish'), () => g.money(d => harvestPond(d, st.id, 'crayfish')), 'Up to 400 crayfish, May to October')}
        </div>
        {r.notes.map(n => <Note key={n}>{n}</Note>)}
        <Note tone={r.kept ? 'good' : 'warn'}>{r.kept ? 'The line keeps predators out.' : 'The line is open to predators: heron, otter, raccoon, bear.'}{r.lost > 0 ? ` ${r.lost.toLocaleString('en-US')} fish lost so far.` : ''}</Note>
      </Section>;
    })}
    {(yards.length > 0 || hasWorkshop(game)) && <Section title="Workshop & yard">
      {hasWorkshop(game) && <Note tone="good">The workshop bench: tools wear a quarter slower, edges come back in half the time, repairs hold better.</Note>}
      {yards.length > 0 && <Row label="Equipment bays" value={`${yardBays(game).filter(b => b.occupant).length} of ${yards.length * YARD_BAYS} in use`} title="The fleet parks the tractor and its implements here" />}
      {yards.length > 0 && yardBays(game).every(b => !b.occupant) && <Note>Empty: the tractor and implements park here once the fleet has them.</Note>}
    </Section>}
  </>;
}
