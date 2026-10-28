/** Shared HUD pieces: panel styling, sections, rows, notes, tabs, folding groups and build items. */
import { useState, type ReactNode } from 'react';
import { DIM, LINE, TONE, h3, type Tone } from './style';



export function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div style={{ marginBottom: 10 }}><div style={h3}>{title}</div>{children}</div>;
}


/** A label on the left, its value on the right. */
export function Row({ label, value, tone, title }: { label: ReactNode; value: ReactNode; tone?: Tone; title?: string }) {
  return <div title={title} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '2px 0' }}>
    <span style={{ color: DIM }}>{label}</span>
    <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: tone ? TONE[tone] : undefined }}>{value}</span>
  </div>;
}

/** A note line (a warning or a hint), colored by tone. */
export function Note({ tone, children }: { tone?: Tone; children: ReactNode }) {
  return <div style={{ fontSize: 11.5, lineHeight: 1.35, margin: '3px 0', color: tone ? TONE[tone] : DIM }}>{children}</div>;
}

/** Tabs across the top of a panel (one row: the labels shrink to fit); a dot marks a tab that wants attention. */
export function Tabs<T extends string>({ tabs, value, set }: { tabs: Array<[T, string, Tone?]>; value: T; set: (t: T) => void }) {
  return <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${LINE}`, margin: '-2px -4px 8px' }}>
    {tabs.map(([id, label, alert]) => (
      <button key={id} onClick={() => set(id)} style={{ flex: '1 1 auto', padding: '5px 3px', border: 0, borderBottom: `2px solid ${value === id ? '#d8c9a0' : 'transparent'}`, background: 'transparent', color: value === id ? '#fff' : DIM, cursor: 'pointer', fontSize: 11, fontWeight: value === id ? 600 : 400, whiteSpace: 'nowrap' }}>
        {label}{alert && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: TONE[alert], marginLeft: 3, verticalAlign: 'middle' }} />}
      </button>
    ))}
  </div>;
}

/** A group of build items that folds away (remembered per browser). */
export function Group({ id, title, extra, children }: { id: string; title: string; extra?: string; children: ReactNode }) {
  const key = `cb.fold.${id}`;
  const [open, setOpen] = useState(() => { try { return localStorage.getItem(key) !== '0'; } catch { return true; } });
  const toggle = () => { setOpen(!open); try { localStorage.setItem(key, open ? '0' : '1'); } catch { /* storage blocked */ } };
  return <div style={{ marginBottom: 4 }}>
    <button onClick={toggle} style={{ ...h3, display: 'flex', width: '100%', justifyContent: 'space-between', background: 'transparent', border: 0, color: '#eee', cursor: 'pointer', padding: '5px 2px', margin: 0 }}>
      <span>{open ? '▾' : '▸'} {title}</span>{extra && <span style={{ textTransform: 'none', letterSpacing: 0 }}>{extra}</span>}
    </button>
    {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{children}</div>}
  </div>;
}

/**
 * One thing to build: the name and cost on a line, the time and notes under it.
 * `off` greys it out and says why; `next` marks the sensible next step (gold edge and a note).
 */
export function Item({ name, cost, sub, on, off, next, title, click }: { name: string; cost: string; sub?: string; on: boolean; off?: string | null; next?: string | null; title?: string; click: () => void }) {
  return <button disabled={!!off} title={off ?? title} onClick={click} style={{ textAlign: 'left', padding: '5px 8px', borderRadius: 6, border: next && !on ? '1px solid #d8c9a0' : '1px solid transparent', cursor: off ? 'not-allowed' : 'pointer', background: on ? '#d8c9a0' : next ? 'rgba(216,201,160,0.14)' : 'rgba(255,255,255,0.05)', color: on ? '#1c1d18' : '#eee' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, opacity: off ? 0.4 : 1 }}><span>{name}</span><span style={{ fontVariantNumeric: 'tabular-nums' }}>{cost}</span></div>
    {off ? <div style={{ fontSize: 11, color: '#e8b070' }}>{off}</div>
      : <>
        {sub && <div style={{ fontSize: 11, opacity: 0.65 }}>{sub}</div>}
        {next && !on && <div style={{ fontSize: 11, color: '#d8c9a0', fontWeight: 600 }}>▸ {next}</div>}
      </>}
  </button>;
}
