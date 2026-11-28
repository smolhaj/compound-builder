/**
 * The Field Guide drawer: the player manual (src/manual), searchable, one section at a time. It renders the same generated
 * text as docs/MANUAL.md, so the game and the document cannot disagree. Tables become one small card per row (the drawer is narrow).
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { buildManual, searchManual } from '../../manual/build';
import { inline, parseMd, type Block } from '../../manual/md';
import { T, tv } from './tokens';
import { chipStyleFor } from './fieldGuideStyle';

const Spans = ({ text }: { text: string }) => <>{inline(text).map((s, i) => s.bold ? <strong key={i}>{s.text}</strong> : s.italic ? <em key={i}>{s.text}</em> : s.code ? <code key={i} style={{ fontFamily: T.font.mono }}>{s.text}</code> : <span key={i}>{s.text}</span>)}</>;

function BlockView({ b }: { b: Block }): ReactNode {
  const dim = { color: tv.color('dim') };
  switch (b.t) {
    case 'h3': return <div style={{ fontSize: tv.font('title'), fontWeight: T.weight.semi, margin: '14px 0 4px' }}><Spans text={b.text} /></div>;
    case 'p': return <p style={{ margin: '6px 0', lineHeight: 1.45 }}><Spans text={b.text} /></p>;
    case 'ul': return <ul style={{ margin: '6px 0', paddingLeft: 18, lineHeight: 1.45 }}>{b.items.map((i, k) => <li key={k}><Spans text={i} /></li>)}</ul>;
    case 'table': return <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '6px 0' }}>
      {b.rows.map((r, k) => <div key={k} data-testid="guide-row" style={{ background: tv.color('raised'), borderRadius: tv.radius('control'), padding: '6px 8px' }}>
        <div style={{ fontWeight: T.weight.semi }}><Spans text={r[0]} /></div>
        {r.slice(1).map((c, j) => c && <div key={j} style={{ fontSize: tv.font('fine'), lineHeight: 1.4 }}><span style={dim}>{b.head[j + 1]}: </span><Spans text={c} /></div>)}
      </div>)}
    </div>;
  }
}

export function FieldGuide() {
  const manual = useMemo(() => buildManual(), []);
  const [sectionId, setSection] = useState(manual.sections[0].id);
  const [q, setQ] = useState('');
  const top = useRef<HTMLDivElement>(null);
  const section = manual.sections.find(s => s.id === sectionId) ?? manual.sections[0];
  const blocks = useMemo(() => parseMd(section.md), [section]);
  const hits = useMemo(() => (q.trim().length >= 2 ? searchManual(manual.sections, q) : null), [manual, q]);
  const go = (id: string) => { setSection(id); setQ(''); top.current?.scrollIntoView?.({ block: 'start' }); };

  return <div data-testid="field-guide" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
    <input data-testid="guide-search" type="search" value={q} placeholder="Search the manual (try: well, tornado, gate)" aria-label="Search the manual"
      onChange={e => setQ(e.target.value)}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); if (q) setQ(''); else (e.target as HTMLElement).blur(); } }}
      style={{ font: 'inherit', fontSize: tv.font('sm'), padding: '5px 8px', margin: '0 0 8px', borderRadius: tv.radius('control'), border: `1px solid ${T.color.line}`, background: tv.color('control'), color: tv.color('text') }} />
    {hits ? <div data-testid="guide-hits">
      <div style={{ color: tv.color('dim'), fontSize: tv.font('fine'), marginBottom: 6 }}>{hits.length === 0 ? 'Nothing matches. Try one word.' : `${hits.length}${hits.length >= 40 ? '+' : ''} matches`}</div>
      {hits.map((h, i) => <button key={i} type="button" onClick={() => go(h.section)} style={{ display: 'block', width: '100%', textAlign: 'left', font: 'inherit', fontSize: tv.font('fine'), lineHeight: 1.4, margin: '0 0 6px', padding: '6px 8px', border: 0, borderRadius: tv.radius('control'), background: tv.color('raised'), color: tv.color('text'), cursor: 'pointer' }}>
        <div style={{ color: tv.color('accent'), fontWeight: T.weight.semi }}>{h.title}</div>
        <div>{h.text.length > 220 ? `${h.text.slice(0, 217)}...` : h.text}</div>
      </button>)}
    </div> : <>
      <div role="group" aria-label="Manual sections" data-testid="guide-sections" style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {manual.sections.map(s => <button key={s.id} type="button" title={s.about} data-testid={`guide-chip-${s.id}`} aria-pressed={s.id === section.id} onClick={() => go(s.id)} style={chipStyleFor(s.id === section.id)}>{s.title}</button>)}
      </div>
      <div ref={top} style={{ fontSize: tv.font('display'), fontWeight: T.weight.semi }}>{section.title}</div>
      <div style={{ color: tv.color('dim'), marginBottom: 4 }}>{section.about}</div>
      {blocks.map((b, i) => <BlockView key={i} b={b} />)}
    </>}
  </div>;
}
