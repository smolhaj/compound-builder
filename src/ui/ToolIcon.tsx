/** A small drawn icon per tool (procedural: shapes and colors, no image files). */
import type { ReactNode } from 'react';
import { TOOLS, type ToolKind } from '../sim/tools';

const STEEL = '#b9bfc4', WOOD = '#a9794a', DARK = '#3b3f44', ORANGE = '#d98a22', RED = '#b8402e', CRUDE = '#8a7a5a';

function art(kind: ToolKind): ReactNode {
  switch (kind) {
    case 'hammer': case 'rock_hammer':
      return <><rect x="20" y="12" width="4" height="26" rx="1.5" fill={WOOD} /><rect x="11" y="7" width="20" height="9" rx="2" fill={kind === 'hammer' ? STEEL : '#8d8a84'} /></>;
    case 'nail_gun':
      return <><rect x="8" y="12" width="26" height="10" rx="3" fill={ORANGE} /><rect x="26" y="20" width="6" height="14" rx="1" fill={DARK} /><rect x="9" y="22" width="5" height="12" fill={DARK} /></>;
    case 'hand_saw': case 'scrap_saw':
      return <><path d="M6 12 L34 8 L34 22 L6 20 Z" fill={kind === 'hand_saw' ? STEEL : '#9a9488'} />{[10, 14, 18, 22, 26, 30].map(x => <path key={x} d={`M${x} 21 l2 4 l2 -4`} fill={kind === 'hand_saw' ? STEEL : '#9a9488'} />)}<rect x="30" y="6" width="9" height="12" rx="3" fill={kind === 'hand_saw' ? RED : WOOD} /></>;
    case 'circular_saw':
      return <><circle cx="20" cy="24" r="12" fill={STEEL} stroke={DARK} strokeWidth="1.5" />{Array.from({ length: 12 }, (_, i) => <path key={i} d="M20 10 l1.4 -3 l1.4 3" fill={STEEL} transform={`rotate(${i * 30} 20 24)`} />)}<circle cx="20" cy="24" r="3" fill={DARK} /><rect x="27" y="6" width="10" height="9" rx="2" fill={ORANGE} /></>;
    case 'chainsaw':
      return <><rect x="4" y="18" width="32" height="7" rx="3.5" fill={STEEL} stroke={DARK} /><path d="M6 21 h28" stroke={DARK} strokeDasharray="2 2" /><rect x="26" y="10" width="14" height="16" rx="3" fill={ORANGE} /><path d="M30 10 q4 -5 8 0" fill="none" stroke={DARK} strokeWidth="2" /></>;
    case 'axe': case 'stone_axe':
      return <><rect x="20" y="6" width="4" height="32" rx="1.5" fill={WOOD} /><path d={kind === 'axe' ? 'M24 8 q12 2 12 10 q-6 -2 -12 0 z' : 'M24 8 q8 1 9 7 q-5 4 -9 3 z'} fill={kind === 'axe' ? STEEL : '#8d8a84'} /></>;
    case 'screwdriver_set': case 'scrap_driver':
      return <><rect x="9" y="22" width="9" height="14" rx="3" fill={kind === 'screwdriver_set' ? RED : WOOD} transform="rotate(-35 14 28)" /><rect x="17" y="8" width="3" height="18" fill={STEEL} transform="rotate(-35 14 28)" /><rect x="22" y="22" width="9" height="14" rx="3" fill={ORANGE} transform="rotate(20 26 28)" /></>;
    case 'cordless_drill':
      return <><rect x="6" y="10" width="26" height="11" rx="3" fill={ORANGE} /><rect x="28" y="13" width="9" height="5" fill={STEEL} /><rect x="12" y="20" width="9" height="15" rx="2" fill={DARK} /><rect x="10" y="33" width="13" height="5" rx="1" fill="#4a5258" /></>;
    case 'shovel':
      return <><rect x="20" y="4" width="4" height="22" rx="1.5" fill={WOOD} /><rect x="17" y="4" width="10" height="4" rx="1" fill={DARK} /><path d="M13 26 h18 q-1 12 -9 14 q-8 -2 -9 -14 z" fill={STEEL} /></>;
    case 'pick_mattock':
      return <><rect x="20" y="9" width="4" height="30" rx="1.5" fill={WOOD} /><path d="M6 14 q16 -10 32 0 q-16 -3 -32 0 z" fill={STEEL} stroke={DARK} /></>;
    case 'digging_stick':
      return <><path d="M12 38 L28 6" stroke={WOOD} strokeWidth="4" strokeLinecap="round" /><path d="M10 40 l4 -8 l3 3 z" fill={CRUDE} /></>;
    case 'hoe':
      return <><rect x="21" y="4" width="3" height="30" rx="1.5" fill={WOOD} /><path d="M12 32 h18 v4 h-18 z" fill={STEEL} /></>;
    case 'garden_fork':
      return <><rect x="20" y="4" width="4" height="22" rx="1.5" fill={WOOD} /><path d="M12 26 h20 M14 26 v12 M22 26 v13 M30 26 v12" stroke={STEEL} strokeWidth="2.5" strokeLinecap="round" /></>;
    case 'wrench_set': case 'scrap_wrench':
      return <><path d="M12 36 L28 12" stroke={kind === 'wrench_set' ? STEEL : CRUDE} strokeWidth="6" strokeLinecap="round" /><circle cx="29" cy="11" r="7" fill={kind === 'wrench_set' ? STEEL : CRUDE} /><rect x="27" y="3" width="5" height="9" fill="#2c2f28" /></>;
    case 'pliers': case 'bent_pliers':
      return <><path d="M10 38 L22 20 M34 38 L22 20" stroke={kind === 'pliers' ? RED : CRUDE} strokeWidth="5" strokeLinecap="round" /><path d="M22 20 L17 6 M22 20 L27 6" stroke={STEEL} strokeWidth="4" strokeLinecap="round" /></>;
    case 'bolt_cutters':
      return <><path d="M6 38 L21 18 M36 38 L21 18" stroke={RED} strokeWidth="4" strokeLinecap="round" /><path d="M21 18 L14 6 M21 18 L28 6" stroke={STEEL} strokeWidth="5" strokeLinecap="round" /></>;
    case 'whetstone':
      return <><rect x="6" y="16" width="32" height="14" rx="2" fill="#8d8a84" /><rect x="6" y="16" width="32" height="6" rx="2" fill="#a7a49c" /></>;
    case 'file':
      return <><rect x="6" y="18" width="22" height="7" fill={STEEL} stroke={DARK} />{[9, 13, 17, 21, 25].map(x => <path key={x} d={`M${x} 18 v7`} stroke={DARK} strokeWidth="0.7" />)}<rect x="28" y="19" width="10" height="5" rx="2.5" fill={WOOD} /></>;
  }
}

export function ToolIcon({ kind, size = 44 }: { kind: ToolKind; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 44 44" style={{ flex: 'none', borderRadius: 8, background: TOOLS[kind].crude ? '#2f2c24' : '#2c2f28' }} role="img" aria-label={TOOLS[kind].name}>{art(kind)}</svg>;
}
