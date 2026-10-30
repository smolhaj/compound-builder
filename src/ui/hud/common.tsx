/** Shared HUD pieces: panel styling, sections, rows, notes, tabs, folding groups and build items. */
import { useState, type ReactNode } from 'react';
import { DIM, FS, LINE, TONE, btn, h3, miniBtn, type Tone } from './style';



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
export function Group({ id, title, extra, defaultOpen = true, children }: { id: string; title: string; extra?: string; /** Advanced groups start folded. */ defaultOpen?: boolean; children: ReactNode }) {
  const key = `cb.fold.${id}`;
  const [open, setOpen] = useState(() => { try { const v = localStorage.getItem(key); return v === null ? defaultOpen : v !== '0'; } catch { return defaultOpen; } });
  const toggle = () => { setOpen(!open); try { localStorage.setItem(key, open ? '0' : '1'); } catch { /* storage blocked */ } };
  return <div style={{ marginBottom: 4 }}>
    <button onClick={toggle} style={{ ...h3, display: 'flex', width: '100%', justifyContent: 'space-between', background: 'transparent', border: 0, color: '#eee', cursor: 'pointer', padding: '5px 2px', margin: 0 }}>
      <span style={{ flex: 'none' }}>{open ? '▾' : '▸'} {title}</span>{extra && <span title={extra} style={{ textTransform: 'none', letterSpacing: 0, fontSize: FS.fine, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 8 }}>{extra}</span>}
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


/** A one-line note with its detail one tap away: the "more" pattern for explanations (the line stays, the paragraph hides). */
export function Hint({ children, more, tone }: { children: ReactNode; more: ReactNode; tone?: Tone }) {
  const [open, setOpen] = useState(false);
  return <div style={{ fontSize: FS.small, lineHeight: 1.35, margin: '3px 0', color: tone ? TONE[tone] : DIM }}>
    <span>{children}</span>{' '}
    <button onClick={() => setOpen(!open)} title={open ? 'Hide the details' : 'Show the details'} style={{ background: 'transparent', border: 0, padding: 0, color: '#d8c9a0', cursor: 'pointer', fontSize: FS.small }}>{open ? 'less' : 'more'}</button>
    {open && <div style={{ marginTop: 2, color: DIM }}>{more}</div>}
  </div>;
}

/** Text held to two lines; the whole text is the tooltip and a click opens it. */
export function Clamp({ children, text }: { children: ReactNode; /** The full text, for the tooltip. */ text?: string }) {
  const [open, setOpen] = useState(false);
  return <div title={open ? undefined : text} onClick={() => setOpen(!open)} style={{ color: DIM, fontSize: FS.small, lineHeight: 1.35, cursor: 'pointer', ...(open ? {} : { display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) }}>{children}</div>;
}

/** A checklist line: a green tick or an open dot, a short label, one line of status, and one button when something is left to do. */
export function Tick({ done, label, line, act, title }: { done: boolean; label: string; line: string; act?: { label: string; run: () => void; off?: string | null }; title?: string }) {
  return <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0' }}>
    <span aria-label={done ? 'done' : 'to do'} style={{ width: 14, textAlign: 'center', color: done ? TONE.good : DIM, fontWeight: 700 }}>{done ? '✓' : '○'}</span>
    <span style={{ flex: 1, minWidth: 0, lineHeight: 1.25 }}><b style={{ opacity: done ? 0.7 : 1 }}>{label}</b> <span style={{ color: done ? DIM : '#ddd', fontSize: FS.small }}>{line}</span></span>
    {!done && act && <button style={{ ...btn(true), ...miniBtn }} disabled={!!act.off} title={act.off ?? undefined} onClick={act.run}>{act.label}</button>}
  </div>;
}
