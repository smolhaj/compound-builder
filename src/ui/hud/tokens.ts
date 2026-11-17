/**
 * Design tokens for layout A (docs/UX_AUDIT.md section 11.8): one type scale, one spacing unit, radii, shadows,
 * seven z layers and semantic color roles. Written as CSS variables on the root while layout A is on (`applyTokens`),
 * under the class `cb-a`, so the Classic HUD (which never reads them) is pixel-identical.
 * Pure data and pure helpers (contrast math) so tokens.test.ts can check the colors.
 */
export const T = {
  font: { family: 'system-ui, -apple-system, "Segoe UI", sans-serif', mono: 'ui-monospace, Menlo, monospace',
    fine: 11, sm: 12.5, body: 13.5, title: 15, display: 20 },   // the 5-step scale
  weight: { regular: 400, semi: 600, bold: 700 },
  lineHeight: { tight: 1.2, body: 1.35 },
  /** 4 px unit: gaps inside a row 8, padding inside a card 8 to 12, between cards 12, window edge 16. */
  space: { 1: 4, 2: 8, 3: 12, 4: 16, 5: 24 }, edge: 16,
  size: { control: { sm: 28, md: 32, lg: 36 }, chip: 28, bar: 44, card: 320, drawer: 360, drawerNarrow: 340 },
  radius: { control: 6, panel: 8, chip: 14, paper: 3 },
  shadow: { 1: '0 1px 2px rgba(0,0,0,.40)', 2: '0 6px 18px rgba(0,0,0,.50)', 3: '0 10px 30px rgba(0,0,0,.55)' },
  color: {
    panel: 'rgba(20,22,18,0.90)', raised: '#2b2e26', control: '#34372e',
    line: 'rgba(255,255,255,0.16)', lineStrong: 'rgba(255,255,255,0.35)',
    text: '#f2efe4', dim: 'rgba(242,239,228,0.72)',
    accent: '#d8c9a0', onAccent: '#1c1d18',
    good: '#a8d080', warn: '#f0c070', bad: '#ff9070', info: '#8fc0e8',
    paper: '#ece4d0', ink: '#1d1b16', scrim: 'rgba(8,8,6,0.38)',
  },
  /** Never color alone: warn is a triangle, bad a cross, good nothing (calm is quiet), info a dot. */
  glyph: { good: '', warn: '▲', bad: '✕', info: '●' },
  z: { hud: 10, drawer: 20, banner: 30, toast: 40, modal: 50, cinematic: 60, blocking: 70 },
  motion: { fast: 120, drawer: 180, ease: 'cubic-bezier(.2,.8,.2,1)' },
} as const;

export type Tone = 'good' | 'warn' | 'bad' | 'info';

/** The UI scale setting (Settings): 90 to 125 percent, 5 point steps. */
export const UI_SCALE = { min: 0.9, max: 1.25, step: 0.05, def: 1 } as const;
export const clampScale = (x: number): number => {
  if (!Number.isFinite(x)) return UI_SCALE.def;
  return Math.round(Math.min(UI_SCALE.max, Math.max(UI_SCALE.min, x)) / UI_SCALE.step) * UI_SCALE.step;
};

const kebab = (s: string) => s.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
/** Every token as a flat `--cb-<group>-<name>: value` map (numbers get `px` where they are lengths). */
export function cssVars(): Record<string, string> {
  const out: Record<string, string> = {};
  const px = (n: number) => `${n}px`;
  for (const [k, v] of Object.entries(T.font)) out[`--cb-font-${k}`] = typeof v === 'number' ? px(v) : v;
  for (const [k, v] of Object.entries(T.weight)) out[`--cb-weight-${k}`] = String(v);
  for (const [k, v] of Object.entries(T.lineHeight)) out[`--cb-leading-${k}`] = String(v);
  for (const [k, v] of Object.entries(T.space)) out[`--cb-space-${k}`] = px(v);
  out['--cb-edge'] = px(T.edge);
  for (const [k, v] of Object.entries(T.radius)) out[`--cb-radius-${k}`] = px(v);
  for (const [k, v] of Object.entries(T.shadow)) out[`--cb-shadow-${k}`] = v;
  for (const [k, v] of Object.entries(T.color)) out[`--cb-color-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(T.z)) out[`--cb-z-${k}`] = String(v);
  out['--cb-motion-fast'] = `${T.motion.fast}ms`; out['--cb-motion-drawer'] = `${T.motion.drawer}ms`; out['--cb-ease'] = T.motion.ease;
  out['--cb-bar'] = px(T.size.bar); out['--cb-chip'] = px(T.size.chip);
  return out;
}

/** Write the tokens on a root element and mark it `cb-a`; `removeTokens` undoes it. */
export function applyTokens(root: HTMLElement, scale: number = UI_SCALE.def): void {
  root.classList.add('cb-a');
  for (const [k, v] of Object.entries(cssVars())) root.style.setProperty(k, v);
  root.style.setProperty('--cb-ui-scale', String(scale));
}
export function removeTokens(root: HTMLElement): void {
  root.classList.remove('cb-a');
  for (const k of Object.keys(cssVars())) root.style.removeProperty(k);
  root.style.removeProperty('--cb-ui-scale');
}

/** `var(--cb-...)` with the literal as the fallback, so a component reads the same value with or without the root class. */
export const tv = {
  font: (k: keyof typeof T.font) => `var(--cb-font-${k}, ${typeof T.font[k] === 'number' ? T.font[k] + 'px' : T.font[k]})`,
  color: (k: keyof typeof T.color) => `var(--cb-color-${kebab(k)}, ${T.color[k]})`,
  space: (k: keyof typeof T.space) => `var(--cb-space-${k}, ${T.space[k]}px)`,
  radius: (k: keyof typeof T.radius) => `var(--cb-radius-${k}, ${T.radius[k]}px)`,
  shadow: (k: keyof typeof T.shadow) => `var(--cb-shadow-${k}, ${T.shadow[k]})`,
  z: (k: keyof typeof T.z) => `var(--cb-z-${k}, ${T.z[k]})`,
};

/** Tone to color role; the glyph travels with it (`T.glyph`). */
export const toneColor = (t: Tone): string => tv.color(t);

// ---- contrast (WCAG 2.x) ----
export type RGBA = [number, number, number, number];
export function parseColor(c: string): RGBA {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
  if (hex) { let h = hex[1]; if (h.length === 3) h = [...h].map(x => x + x).join(''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 1]; }
  const m = /^rgba?\(([^)]+)\)$/.exec(c.trim());
  if (!m) throw new Error(`unparseable color ${c}`);
  const p = m[1].split(',').map(x => Number(x.trim()));
  return [p[0], p[1], p[2], p[3] ?? 1];
}
/** `top` painted over an opaque `bottom`. */
export function over(top: string, bottom: string): RGBA {
  const [tr, tg, tb, ta] = parseColor(top), [br, bg, bb] = parseColor(bottom);
  return [tr * ta + br * (1 - ta), tg * ta + bg * (1 - ta), tb * ta + bb * (1 - ta), 1];
}
const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
export const luminance = (c: RGBA): number => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export function contrast(a: RGBA, b: RGBA): number { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }
/** Contrast of a foreground role (translucent allowed) over `surface` (itself translucent) over a scene color. */
export function roleContrast(fg: string, surface: string, scene: string): number {
  const s = over(surface, scene), f = over(fg, rgbCss(s));
  return contrast(f, s);
}
const rgbCss = (c: RGBA) => `rgb(${c[0]},${c[1]},${c[2]})`;

/** The four reference scenes the HUD sits over (what the world shows behind a panel). */
export const SCENES = { snow: '#eef2f6', brightSky: '#bcd8f0', grass: '#7a9a50', darkGround: '#2a2620' } as const;
