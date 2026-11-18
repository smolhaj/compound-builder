/**
 * "How the skirt works": a technical cutaway of the buried skirt that stops tunneling raiders, drawn as procedural SVG from the pure dome model
 * (`sim/dome/tiers`, `siting`, `crossing`, `vestibule`, `tunnelers`), so the numbers on the page are the numbers the game uses. The same components
 * produce `docs/ux/dome-mock/skirt-cutaway.svg` (scripts/buildSkirtCutaway.mjs) and the in-game info card.
 *
 *   SkirtSection  a vertical section: shell, ring beam, buried skirt, strata, water table, dig depth bands, a raider tunnel turned at the skirt,
 *                 ground sensors, the airlock chamber with its two doors and the legitimate tunnel crossing. Depths are to scale (7.6 px a ft);
 *                 the ring beam, strata thickness and everything above grade except the airlock chamber are schematic.
 *   SkirtPlan     the same story from above: the skirt ring, the airlocks, and where a turned tunnel goes.
 *
 * Pure presentation: no state, no THREE. US units (feet) throughout.
 */
import type { ReactElement, ReactNode } from 'react';
import { TIER, DOME_TIERS, type DomeTier } from '../sim/dome/tiers';
import { SKIRT_NUMBERS, skirtFacts } from '../sim/dome/skirtFacts';
import { vestibuleOf } from '../sim/dome/vestibule';
import { FT_PER_UNIT, airlockAngles } from '../sim/dome/standing';
import { SALLY_HOLD } from '../sim/dome/siege';

// ── palette: warm paper, navy ink, one amber and one red ──
const C = {
  paper: '#f4efe4', paper2: '#ebe4d3', ink: '#1c2b3d', ink2: '#44566b', faint: '#8d99a6', grid: '#d9d1bf',
  concrete: '#b7bbc0', concreteDk: '#8b9097', steel: '#5e6f82',
  amber: '#e29a2e', red: '#c4402c', teal: '#17858a', tealPale: '#d9ecea', water: '#4a8fc2',
  soil1: '#80573a', soil2: '#b08a5e', soil3: '#cdb98d', rock: '#9a9ca0',
};
const FONT = "'Inter','Helvetica Neue','Segoe UI',Arial,'Liberation Sans','DejaVu Sans',sans-serif";

const PX = 7.6;                     // px per foot, vertical and horizontal on the section
const GY = 330;                     // ground line
const dy = (ft: number): number => GY + ft * PX;

const pct = (p: number): string => (p >= 0.99 ? '99%+' : `${Math.round(p * 100)}%`);

const T = (p: { x: number; y: number; children: ReactNode; size?: number; weight?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; italic?: boolean; spacing?: number; opacity?: number; chip?: number }): ReactElement => (
  <g>{p.chip ? <rect x={(p.anchor === 'end' ? p.x - p.chip : p.anchor === 'middle' ? p.x - p.chip / 2 : p.x) - 5} y={p.y - (p.size ?? 15) - 1} width={p.chip + 10} height={(p.size ?? 15) + 8} rx={3} fill={C.paper} opacity={0.9} /> : null}<text x={p.x} y={p.y} fontSize={p.size ?? 15} fontWeight={p.weight ?? 500} fill={p.fill ?? C.ink} textAnchor={p.anchor ?? 'start'} fontStyle={p.italic ? 'italic' : 'normal'} letterSpacing={p.spacing} opacity={p.opacity} fontFamily={FONT}>{p.children}</text></g>
);

/** A numbered callout badge. */
const Badge = ({ x, y, n, fill = C.ink }: { x: number; y: number; n: number; fill?: string }): ReactElement => (
  <g><circle cx={x} cy={y} r={13} fill={fill} stroke={C.paper} strokeWidth={2} /><T x={x} y={y + 5} size={14} weight={800} fill={C.paper} anchor="middle">{n}</T></g>
);

/** A dimension line with arrow ends, horizontal or vertical, and a label. */
function Dim({ x1, y1, x2, y2, label, side = 1, size = 14, fill = C.ink2 }: { x1: number; y1: number; x2: number; y2: number; label: string; side?: 1 | -1; size?: number; fill?: string }): ReactElement {
  const vert = Math.abs(x1 - x2) < 0.5;
  const ang = Math.atan2(y2 - y1, x2 - x1), ah = 7, aw = 3;
  const head = (x: number, y: number, a: number) => `M${x} ${y} L${x - ah * Math.cos(a) + aw * Math.sin(a)} ${y - ah * Math.sin(a) - aw * Math.cos(a)} L${x - ah * Math.cos(a) - aw * Math.sin(a)} ${y - ah * Math.sin(a) + aw * Math.cos(a)} Z`;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  return (
    <g stroke={fill} strokeWidth={1.2} fill={fill}>
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <path d={head(x2, y2, ang)} stroke="none" /><path d={head(x1, y1, ang + Math.PI)} stroke="none" />
      {vert
        ? <g stroke="none"><rect x={mx + side * 8 - (side < 0 ? label.length * size * 0.56 : 0)} y={my - size * 0.75} width={label.length * size * 0.56} height={size * 1.4} fill={C.paper} opacity={0.85} /><T x={mx + side * 10} y={my + 5} size={size} weight={700} fill={fill} anchor={side > 0 ? 'start' : 'end'}>{label}</T></g>
        : <g stroke="none"><T x={mx} y={my + side * -7} size={size} weight={700} fill={fill} anchor="middle" chip={label.length * size * 0.56}>{label}</T></g>}
    </g>
  );
}

function Defs(): ReactElement {
  return (
    <defs>
      <pattern id="sk-concrete" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="9" height="9" fill={C.concrete} /><line x1="0" y1="0" x2="0" y2="9" stroke={C.concreteDk} strokeWidth="1.2" />
      </pattern>
      <pattern id="sk-topsoil" width="12" height="10" patternUnits="userSpaceOnUse"><rect width="12" height="10" fill="#7a5337" /><circle cx="3" cy="3" r="1.1" fill="#4e3322" /><circle cx="9" cy="7" r="1" fill="#a47a55" /><circle cx="6" cy="9" r="0.8" fill="#4e3322" /></pattern>
      <pattern id="sk-clay" width="16" height="12" patternUnits="userSpaceOnUse"><rect width="16" height="12" fill="#b58b5f" /><path d="M0 4 Q4 2 8 4 T16 4 M0 10 Q4 8 8 10 T16 10" stroke="#96704a" strokeWidth="1" fill="none" /><circle cx="12" cy="7" r="0.9" fill="#8a6644" /></pattern>
      <pattern id="sk-gravel" width="20" height="16" patternUnits="userSpaceOnUse"><rect width="20" height="16" fill="#d2c196" /><circle cx="4" cy="4" r="2.4" fill="none" stroke="#a89466" strokeWidth="1" /><circle cx="14" cy="6" r="1.8" fill="none" stroke="#a89466" strokeWidth="1" /><circle cx="9" cy="12" r="2.1" fill="none" stroke="#a89466" strokeWidth="1" /><circle cx="17" cy="13" r="0.9" fill="#b9a478" /></pattern>
      <pattern id="sk-rock" width="30" height="24" patternUnits="userSpaceOnUse"><rect width="30" height="24" fill="#9b9da1" /><path d="M0 6 L12 0 M12 0 L30 8 M5 24 L14 12 L30 16 M14 12 L10 0" stroke="#74777c" strokeWidth="1.2" fill="none" /></pattern>
      <pattern id="sk-wet" width="14" height="8" patternUnits="userSpaceOnUse"><path d="M0 4 Q3.5 1 7 4 T14 4" stroke="#3b7fb5" strokeWidth="1" fill="none" opacity="0.55" /></pattern>
      <pattern id="sk-dig" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><line x1="0" y1="0" x2="0" y2="10" stroke={C.red} strokeWidth="1" opacity="0.35" /></pattern>
      <linearGradient id="sk-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#cfe0ea" /><stop offset="1" stopColor="#f4efe4" /></linearGradient>
      <linearGradient id="sk-inside" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#cfe7e5" /><stop offset="1" stopColor="#eaf4ee" /></linearGradient>
      <linearGradient id="sk-glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#9fd0d3" stopOpacity="0.9" /><stop offset="1" stopColor="#d7eeee" stopOpacity="0.55" /></linearGradient>
      <marker id="sk-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={C.red} /></marker>
      <marker id="sk-arrow-ink" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={C.ink} /></marker>
      <marker id="sk-arrow-teal" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={C.teal} /></marker>
      <filter id="sk-soft" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#1c2b3d" floodOpacity="0.22" /></filter>
    </defs>
  );
}

/** The depth ruler on the left of the section, in feet. */
function Ruler({ x, to }: { x: number; to: number }): ReactElement {
  const ticks: ReactElement[] = [];
  for (let f = 0; f <= to; f += 10) ticks.push(<g key={f}><line x1={x - 8} x2={x} y1={dy(f)} y2={dy(f)} stroke={C.ink} strokeWidth={1.4} /><T x={x - 12} y={dy(f) + 5} size={13} weight={700} anchor="end" fill={C.ink2}>{f} ft</T></g>);
  for (let f = 0; f <= to; f += 2) if (f % 10) ticks.push(<line key={'m' + f} x1={x - 4} x2={x} y1={dy(f)} y2={dy(f)} stroke={C.faint} strokeWidth={1} />);
  return <g><line x1={x} x2={x} y1={GY} y2={dy(to)} stroke={C.ink} strokeWidth={1.6} />{ticks}</g>;
}

/** A buried geophone with listening arcs. */
function Geophone({ x, depth = 4, reach = 80, wave = true }: { x: number; depth?: number; reach?: number; wave?: boolean }): ReactElement {
  const y = dy(depth);
  return (
    <g>
      {wave && [0.34, 0.6, 0.86].map((k, i) => <path key={i} d={`M${x - reach * k * 0.78} ${y + reach * k * 0.62} A${reach * k} ${reach * k} 0 0 0 ${x + reach * k * 0.78} ${y + reach * k * 0.62}`} fill="none" stroke={C.teal} strokeWidth={1.6} strokeDasharray="5 4" opacity={0.75 - i * 0.18} />)}
      <line x1={x} x2={x} y1={y - 9} y2={GY + 1} stroke={C.steel} strokeWidth={2} />
      <path d={`M${x} ${y + 12} L${x - 6} ${y - 4} L${x + 6} ${y - 4} Z`} fill={C.teal} stroke={C.ink} strokeWidth={1.4} />
      <circle cx={x} cy={y - 7} r={3.4} fill={C.paper} stroke={C.ink} strokeWidth={1.2} />
    </g>
  );
}

/** A person at scale (5.6 ft, 0.28 world units) standing on grade. */
function Person({ x, y = GY, tall = 5.6 * PX }: { x: number; y?: number; tall?: number }): ReactElement {
  const h = tall;
  return (
    <g stroke={C.ink} strokeWidth={2.2} strokeLinecap="round" fill="none">
      <circle cx={x} cy={y - h + 5} r={5} fill={C.ink} />
      <line x1={x} y1={y - h + 10} x2={x} y2={y - h * 0.42} /><line x1={x} y1={y - h * 0.42} x2={x - 6} y2={y} /><line x1={x} y1={y - h * 0.42} x2={x + 6} y2={y} />
      <line x1={x} y1={y - h * 0.8} x2={x - 8} y2={y - h * 0.52} /><line x1={x} y1={y - h * 0.8} x2={x + 8} y2={y - h * 0.52} />
    </g>
  );
}

/** Strata, from the surface down: layer bounds in feet. */
const STRATA: Array<{ from: number; to: number; fill: string; name: string }> = [
  { from: 0, to: 3, fill: 'url(#sk-topsoil)', name: 'topsoil' },
  { from: 3, to: 16, fill: 'url(#sk-clay)', name: 'clay subsoil' },
  { from: 16, to: 44, fill: 'url(#sk-gravel)', name: 'sand and gravel' },
  { from: 44, to: 76, fill: 'url(#sk-rock)', name: 'weathered rock' },
];
const WATER_FT = 28;

/**
 * The vertical section. `x0..x1` is the drawn width; the left part (A-A) is the plain wall, the right part (B-B) is cut through an airlock.
 */
export function SkirtSection({ standalone = true }: { standalone?: boolean }): ReactElement {
  const arc = TIER.arcology, th = arc.skirtThickFt * PX;
  const WX = 600;                              // outside face of the skirt on A-A
  const BX = 1010;                             // the shell plane on B-B
  const X0 = 150, X1 = 1390, BOT = dy(76);
  const v = vestibuleOf('arcology', 15), lenPx = v.len * FT_PER_UNIT * PX / 1, hPx = v.h * FT_PER_UNIT * PX / 1, dhPx = v.dh * FT_PER_UNIT * PX / 1;
  const lenFt = Math.round(v.len * FT_PER_UNIT), hFt = Math.round(v.h * FT_PER_UNIT), dhFt = Math.round(v.dh * FT_PER_UNIT * 10) / 10;
  const S = SKIRT_NUMBERS;
  const tiers = DOME_TIERS.map(skirtFacts);
  const ringBeam = (x: number) => (
    <g>
      <rect x={x - 42} y={GY - 36} width={84} height={72} fill="url(#sk-concrete)" stroke={C.ink} strokeWidth={2} />
      {[-30, -14, 2, 18, 34].map((o, i) => <circle key={i} cx={x + o} cy={GY + 26} r={2.6} fill={C.ink} />)}
      {[-30, 34].map((o, i) => <circle key={'t' + i} cx={x + o} cy={GY - 26} r={2.6} fill={C.ink} />)}
    </g>
  );
  const shell = (x: number) => (
    <g>
      <path d={`M${x} ${GY - 36} L${x + 2} 150 L${x + 12} 122`} fill="none" stroke={C.ink} strokeWidth={7} strokeLinecap="round" />
      <path d={`M${x} ${GY - 36} L${x + 2} 150 L${x + 12} 122`} fill="none" stroke="url(#sk-glass)" strokeWidth={3.6} strokeLinecap="round" />
      {Array.from({ length: 9 }, (_, i) => { const yy = GY - 56 - i * 20; return <line key={i} x1={x - 6} x2={x + 7} y1={yy} y2={yy} stroke={C.steel} strokeWidth={2} />; })}
      <path d={`M${x - 12} 116 l7 -9 l5 9 l7 -9 l5 9`} fill="none" stroke={C.ink2} strokeWidth={1.6} />
    </g>
  );
  return (
    <svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg" width={standalone ? 1920 : '100%'} role="img" aria-label="Section through a dome wall showing the buried skirt, the tunnelers' dig depths, ground sensors, the airlock and the tunnel crossing" style={{ display: 'block', background: C.paper, fontFamily: FONT }}>
      <Defs />
      <rect width="1920" height="1080" fill={C.paper} />
      {/* faint blueprint grid */}
      <g stroke={C.grid} strokeWidth={0.8} opacity={0.55}>{Array.from({ length: 48 }, (_, i) => <line key={'v' + i} x1={i * 40} x2={i * 40} y1={0} y2={1080} />)}{Array.from({ length: 28 }, (_, i) => <line key={'h' + i} x1={0} x2={1920} y1={i * 40} y2={i * 40} />)}</g>

      {/* title */}
      <T x={60} y={62} size={40} weight={800} spacing={1}>THE BURIED SKIRT</T>
      <T x={62} y={92} size={19} weight={500} fill={C.ink2}>A vertical cutaway of a dome wall: how the footing stops a tunnel, and where a tunnel is allowed through.</T>
      <rect x={60} y={104} width={120} height={4} fill={C.amber} />

      {/* ── the ground drawing ── */}
      <clipPath id="sk-clip"><rect x={X0} y={112} width={X1 - X0} height={BOT - 112} /></clipPath>
      <g clipPath="url(#sk-clip)">
        <rect x={X0} y={112} width={X1 - X0} height={GY - 112} fill="url(#sk-sky)" />
        {/* the dome's own air: the inside of the shell, on both sections */}
        <rect x={WX + 16} y={112} width={880 - WX - 16} height={GY - 112} fill="url(#sk-inside)" />
        <rect x={BX + 4} y={112} width={X1 - BX - 4} height={GY - 112} fill="url(#sk-inside)" />
        {/* strata */}
        {STRATA.map(s => <rect key={s.name} x={X0} y={dy(s.from)} width={X1 - X0} height={(s.to - s.from) * PX + (s.to === 76 ? 40 : 0)} fill={s.fill} />)}
        {/* saturated ground under the water table */}
        <rect x={X0} y={dy(WATER_FT)} width={X1 - X0} height={dy(44) - dy(WATER_FT)} fill="url(#sk-wet)" />
        <rect x={X0} y={dy(WATER_FT)} width={X1 - X0} height={dy(44) - dy(WATER_FT)} fill={C.water} opacity={0.13} />
        {STRATA.slice(1).map(s => <line key={'l' + s.name} x1={X0} x2={X1} y1={dy(s.from)} y2={dy(s.from)} stroke="#5a4630" strokeWidth={1} opacity={0.4} />)}
        {/* grade */}
        <path d={`M${X0} ${GY} H${X1}`} stroke={C.ink} strokeWidth={2.6} />
        <path d={`M${X0} ${GY - 3} q40 -6 80 0 t80 0 t80 0 t80 0 t80 0 t80 0`} fill="none" stroke="#6c8a52" strokeWidth={3} strokeLinecap="round" opacity={0.85} />

        {/* dig depth bands on the outside of A-A */}
        <rect x={X0} y={dy(S.digLo)} width={WX - 42 - X0} height={(S.digHi - S.digLo) * PX} fill={C.amber} opacity={0.32} />
        <rect x={X0} y={dy(S.learnedLo)} width={WX - 42 - X0} height={(S.learnedHi - S.learnedLo) * PX} fill="url(#sk-dig)" />
        <rect x={X0} y={dy(S.learnedLo)} width={WX - 42 - X0} height={(S.learnedHi - S.learnedLo) * PX} fill={C.red} opacity={0.17} />
        {[S.digLo, S.digHi, S.learnedLo, S.learnedHi].map(f => <line key={f} x1={X0} x2={WX - 42} y1={dy(f)} y2={dy(f)} stroke={f <= S.digHi ? C.amber : C.red} strokeWidth={1.4} strokeDasharray="7 5" opacity={0.9} />)}

        {/* water table */}
        <line x1={X0} x2={WX - 42} y1={dy(WATER_FT)} y2={dy(WATER_FT)} stroke={C.water} strokeWidth={2.2} strokeDasharray="14 6" />
        <line x1={WX + 40} x2={880} y1={dy(WATER_FT)} y2={dy(WATER_FT)} stroke={C.water} strokeWidth={2.2} strokeDasharray="14 6" />
        <line x1={BX + 40} x2={X1} y1={dy(WATER_FT)} y2={dy(WATER_FT)} stroke={C.water} strokeWidth={2.2} strokeDasharray="14 6" />
        <line x1={X0} x2={BX - 42} y1={dy(WATER_FT)} y2={dy(WATER_FT)} stroke={C.water} strokeWidth={2.2} strokeDasharray="14 6" />

        {/* ── A-A: the buried skirt ── */}
        {ringBeam(WX + 16)}
        <rect x={WX} y={GY + 36} width={th} height={dy(arc.skirtFt) - GY - 36} fill="url(#sk-concrete)" stroke={C.ink} strokeWidth={2} />
        <path d={`M${WX} ${dy(arc.skirtFt)} l${th / 2} 12 l${th / 2} -12`} fill="url(#sk-concrete)" stroke={C.ink} strokeWidth={2} />
        {Array.from({ length: 13 }, (_, i) => <circle key={i} cx={WX + 6} cy={GY + 56 + i * 32} r={2} fill={C.ink} opacity={0.8} />)}
        {Array.from({ length: 13 }, (_, i) => <circle key={'b' + i} cx={WX + th - 6} cy={GY + 56 + i * 32} r={2} fill={C.ink} opacity={0.8} />)}
        {shell(WX + 16)}

        {/* the tier ladder on the inside face */}
        {tiers.map(t => (
          <g key={t.tier}>
            <line x1={WX + th} x2={WX + th + 92} y1={dy(t.depth)} y2={dy(t.depth)} stroke={C.ink} strokeWidth={1.4} />
            <circle cx={WX + th + 92} cy={dy(t.depth)} r={3.2} fill={C.ink} />
          </g>
        ))}
        {/* what a raider tunnel meets */}
        {/* plain crew tunnel, 12 ft */}
        <path d={`M232 ${GY} L300 ${dy(12)} L${WX - 2} ${dy(12)}`} fill="none" stroke="#2a1a10" strokeWidth={26} strokeLinejoin="round" />
        <path d={`M232 ${GY} L300 ${dy(12)} L${WX - 2} ${dy(12)}`} fill="none" stroke="#5a3b27" strokeWidth={17} strokeLinejoin="round" />
        {[330, 380, 430, 480, 530].map(x => <g key={x} stroke="#2a1a10" strokeWidth={3}><line x1={x} y1={dy(12) - 12} x2={x} y2={dy(12) + 12} /></g>)}
        {/* learned crew tunnel, 24 ft */}
        <path d={`M170 ${GY} L250 ${dy(24)} L${WX - 2} ${dy(24)}`} fill="none" stroke="#2a1a10" strokeWidth={26} strokeLinejoin="round" opacity={0.0} />
        {/* their spoil */}
        <path d={`M196 ${GY} q16 -34 40 -34 q22 0 40 34 z`} fill="#8a6644" stroke={C.ink} strokeWidth={1.6} />
        {/* ground sensors and their cable to the listening base inside */}
        <path d={`M300 ${dy(4)} H${WX - 40}`} stroke={C.steel} strokeWidth={2} strokeDasharray="3 3" />
        <path d={`M${WX - 40} ${dy(4)} V${GY - 14}`} stroke={C.steel} strokeWidth={2} strokeDasharray="3 3" />
        <Geophone x={300} depth={4} reach={96} />
        <Geophone x={490} depth={4} reach={96} wave={false} />
        <rect x={WX + 60} y={GY - 26} width={56} height={26} rx={3} fill={C.paper} stroke={C.ink} strokeWidth={2} />
        <circle cx={WX + 76} cy={GY - 13} r={5} fill={C.teal} /><line x1={WX + 88} x2={WX + 108} y1={GY - 16} y2={GY - 16} stroke={C.ink} strokeWidth={2} /><line x1={WX + 88} x2={WX + 104} y1={GY - 10} y2={GY - 10} stroke={C.ink} strokeWidth={2} />
        <path d={`M${WX + 60} ${GY - 13} H${WX + 36}`} stroke={C.steel} strokeWidth={2} strokeDasharray="3 3" />

        {/* a person for scale, on the inside */}
        <Person x={WX + 230} />

        {/* ── break between the two sections ── */}
        <g>
          <path d={`M892 112 l10 40 l-14 40 l14 40 l-14 40 l14 40 l-14 40 l14 40 l-14 40 l14 40 l-14 40 l14 40 l-14 40 l14 40 l-14 40 L892 ${BOT}`} fill="none" stroke="none" />
          <polygon points={`888,112 902,150 886,190 902,230 886,270 902,310 886,350 902,390 886,430 902,470 886,510 902,550 886,590 902,630 886,670 902,710 886,750 902,790 886,830 902,870 888,${BOT} 936,${BOT} 922,870 938,830 922,790 938,750 922,710 938,670 922,630 938,590 922,550 938,510 922,470 938,430 922,390 938,350 922,310 938,270 922,230 938,190 922,150 936,112`} fill={C.paper} stroke={C.ink} strokeWidth={1.6} />
        </g>

        {/* ── B-B: through an airlock ── */}
        {/* the legitimate tunnel, 10 ft down, to the floor hatch inside the chamber */}
        <path d={`M936 ${dy(10)} H${BX + lenPx - 70}`} stroke="#2a1a10" strokeWidth={50} />
        <path d={`M936 ${dy(10)} H${BX + lenPx - 70}`} stroke="#6b4d38" strokeWidth={42} />
        <path d={`M936 ${dy(10)} H${BX + lenPx - 70}`} stroke="#e6dcc6" strokeWidth={4} strokeDasharray="10 8" opacity={0.7} transform="translate(0 14)" />
        <rect x={BX + lenPx - 96} y={GY + 6} width={26} height={dy(10) + 21 - GY - 6} fill="#6b4d38" stroke="#2a1a10" strokeWidth={4} />
        {Array.from({ length: 5 }, (_, i) => <line key={i} x1={BX + lenPx - 96} x2={BX + lenPx - 70} y1={GY + 24 + i * 22} y2={GY + 24 + i * 22} stroke="#e6dcc6" strokeWidth={2} opacity={0.7} />)}
        {/* skirt and ring beam on B-B, with the sleeve the tunnel passes through */}
        {ringBeam(BX + 16)}
        <rect x={BX} y={GY + 36} width={th} height={dy(arc.skirtFt) - GY - 36} fill="url(#sk-concrete)" stroke={C.ink} strokeWidth={2} />
        <path d={`M${BX} ${dy(arc.skirtFt)} l${th / 2} 12 l${th / 2} -12`} fill="url(#sk-concrete)" stroke={C.ink} strokeWidth={2} />
        <rect x={BX - 6} y={dy(10) - 28} width={th + 12} height={56} fill="#8b9fb0" stroke={C.ink} strokeWidth={2.4} />
        <rect x={BX + 3} y={dy(10) - 21} width={th - 6} height={42} fill="#6b4d38" />
        <path d={`M${BX - 6} ${dy(10) - 28} v56 M${BX + th + 6} ${dy(10) - 28} v56`} stroke={C.ink} strokeWidth={4} />
        {/* the chamber: floor slab, glazed ceiling, outer door in the shell plane, inner door at the far end */}
        <rect x={BX + 16} y={GY} width={lenPx} height={8} fill="url(#sk-concrete)" stroke={C.ink} strokeWidth={1.6} />
        <rect x={BX + 16} y={GY - hPx} width={lenPx + 8} height={9} fill="url(#sk-glass)" stroke={C.ink} strokeWidth={2.2} />
        <path d={`M${BX + 16} ${GY - hPx} V${GY}`} stroke={C.ink} strokeWidth={0} />
        {Array.from({ length: 6 }, (_, i) => <line key={i} x1={BX + 16 + (i + 1) * lenPx / 7} x2={BX + 16 + (i + 1) * lenPx / 7} y1={GY - hPx} y2={GY - hPx + 9} stroke={C.steel} strokeWidth={2} />)}
        <rect x={BX + 16} y={GY - hPx + 9} width={lenPx + 8} height={hPx - 9 - dhPx} fill={C.tealPale} opacity={0.6} />
        {/* inner door: shut */}
        <rect x={BX + 16 + lenPx - 6} y={GY - dhPx} width={9} height={dhPx} fill={C.steel} stroke={C.ink} strokeWidth={2} />
        <rect x={BX + 16 + lenPx + 3} y={GY - hPx + 9} width={9} height={hPx - 9} fill={C.steel} stroke={C.ink} strokeWidth={1.6} opacity={0.0} />
        {/* outer door: open (drawn as the empty frame; the leaf swings out of the plane) */}
        <rect x={BX + 12} y={GY - dhPx} width={8} height={dhPx} fill="none" stroke={C.steel} strokeWidth={2} strokeDasharray="6 4" />
        <path d={`M${BX + 16} ${GY - dhPx} V${GY - hPx + 9}`} stroke={C.ink} strokeWidth={7} />
        {shell(BX + 16)}
        {/* floor hatch inside the chamber, by the inner door */}
        <rect x={BX + lenPx - 104} y={GY - 12} width={46} height={12} fill="url(#sk-concrete)" stroke={C.ink} strokeWidth={2} />
        <rect x={BX + lenPx - 100} y={GY - 17} width={38} height={6} fill={C.steel} stroke={C.ink} strokeWidth={1.6} transform={`rotate(-26 ${BX + lenPx - 100} ${GY - 14})`} />
        <line x1={BX + lenPx - 40} x2={BX + lenPx - 40} y1={GY} y2={GY - 62} stroke={C.ink} strokeWidth={3} /><circle cx={BX + lenPx - 40} cy={GY - 66} r={6} fill="#ffe08a" stroke={C.ink} strokeWidth={1.6} />
        {/* outside the airlock: the backfill ridge, marker posts and the spoil of the legitimate dig */}
        <path d={`M940 ${GY} q16 -14 40 -14 q20 0 32 14 z`} fill="#6f8a4d" stroke={C.ink} strokeWidth={1.4} />
        {[950, 968].map(x => <g key={x}><line x1={x} x2={x} y1={GY - 8} y2={GY - 34} stroke={C.ink} strokeWidth={2.4} /><rect x={x - 3} y={GY - 36} width={6} height={8} fill={C.amber} stroke={C.ink} strokeWidth={1} /></g>)}
        <Geophone x={970} depth={5} reach={0} wave={false} />
      </g>

      {/* frame */}
      <rect x={X0} y={112} width={X1 - X0} height={BOT - 112} fill="none" stroke={C.ink} strokeWidth={2.4} />
      <Ruler x={X0 - 4} to={75} />

      {/* ── labels and callouts ── */}
      <g>
        <rect x={X0 + 12} y={118} width={338} height={26} rx={4} fill={C.ink} /><T x={X0 + 24} y={136} size={14.5} weight={800} fill={C.paper} spacing={0.8}>SECTION A-A  THROUGH THE WALL</T>
        <rect x={948} y={118} width={352} height={26} rx={4} fill={C.ink} /><T x={960} y={136} size={14.5} weight={800} fill={C.paper} spacing={0.8}>SECTION B-B  THROUGH AN AIRLOCK</T>
      </g>
      <T x={X0 + 14} y={186} size={14} fill={C.ink2} weight={700}>OUTSIDE</T>
      <T x={WX + 60} y={186} size={14} fill={C.teal} weight={700}>INSIDE THE DOME</T>
      <T x={950} y={186} size={14} fill={C.ink2} weight={700}>OUTSIDE</T>

      {/* strata labels, on the right edge */}
      {STRATA.map(s => <T key={s.name} x={X1 - 12} y={dy(s.from) + (s.from === 16 ? 84 : 22)} size={12.5} weight={700} fill={C.ink2} anchor="end" chip={s.name.length * 6.8}>{s.name}</T>)}

      {/* dig depth bands */}
      <T x={WX - 62} y={dy(S.digLo) + 19} size={13} weight={800} fill="#8a5a08" anchor="end" chip={250}>PLAIN CREW DIGS {S.digLo}-{S.digHi} ft</T>
      <T x={WX - 62} y={dy(S.learnedLo) + 19} size={13} weight={800} fill={C.red} anchor="end" chip={330}>A CREW THAT HAS LEARNED THE PLACE: {S.learnedLo}-{S.learnedHi} ft</T>
      <T x={WX - 62} y={dy(S.learnedLo) + 36} size={12} fill={C.red} anchor="end" italic chip={170}>({S.deeper} ft deeper at full adaptation)</T>
      <g>
        <line x1={X0} x2={WX - 42} y1={dy(S.coverPlain)} y2={dy(S.coverPlain)} stroke={C.ink} strokeWidth={1.3} strokeDasharray="2 5" />
        <T x={X0 + 10} y={dy(S.coverPlain) - 5} size={12.5} weight={700} chip={72}>{S.coverPlain} ft line</T>
        <line x1={X0} x2={WX - 42} y1={dy(S.coverLearned)} y2={dy(S.coverLearned)} stroke={C.ink} strokeWidth={1.3} strokeDasharray="2 5" />
        <T x={X0 + 10} y={dy(S.coverLearned) + 17} size={12.5} weight={700} chip={72}>{S.coverLearned} ft line</T>
      </g>
      {/* water table */}
      <path d={`M${X0 + 14} ${dy(WATER_FT) - 22} l7 12 l7 -12 z`} fill={C.water} />
      <T x={X0 + 34} y={dy(WATER_FT) - 11} size={12.5} weight={700} fill={C.water} chip={470}>water table, {WATER_FT} ft (drawn for the picture; a ditch or creek raises it and floods nearby tunnels)</T>

      {/* tier ladder labels */}
      {tiers.map(t => (
        <g key={t.tier}>
          <T x={WX + th + 106} y={dy(t.depth) + 5} size={14.5} weight={800} chip={190}>{t.name.replace(' dome', '').toUpperCase()}  <tspan fill={C.ink2} fontWeight={600}>{t.depth} ft</tspan></T>
        </g>
      ))}
      <T x={WX + th + 106} y={dy(4) + 24} size={12.5} fill={C.ink2} italic chip={140}>too shallow to matter</T>
      <T x={WX + th + 106} y={dy(20) + 23} size={12.5} fill={C.ink2} italic chip={400}>beats a plain crew ({S.digHi} + {S.margin} = {S.coverPlain} ft), not a learned one</T>
      <T x={WX + th + 106} y={dy(30) + 23} size={12.5} fill={C.ink2} italic chip={370}>beats a learned crew too ({S.learnedHi} + {S.margin} = {S.coverLearned} ft)</T>
      <T x={WX + th + 106} y={dy(60) + 23} size={12.5} fill={C.ink2} italic chip={210}>keyed into rock; stops every crew</T>
      <Dim x1={WX + th + 14} y1={GY} x2={WX + th + 14} y2={dy(60)} label="" side={1} />
      <T x={WX + th + 26} y={dy(45)} size={16} weight={800} chip={44}>60 ft</T>
      <Dim x1={WX} y1={dy(52)} x2={WX + th} y2={dy(52)} label="" />
      <T x={WX + th / 2} y={dy(52) - 8} size={13} weight={800} anchor="middle" chip={36}>4 ft</T>

      {/* raider tunnel callouts */}
      <T x={236} y={GY - 44} size={13} weight={800} fill={C.red} anchor="middle">their spoil</T>
      <Badge x={410} y={dy(12) + 40} n={1} fill={C.red} />
      <T x={430} y={dy(12) + 45} size={13} weight={700} fill={C.red} chip={240}>the dig meets the skirt (a dead end)</T>
      <path d={`M${WX - 36} ${dy(12) - 22} q-26 -14 -6 -34`} fill="none" stroke={C.red} strokeWidth={2.6} markerEnd="url(#sk-arrow)" strokeDasharray="6 4" />
      <Badge x={WX - 270} y={dy(12) - 59} n={3} fill={C.red} />
      <T x={WX - 54} y={dy(12) - 54} size={12.5} weight={700} fill={C.red} anchor="end" chip={200}>so they turn along the footing</T>
      <Badge x={WX - 14} y={dy(8) + 4} n={2} />
      <Badge x={300} y={dy(4) - 34} n={4} fill={C.teal} />
      <T x={322} y={dy(4) - 30} size={13} weight={700} fill={C.teal} chip={120}>ground sensor</T>
      <Badge x={WX + 76} y={GY - 94} n={4} fill={C.teal} />
      <T x={WX + 96} y={GY - 90} size={13} weight={800} fill={C.teal} chip={190}>listening base (powered)</T>
      <T x={WX + 230} y={GY - 5.6 * PX - 8} size={12.5} weight={700} anchor="middle" chip={80}>person 5.6 ft</T>

      {/* B-B callouts */}
      <Badge x={BX + 36} y={GY - hPx - 27} n={5} fill={C.teal} />
      <T x={BX + 58} y={GY - hPx - 22} size={13.5} weight={800} fill={C.teal} chip={300}>AIRLOCK CHAMBER, {lenFt} ft long and {hFt} ft high</T>
      <T x={BX + 58} y={GY - hPx - 3} size={12.5} fill={C.ink2} italic chip={250}>two doors, only one open at a time</T>
      <T x={BX - 2} y={GY - dhPx - 8} size={12.5} weight={700} anchor="end" chip={70}>outer door</T>
      <T x={BX + 16 + lenPx + 20} y={GY - dhPx / 2} size={12.5} weight={700} chip={110}>inner door, shut</T>
      <T x={BX + 16 + lenPx + 20} y={GY - dhPx / 2 + 17} size={12.5} fill={C.ink2} chip={110}>{dhFt} ft tall;</T>
      <T x={BX + 16 + lenPx + 20} y={GY - dhPx / 2 + 34} size={12.5} fill={C.ink2} chip={110}>a kill zone</T>
      <Dim x1={BX + 16} y1={GY + 24} x2={BX + 16 + lenPx} y2={GY + 24} label={`${lenFt} ft`} side={1} />
      <Badge x={BX + 96} y={dy(10) + 52} n={5} fill={C.teal} />
      <T x={BX + 118} y={dy(10) + 52} size={13} weight={800} fill={C.teal} chip={215}>steel sleeve through the footing</T>
      <T x={BX + 118} y={dy(10) + 69} size={12.5} fill={C.ink} chip={150}>the only gap in the skirt</T>
      <T x={BX + 118} y={dy(10) + 90} size={13} weight={800} fill={C.teal} chip={185}>tunnel rises to a floor hatch</T>
      <T x={944} y={dy(10) + 4} size={12.5} weight={700} fill={C.paper}>from the retreat</T>
      <T x={BX - 36} y={GY - 44} size={12} fill={C.ink2} anchor="middle" italic chip={110}>backfill ridge, markers</T>

      {/* footer */}
      <rect x={X0} y={BOT + 14} width={X1 - X0} height={86} rx={6} fill={C.paper2} stroke={C.grid} />
      <T x={X0 + 16} y={BOT + 40} size={13.5} weight={800} fill={C.ink}>HOW TO READ IT</T>
      <T x={X0 + 16} y={BOT + 60} size={13} fill={C.ink2}>Depths to scale, 7.6 px a foot (the ruler counts feet below grade). Skirt depth and thickness, the dig bands and the airlock chamber use the game's own numbers (sim/dome).</T>
      <T x={X0 + 16} y={BOT + 78} size={13} fill={C.ink2}>The ring beam, the soil layers and the shell above grade are schematic: the strata and the water table are drawn for the picture, they are not a game rule. The dome is shown at its largest tier.</T>
      <T x={X0 + 16} y={BOT + 96} size={13} fill={C.ink2}>The tunnels drawn in red are what raiders dig; the legitimate tunnel in section B-B is the one the family digs, and it crosses only at an airlock.</T>

      <SkirtPanel x={1420} />
    </svg>
  );
}

/** The right-hand panel of the section: the tier comparison, how it works, and the sensors. */
function SkirtPanel({ x }: { x: number }): ReactElement {
  const tiers = DOME_TIERS.map(skirtFacts), S = SKIRT_NUMBERS, W = 460;
  const rows = tiers;
  const barMax = 60;
  const colX = [x + 215, x + 318, x + 405];
  return (
    <g>
      <rect x={x - 8} y={112} width={W + 16} height={BOT_PANEL - 112} rx={8} fill="#fbf8f0" stroke={C.ink} strokeWidth={2} filter="url(#sk-soft)" />
      <T x={x + 14} y={146} size={17} weight={800} spacing={0.6}>TIER COMPARISON</T>
      <T x={x + 14} y={166} size={12.5} fill={C.ink2}>share of dig attempts the skirt turns back</T>
      <g>
        <T x={colX[0]} y={200} size={12} weight={800} fill={C.ink2} anchor="middle">DEPTH</T>
        <T x={colX[1] - 2} y={196} size={11.5} weight={800} fill="#a06a0e" anchor="middle">PLAIN CREW</T>
        <T x={colX[1]} y={211} size={11} fill="#a06a0e" anchor="middle">{S.digLo}-{S.digHi} ft dig</T>
        <T x={colX[2] + 2} y={196} size={11.5} weight={800} fill={C.red} anchor="middle">LEARNED CREW</T>
        <T x={colX[2]} y={211} size={11} fill={C.red} anchor="middle">{S.learnedLo}-{S.learnedHi} ft dig</T>
      </g>
      {rows.map((t, i) => {
        const y = 232 + i * 76;
        return (
          <g key={t.tier}>
            <rect x={x + 10} y={y - 10} width={W - 20} height={66} rx={6} fill={i % 2 ? '#f3eddc' : '#f8f3e6'} />
            <T x={x + 20} y={y + 12} size={15.5} weight={800}>{t.name}</T>
            <T x={x + 20} y={y + 32} size={12.5} fill={C.ink2}>{t.thick} ft thick, {t.doorOnly ? '1 door' : `${t.airlocks} airlock${t.airlocks > 1 ? 's' : ''}`}</T>
            <rect x={x + 20} y={y + 40} width={110} height={8} rx={4} fill={C.grid} /><rect x={x + 20} y={y + 40} width={Math.max(4, 110 * t.depth / barMax)} height={8} rx={4} fill={C.ink} />
            <T x={colX[0]} y={y + 32} size={22} weight={800} anchor="middle">{t.depth}<tspan fontSize={13} fontWeight={600}> ft</tspan></T>
            <Pill x={colX[1] - 36} y={y + 8} p={t.plain} />
            <Pill x={colX[2] - 36} y={y + 8} p={t.learned} />
          </g>
        );
      })}
      <T x={x + 14} y={548} size={12} fill={C.ink2} italic>In between, the odds slide with how much the raiders have learned the</T>
      <T x={x + 14} y={564} size={12} fill={C.ink2} italic>place. A half-learned crew beats a Geodesic skirt {pct(1 - tiers[1].half)} of the time.</T>

      <line x1={x + 10} x2={x + W - 10} y1={584} y2={584} stroke={C.grid} strokeWidth={1.5} />
      <T x={x + 14} y={612} size={17} weight={800} spacing={0.6}>HOW IT STOPS A TUNNEL</T>
      {[
        ['A crew digs under the wall, at its usual depth, and reaches the skirt about 40% of the way through the dig.', C.red],
        ['It is concrete to a depth set by the tier. If the skirt runs 3 ft below the crew\'s dig, the dig is turned back.', C.ink],
        ['Turned crews do not give up: they work along the footing toward the nearest airlock. The only way in is the door.', C.ink],
        ['Buried ground sensors (a set covers about 390 ft of wall, powered), dogs, a watcher or a tower can hear the dig first.', C.teal],
        ['The airlock is two doors and a room between them. Tunnels cross only here, through a sleeve, to a floor hatch.', C.teal],
      ].map(([text, col], i) => (
        <g key={i}>
          <Badge x={x + 28} y={642 + i * 62} n={i + 1} fill={col} />
          <Wrap x={x + 52} y={642 + i * 62 - 4} width={W - 66} size={13.5} lines={text} />
        </g>
      ))}
      <line x1={x + 10} x2={x + W - 10} y1={956} y2={956} stroke={C.grid} strokeWidth={1.5} />
      <T x={x + 14} y={980} size={13} weight={800}>{`Sally port hold: ${SALLY_HOLD.earthen}-${SALLY_HOLD.arcology} s at the inner door by tier.`}</T>
      <T x={x + 14} y={1000} size={12.5} fill={C.ink2}>Sensors 35% a day (powered, full cover); dog 10% each, 2 max;</T>
      <T x={x + 14} y={1018} size={12.5} fill={C.ink2}>listening watcher up to 30%; tower 6%. Source: sim/dome, sim/tunnelers.</T>
    </g>
  );
}
const BOT_PANEL = 1040;

/** A result pill: a bar and the share. */
function Pill({ x, y, p }: { x: number; y: number; p: number }): ReactElement {
  const col = p >= 0.99 ? C.teal : p > 0.05 ? C.amber : C.red;
  return (
    <g>
      <rect x={x} y={y} width={72} height={26} rx={13} fill={col} />
      <T x={x + 36} y={y + 18} size={14} weight={800} fill="#fff" anchor="middle">{p <= 0 ? '0%' : pct(p)}</T>
      <T x={x + 36} y={y + 44} size={11} fill={C.ink2} anchor="middle">{p >= 0.99 ? 'turned back' : p <= 0 ? 'gets under' : 'partial'}</T>
    </g>
  );
}

/** Greedy word wrap for SVG text. */
function Wrap({ x, y, width, size, lines }: { x: number; y: number; width: number; size: number; lines: string }): ReactElement {
  const maxCh = Math.floor(width / (size * 0.52)), words = lines.split(' '), out: string[] = [];
  let cur = '';
  for (const w of words) { if ((cur + ' ' + w).trim().length > maxCh) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }
  if (cur) out.push(cur);
  return <g>{out.map((l, i) => <T key={i} x={x} y={y + 6 + i * (size + 3)} size={size} fill={C.ink}>{l}</T>)}</g>;
}

// ──────────────────────────── plan view ────────────────────────────

/** Polar to screen: angle from +z (south, down the page) toward +x (east), like the sim. */
const pol = (cx: number, cy: number, r: number, a: number): [number, number] => [cx + Math.sin(a) * r, cy + Math.cos(a) * r];

/** One plan of a dome: the shell ring, the skirt ring under it, airlocks and sensors. */
function PlanDome({ tier, cx, cy, R, detail }: { tier: DomeTier; cx: number; cy: number; R: number; detail: boolean }): ReactElement {
  const t = TIER[tier], f = skirtFacts(tier);
  const angles = tier === 'earthen' ? [0] : airlockAngles(t.airlocks);
  const sk = R * 0.04 + t.skirtThickFt * (R / 300) * 1.6;
  return (
    <g>
      <circle cx={cx} cy={cy} r={R + sk} fill={f.plain >= 0.99 ? 'none' : 'none'} />
      <circle cx={cx} cy={cy} r={R} fill={C.tealPale} stroke="none" />
      <circle cx={cx} cy={cy} r={R + sk / 2} fill="none" stroke={C.concreteDk} strokeWidth={sk} strokeDasharray={detail ? '16 7' : '9 5'} opacity={0.95} />
      <circle cx={cx} cy={cy} r={R + sk} fill="none" stroke={C.ink} strokeWidth={1.6} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.ink} strokeWidth={2.4} />
      {angles.map((a, i) => { const [x, y] = pol(cx, cy, R, a), [x2, y2] = pol(cx, cy, R - Math.max(9, R * 0.1), a);
        return <g key={i} transform={`rotate(${-a * 180 / Math.PI} ${x} ${y})`}><rect x={x - Math.max(6, R * 0.05)} y={y - Math.max(10, R * 0.1)} width={Math.max(12, R * 0.1)} height={Math.max(10, R * 0.1) + 4} rx={2} fill={C.paper} stroke={C.teal} strokeWidth={2.4} transform={`rotate(0)`} opacity={0} /><circle cx={x2} cy={y2} r={0} /></g>; })}
      {angles.map((a, i) => { const [x, y] = pol(cx, cy, R, a), w = Math.max(11, R * 0.07);
        return <g key={'a' + i}><circle cx={x} cy={y} r={w} fill={C.teal} stroke={C.paper} strokeWidth={2.4} /><T x={x} y={y + 4.5} size={Math.max(11, w)} weight={800} fill="#fff" anchor="middle">{String.fromCharCode(65 + i)}</T></g>; })}
    </g>
  );
}

/** The plan view: the buried skirt ring, the airlocks, and the tunnel paths raiders are turned onto. */
export function SkirtPlan({ standalone = true }: { standalone?: boolean }): ReactElement {
  const cx = 540, cy = 590, R = 270;
  const arc = TIER.arcology, sk = R * 0.04 + arc.skirtThickFt * (R / 300) * 1.6;
  const angles = airlockAngles(arc.airlocks);
  const S = SKIRT_NUMBERS;
  // raiders: three digs reach the skirt at angles between airlocks; each is turned along the footing the short way to the nearest airlock
  const digs = [{ at: 2.55, to: 2 }, { at: 4.55, to: 4 }, { at: 0.55, to: 0 }];
  const nearestIdx = (a: number) => { let b = 0, bd = 9; angles.forEach((x, i) => { const d = Math.abs(Math.atan2(Math.sin(a - x), Math.cos(a - x))); if (d < bd) { bd = d; b = i; } }); return b; };
  const path = (aFrom: number, aTo: number, r: number): string => {
    const d = Math.atan2(Math.sin(aTo - aFrom), Math.cos(aTo - aFrom)), n = 14, pts: string[] = [];
    for (let i = 0; i <= n; i++) { const [x, y] = pol(cx, cy, r, aFrom + d * i / n); pts.push(`${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`); }
    return pts.join(' ');
  };
  const tiers = DOME_TIERS.slice(0, 3).reverse();
  return (
    <svg viewBox="0 0 1920 1080" xmlns="http://www.w3.org/2000/svg" width={standalone ? 1920 : '100%'} role="img" aria-label="Plan view of a dome showing the buried skirt ring, the airlocks and where a turned tunnel goes" style={{ display: 'block', background: C.paper, fontFamily: FONT }}>
      <Defs />
      <rect width="1920" height="1080" fill={C.paper} />
      <g stroke={C.grid} strokeWidth={0.8} opacity={0.55}>{Array.from({ length: 48 }, (_, i) => <line key={'v' + i} x1={i * 40} x2={i * 40} y1={0} y2={1080} />)}{Array.from({ length: 28 }, (_, i) => <line key={'h' + i} x1={0} x2={1920} y1={i * 40} y2={i * 40} />)}</g>
      <T x={60} y={62} size={40} weight={800} spacing={1}>THE BURIED SKIRT, FROM ABOVE</T>
      <T x={62} y={92} size={19} fill={C.ink2}>Plan view: the footing is a closed ring, so a tunnel that meets it has only one way left, along the ring to the nearest airlock.</T>
      <rect x={60} y={104} width={120} height={4} fill={C.amber} />

      {/* ground */}
      <circle cx={cx} cy={cy} r={R + 175} fill="#ece4cf" stroke={C.grid} strokeWidth={1.5} />
      <circle cx={cx} cy={cy} r={R + 190} fill="url(#sk-dig)" opacity={0.0} />
      {/* sensor ring */}
      <circle cx={cx} cy={cy} r={R + sk + 34} fill="none" stroke={C.teal} strokeWidth={3.4} strokeDasharray="2 12" strokeLinecap="round" />
      {Array.from({ length: 24 }, (_, i) => { const [x, y] = pol(cx, cy, R + sk + 34, i * Math.PI / 12 + 0.13); return <circle key={i} cx={x} cy={y} r={5.4} fill={C.teal} stroke={C.ink} strokeWidth={1.2} />; })}
      {/* dig reach: the zone a crew's tunnel travels */}
      <circle cx={cx} cy={cy} r={R + 150} fill="none" stroke={C.amber} strokeWidth={1.5} strokeDasharray="8 7" />
      <T x={cx} y={cy - R - 157} size={13} weight={700} fill="#8a5a08" anchor="middle" chip={250}>raiders dig in from outside this line</T>

      {/* the dome */}
      <circle cx={cx} cy={cy} r={R} fill={C.tealPale} />
      <circle cx={cx} cy={cy} r={R + sk / 2} fill="none" stroke="url(#sk-concrete)" strokeWidth={sk} />
      <circle cx={cx} cy={cy} r={R + sk} fill="none" stroke={C.ink} strokeWidth={2} />
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={C.ink} strokeWidth={3.2} />
      <T x={cx} y={cy - 4} size={22} weight={800} fill={C.teal} anchor="middle" opacity={0.9}>INSIDE THE DOME</T>
      <T x={cx} y={cy + 22} size={14} fill={C.ink2} anchor="middle">{arc.name}, {arc.airlocks} airlocks, skirt {arc.skirtFt} ft deep</T>

      {/* turned tunnels */}
      {digs.map((d, i) => {
        const ai = nearestIdx(d.at), [sx, sy] = pol(cx, cy, R + sk + 150, d.at), [hx, hy] = pol(cx, cy, R + sk + 8, d.at), rr = R + sk + 7;
        const [ex, ey] = pol(cx, cy, R + 9, angles[ai]);
        return (
          <g key={i}>
            <path d={`M${sx} ${sy} L${hx} ${hy}`} stroke="#2a1a10" strokeWidth={13} strokeLinecap="round" opacity={0.9} /><path d={`M${sx} ${sy} L${hx} ${hy}`} stroke="#8a6644" strokeWidth={7} strokeLinecap="round" />
            <path d={path(d.at, angles[ai], rr)} fill="none" stroke={C.red} strokeWidth={4.4} strokeDasharray="10 6" markerEnd="url(#sk-arrow)" />
            <circle cx={hx} cy={hy} r={9} fill={C.paper} stroke={C.red} strokeWidth={2.6} /><path d={`M${hx - 4.5} ${hy - 4.5} L${hx + 4.5} ${hy + 4.5} M${hx + 4.5} ${hy - 4.5} L${hx - 4.5} ${hy + 4.5}`} stroke={C.red} strokeWidth={2.6} />
            <circle cx={ex} cy={ey} r={0} />
          </g>
        );
      })}
      {/* the legitimate tunnel at airlock 1 (the front door) */}
      {(() => { const a = angles[0], [x1, y1] = pol(cx, cy, R - 20, a), [x2, y2] = pol(cx, cy, R + sk + 160, a);
        return <g><path d={`M${x1} ${y1} L${x2} ${y2}`} stroke={C.teal} strokeWidth={9} strokeDasharray="14 7" opacity={0.95} /><path d={`M${x1} ${y1} L${x2} ${y2}`} stroke={C.paper} strokeWidth={2} strokeDasharray="14 7" opacity={0.0} /></g>; })()}

      {/* the airlocks */}
      {angles.map((a, i) => { const [x, y] = pol(cx, cy, R, a), [x2, y2] = pol(cx, cy, R + sk + 38, a), [x3, y3] = pol(cx, cy, R - 40, a);
        return (
          <g key={i}>
            <path d={`M${x} ${y} L${x3} ${y3}`} stroke={C.ink} strokeWidth={22} strokeLinecap="butt" /><path d={`M${x} ${y} L${x3} ${y3}`} stroke={C.paper} strokeWidth={16} strokeLinecap="butt" /><path d={`M${x} ${y} L${x3} ${y3}`} stroke={C.teal} strokeWidth={3} strokeDasharray="4 4" />
            <circle cx={x2} cy={y2} r={14} fill={C.teal} stroke={C.paper} strokeWidth={2.4} /><T x={x2} y={y2 + 5} size={15} weight={800} fill="#fff" anchor="middle">{String.fromCharCode(65 + i)}</T>
          </g>
        ); })}
      {/* callouts on the big plan */}
      {(() => { const [x, y] = pol(cx, cy, R + sk + 120, 2.55); return <g><Badge x={x + 8} y={y - 28} n={1} fill={C.red} /></g>; })()}
      <g>
        <Callout x={1010} y={170} n={1} fill={C.red} head="A dig meets the footing" body={`About ${Math.round(S.digLo)}-${Math.round(S.digHi)} ft down, against concrete that runs ${arc.skirtFt} ft deep. The crew cannot go under it and finds no seam to dig through.`} />
        <Callout x={1010} y={286} n={2} fill={C.red} head="Turned along the ring" body="They follow the footing the short way round to the nearest airlock (red dashes), and a raid on that door follows within 2-4 days." />
        <Callout x={1010} y={402} n={3} fill={C.teal} head="The airlock is the one opening" body={`Two doors and a chamber. A crew that gets in meets the inner door held for about ${SALLY_HOLD.arcology} s (a ${arc.name.toLowerCase()}).`} />
        <Callout x={1010} y={518} n={4} fill={C.teal} head="Ground sensors listen" body="Buried geophones ring the wall (teal dots). A set covers about 390 ft of wall, needs power, and hears a dig 35% of days at full cover." />
        <Callout x={1010} y={634} n={5} fill={C.ink} head="The way people cross" body="The family's own tunnel and escape route pass through airlock A only (teal dashes), in a sleeve through the footing." />
      </g>

      {/* small plans of the other tiers */}
      <g>
        <T x={1010} y={852} size={15} weight={800} spacing={0.6}>THE SAME RING AT THE OTHER TIERS</T>
        {tiers.map((t, i) => {
          const x = 1130 + i * 270, y = 950, rr = [58, 48, 32][i], f = skirtFacts(t);
          return (
            <g key={t}>
              <PlanDome tier={t} cx={x} cy={y} R={rr} detail={false} />
              <T x={x} y={y + rr + 28} size={14} weight={800} anchor="middle">{TIER[t].name.replace(' dome', '')}</T>
              <T x={x} y={y + rr + 46} size={12.5} anchor="middle" fill={C.ink2}>{f.depth} ft skirt, {f.doorOnly ? 'one door' : `${f.airlocks} airlock${f.airlocks > 1 ? 's' : ''}`}</T>
            </g>
          );
        })}
      </g>
      {/* legend */}
      <g>
        <rect x={1010} y={712} width={470} height={112} rx={8} fill="#fbf8f0" stroke={C.ink} strokeWidth={1.6} />
        <T x={1026} y={736} size={13} weight={800} spacing={0.6}>LEGEND</T>
        <rect x={1026} y={746} width={30} height={12} fill="url(#sk-concrete)" stroke={C.ink} /><T x={1066} y={757} size={12.5}>buried skirt (concrete ring)</T>
        <line x1={1026} x2={1056} y1={775} y2={775} stroke={C.red} strokeWidth={4} strokeDasharray="8 5" /><T x={1066} y={780} size={12.5}>raider tunnel, turned</T>
        <line x1={1026} x2={1056} y1={796} y2={796} stroke={C.teal} strokeWidth={5} strokeDasharray="10 5" /><T x={1066} y={801} size={12.5}>the family's tunnel (airlock A)</T>
        <circle cx={1296} cy={751} r={5} fill={C.teal} stroke={C.ink} strokeWidth={1.2} /><T x={1308} y={756} size={12.5}>ground sensor</T>
        <circle cx={1298} cy={775} r={9} fill={C.paper} stroke={C.red} strokeWidth={2.6} /><T x={1314} y={780} size={12.5}>dig stopped</T>
        <circle cx={1298} cy={796} r={9} fill={C.teal} /><T x={1314} y={801} size={12.5}>airlock</T>
      </g>
    </svg>
  );
}

function Callout({ x, y, n, head, body, fill }: { x: number; y: number; n: number; head: string; body: string; fill: string }): ReactElement {
  return (
    <g>
      <Badge x={x + 14} y={y + 10} n={n} fill={fill} />
      <T x={x + 38} y={y + 15} size={16} weight={800}>{head}</T>
      <Wrap x={x + 38} y={y + 26} width={780} size={14} lines={body} />
    </g>
  );
}
