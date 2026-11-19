/** The Links section of the Dome page: join this dome to another dome, a building or a walled yard by an underground tunnel, an above-ground enclosed walkway, or both. (sim/dome/links.ts) */
import { useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import { Note, Row, Section } from './common';
import { DIM, TONE, btn, usd } from './style';
import type { DomeView } from '../../sim/dome/live';
import {
  LINK, STAGE_WORD, depthCapFt, depthChoices, depthWord, feederPartners, linksOf, linkName, linkState, nodeLabel, nodeOf, orderLink, progressOf, quoteLink, redundant, repairLink, collapseLink, ringOf, stageOf,
  towersCovering, type DomeLink, type LinkKind, linkProblem,
} from '../../sim/dome/links';
import { domesOf } from '../../sim/dome/standing';
import { yardRings } from '../../sim/compounds';
import { lengthText } from '../../sim/units';
import { pluralize } from '../../sim/words';

const SHELL_WORD = { earthen: 'earth-covered', geodesic: 'polycarbonate', glass: 'glass', arcology: 'armored' } as const;
type Choice = 'tunnel' | 'walkway' | 'both';
const CHOICE: Record<Choice, string> = { tunnel: 'Underground', walkway: 'Above ground', both: 'Both' };
const CHOICE_TIP: Record<Choice, string> = {
  tunnel: 'A hidden tunnel under the ground, out of sight and out of the weather. Slower and dearer to build; a crew that digs can reach a shallow one. Carries people, carts and vehicles.',
  walkway: 'A sealed, fully enclosed tube clad in the same shell as the domes it joins (the stronger of the two), on the ground or on piers. It takes that shell\'s wind, hail, snow, fire, blast and ram ratings, stays sealed against ash and fallout with an airlock at each end, and is a wall to a raid: a crew has to breach the shell or force an airlock. Faster than a tunnel, in plain sight, and priced by the shell. People and carts only.',
  both: 'Build each: two separate links with their own cost. If one is cut or collapsed the other still carries travel, supplies and the plants\' shared power and water lines.',
};

export function DomeLinksSection({ v }: { v: DomeView }) {
  const game = useGameStore(s => s.game), g = useGameStore();
  const id = v.ref.st.id;
  const others = [
    ...domesOf(game).filter(d => d.id !== id).map(d => ({ id: d.id, label: nodeLabel(game, d.id) })),
    ...game.structures.filter(st => st.id !== id && !st.kind.startsWith('dome_') && nodeOf(game, st.id)).slice(0, 12).map(st => ({ id: st.id, label: `${st.kind.replace(/_/g, ' ')} (${st.id})` })),
    ...yardRings(game).map(r => ({ id: r.id, label: `walled yard ${r.id}` })),
  ];
  const [to, setTo] = useState<string>(''), [how, setHow] = useState<Choice>('walkway'), [depthPick, setDepth] = useState<number | null>(null);
  const partner = others.find(o => o.id === to) ? to : others[0]?.id ?? '';
  const mine = linksOf(game).filter(l => l.ends.some(e => e.id === id));
  const kinds: LinkKind[] = how === 'both' ? ['walkway', 'tunnel'] : [how];
  const a = nodeOf(game, id), b = partner ? nodeOf(game, partner) : null;
  const cap = a && b ? depthCapFt(a, b) : 0, depths = depthChoices(cap), depth = depthPick !== null && depths.includes(depthPick) ? depthPick : cap;
  const quotes = partner ? kinds.map(k => ({ k, q: quoteLink(game, id, partner, k, depth) })) : [];
  const problem = quotes.map(x => x.q.problem).find(Boolean) ?? null;
  const total = quotes.reduce((s, x) => s + x.q.totalUsd, 0), fit = quotes.reduce((s, x) => s + x.q.fitUsd, 0);
  const act = (f: (x: typeof game) => string | null) => { const w = g.money(f); if (w) alert(w); };
  const ring = ringOf(game, id), feeders = feederPartners(game, id);
  if (domesOf(game).length < 2 && mine.length === 0) return null;   // one dome alone: nothing to link, nothing shown
  return <Section title="Links to other domes and buildings">
    {mine.length === 0 && <Note>No tunnel or walkway yet. With more than one dome, people cross open ground between them. Build a link and the trip stays under cover, and the two plants can back each other up.</Note>}
    <div data-testid="dome-link-list" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {mine.map(l => <LinkRow key={l.id} l={l} self={id} />)}
    </div>
    {ring.length > 1 && <Row label="One ring" value={`${ring.length} domes: guards and towers cover them all (${pluralize(towersCovering(game, id), 'tower')} in reach)`} tone="good" title="An open walkway or tunnel joins the domes into one ring: the walkway is wall to a raid, and the watch on one dome sees to the others." />}
    {feeders.length > 0 && <Row label="Shared plant feeder" value={`${feeders.length === 1 ? 'one partner dome' : `${feeders.length} partner domes`} back up this plant`} tone="good" title="Each open dome-to-dome link carries a feeder: if this dome's climate plant, air scrubbers or water loop run short, a partner's whole plant lifts the shortfall by half of what is missing." />}
    {others.length > 0
      ? <div data-testid="dome-link-card" style={{ marginTop: 6, borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: 6 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span>Join this dome to</span>
          <select data-testid="link-partner" value={partner} onChange={e => setTo(e.target.value)} style={{ ...btn(), padding: '2px 6px' }}>
            {others.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 4, margin: '5px 0' }}>
          {(Object.keys(CHOICE) as Choice[]).map(c => <button key={c} data-testid={`link-kind-${c}`} style={btn(how === c)} aria-pressed={how === c} title={CHOICE_TIP[c]} onClick={() => setHow(c)}>{CHOICE[c]}</button>)}
        </div>
        {kinds.includes('tunnel') && depths.length > 0 && <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', margin: '3px 0' }}>
          <span style={{ color: DIM }}>Depth:</span>
          {depths.map(d => <button key={d} data-testid={`link-depth-${d}`} style={btn(d === depth)} onClick={() => setDepth(d)}>{d} ft</button>)}
          <span style={{ fontSize: 11.5, color: DIM }}>{depth} ft: {depthWord(depth)}. The deepest allowed is the shallower footing, {cap} ft.</span>
        </div>}
        {quotes.map(({ k, q }) => <div key={k} data-testid={`link-quote-${k}`} style={{ fontSize: 12, borderLeft: `3px solid ${q.problem ? TONE.bad : TONE.good}`, paddingLeft: 8, margin: '4px 0' }}>
          <b>{k === 'tunnel' ? 'Underground tunnel' : 'Above-ground walkway'}</b>: {q.lenFt ? `${q.lenFt.toLocaleString('en-US')} ft` : ''}{q.shellNote ? ` · ${q.shellNote}` : ''}{q.problem ? <span style={{ color: TONE.bad }}> {q.problem}</span>
            : <> · {usd(q.totalUsd)} in all ({usd(q.materialsUsd)} of materials from the stockpile + {usd(q.fitUsd)} contractor fit-out now) · about {q.hours.toLocaleString('en-US')} work hours
              <div style={{ color: DIM }}>{q.fitLines.map(l => `${l.label} ${usd(l.usd)}`).join(' · ')}. Each end adds an airlock cycle on a sealed dome.</div></>}
        </div>)}
        <button data-testid="link-build" style={{ ...btn(), width: '100%', marginTop: 4, opacity: problem || game.money < fit ? 0.55 : 1 }} disabled={!!problem || game.money < fit}
          title={problem ?? (game.money < fit ? `The fit-out is ${usd(fit)}` : 'Lay out the link: the family builds it like any other run, and the fit-out is paid now')}
          onClick={() => act(x => { for (const k of kinds) { const w = linkProblem(x, id, partner, k, depth) ?? orderLink(x, id, partner, k, depth); if (w) return w; } return null; })}>
          Build {how === 'both' ? 'both links' : CHOICE[how].toLowerCase()} · {usd(total)}{problem ? ' · not possible' : ''}
        </button>
        <Note>{LINK.MIN_GAP_FT} ft between shells at least, {LINK.MAX_WALK_FT.toLocaleString('en-US')} ft for a walkway and {LINK.MAX_TUNNEL_FT.toLocaleString('en-US')} ft for a tunnel at most. A link enters each dome only by its own airlock, apart from the people airlocks and the plant's service airlock.</Note>
      </div>
      : <Note>There is nothing to link to yet: build a second dome, or a walled yard or building within reach.</Note>}
  </Section>;
}

function LinkRow({ l, self }: { l: DomeLink; self: string }) {
  const game = useGameStore(s => s.game), g = useGameStore();
  const state = linkState(game, l), other = l.ends.find(e => e.id !== self) ?? l.ends[1];
  const tone = state === 'open' ? (l.wear > 0.6 ? 'warn' : 'good') : state === 'down' ? 'bad' : 'warn';
  const act = (f: (x: typeof game) => string | null) => { const w = g.money(f); if (w) alert(w); };
  const both = redundant(game, l.ends[0].id, l.ends[1].id);
  return <div data-testid={`dome-link-${l.id}`} style={{ borderLeft: `3px solid ${TONE[tone]}`, paddingLeft: 8 }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><b>{l.kind === 'tunnel' ? 'Underground tunnel' : 'Above-ground walkway'} to {nodeLabel(game, other.id)}</b>
      <span style={{ color: TONE[tone] }}>{state === 'open' ? 'open' : state === 'down' ? (l.down?.clearsAt !== null ? 'being repaired' : 'out of service') : `${Math.round(progressOf(game, l) * 100)} percent`}</span></div>
    <div style={{ fontSize: 11.5, color: DIM }}>
      {lengthText(l.lenFt * 0.3048)} · {state === 'building' ? STAGE_WORD[stageOf(game, l)] : l.kind === 'tunnel' ? `${l.depthFt ?? 0} ft down, ${depthWord(l.depthFt ?? 0)}` : `${l.shell ? `${SHELL_WORD[l.shell]} shell` : 'sealed shell'}, ${Math.round((1 - l.wear) * 100)} percent sound`}{both ? ' · backed by a second link' : ''}
    </div>
    {state === 'down' && l.down && <div style={{ fontSize: 11.5, color: TONE.bad }}>Lost to {l.down.why === 'snow' ? 'snow load' : l.down.why === 'charge' ? 'an attack' : l.down.why}. Nothing crosses it until a contractor repairs it.
      {l.down.clearsAt === null && <button data-testid={`link-repair-${l.id}`} style={{ ...btn(), padding: '1px 7px', marginLeft: 6 }} disabled={game.money < l.down.repairUsd} onClick={() => act(x => repairLink(x, l.id))}>Repair · {usd(l.down.repairUsd)}</button>}</div>}
    {state === 'open' && l.kind === 'tunnel' && <button data-testid={`link-collapse-${l.id}`} style={{ ...btn(), padding: '1px 7px', marginTop: 3 }} title="Bring the tunnel down on purpose. It costs the link." onClick={() => { if (confirm('Bring the tunnel down? You lose the link until a contractor clears it.')) act(x => collapseLink(x, l.id)); }}>Collapse the tunnel</button>}
    <div style={{ display: 'none' }}>{linkName(l.kind)}</div>
  </div>;
}
