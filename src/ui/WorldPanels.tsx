/**
 * The world round the place, on the Outside tab: scavenging runs, the
 * crossroads market, and the neighbors' lives (sim/scavenge.ts, market.ts,
 * neighborLife.ts).
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { dayIndex, type GameState } from '../sim/state';
import { canGo, tripFuel } from '../sim/rescue';
import { NEIGHBOR_BLURB } from '../sim/encounters';
import { PLACE_KIND_NAME, pickedOver, riskOf, riskWord, runDays, runProblem, scavengeOpen, startRun, type Roe } from '../sim/scavenge';
import { litersText } from '../sim/format';
import { tripPlan, VEHICLES } from '../sim/vehicles';
import { askPrice, CURRENCY, daysToMarket, goodName, goProblem, goToMarket, MARKET_KM, haggle, isMarketDay, marketOpen, marketPrices, mhave, refuses, type DealMode, type MarketGood } from '../sim/market';
import { BAG_BASE, BAG_GOODS } from '../sim/tradeGoods';
import { answerCallout, askPact, joinGroup, joinGroupProblem, leaveGroup, leavePact, PACT_MIN, stateWord, surname } from '../sim/neighborLife';
import { inPact } from '../sim/pact';

const DIM = 'rgba(238,238,238,0.6)', LINE = 'rgba(255,255,255,0.08)';
const TONE = { good: '#a8d080', warn: '#f0c070', bad: '#f08060' } as const;
type Tone = keyof typeof TONE;
const h3: CSSProperties = { margin: '0 0 4px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.65, fontWeight: 600 };
const btn = (on = false): CSSProperties => ({ padding: '4px 9px', borderRadius: 6, border: 0, cursor: 'pointer', background: on ? '#d8c9a0' : '#3a3d34', color: on ? '#1c1d18' : '#eee', fontSize: 12.5 });
const Section = ({ title, children }: { title: string; children: ReactNode }) => <div style={{ marginBottom: 10 }}><div style={h3}>{title}</div>{children}</div>;
const Row = ({ label, value, tone, title }: { label: ReactNode; value: ReactNode; tone?: Tone; title?: string }) => (
  <div title={title} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
    <span style={{ color: DIM }}>{label}</span>
    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: tone ? TONE[tone] : undefined }}>{value}</span>
  </div>);
const Note = ({ tone, children }: { tone?: Tone; children: ReactNode }) => <div style={{ fontSize: 11.5, lineHeight: 1.35, margin: '3px 0', color: tone ? TONE[tone] : DIM }}>{children}</div>;
const cap = (x: string) => x[0].toUpperCase() + x.slice(1);
const ago = (day: number, d?: number) => d == null ? 'never' : day - d === 0 ? 'today' : `${day - d} d ago`;
const RISK_TONE = { low: 'good', some: undefined, high: 'warn', deadly: 'bad' } as const;
const pct = (x: number) => `${Math.round(x * 100)} %`;

/** Who can be sent: on their feet, 16 and up, not away. */
const goers = (g: GameState) => g.people.filter(p => canGo(g, p) && p.age >= 16);

function Picker({ game, picked, set, max = 4 }: { game: GameState; picked: string[]; set: (x: string[]) => void; max?: number }) {
  const can = goers(game);
  if (!can.length) return <Note tone="warn">Nobody is fit to go.</Note>;
  return <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
    {can.map(p => <button key={p.id} style={btn(picked.includes(p.id))} title={`Health ${Math.round(game.personState.find(x => x.id === p.id)?.needs.health ?? 0)} · hunter ${p.skills.hunter} · negotiator ${p.skills.negotiator}`}
      onClick={() => set(picked.includes(p.id) ? picked.filter(x => x !== p.id) : picked.length < max ? [...picked, p.id] : picked)}>{p.first}</button>)}
  </div>;
}

// ─────────────────────────────────────────────────────────────────────────
// Scavenging
// ─────────────────────────────────────────────────────────────────────────

const ROE: Array<[Roe, string, string]> = [['avoid', 'Keep clear', 'If anyone else is there, back off and wait. Safest, least found.'], ['talk', 'Talk first', 'Talk to whoever is there; split the place or swap news. A good negotiator helps.'], ['fight', 'Shoot first', 'Don\'t wait to find out what they want. Most found, if it goes your way.']];

export function ScavengeSection() {
  const g = useGameStore();
  const game = g.game;
  const [sel, setSel] = useState<string | null>(null);
  const [team, setTeam] = useState<string[]>([]);
  const [mode, setMode] = useState<'foot' | 'truck'>('foot');
  const [roe, setRoe] = useState<Roe>('talk');
  const S = game.scavenge;
  if (!scavengeOpen(game) && !S?.places.length) return null;
  const day = dayIndex(game.clock.t);
  const name = (id: string) => game.people.find(p => p.id === id)?.first ?? '?';
  const run = S?.run;
  const places = S?.places ?? [];
  const p = places.find(x => x.id === sel);
  const why = p ? runProblem(game, p.id, team, mode) : 'pick a place';
  return <Section title="Scavenging">
    {run && <Note tone="warn">{run.team.map(name).join(', ')} out at {places.find(x => x.id === run.place)?.name}{run.mode === 'truck' ? ' with the truck' : ' on foot'}: back {run.back - day <= 0 ? 'today' : `in ${run.back - day} day${run.back - day > 1 ? 's' : ''}`}.</Note>}
    {!places.length && <Note>The town is two days dead. Tomorrow there'll be places to go.</Note>}
    {places.map(x => {
      const r = riskOf(game, x, Math.max(1, team.length));
      const w = riskWord(r);
      const picked = pickedOver(x);
      const tip = [`Someone else there ${pct(r.people)}`, x.claim?.known ? `${cap(x.claim.crew)} hold it` : '', `dogs ${pct(r.dogs)}`, `a fall or a nail ${pct(r.hurt)}`, r.fallout > 0 ? `fallout ≈ ${Math.round(r.fallout * 1000)} mSv each` : '', r.sickness > 0 ? `sickness ${pct(r.sickness)}` : ''].filter(Boolean).join(' · ');
      return <button key={x.id} onClick={() => setSel(x.id === sel ? null : x.id)} title={tip}
        style={{ display: 'block', width: '100%', textAlign: 'left', padding: '4px 6px', marginBottom: 2, borderRadius: 6, border: 0, cursor: 'pointer', background: x.id === sel ? 'rgba(216,201,160,0.22)' : 'rgba(255,255,255,0.04)', color: '#eee', fontSize: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><span>{cap(x.name)}</span><span style={{ color: DIM }}>{x.km} km</span></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, fontSize: 11 }}>
          <span style={{ color: DIM }}>{PLACE_KIND_NAME[x.kind]} · {picked >= 0.97 ? 'stripped' : `${Math.round(picked * 100)} % picked over`} · {ago(day, x.visited)}</span>
          <span style={{ color: RISK_TONE[w] ? TONE[RISK_TONE[w]!] : undefined }}>{x.claim?.known ? 'held by a crew' : `risk: ${w}`}</span>
        </div>
      </button>;
    })}
    {p && !run && <div style={{ marginTop: 4 }}>
      <div style={{ fontSize: 11.5, color: DIM, marginBottom: 2 }}>Who goes to {p.name}:</div>
      <Picker game={game} picked={team} set={setTeam} />
      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
        <button style={btn(mode === 'foot')} onClick={() => setMode('foot')} title="A pack each, about 25 kg">On foot · {runDays(p, 'foot')} d</button>
        <button style={btn(mode === 'truck')} onClick={() => setMode('truck')} title="A bed full, but it's heard for miles">Truck · {runDays(p, 'truck')} d · {tripFuel(game, p.km).liters} L</button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
        {ROE.map(([k, l, t]) => <button key={k} style={btn(roe === k)} title={t} onClick={() => setRoe(k)}>{l}</button>)}
      </div>
      {team.length > 0 && <Note tone="warn">Staying: {game.people.filter((q, i) => game.personState[i]?.needs.died == null && !team.includes(q.id)).map(q => q.first).join(', ') || 'nobody'}.</Note>}
      <button style={{ ...btn(true), width: '100%', marginTop: 4, opacity: why ? 0.4 : 1 }} disabled={!!why} title={why ?? ''}
        onClick={() => { const w = g.money(d => startRun(d, p.id, team, mode, roe)); if (w) alert(w); else { setTeam([]); setSel(null); } }}>Send them</button>
    </div>}
    {(S?.history.length ?? 0) > 0 && <div style={{ marginTop: 4 }}>{S!.history.slice(-3).reverse().map((h, i) => <Note key={i}>{ago(day, h.day)}: {h.place}: {h.text}</Note>)}</div>}
  </Section>;
}

// ─────────────────────────────────────────────────────────────────────────
// Market
// ─────────────────────────────────────────────────────────────────────────

const usd = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
const NAMES: Partial<Record<string, string>> = { canned: 'canned (case)', staples: 'staples (25 kg)', fuel: 'fuel (20 L can)', meds: 'meds / antibiotics (kit)', seed: 'seed (season)', fresh: 'fresh (basket)', hygiene: 'hygiene (month)', firewood: 'firewood (rick)' };
const gname = (k: MarketGood) => k.startsWith('bag:') ? BAG_BASE[k.slice(4) as keyof typeof BAG_BASE].name.toLowerCase() : k.startsWith('ammo:') ? `${k.slice(5)} (round)` : NAMES[k] ?? goodName(k);

export function MarketSection() {
  const g = useGameStore();
  const game = g.game;
  const [who, setWho] = useState<string[]>([]);
  const [armed, setArmed] = useState(true);
  const [drive, setDrive] = useState(false);
  const mp = tripPlan(game, MARKET_KM, 1);
  const [pickOffer, setPickOffer] = useState<{ stall: string; i: number } | null>(null);
  const [give, setGive] = useState<MarketGood>('ammo:22lr');
  const [qty, setQty] = useState(1);
  const [dmode, setDmode] = useState<DealMode>('honest');
  const [said, setSaid] = useState<string | null>(null);
  if (!marketOpen(game)) return null;
  const m = game.market!;
  const day = dayIndex(game.clock.t);
  const today = isMarketDay(game);
  const there = m.trip?.day === day ? game.people.find(p => p.id === m.trip!.pid) : null;
  const prices = marketPrices(game);
  const bag = BAG_GOODS.filter(b => (m.bag?.[b] ?? 0) > 0);
  const st = pickOffer ? m.stalls.find(x => x.id === pickOffer.stall) : undefined;
  const offer = st?.offers[pickOffer!.i];
  const ask = st && offer ? askPrice(game, st, pickOffer!.i, 1, there?.id) : 0;
  const mine = (k: MarketGood) => Math.floor(mhave(game, k));
  const options: MarketGood[] = [...new Set<MarketGood>([...(st?.wants ?? []), ...CURRENCY, 'canned', 'staples', 'hygiene', 'firewood', ...BAG_GOODS.map(b => `bag:${b}` as MarketGood), 'metal:silver_coin', 'metal:junk_silver', 'metal:gold_coin'])].filter(k => mine(k) > 0);
  const per = (prices[give] ?? 0) * (st?.wants.includes(give) ? 1 : 0.6);
  const suggest = per > 0 ? Math.ceil(ask / per) : 0;
  return <Section title="Crossroads market">
    <Row label="The family's name" value={`${m.rep > 40 ? 'well thought of' : m.rep > 10 ? 'decent' : m.rep < -40 ? 'cheats, they say' : m.rep < -10 ? 'not trusted' : 'nobody knows you'} (${Math.round(m.rep)})`} tone={m.rep > 10 ? 'good' : m.rep < -10 ? 'bad' : undefined} title="Honest dealing and generosity raise it (better prices, an invitation); cheating that comes out sinks it (stalls refuse you)" />
    {bag.length > 0 && <Row label="Trade goods" value={bag.map(b => `${m.bag[b]} ${BAG_BASE[b].unit}`).join(', ')} />}
    {!today && <Note>Saturdays by the old Grange hall. Next one in {daysToMarket(game)} days.</Note>}
    {today && !there && <div>
      <div style={{ fontSize: 11.5, color: DIM, marginBottom: 2 }}>Market day. Who goes:</div>
      <Picker game={game} picked={who} set={x => setWho(x.slice(-1))} max={2} />
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button style={btn(armed)} onClick={() => setArmed(!armed)} title="Half as likely to be robbed on the way home">{armed ? '✓ ' : ''}Take a rifle</button>
        <button style={{ ...btn(drive && !!mp.truck), opacity: mp.truck && mp.have >= mp.liters ? 1 : 0.4 }} disabled={!mp.truck || mp.have < mp.liters} onClick={() => setDrive(!drive)} title={mp.truck ? `Take the ${VEHICLES[mp.truck.kind].name.toLowerCase()}: ${litersText(mp.liters)} of fuel there and back. Robbed far less on the road, but an engine is heard for miles: more likely to be followed home.` : 'No running vehicle'}>{drive ? '✓ ' : ''}Drive ({litersText(mp.liters)})</button>
        <button style={{ ...btn(true), flex: 1, opacity: who.length && !goProblem(game, who[0]) ? 1 : 0.4 }} disabled={!who.length || !!goProblem(game, who[0])} title={who.length ? goProblem(game, who[0]) ?? 'Away for the day' : 'pick who goes'}
          onClick={() => { const w = g.money(d => goToMarket(d, who[0], armed, drive)); if (w) alert(w); }}>{drive ? 'Drive' : 'Ride'} to the crossroads</button>
      </div>
    </div>}
    {there && <>
      <Note>{there.first} is at the market{m.trip!.carried > 0 ? `, ${usd(m.trip!.carried)} worth bought` : ''}. Pick something on a stall.</Note>
      {m.stalls.map(s => {
        const cold = refuses(game, s);
        return <div key={s.id} style={{ padding: '3px 0', borderBottom: `1px solid ${LINE}`, opacity: cold ? 0.45 : 1 }}>
          <div style={{ fontSize: 12 }}>{cap(s.vendor)}{cold ? ' · won\'t deal with you' : ''}</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '2px 0' }}>
            {s.offers.map((o, i) => <button key={i} disabled={cold} style={btn(pickOffer?.stall === s.id && pickOffer.i === i)} onClick={() => { setPickOffer({ stall: s.id, i }); setSaid(null); }} title={`Asks about ${usd(askPrice(game, s, i, 1, there.id))} each`}>{o.qty} × {gname(o.good)}</button>)}
          </div>
          <Note>Takes: {s.wants.map(gname).join(', ')}</Note>
        </div>;
      })}
      {st && offer && <div style={{ marginTop: 4 }}>
        <Row label={`1 × ${gname(offer.good)}`} value={`asks ≈ ${usd(ask)}`} />
        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={give} onChange={e => setGive(e.target.value as MarketGood)} style={{ maxWidth: 150 }}>
            {options.map(k => <option key={k} value={k}>{gname(k)} ({mine(k)}){st.wants.includes(k) ? ' ★' : ''}</option>)}
          </select>
          <input type="number" min={1} value={qty} onChange={e => setQty(Math.max(1, Math.floor(+e.target.value)))} style={{ width: 64 }} />
          <button style={btn()} onClick={() => setQty(suggest)} title="What it should take, at their price">≈ {suggest}</button>
        </div>
        <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
          {(['honest', 'generous', 'cheat'] as DealMode[]).map(k => <button key={k} style={btn(dmode === k)} onClick={() => setDmode(k)} title={k === 'cheat' ? 'Water the fuel, short-weight the salt. More for less, until somebody finds out.' : k === 'generous' ? 'Give a little over: people remember.' : 'A fair deal.'}>{cap(k)}</button>)}
          <button style={{ ...btn(true), flex: 1 }} onClick={() => { let line = ''; g.money(d => { const r = haggle(d, st.id, pickOffer!.i, 1, [{ good: give, qty }], dmode); line = r.line; return r.ok || r.caught ? null : r.line; }); setSaid(line); }}>Haggle</button>
        </div>
        {said && <Note tone={/Done|spat|nod|fair|Fine/.test(said) ? 'good' : 'warn'}>{said}</Note>}
      </div>}
    </>}
    <details style={{ marginTop: 4 }}>
      <summary style={{ fontSize: 11.5, color: DIM, cursor: 'pointer' }}>What things fetch now (2025 dollars-equivalent)</summary>
      {([['ammo:22lr', '.22 LR, 100 rounds', 100], ['ammo:9mm', '9mm, 50 rounds', 50], ['ammo:12ga', '12 gauge, 25 shells', 25], ['meds', 'Meds / antibiotics kit', 1], ['fuel', 'Fuel, 20 L', 1], ['seed', 'Seed, a season', 1], ['bag:salt', 'Salt, kg', 1], ['bag:coffee', 'Coffee, lb', 1], ['bag:batteries', 'AA four-pack', 1], ['bag:tobacco', 'Cigarettes, pack', 1], ['metal:silver_coin', 'Silver eagle', 1], ['metal:gold_coin', 'Gold eagle', 1]] as Array<[MarketGood, string, number]>).map(([k, l, n]) => <Row key={k} label={l} value={usd((prices[k] ?? 0) * n)} />)}
    </details>
  </Section>;
}

// ─────────────────────────────────────────────────────────────────────────
// Neighbors
// ─────────────────────────────────────────────────────────────────────────

const HOW: Record<string, string> = { shots: 'heard the shooting', smoke: 'saw the smoke', radio: 'on the radio', gossip: 'gossip', visit: 'a visit', market: 'at the market', seen: '' };

export function NeighborsSection() {
  const g = useGameStore();
  const game = g.game;
  const [open, setOpen] = useState<string | null>(null);
  const [team, setTeam] = useState<string[]>([]);
  const L = game.locals;
  const day = dayIndex(game.clock.t);
  const c = L?.callout;
  const cn = c ? game.neighbors.find(n => n.id === c.neighbor) : undefined;
  const why = joinGroupProblem(game);
  return <Section title="Neighbors">
    {c && cn && <div style={{ padding: 6, marginBottom: 6, borderRadius: 6, background: 'rgba(240,96,80,0.15)' }}>
      <Note tone="bad">The {surname(cn)} place is under attack: {c.raiders} raiders. They're calling for the pact.</Note>
      <Picker game={game} picked={team} set={setTeam} />
      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button style={{ ...btn(true), flex: 1, opacity: team.length ? 1 : 0.4 }} disabled={!team.length} title="Ride over and hit them from behind; the household fights alongside" onClick={() => { const w = g.money(d => answerCallout(d, team)); if (w) alert(w); else setTeam([]); }}>Go</button>
        <button style={{ ...btn(), flex: 1 }} title="Bar the gate. They fight alone, and they'll remember." onClick={() => g.money(d => answerCallout(d, null))}>Stay home</button>
      </div>
    </div>}
    {game.neighbors.map(n => {
      const l = L?.lives[n.id];
      const known = (l?.history ?? []).filter(h => h.known);
      const pact = inPact(game, n.id);
      const home = n.status === 'home';
      return <div key={n.id} style={{ borderBottom: `1px solid ${LINE}`, padding: '2px 0' }}>
        <button onClick={() => setOpen(open === n.id ? null : n.id)} title={l?.blurb ?? NEIGHBOR_BLURB[n.kind]} style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 6, background: 'transparent', border: 0, color: '#eee', cursor: 'pointer', padding: '2px 0', fontSize: 12.5 }}>
          <span>{open === n.id ? '▾' : '▸'} {cap(n.name)}{pact ? ' · pact' : ''}{n.radio ? ' · radio' : ''}</span>
          <span style={{ color: !home ? DIM : n.disposition > 50 ? TONE.good : n.disposition < -20 ? TONE.bad : undefined }}>{stateWord(game, n)}</span>
        </button>
        {open === n.id && <div style={{ paddingLeft: 12, paddingBottom: 4 }}>
          <Note>{l?.blurb ?? NEIGHBOR_BLURB[n.kind]}</Note>
          {home && <Row label="Household" value={`${n.members} · head ${l?.head ?? '?'} · ${n.km} km ${n.dir}`} />}
          {home && <Row label="Good at" value={n.skill} />}
          {known.slice(-5).reverse().map((h, i) => <Note key={i}>{day - h.day === 0 ? 'Today' : `${day - h.day} d ago`}{h.how && HOW[h.how] ? ` (${HOW[h.how]})` : ''}: {h.text}</Note>)}
          {!known.length && <Note>Nothing new you've heard.</Note>}
          {home && game.disaster.kind && game.clock.t >= game.disaster.hitAt && <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            {pact ? <button style={btn()} title="They'll hold it against you" onClick={() => g.money(d => { leavePact(d, n.id); return null; })}>Leave the pact</button>
              : <button style={{ ...btn(), opacity: n.disposition >= PACT_MIN[n.kind] ? 1 : 0.4 }} title={`Mutual defense: they come when there's shooting here, you go when it's there. A work day every two weeks. Needs their trust (${PACT_MIN[n.kind]}).`} onClick={() => { const w = g.money(d => askPact(d, n.id)); if (w) alert(w); }}>Ask for a pact</button>}
          </div>}
        </div>}
      </div>;
    })}
    {L?.group && <div style={{ marginTop: 6 }}>
      <Row label={cap(L.group.name)} value={`${L.group.members.length} households${L.member ? ' · you\'re in' : ''}`} tone={L.member ? 'good' : undefined} />
      <Note>{L.group.kind === 'militia' ? 'Armed men on the roads at night. Members stand a day\'s watch a week; three men come when there\'s shooting.' : 'A seed library, a work rotation, the Saturday market. A case of food a week to the common store.'}</Note>
      {L.member ? <button style={btn()} onClick={() => g.money(d => { leaveGroup(d); return null; })}>Leave</button>
        : <button style={{ ...btn(true), opacity: why ? 0.4 : 1 }} disabled={!!why} title={why ?? ''} onClick={() => { const w = g.money(d => joinGroup(d)); if (w) alert(w); }}>Join {L.group.name}</button>}
    </div>}
    {game.clock.t >= game.disaster.hitAt && game.disaster.kind && <Note>Humanity {Math.round(game.gate.humanity)} · took in {game.gate.tookIn} · turned away {game.gate.turnedAway}</Note>}
  </Section>;
}
