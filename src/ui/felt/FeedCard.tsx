/** FL3: the "What's different" card at the top of the Compound Board: today's true feed (sim/felt/feed.ts) and the last few things heard on the radio. */
import { useGameStore } from '../../store/gameStore';
import { feedOf } from '../../sim/felt/feed';
import { feltDay } from '../../sim/felt/state';
import { dayIndex } from '../../sim/state';
import { DIM, FS, LINE, TONE, card } from '../hud/style';

const TONE_COLOR = [TONE.good, '#e8d290', TONE.warn, TONE.bad] as const;
const STATUS: Record<string, string> = { open: 'not checked', confirmed: 'confirmed', false: 'false', unclear: 'unclear' };

export function FeedCard() {
  const game = useGameStore(g => g.game);
  const d = game.disaster;
  if (!d.kind || game.clock.t < d.hitAt) return null;
  const feed = feedOf(game);
  const heard = (game.radio?.heard ?? []).slice(-4).reverse();
  const digest = feed?.lines.find(l => l.id === 'radio.digest');
  if (!feed && !heard.length) return null;
  const day = feltDay(game);
  return <div data-felt="feed" style={card(!!feed?.worse)}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
      <b style={{ fontSize: 13 }}>What's different</b>
      <span style={{ color: DIM, fontSize: FS.fine }}>{day <= 0 ? 'The day of the hit' : `${day} ${day === 1 ? 'day' : 'days'} since the hit`}</span>
    </div>
    {feed?.lines.filter(l => l.id !== 'radio.digest').map(l => <div key={l.id} data-feed-line={l.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', padding: '2px 0' }}>
      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: TONE_COLOR[l.tone], flex: 'none', marginTop: 5 }} />
      <span style={{ flex: 1, minWidth: 0 }}>{l.text}</span>
    </div>)}
    {digest && <div data-feed-line="radio.digest" data-felt="digest" style={{ color: DIM, fontSize: FS.small, padding: '2px 0 0' }}>{digest.text}</div>}
    {heard.length > 0 && <div data-felt="radio" style={{ borderTop: `1px solid ${LINE}`, marginTop: 4, paddingTop: 3 }}>
      <div style={{ color: DIM, fontSize: FS.fine, marginBottom: 1 }}>Heard lately (the radio can be wrong; send someone to check)</div>
      {heard.map(h => <div key={h.id} style={{ display: 'flex', gap: 6, fontSize: FS.small, padding: '1px 0' }}>
        <span style={{ flex: 1, minWidth: 0 }}><span style={{ color: DIM }}>Day {Math.max(0, h.day - dayIndex(d.hitAt))}: </span>{h.text}</span>
        <span style={{ color: h.status === 'confirmed' ? TONE.good : h.status === 'false' ? TONE.bad : DIM, flex: 'none' }}>{STATUS[h.status]}</span>
      </div>)}
    </div>}
  </div>;
}
