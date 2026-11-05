/**
 * Shop card icons for goods that ShopWindow's own switch does not draw (procedural: shapes and colors on a 44x44 tile, no
 * image files). `shopIconArt(id)` returns the tile's inside, or null when the good has no drawing here. A test
 * (shopIcons.test.ts) fails when any good on any shelf falls through to the gray placeholder box.
 */
import type { ReactNode } from 'react';

const STEEL = '#b9bfc4', DARK = '#2a2e32', WOOD = '#a9794a', CREAM = '#e8dfc0', OD = '#4a5a3a';

/** A side-on animal: body, head, legs, and a tail; the parameters make a goat, cow, pig, steer or rabbit. */
function animal(o: { body: string; patch?: string; head: string; w?: number; h?: number; ears?: 'up' | 'down' | 'long' | 'none'; horns?: boolean; legs?: number; tail?: 'tuft' | 'curl' | 'puff'; snout?: string }): ReactNode {
  const w = o.w ?? 22, h = o.h ?? 11, x0 = 22 - w / 2, y0 = 31 - h - (o.legs ?? 6), lg = o.legs ?? 6;
  const hx = x0 + w + 1, hy = y0 - 2;
  return <>
    <path d={`M${x0 + 4} ${y0 + h} v${lg} M${x0 + w - 4} ${y0 + h} v${lg}`} stroke={o.head} strokeWidth="2.6" strokeLinecap="round" />
    <rect x={x0} y={y0} width={w} height={h} rx={h / 2.4} fill={o.body} />
    {o.patch && <ellipse cx={x0 + w * 0.4} cy={y0 + h * 0.45} rx={w * 0.17} ry={h * 0.28} fill={o.patch} />}
    <ellipse cx={hx} cy={hy + 4} rx="5" ry="4.4" fill={o.head} />
    {o.snout && <ellipse cx={hx + 4.4} cy={hy + 6} rx="2.6" ry="2" fill={o.snout} />}
    <circle cx={hx + 1} cy={hy + 3} r="0.9" fill={DARK} />
    {o.ears === 'up' && <path d={`M${hx - 2} ${hy} l-1 -5 l3 3 z M${hx + 2} ${hy} l1 -5 l1 4 z`} fill={o.head} />}
    {o.ears === 'down' && <path d={`M${hx - 3} ${hy + 1} l-3 4 l5 0 z`} fill={o.head} stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />}
    {o.ears === 'long' && <path d={`M${hx - 2} ${hy + 1} q-2 -9 1 -10 q3 2 1 10 z M${hx + 1} ${hy + 1} q0 -9 3 -9 q2 3 -1 9 z`} fill={o.head} stroke="rgba(0,0,0,0.25)" strokeWidth="0.5" />}
    {o.horns && <path d={`M${hx - 2} ${hy} q-1 -5 -4 -5 M${hx + 2} ${hy} q1 -5 4 -5`} stroke={CREAM} strokeWidth="1.6" fill="none" strokeLinecap="round" />}
    {o.tail === 'tuft' && <path d={`M${x0} ${y0 + 2} q-4 2 -3 8`} stroke={o.head} strokeWidth="1.6" fill="none" strokeLinecap="round" />}
    {o.tail === 'curl' && <path d={`M${x0} ${y0 + 2} q-5 -2 -3 2 q2 2 -1 3`} stroke={o.head} strokeWidth="1.5" fill="none" strokeLinecap="round" />}
    {o.tail === 'puff' && <circle cx={x0 - 1} cy={y0 + 3} r="3" fill={CREAM} />}
  </>;
}

const bottle = (cap: string, body: string, label: string): ReactNode => <>
  <rect x="14" y="14" width="16" height="22" rx="3" fill={body} />
  <rect x="15" y="8" width="14" height="7" rx="1.5" fill={cap} />
  <rect x="14" y="20" width="16" height="9" fill={label} />
</>;

const ART: Record<string, () => ReactNode> = {
  // building
  tunnel_kit_small: () => <><path d="M5 34 q17 -34 34 0" fill="#dfeef2" fillOpacity="0.45" stroke="#9aa4aa" strokeWidth="1.6" /><path d="M14 34 q8 -22 16 0 M5 34 h34" stroke="#9aa4aa" strokeWidth="1.4" fill="none" /><path d="M12 34 q10 -12 20 0" stroke="#7fa860" strokeWidth="2" fill="none" /></>,
  tunnel_kit_high: () => <><path d="M6 36 V20 q16 -18 32 0 V36 Z" fill="#dfeef2" fillOpacity="0.45" stroke="#9aa4aa" strokeWidth="1.8" /><path d="M6 36 V20 M38 36 V20 M22 7 V36 M14 12 V36 M30 12 V36" stroke="#8a949a" strokeWidth="1.3" /><path d="M6 36 h32" stroke="#6a6a60" strokeWidth="2.5" /></>,
  poly_film: () => <><rect x="8" y="14" width="28" height="18" rx="9" fill="#dfeef2" fillOpacity="0.55" stroke="#9aa4aa" strokeWidth="1.6" /><ellipse cx="36" cy="23" rx="4" ry="9" fill="#cfe4ea" stroke="#9aa4aa" strokeWidth="1.4" /><ellipse cx="36" cy="23" rx="1.6" ry="3.6" fill="#8a949a" /><path d="M12 20 q6 2 12 0 M12 26 q6 2 12 0" stroke="#ffffff" strokeOpacity="0.5" fill="none" /></>,
  aqua_kit: () => <><rect x="6" y="18" width="32" height="18" rx="2" fill="#5a9ad0" fillOpacity="0.55" stroke="#9fd0e0" strokeWidth="1.6" /><path d="M14 27 q4 -4 8 0 q-4 4 -8 0 z M22 27 l3 -2 v4 z" fill="#f08a3a" /><path d="M30 18 v-5 M30 15 q-5 0 -6 -4 M30 15 q5 0 6 -4" stroke="#6fbf6f" strokeWidth="1.8" fill="none" strokeLinecap="round" /></>,
  modular_unit: () => <><rect x="6" y="16" width="32" height="20" fill="#cfc8b8" stroke="#6a6458" strokeWidth="1.6" /><path d="M4 16 l18 -8 l18 8 z" fill="#7a5a48" /><rect x="10" y="21" width="8" height="8" fill="#7aa0b0" stroke="#4a5a60" /><rect x="26" y="21" width="8" height="15" fill="#8a6a48" /><path d="M6 33 h32" stroke="#8a8478" /></>,
  // power
  hydro_set: () => <><circle cx="20" cy="20" r="11" fill="#6a7a84" stroke="#2a3238" strokeWidth="2" />{[0, 45, 90, 135, 180, 225, 270, 315].map(a => <rect key={a} x="18.6" y="7" width="2.8" height="6" fill="#aab4ba" transform={`rotate(${a} 20 20)`} />)}<circle cx="20" cy="20" r="3" fill="#2a3238" /><path d="M2 36 q6 -4 12 0 t12 0 t12 0" stroke="#5a9ad0" strokeWidth="2.4" fill="none" /></>,
  penstock: () => <><path d="M5 12 L30 32 h9" stroke="#7a838a" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M5 12 L30 32 h9" stroke="#aab4ba" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" /><path d="M14 18 l2 -3 M22 24 l2 -3" stroke="#3a4248" strokeWidth="2" /><path d="M5 40 h34" stroke="#5a9ad0" strokeWidth="2" /></>,
  wind_turbine: () => <><path d="M22 22 V40" stroke="#c8ccd0" strokeWidth="3" /><path d="M22 22 V4 M22 22 L37 30 M22 22 L7 30" stroke="#e8ecec" strokeWidth="3.4" strokeLinecap="round" /><circle cx="22" cy="22" r="3" fill="#8a9298" /></>,
  tilt_tower: () => <><path d="M14 40 L22 6 L30 40 M16 31 h12 M18 22 h8 M20 14 h4 M16 31 L28 22 M28 31 L16 22" stroke="#9aa2a8" strokeWidth="1.8" fill="none" /><path d="M10 40 h24" stroke="#5a5a52" strokeWidth="3" /><path d="M31 36 l7 -3" stroke="#d8b84a" strokeWidth="2" /></>,
  // food and farm
  goat: () => animal({ body: '#e8e2d4', head: '#d8d0bc', horns: true, ears: 'down', tail: 'tuft', w: 20, h: 10 }),
  cow: () => animal({ body: '#f2f0ea', patch: '#2a2a2a', head: '#e4e0d6', ears: 'down', tail: 'tuft', w: 24, h: 12, snout: '#e8a8a0' }),
  pig: () => animal({ body: '#f0b4aa', head: '#e8a49a', ears: 'down', tail: 'curl', w: 22, h: 12, legs: 4, snout: '#d88a82' }),
  steer: () => animal({ body: '#7a4a2e', head: '#6a3e26', horns: true, ears: 'down', tail: 'tuft', w: 26, h: 13, snout: '#a87a5a' }),
  rabbit: () => animal({ body: '#b8a48a', head: '#a8947a', ears: 'long', tail: 'puff', w: 14, h: 10, legs: 3 }),
  hay: () => <><rect x="7" y="14" width="30" height="22" rx="3" fill="#d4b84a" stroke="#8a7220" strokeWidth="1.5" /><path d="M7 21 h30 M7 29 h30" stroke="#8a7220" strokeWidth="1.8" /><path d="M12 14 l-1 -4 M20 14 l1 -5 M29 14 l-1 -4 M34 14 l2 -3" stroke="#d4b84a" strokeWidth="1.8" strokeLinecap="round" /></>,
  feed: () => <><path d="M12 10 q10 -4 20 0 l3 26 q-13 4 -26 0 z" fill="#c8a868" stroke="#7a6a3a" /><path d="M14 11 q8 3 16 0" stroke="rgba(0,0,0,0.3)" fill="none" /><circle cx="19" cy="24" r="1.6" fill="#e8c860" /><circle cx="24" cy="27" r="1.6" fill="#e8c860" /><circle cx="28" cy="22" r="1.6" fill="#e8c860" /><circle cx="22" cy="31" r="1.6" fill="#e8c860" /></>,
  vet_kit: () => <><rect x="7" y="14" width="30" height="22" rx="3" fill="#4a6a8a" stroke="#223244" strokeWidth="1.6" /><rect x="16" y="9" width="12" height="6" rx="2" fill="none" stroke="#223244" strokeWidth="2" /><path d="M22 20 v10 M17 25 h10" stroke="#f2f0ea" strokeWidth="3.4" /><path d="M31 18 l5 -5" stroke="#dfe6ea" strokeWidth="2" /></>,
  cheese_kit: () => <><ellipse cx="22" cy="30" rx="15" ry="6" fill="#e8c040" /><rect x="7" y="22" width="30" height="8" fill="#e8c040" /><ellipse cx="22" cy="22" rx="15" ry="6" fill="#f2d868" stroke="#a88a20" strokeWidth="1.2" /><circle cx="17" cy="22" r="1.8" fill="#c8a020" /><circle cx="26" cy="23" r="1.4" fill="#c8a020" /><circle cx="30" cy="27" r="1.6" fill="#c8a020" /></>,
  bee_nuc: () => <><rect x="9" y="16" width="26" height="8" fill="#e8d098" stroke="#8a7240" /><rect x="9" y="25" width="26" height="9" fill="#d8bc78" stroke="#8a7240" /><rect x="7" y="12" width="30" height="5" fill="#a8905a" /><rect x="19" y="28" width="6" height="2.6" fill="#2a2418" /><ellipse cx="38" cy="10" rx="3" ry="2" fill="#e8b830" /><path d="M36 10 h4 M38 8 v4" stroke="#2a2418" strokeWidth="0.8" /><ellipse cx="35.4" cy="7.6" rx="1.8" ry="1" fill="#dfeef2" /></>,
  hive_supplies: () => <><path d="M8 34 h28 l-3 -14 q-11 -10 -22 0 z" fill="#e8dfc0" stroke="#8a7a50" /><ellipse cx="22" cy="20" rx="9" ry="3" fill="#c8bb98" /><path d="M12 30 q10 3 20 0" stroke="#8a7a50" fill="none" /><rect x="30" y="8" width="4" height="12" fill="#8a8e92" transform="rotate(25 32 14)" /></>,
  maple_taps: () => <><path d="M22 4 V40" stroke="#6a4a30" strokeWidth="8" /><path d="M22 4 V40" stroke="#8a6a48" strokeWidth="3" /><path d="M26 16 h8 v4" stroke="#aab4ba" strokeWidth="2.4" fill="none" /><path d="M32 22 h8 v12 h-8 z" fill="#aab4ba" stroke="#6a7278" /><path d="M36 20 v3" stroke="#e0a030" strokeWidth="2" /></>,
  tilapia_fry: () => <><path d="M8 24 q8 -9 18 -2 l8 -5 v14 l-8 -5 q-10 7 -18 -2 z" fill="#8aa8b8" stroke="#4a6070" /><circle cx="13" cy="22" r="1.4" fill={DARK} /><path d="M18 18 q3 -3 6 0" stroke="#6a8898" fill="none" /></>,
  jon_boat: () => <><path d="M4 22 h36 l-4 11 h-28 z" fill="#8a9298" stroke="#454c52" strokeWidth="1.6" /><path d="M10 27 h24" stroke="#454c52" /><path d="M2 36 q5 -3 10 0 t10 0 t10 0 t10 0" stroke="#5a9ad0" strokeWidth="2.2" fill="none" /></>,
  skiff: () => <><path d="M3 24 h34 l4 -4 -3 13 h-32 z" fill="#e8ecec" stroke="#6a7278" strokeWidth="1.6" /><rect x="34" y="12" width="6" height="14" rx="2" fill="#2a4a6a" /><path d="M37 26 v8" stroke="#2a4a6a" strokeWidth="3" /><path d="M2 38 q5 -3 10 0 t10 0 t10 0 t10 0" stroke="#5a9ad0" strokeWidth="2.2" fill="none" /></>,
  // medical and household
  antibiotics: () => bottle('#f2f0ea', '#d88a2a', '#f2f0ea'),
  splints: () => <><rect x="6" y="14" width="32" height="7" rx="2" fill="#c8a468" stroke="#7a6038" transform="rotate(-12 22 17)" /><circle cx="22" cy="31" r="8" fill="#f2f0ea" stroke="#b8b4a8" strokeWidth="1.5" /><circle cx="22" cy="31" r="3" fill="#2c2f28" /><path d="M14 30 h16 M15 34 h14" stroke="#d8d4c8" strokeWidth="1" /></>,
  ors: () => <><rect x="10" y="9" width="24" height="26" rx="2" fill="#f2f0ea" stroke="#8a8a80" /><path d="M10 13 h24 M10 31 h24" stroke="#8a8a80" strokeDasharray="2 1.5" /><path d="M22 16 q-4 5 0 8 q4 -3 0 -8 z" fill="#5a9ad0" /><path d="M16 28 h12" stroke="#5a9ad0" strokeWidth="2" /></>,
  dental_kit: () => <><rect x="7" y="27" width="30" height="10" rx="3" fill="#4a6a8a" stroke="#223244" /><path d="M13 7 q5 -3 9 0 q4 -3 9 0 q4 5 0 10 q-1 5 -3 11 q-2 0 -2 -6 h-8 q0 6 -2 6 q-2 -6 -3 -11 q-4 -5 0 -10 z" fill="#f2f0ea" stroke="#9a9a90" strokeWidth="1.2" /></>,
  midwife_kit: () => <><rect x="7" y="16" width="30" height="20" rx="3" fill="#a85a6a" stroke="#4a222c" strokeWidth="1.6" /><path d="M16 16 q6 -9 12 0" fill="none" stroke="#4a222c" strokeWidth="2.4" /><path d="M22 22 q-5 -3 -5 2 q0 4 5 7 q5 -3 5 -7 q0 -5 -5 -2 z" fill="#f2f0ea" /></>,
  medical_books: () => <><rect x="8" y="10" width="14" height="26" rx="1.5" fill="#8a2a2a" stroke="#3a1010" /><rect x="22" y="12" width="14" height="24" rx="1.5" fill="#2a4a6a" stroke="#101c2a" /><path d="M15 17 v10 M10 22 h10" stroke="#f2f0ea" strokeWidth="2.6" /><path d="M26 18 h6 M26 22 h6 M26 26 h5" stroke="#e8dfc0" strokeWidth="1.4" /></>,
  vehicle_parts: () => <><circle cx="17" cy="24" r="9" fill="#8a9298" stroke="#454c52" strokeWidth="1.6" />{[0, 45, 90, 135, 180, 225, 270, 315].map(a => <rect key={a} x="15.6" y="12" width="2.8" height="4" fill="#8a9298" stroke="#454c52" strokeWidth="0.6" transform={`rotate(${a} 17 24)`} />)}<circle cx="17" cy="24" r="3.4" fill="#2a2e32" /><path d="M28 36 L38 14" stroke="#b9bfc4" strokeWidth="4" strokeLinecap="round" /><circle cx="38" cy="13" r="4" fill="#b9bfc4" /><circle cx="38" cy="13" r="1.6" fill="#2c2f28" /></>,
  // kit and security
  soft_armor: () => <><path d="M13 7 q9 5 18 0 l5 7 -3 5 v17 h-22 v-17 l-3 -5 z" fill="#3a4a5a" stroke="#1a2430" strokeWidth="1.6" /><path d="M13 7 q9 8 18 0" fill="none" stroke="#1a2430" strokeWidth="1.6" /><path d="M11 23 h22 M11 28 h22" stroke="#222e3a" strokeWidth="1.4" /><rect x="15" y="31" width="14" height="6" rx="1.5" fill="#2e3c4a" stroke="#1a2430" /><path d="M8 19 l3 -2 M36 19 l-3 -2" stroke="#8a9298" strokeWidth="2" /></>,
  helmet: () => <><path d="M7 28 q0 -17 15 -17 q15 0 15 17 z" fill={OD} stroke="#2a3220" strokeWidth="1.6" /><path d="M7 28 h30 v3 h-30 z" fill="#3a4630" stroke="#2a3220" /><path d="M13 18 q4 -4 9 -4" stroke="#6a7a58" strokeWidth="1.6" fill="none" /><rect x="19" y="8" width="6" height="4" rx="1" fill="#2a3220" /><path d="M10 31 q-2 5 2 6 M34 31 q2 5 -2 6" stroke="#2a3220" strokeWidth="2" fill="none" /></>,
  sw_radio: () => <><rect x="7" y="16" width="30" height="20" rx="3" fill="#8a3a2a" stroke="#3a1610" strokeWidth="1.6" /><rect x="11" y="20" width="14" height="6" rx="1" fill="#e8dfc0" /><path d="M13 23 h10" stroke="#8a3a2a" /><circle cx="31" cy="24" r="3.4" fill="#2a2a2a" stroke="#c8ccd0" /><path d="M11 31 h22" stroke="#2a1410" strokeDasharray="1.6 1.6" /><path d="M32 16 L40 5" stroke="#c8ccd0" strokeWidth="1.6" /><path d="M24 36 v2 h-4" stroke="#3a1610" strokeWidth="1.4" fill="none" /></>,
  ham_rig: () => <><rect x="5" y="18" width="34" height="16" rx="2" fill="#3a3e44" stroke="#14161a" strokeWidth="1.6" /><rect x="8" y="21" width="14" height="6" rx="1" fill="#5aa070" /><path d="M10 24 h10" stroke="#1a3a24" strokeWidth="1.2" /><circle cx="29" cy="25" r="3.4" fill="#1a1c20" stroke="#aab0b6" /><circle cx="36" cy="25" r="2.4" fill="#1a1c20" stroke="#aab0b6" /><path d="M9 31 h12" stroke="#8a9096" strokeDasharray="1.4 1.4" /><path d="M14 18 V8 M9 8 h10 M11 12 h6" stroke="#d8b84a" strokeWidth="1.6" /></>,
  gun_mount: () => <><path d="M8 38 h28" stroke="#4a4e52" strokeWidth="3" /><path d="M16 38 V28 M28 38 V28" stroke="#5a5e62" strokeWidth="3" /><circle cx="22" cy="25" r="8" fill="none" stroke="#8a9298" strokeWidth="3" /><rect x="14" y="21" width="26" height="6" rx="1.5" fill="#2a2c2e" stroke="#6a6e72" /><rect x="34" y="22.5" width="8" height="3" fill="#6a6e72" /><path d="M16 21 v-5 h8 v5" fill="#3a3c3e" stroke="#6a6e72" /></>,
  turret_head: () => <><path d="M6 38 h32" stroke="#4a4e52" strokeWidth="3" /><path d="M10 36 q0 -18 12 -18 q12 0 12 18 z" fill="#5a625e" stroke="#222622" strokeWidth="1.8" /><rect x="18" y="26" width="22" height="5" rx="1.5" fill="#2a2c2e" stroke="#6a6e72" /><circle cx="19" cy="28.5" r="3.4" fill="#223" stroke="#9fd0e0" strokeWidth="1.4" /><path d="M22 18 v-6 M19 12 h6" stroke="#8a9298" strokeWidth="1.8" /></>,
  // food shelf props
  'f:mylar': () => <><path d="M12 8 h20 l2 4 v22 l-2 4 h-20 l-2 -4 v-22 z" fill="#c8ccd2" stroke="#7a8088" strokeWidth="1.4" /><path d="M12 8 h20 M12 38 h20" stroke="#8a9096" strokeWidth="1.4" strokeDasharray="1.6 1.2" /><path d="M14 14 l6 20" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="3" /><rect x="15" y="19" width="14" height="10" rx="1" fill="#3a5a8a" /><path d="M18 24 h8" stroke="#e8dfc0" strokeWidth="1.6" /></>,
  'f:crate': () => <><rect x="6" y="12" width="32" height="24" fill={WOOD} stroke="#4a3018" strokeWidth="1.6" /><path d="M6 20 h32 M6 28 h32" stroke="#4a3018" strokeWidth="1.2" /><path d="M6 12 L38 36 M38 12 L6 36" stroke="#7a5430" strokeWidth="1.6" /><path d="M10 15 h3 M30 33 h3" stroke={STEEL} strokeWidth="1.4" /></>,
};

/** The inside of a shop tile for goods drawn here, or null. */
export function shopIconArt(id: string): ReactNode | null {
  const f = ART[id];
  return f ? f() : null;
}

/** Every good this file draws. */
export const SHOP_ICON_IDS: ReadonlySet<string> = new Set(Object.keys(ART));
