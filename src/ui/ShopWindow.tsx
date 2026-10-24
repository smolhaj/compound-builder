/**
 * The shop & money window (decided with the user: "Catalog window": tabs,
 * item cards with a drawn icon, a cart and one order; "Accounts you
 * manage"; metals at spot plus dealer premiums).
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { useGameStore } from '../store/gameStore';
import { MATERIALS, type MaterialId } from '../sim/materials';
import { orderCost, orderProblem, payWith, prices } from '../sim/economy';
import {
  banksOpen, buyMetal, buyPrice, dealerOpen, METAL_KINDS, METALS, metalsValue, moveMetal, netWorth, sellMetal, sellPrice, transfer, WHERE_NAME,
  type Account, type MetalKind, type Where,
} from '../sim/finance';
import type { OrderLine } from '../sim/state';
import { HARDEN_GOODS, KIT_GOODS, WATCH_GOODS } from '../sim/gear';
import { ammoLimit, buyAmmo, buyGun, CALIBER, CALIBERS, CLASS_USD, GUN, GUNS, gunPrices, issue, practice, shopOpen, skillOf, takeClass, type Caliber } from '../sim/armory';

type Tab = 'build' | 'bunker' | 'water' | 'food' | 'household' | 'fuel' | 'guns' | 'defense' | 'metals' | 'money';
const TABS: Array<[Tab, string]> = [['build', 'Building'], ['bunker', 'Bunker'], ['water', 'Water & power'], ['food', 'Food'], ['household', 'Medical & household'], ['fuel', 'Fuel & tools'], ['guns', 'Guns & ammo'], ['defense', 'Kit & security'], ['metals', 'Gold & silver'], ['money', 'Money']];
const SHELVES: Record<Exclude<Tab, 'metals' | 'money' | 'guns'>, MaterialId[]> = {
  build: ['lumber', 'fieldstone', 'concrete', 'roofing', 'hardware', 'wire', 'seedlings'],
  bunker: ['rebar', 'membrane', 'container', 'blast_door', 'blast_valve', 'nbc_filter', 'filter_set', 'culvert', 'egress_hatch', 'lead_sheet', 'faraday_mesh'],
  water: ['water_jugs', 'ibc_tote', 'water_trailer', 'water_filter', 'ro_system', 'softener', 'greywater', 'pipe', 'cable', 'fixtures', 'pump', 'drilling', 'tank', 'septic_tank', 'solar_panel', 'battery', 'inverter', 'generator'],
  food: ['staples', 'canned', 'frozen', 'seed', 'lids'],
  household: ['meds', 'hygiene', 'traps'],
  fuel: ['fuel', 'stabilizer', 'firewood', 'excavator', 'plow', 'gun_safe', 'gun_cleaning'],
  defense: [...KIT_GOODS, ...WATCH_GOODS, ...HARDEN_GOODS],
};

const C = { bg: 'rgba(22,24,20,0.98)', card: 'rgba(255,255,255,0.045)', line: 'rgba(255,255,255,0.09)', gold: '#d8c9a0', dim: 'rgba(238,238,238,0.62)', good: '#a8d080', bad: '#f0a080' };
const usd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const btn = (on = false, off = false): CSSProperties => ({ padding: '4px 10px', borderRadius: 6, border: `1px solid ${on ? C.gold : C.line}`, background: on ? 'rgba(216,201,160,0.18)' : 'rgba(255,255,255,0.06)', color: '#eee', cursor: off ? 'not-allowed' : 'pointer', opacity: off ? 0.45 : 1, fontSize: 12.5 });

/** A small drawn icon per item (procedural: shapes and colors, no image files). */
function Icon({ id }: { id: string }) {
  const s = 44;
  const g = (children: ReactNode, bg = '#2c2f28') => <svg width={s} height={s} viewBox="0 0 44 44" style={{ flex: 'none', borderRadius: 8, background: bg }}>{children}</svg>;
  const planks = (c: string) => g(<>{[10, 18, 26].map(y => <rect key={y} x="6" y={y} width="32" height="6" rx="1" fill={c} stroke="#3a2a18" strokeWidth="0.8" />)}</>);
  const bag = (c: string, t: string) => g(<><path d="M12 12 h20 l3 24 h-26 z" fill={c} /><text x="22" y="29" fontSize="8" textAnchor="middle" fill="#2a2418" fontFamily="sans-serif">{t}</text></>);
  const can = (c: string) => g(<>{[10, 22].map(x => <g key={x}><rect x={x} y="12" width="12" height="20" rx="2" fill="#b8bcc0" /><rect x={x} y="16" width="12" height="10" fill={c} /></g>)}</>);
  const box = (c: string, t = '') => g(<><rect x="8" y="12" width="28" height="22" rx="2" fill={c} /><path d="M8 18 h28" stroke="rgba(0,0,0,0.3)" /><text x="22" y="30" fontSize="8" textAnchor="middle" fill="#fff" fontFamily="sans-serif">{t}</text></>);
  const coin = (c: string, n = 3, bar = false) => g(<>{bar ? <path d="M8 30 l6 -12 h16 l6 12 z" fill={c} stroke="#7a5a10" /> : Array.from({ length: n }, (_, i) => <ellipse key={i} cx={22} cy={30 - i * 4} rx="12" ry="4" fill={c} stroke="rgba(0,0,0,0.35)" />)}</>);
  switch (id) {
    case 'lumber': return planks('#c89a62');
    case 'firewood': return g(<>{[[14, 26], [26, 26], [20, 18]].map(([x, y]) => <g key={x + '' + y}><circle cx={x} cy={y} r="6" fill="#8a6440" /><circle cx={x} cy={y} r="3" fill="#c8a070" /></g>)}</>);
    case 'fieldstone': return g(<>{[[14, 26, 8], [28, 24, 9], [20, 16, 7]].map(([x, y, r]) => <ellipse key={x} cx={x} cy={y} rx={r} ry={r * 0.75} fill="#9a9488" stroke="#5a564e" />)}</>);
    case 'concrete': return bag('#b4b0a8', 'MIX');
    case 'roofing': return g(<>{[8, 16, 24, 32].map(x => <rect key={x} x={x} y="10" width="6" height="24" fill="#7a3428" stroke="#4a1a14" />)}</>);
    case 'hardware': return box('#5a6068', 'BOLTS');
    case 'wire': return g(<><circle cx="22" cy="22" r="11" fill="none" stroke="#a0a6aa" strokeWidth="3" /><circle cx="22" cy="22" r="6" fill="none" stroke="#a0a6aa" strokeWidth="2" /></>);
    case 'seedlings': return g(<><rect x="12" y="26" width="20" height="10" fill="#6a4a2a" /><path d="M16 26 v-8 M22 26 v-12 M28 26 v-7" stroke="#5a9a3a" strokeWidth="2.5" /></>);
    case 'staples': return bag('#d8c8a0', 'RICE');
    case 'canned': return can('#b04a30');
    case 'frozen': return box('#8ab0c8', 'MEAT');
    case 'seed': return bag('#c8b070', 'SEED');
    case 'lids': return g(<>{[0, 1, 2].map(i => <ellipse key={i} cx="22" cy={18 + i * 6} rx="11" ry="3" fill="#c8a040" stroke="#7a5a10" />)}</>);
    case 'meds': return g(<><rect x="8" y="12" width="28" height="22" rx="3" fill="#e8e4dc" /><path d="M22 16 v14 M15 23 h14" stroke="#c03030" strokeWidth="4" /></>);
    case 'hygiene': return g(<><rect x="9" y="14" width="12" height="20" rx="3" fill="#7ab0d8" /><circle cx="29" cy="24" r="8" fill="#f2f0ea" /><circle cx="29" cy="24" r="3" fill="#c8c4bc" /></>);
    case 'traps': return g(<><rect x="10" y="20" width="24" height="10" fill="#c8a070" /><path d="M12 20 q10 -10 20 0" fill="none" stroke="#9aa0a4" strokeWidth="2" /></>);
    case 'fuel': case 'stabilizer': return g(<><path d="M12 12 h16 l6 6 v18 h-22 z" fill={id === 'fuel' ? '#b83a2a' : '#3a7ab8'} /><rect x="26" y="8" width="5" height="6" fill="#333" /></>);
    case 'plow': return g(<path d="M6 30 q16 -16 32 0 v4 h-32 z" fill="#d8a020" stroke="#7a5a10" />);
    case 'excavator': return g(<><rect x="8" y="24" width="18" height="8" fill="#e0b020" /><path d="M26 26 l8 -10 l4 6" stroke="#e0b020" strokeWidth="3" fill="none" /><rect x="8" y="32" width="18" height="4" fill="#333" /></>);
    case 'pipe': return g(<><circle cx="22" cy="22" r="12" fill="none" stroke="#c84a30" strokeWidth="4" /></>);
    case 'cable': return g(<><circle cx="22" cy="22" r="12" fill="none" stroke="#2a2a2a" strokeWidth="5" /><circle cx="22" cy="22" r="12" fill="none" stroke="#c8a040" strokeWidth="1" /></>);
    case 'fixtures': return g(<><rect x="10" y="16" width="24" height="14" rx="3" fill="#f0eee8" /><path d="M22 10 v6" stroke="#aaa" strokeWidth="3" /></>);
    case 'pump': case 'drilling': return g(<><rect x="18" y="6" width="8" height="32" fill={id === 'pump' ? '#3a6ab0' : '#888'} /><path d="M14 38 h16" stroke="#555" strokeWidth="3" /></>);
    case 'tank': case 'septic_tank': return g(<rect x="8" y="12" width="28" height="22" rx="10" fill={id === 'tank' ? '#3a6a9a' : '#8a8a80'} />);
    case 'solar_panel': return g(<><rect x="6" y="10" width="32" height="22" fill="#1a2a4a" stroke="#aab" />{[16, 26].map(x => <path key={x} d={`M${x} 10 v22`} stroke="#aab" strokeWidth="0.6" />)}<path d="M6 21 h32" stroke="#aab" strokeWidth="0.6" /></>);
    case 'battery': case 'inverter': case 'generator': return box(id === 'battery' ? '#3a4a3a' : id === 'inverter' ? '#4a4a5a' : '#c84020', id === 'battery' ? '48V' : id === 'inverter' ? 'AC' : 'GEN');
    case 'container': return box('#9a3a2a', '20 FT');
    case 'blast_door': case 'egress_hatch': return g(<><rect x="10" y="6" width="24" height="32" rx="2" fill="#5a6058" stroke="#2a2e28" strokeWidth="2" /><circle cx="22" cy="22" r="5" fill="none" stroke="#c8c8c0" strokeWidth="2" /></>);
    case 'nbc_filter': case 'filter_set': case 'blast_valve': return g(<><circle cx="22" cy="22" r="13" fill="#5a6058" /><circle cx="22" cy="22" r="7" fill="#2a2e28" />{[0, 60, 120].map(a => <path key={a} d="M22 15 v14" stroke="#9aa" transform={`rotate(${a} 22 22)`} />)}</>);
    case 'rebar': return g(<>{[12, 18, 24, 30].map(x => <path key={x} d={`M${x} 6 v32`} stroke="#8a4a2a" strokeWidth="3" />)}</>);
    case 'membrane': case 'faraday_mesh': case 'lead_sheet': case 'culvert': return g(<rect x="8" y="10" width="28" height="24" rx={id === 'culvert' ? 12 : 1} fill={id === 'membrane' ? '#1a1a1a' : id === 'faraday_mesh' ? '#b87333' : id === 'lead_sheet' ? '#707880' : '#9aa0a4'} />);
    case 'water_jugs': return g(<><rect x="12" y="12" width="20" height="24" rx="5" fill="#5a9ad0" opacity="0.85" /><rect x="18" y="7" width="8" height="6" fill="#3a6a9a" /></>);
    case 'ibc_tote': return g(<><rect x="8" y="9" width="28" height="26" fill="#e8e8e0" /><path d="M8 18 h28 M8 27 h28 M17 9 v26 M27 9 v26" stroke="#888" /><rect x="8" y="35" width="28" height="3" fill="#8a6a40" /></>);
    case 'water_trailer': return g(<><rect x="8" y="12" width="26" height="16" rx="8" fill="#e8e8e0" /><circle cx="14" cy="32" r="4" fill="#222" /><circle cx="28" cy="32" r="4" fill="#222" /><path d="M34 26 h6" stroke="#888" strokeWidth="2" /></>);
    case 'water_filter': return g(<><rect x="14" y="6" width="16" height="30" rx="3" fill="#c8ccd0" /><path d="M22 36 v4" stroke="#5a9ad0" strokeWidth="2" /></>);
    case 'ro_system': case 'softener': return g(<>{[12, 22, 32].map(x => <rect key={x} x={x - 4} y="10" width="8" height="24" rx="3" fill={id === 'ro_system' ? '#5a8ab0' : '#c8ccd0'} />)}</>);
    case 'greywater': return g(<><path d="M8 14 h16 v12 h12" fill="none" stroke="#7a8a6a" strokeWidth="4" /><ellipse cx="34" cy="32" rx="7" ry="3" fill="#5a7a3a" /></>);
    case 'plate_carrier': return g(<path d="M12 8 h20 v6 l4 4 v18 h-28 v-18 l4 -4 z" fill="#4a5a3a" stroke="#2a3020" />);
    case 'ifak': return g(<><rect x="10" y="12" width="24" height="20" rx="3" fill="#3a3a30" /><path d="M22 16 v12 M16 22 h12" stroke="#c03030" strokeWidth="3" /></>);
    case 'nvg': case 'thermal': return g(<><rect x="8" y="16" width="24" height="12" rx="4" fill="#333" /><circle cx="34" cy="22" r="5" fill={id === 'nvg' ? '#3a9a4a' : '#d06a2a'} /></>);
    case 'radios': return g(<>{[14, 28].map(x => <g key={x}><rect x={x - 5} y="14" width="10" height="20" rx="2" fill="#2a2a2a" /><path d={`M${x + 3} 14 v-7`} stroke="#2a2a2a" strokeWidth="2" /></g>)}</>);
    case 'cameras': case 'thermal_cam': return g(<><rect x="8" y="16" width="22" height="10" rx="2" fill="#e0e0d8" /><circle cx="10" cy="21" r="3" fill={id === 'cameras' ? '#333' : '#d06a2a'} /><path d="M24 26 v10" stroke="#888" strokeWidth="2" /></>);
    case 'driveway_alarm': case 'tripwire': return g(<><path d="M6 30 h32" stroke="#888" strokeDasharray={id === 'tripwire' ? '2 2' : undefined} /><rect x="16" y="14" width="12" height="12" rx="2" fill="#3a6a9a" /></>);
    case 'floodlights': return g(<><path d="M14 14 l10 6 v6 l-10 6 z" fill="#555" /><path d="M24 20 l14 -6 v20 l-14 -6" fill="#ffe08a" opacity="0.8" /></>);
    case 'dog': return g(<path d="M10 30 v-10 l6 -6 h4 l2 -4 l4 4 v6 h10 v10 h-4 v-6 h-14 v6 z" fill="#8a6a40" />);
    case 'steel_door': case 'safe_room': return g(<><rect x="12" y="6" width="20" height="32" fill="#6a7068" stroke="#3a3e38" strokeWidth="2" /><circle cx="28" cy="22" r="2" fill="#ccc" /></>);
    case 'window_bars': return g(<><rect x="8" y="8" width="28" height="28" fill="#2a3a4a" />{[14, 20, 26, 32].map(x => <path key={x} d={`M${x} 8 v28`} stroke="#9a9a9a" strokeWidth="2" />)}</>);
    case 'sandbags': return g(<>{[[12, 30], [24, 30], [18, 22], [30, 22]].map(([x, y]) => <ellipse key={x + '' + y} cx={x} cy={y} rx="7" ry="4" fill="#b8a070" stroke="#7a6a48" />)}</>);
    case 'gun_safe': return g(<><rect x="10" y="6" width="24" height="32" rx="2" fill="#2a2e2a" stroke="#555" /><circle cx="22" cy="20" r="5" fill="none" stroke="#c8a040" strokeWidth="2" /><path d="M28 26 h3" stroke="#c8a040" strokeWidth="2" /></>);
    case 'gun_cleaning': return g(<><path d="M8 34 L36 10" stroke="#8a8a8a" strokeWidth="3" /><rect x="10" y="22" width="8" height="12" rx="1" fill="#3a6a3a" /></>);
    case 'rifle': return g(<path d="M4 24 h26 l6 -3 h4 v4 h-10 l-4 5 h-6 l2 -5 h-18 z" fill="#b08858" stroke="#5a4028" />);
    case 'shotgun': return g(<path d="M4 23 h30 v3 h-12 l-3 5 h-6 l2 -5 h-11 z" fill="#9a7a58" stroke="#5a4028" />);
    case 'handgun': return g(<path d="M12 16 h20 v6 h-10 l-2 10 h-6 l2 -10 h-4 z" fill="#8a8e92" stroke="#c8ccd0" />);
    case 'ammo': return g(<>{[10, 17, 24, 31].map(x => <g key={x}><rect x={x} y="16" width="5" height="18" fill="#c8a040" /><path d={`M${x} 16 q2.5 -6 5 0`} fill="#b87333" /></g>)}</>);
    case 'gold_coin': return coin('#e0b030');
    case 'gold_bar': return coin('#e0b030', 1, true);
    case 'silver_coin': case 'silver_round': return coin('#c8ccd0');
    case 'junk_silver': return g(<>{[[14, 18], [26, 16], [20, 26], [30, 28], [12, 30]].map(([x, y]) => <circle key={x + '' + y} cx={x} cy={y} r="6" fill="#c0c4c8" stroke="#808488" />)}</>);
    default: return box('#555');
  }
}

/** The shop & money window. */
export function ShopWindow() {
  const g = useGameStore();
  const game = g.game;
  const [tab, setTab] = useState<Tab>('build');
  const [cart, setCart] = useState<Partial<Record<MaterialId, number>>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const k = prices(game);
  const lines: OrderLine[] = (Object.entries(cart) as Array<[MaterialId, number]>).filter(([, q]) => q > 0).map(([material, qty]) => ({ material, qty }));
  const total = lines.length ? orderCost(lines, k) : 0;
  const why = lines.length ? orderProblem(game, lines) : 'empty';
  const pay = payWith(game);
  const add = (m: MaterialId, d: number) => setCart({ ...cart, [m]: Math.max(0, (cart[m] ?? 0) + d) });
  const close = () => g.openShop(false);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(10,12,9,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 11, padding: 16 }} onClick={close}>
      <div onClick={e => e.stopPropagation()} style={{ background: C.bg, color: '#eee', borderRadius: 14, width: 1000, maxWidth: '100%', height: 640, maxHeight: '100%', display: 'flex', flexDirection: 'column', fontSize: 13, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px 10px', borderBottom: `1px solid ${C.line}` }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 700 }}>Town & the mail-order catalog</div>
            <div style={{ color: C.dim, fontSize: 12 }}>Checking {usd(game.money)} · cash in the safe {usd(game.fin.cash)}{k > 1.02 ? ` · prices up ${Math.round((k - 1) * 100)} %` : ''}</div>
          </div>
          <button style={btn()} onClick={close}>Close</button>
        </div>
        <div style={{ display: 'flex', gap: 4, padding: '8px 16px', borderBottom: `1px solid ${C.line}`, flexWrap: 'wrap' }}>
          {TABS.map(([t, name]) => <button key={t} style={btn(tab === t)} onClick={() => { setTab(t); setMsg(null); }}>{name}</button>)}
        </div>
        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
            {tab !== 'metals' && tab !== 'money' && tab !== 'guns' && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {SHELVES[tab].filter(m => MATERIALS[m].price !== null).map(m => (
                <div key={m} style={{ background: C.card, border: `1px solid ${cart[m] ? C.gold : C.line}`, borderRadius: 10, padding: 10, display: 'flex', gap: 10 }}>
                  <Icon id={m} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><b>{MATERIALS[m].name}</b><span style={{ color: C.gold }}>{usd((MATERIALS[m].price ?? 0) * k)}</span></div>
                    <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.3, margin: '2px 0 6px' }}>{MATERIALS[m].unit}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <button style={btn()} onClick={() => add(m, -1)}>−</button>
                      <span style={{ minWidth: 22, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{cart[m] ?? 0}</span>
                      <button style={btn()} onClick={() => add(m, 1)}>+</button>
                      <span style={{ fontSize: 11, color: C.dim, marginLeft: 'auto' }}>have {Math.floor(game.stock[m])}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>}
            {tab === 'guns' && <Guns onMsg={setMsg} />}
            {tab === 'metals' && <Metals onMsg={setMsg} />}
            {tab === 'money' && <Money onMsg={setMsg} />}
            {msg && <div style={{ color: C.bad, marginTop: 10 }}>{msg}</div>}
          </div>
          {tab !== 'metals' && tab !== 'money' && tab !== 'guns' && <div style={{ width: 250, borderLeft: `1px solid ${C.line}`, padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <b>The order</b>
            {!lines.length && <div style={{ color: C.dim }}>Nothing yet.</div>}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {lines.map(l => <div key={l.material} style={{ display: 'flex', justifyContent: 'space-between', gap: 6, padding: '2px 0' }}><span>{l.qty} × {MATERIALS[l.material].name}</span><span style={{ color: C.dim }}>{usd((MATERIALS[l.material].price ?? 0) * l.qty * k)}</span></div>)}
            </div>
            {lines.length > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${C.line}`, paddingTop: 6 }}><span>Total, delivered</span><b>{usd(total)}</b></div>}
            <div style={{ fontSize: 11.5, color: C.dim }}>{pay === 'cash' ? 'The banks are shut: paying cash from the safe.' : pay === 'bank' ? `From checking. The truck comes in about ${2 + Math.floor(game.site.miles / 15)} days.` : 'Nobody is delivering now.'}</div>
            <button style={{ ...btn(true, !!why), padding: '7px 10px', fontWeight: 600 }} disabled={!!why} onClick={() => { if (g.order(lines)) setCart({}); }}>
              {why === 'cannot_afford' ? 'Not enough money' : why === 'no_deliveries' ? 'No deliveries' : 'Place the order'}
            </button>
            {lines.length > 0 && <button style={btn()} onClick={() => setCart({})}>Clear</button>}
          </div>}
        </div>
      </div>
    </div>
  );
}

function Metals({ onMsg }: { onMsg: (m: string | null) => void }) {
  const g = useGameStore(), game = g.game, f = game.fin;
  const [qty, setQty] = useState<Partial<Record<MetalKind, number>>>({});
  const [where, setWhere] = useState<Where>('safe');
  const open = dealerOpen(game);
  const run = (op: Parameters<typeof g.money>[0]) => onMsg(g.money(op));
  return <>
    <div style={{ display: 'flex', gap: 18, marginBottom: 10, flexWrap: 'wrap' }}>
      <span>Gold <b>{usd(f.spot.gold)}</b>/oz</span><span>Silver <b>{usd(f.spot.silver)}</b>/oz</span>
      <span style={{ color: C.dim }}>You hold {usd(metalsValue(game))} at spot</span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 4, alignItems: 'center' }}>
        <span style={{ color: C.dim }}>Keep it</span>
        {(['safe', 'buried', 'bank'] as Where[]).map(w => <button key={w} style={btn(where === w)} onClick={() => setWhere(w)}>{w === 'safe' ? 'in the safe' : w === 'buried' ? 'buried' : 'at the bank'}</button>)}
      </span>
    </div>
    {!open && <div style={{ color: C.bad, marginBottom: 8 }}>No dealer is shipping or buying now. What you hold is for trading.</div>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 8 }}>
      {METAL_KINDS.map(m => {
        const held = f.holdings.filter(h => h.kind === m), n = qty[m] ?? 1;
        return <div key={m} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, display: 'flex', gap: 10 }}>
          <Icon id={m} />
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{METALS[m].name}</b><span style={{ color: C.gold }}>{usd(buyPrice(game, m))}</span></div>
            <div style={{ fontSize: 11.5, color: C.dim }}>{METALS[m].unit} · {Math.round(METALS[m].premium * 100)} % over spot · buys back at {usd(sellPrice(game, m))}</div>
            <div style={{ fontSize: 11.5, margin: '3px 0' }}>{held.length ? held.map(h => `${h.units} ${WHERE_NAME[h.where]}`).join(' · ') : <span style={{ color: C.dim }}>none held</span>}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <button style={btn()} onClick={() => setQty({ ...qty, [m]: Math.max(1, n - 1) })}>−</button>
              <span style={{ minWidth: 20, textAlign: 'center' }}>{n}</span>
              <button style={btn()} onClick={() => setQty({ ...qty, [m]: n + 1 })}>+</button>
              <button style={btn(open, !open)} disabled={!open} onClick={() => run(d => buyMetal(d, m, n, where))}>Buy</button>
              <button style={btn(false, !open)} disabled={!open} onClick={() => run(d => sellMetal(d, m, n))}>Sell</button>
            </div>
            {held.filter(h => h.where !== where).map(h => <button key={h.where} style={{ ...btn(), marginTop: 4, fontSize: 11.5 }} onClick={() => run(d => moveMetal(d, m, h.where, where, h.units))}>Move {h.units} {WHERE_NAME[h.where]} → {WHERE_NAME[where]}</button>)}
          </div>
        </div>;
      })}
    </div>
    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 10, lineHeight: 1.4 }}>Dealers ship insured in about a week. Buys of $10,000 or more go on the dealer's books. A safe-deposit box costs ${150} a year and is out of reach while the bank is shut. Buried metal is safe from looters, but you have to dig it up to sell or trade it.</div>
  </>;
}

function Money({ onMsg }: { onMsg: (m: string | null) => void }) {
  const g = useGameStore(), game = g.game, f = game.fin;
  const [from, setFrom] = useState<Account>('checking'), [to, setTo] = useState<Account>('savings'), [amt, setAmt] = useState(10_000);
  const open = banksOpen(game);
  const acct: Array<[Account | 'metals', string, number, string]> = [
    ['checking', 'Checking', game.money, 'bills, orders, crews'],
    ['savings', 'Savings', f.savings, '4 % a year'],
    ['brokerage', 'Brokerage (index fund)', f.brokerage, 'grows, swings, crashes'],
    ['cash', 'Cash in the safe', f.cash, 'spends when the banks don\'t'],
    ['metals', 'Gold & silver', metalsValue(game), 'at spot'],
  ];
  const sel = (v: Account, set: (a: Account) => void) => <select value={v} onChange={e => set(e.target.value as Account)} style={{ background: '#2a2c26', color: '#eee', border: `1px solid ${C.line}`, borderRadius: 6, padding: '3px 6px' }}>{(['checking', 'savings', 'brokerage', 'cash'] as Account[]).map(a => <option key={a} value={a}>{a}</option>)}</select>;
  return <>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', rowGap: 6, columnGap: 16, maxWidth: 520 }}>
      {acct.map(([id, name, v, note]) => [
        <span key={id + 'n'}>{name} <span style={{ color: C.dim, fontSize: 11.5 }}>· {note}</span></span>,
        <b key={id + 'v'} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{usd(v)}</b>,
      ])}
      <span style={{ borderTop: `1px solid ${C.line}`, paddingTop: 6 }}>Net worth</span><b style={{ borderTop: `1px solid ${C.line}`, paddingTop: 6, textAlign: 'right' }}>{usd(netWorth(game))}</b>
    </div>
    <div style={{ marginTop: 16, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span>Move</span>
      <input type="number" value={amt} step={1000} min={0} onChange={e => setAmt(Math.max(0, Number(e.target.value)))} style={{ width: 110, background: '#2a2c26', color: '#eee', border: `1px solid ${C.line}`, borderRadius: 6, padding: '3px 6px' }} />
      <span>from</span>{sel(from, setFrom)}<span>to</span>{sel(to, setTo)}
      <button style={btn(open, !open)} disabled={!open} onClick={() => onMsg(g.money(d => transfer(d, from, to, amt)))}>Move it</button>
    </div>
    {!open && <div style={{ color: C.bad, marginTop: 8 }}>The banks are shut: checking, savings and the brokerage account are frozen.</div>}
    <div style={{ fontSize: 11.5, color: C.dim, marginTop: 12, lineHeight: 1.4 }}>Cash withdrawals over $10,000 are reported. Savings and checking are insured to $250,000; past that, a bank that fails for good can take a cut. Markets fall when the disaster hits. Metals climb as trust in money goes.</div>
  </>;
}

function Guns({ onMsg }: { onMsg: (m: string | null) => void }) {
  const g = useGameStore(), game = g.game, a = game.armory;
  const open = shopOpen(game), k = gunPrices(game);
  const run = (op: Parameters<typeof g.money>[0]) => onMsg(g.money(op));
  const icon = (t: string) => (['pistol', 'revolver'].includes(t) ? 'handgun' : t === 'pump' ? 'shotgun' : 'rifle');
  const owned = (id: string) => a.guns.filter(x => x.model === id).length + a.pending.filter(x => x.model === id).length;
  return <>
    <div style={{ color: open ? C.dim : C.bad, marginBottom: 8 }}>{open ? `The gun shop in town: a background check at the counter${game.site.region === 'pnw' ? ', and the state\'s 10-business-day wait' : ''}. Every sale goes on the shop's records.${k > 1.05 ? ` Panic buying: prices up ${Math.round((k - 1) * 100)} %, ammo limited to ${ammoLimit(game)} boxes.` : ''}` : 'The gun shop is shut. Guns and ammo come by trade now.'}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 8 }}>
      {GUNS.map(m => <div key={m.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10, display: 'flex', gap: 10 }}>
        <Icon id={icon(m.type)} />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><b>{m.name}</b><span style={{ color: C.gold }}>{usd(m.price * k)}</span></div>
          <div style={{ fontSize: 11.5, color: C.dim, lineHeight: 1.3, margin: '2px 0 5px' }}>{CALIBER[m.cal].name} · holds {m.capacity} · {m.blurb}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button style={btn(open, !open)} disabled={!open} onClick={() => run(d => buyGun(d, m.id))}>Buy</button>
            {owned(m.id) > 0 && <span style={{ fontSize: 11.5, color: C.dim }}>own {owned(m.id)}</span>}
          </div>
        </div>
      </div>)}
    </div>
    <div style={{ fontWeight: 600, margin: '14px 0 6px' }}>Ammunition</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
      {CALIBERS.map((c: Caliber) => <div key={c} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
        <Icon id="ammo" />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}><b>{CALIBER[c].name}</b><span style={{ color: C.gold }}>{usd(CALIBER[c].price * k)}</span></div>
          <div style={{ fontSize: 11.5, color: C.dim }}>box of {CALIBER[c].box} · have {a.ammo[c] ?? 0}</div>
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>{[1, 4].map(n => <button key={n} style={btn(false, !open)} disabled={!open} onClick={() => run(d => buyAmmo(d, c, n))}>+{n}</button>)}</div>
        </div>
      </div>)}
    </div>
    <div style={{ fontWeight: 600, margin: '14px 0 6px' }}>Your guns</div>
    {!a.guns.length && <div style={{ color: C.dim }}>None yet.</div>}
    {a.guns.map(x => <div key={x.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0', borderBottom: `1px solid ${C.line}` }}>
      <span style={{ flex: 1 }}>{GUN[x.model].name} <span style={{ color: C.dim, fontSize: 11.5 }}>· {CALIBER[GUN[x.model].cal].name} · {x.fired} rounds fired · <span style={{ color: x.condition < 0.5 ? C.bad : C.dim }}>{x.condition < 0.5 ? 'needs cleaning' : x.condition < 0.8 ? 'fair' : 'good'}</span> · {x.carrier ? `carried by ${game.people.find(p => p.id === x.carrier)?.first}` : x.where === 'safe' ? 'in the safe' : 'in the house'}</span></span>
      <select value={x.carrier ?? ''} onChange={e => run(d => { issue(d, x.id, e.target.value || null); return null; })} style={{ background: '#2a2c26', color: '#eee', border: `1px solid ${C.line}`, borderRadius: 6, padding: '2px 4px' }}>
        <option value="">{game.stock.gun_safe >= 1 ? 'in the safe' : 'not carried'}</option>
        {game.people.filter((p, i) => game.personState[i]?.needs.died == null && (!p.kid || p.age >= 15)).map(p => <option key={p.id} value={p.id}>{p.first}</option>)}
      </select>
    </div>)}
    {a.guns.length > 0 && game.stock.gun_safe < 1 && game.people.some(p => p.kid && p.age < 13) && <div style={{ color: C.bad, marginTop: 6 }}>No gun safe, and little kids in the house. Get a safe (Fuel & tools).</div>}
    <div style={{ fontWeight: 600, margin: '14px 0 6px' }}>Who can shoot</div>
    {game.people.filter((p, i) => game.personState[i]?.needs.died == null && (!p.kid || p.age >= 10)).map(p => {
      const sk = skillOf(game, p.id);
      return <div key={p.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' }}>
        <span style={{ width: 120 }}>{p.first}, {p.age}</span>
        <div style={{ width: 120, height: 5, background: '#333', borderRadius: 3 }}><div style={{ width: `${sk * 10}%`, height: '100%', background: '#c9b27a', borderRadius: 3 }} /></div>
        <span style={{ color: C.dim, fontSize: 11.5, width: 30 }}>{sk.toFixed(1)}</span>
        <button style={btn(false, !open)} disabled={!open} title={`A weekend class in town: $${CLASS_USD}`} onClick={() => run(d => takeClass(d, p.id))}>Class ${CLASS_USD}</button>
        <button style={btn()} title="100 rounds at the range" onClick={() => run(d => practice(d, p.id))}>Practice</button>
      </div>;
    })}
  </>;
}
