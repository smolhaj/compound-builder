/**
 * Layout A Board drawer (docs/UX_AUDIT.md 11.4): the Compound board as a right drawer with sub-pages Status (vitals, days with no
 * resupply, the wave, threats, what waits on you), What's different (the day's true diff), Radio (what was heard, scouting) and Log.
 * Same content and buttons as Classic's clipboard (`BoardBody`); the newest line of Feed also shows in the What-to-do card.
 */
import { useGameStore } from '../../store/gameStore';
import { useDrawerStore } from '../../store/drawerStore';
import { feedOf } from '../../sim/felt/feed';
import { BoardBody } from '../CompoundBoard';
import { FeedCard } from '../felt/FeedCard';
import { RumorsSection } from '../WorldPanels';
import { Clamp, Note } from './common';
import { DrawerPages, Page } from './SubPages';
import { DIM, LINE } from './style';

export const LOG_LINES = 14;

export function BoardDrawer() {
  const game = useGameStore(g => g.game), close = useDrawerStore(s => s.close);
  const d = game.disaster, afterHit = !!d.kind && game.clock.t >= d.hitAt;
  const feed = feedOf(game), heard = (game.radio?.heard ?? []).length;
  return <DrawerPages drawer="board" always>
    <Page id="status"><BoardBody page="status" onClose={close} onSide={() => undefined} /></Page>
    <Page id="feed">
      <FeedCard part="feed" />
      {!(afterHit && feed) && <Note>Nothing is different yet. After something big happens, each day&rsquo;s changes are listed here, and only what is true.</Note>}
    </Page>
    <Page id="radio">
      <FeedCard part="radio" />
      <RumorsSection />
      {!(afterHit && heard > 0) && <Note>Nothing heard yet. What comes over the radio is listed here, with whether it checked out.</Note>}
    </Page>
    <Page id="log">
      {game.log.length === 0 && <Note>Nothing has happened yet.</Note>}
      {game.log.slice(-LOG_LINES).reverse().map((e, i) => <div key={game.log.length - i} style={{ padding: '4px 0', borderBottom: `1px solid ${LINE}`, color: i === 0 ? undefined : DIM }}><Clamp text={e.text}><span style={{ color: i === 0 ? '#f2efe4' : undefined }}>{e.text}</span></Clamp></div>)}
    </Page>
  </DrawerPages>;
}
