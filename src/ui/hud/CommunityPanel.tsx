/** Defense tab: the armed-response subscription and the road watch (neighbors). (sim/armedResponse.ts, sim/watch.ts; docs/sa_home_security.md) */
import { useGameStore } from '../../store/gameStore';
import { RESPONSE, patrolMinutes, responseActive, subOf, subscribeProblem } from '../../sim/armedResponse';
import { WATCH, communityPosture, watchOf, watchProblem } from '../../sim/watch';
import { Group, Hint, Note, Row } from './common';
import { DIM, btn, usd } from './style';
import { pluralize } from '../../sim/words';

export function CommunityPanel() {
  const game = useGameStore(s => s.game);
  const sub = subOf(game), active = responseActive(game), why = subscribeProblem(game);
  const watch = watchOf(game), wwhy = watchProblem(game), cp = communityPosture(game);
  return <Group id="def-community" title="Armed response and the road watch" defaultOpen={false}>
    <Hint more={<>Time is security: every measure buys minutes until someone answers. An armed-response firm ({usd(RESPONSE.SETUP_USD)} to install, {usd(RESPONSE.MONTHLY_USD)} a month) puts a panic button by the bed and a sign on the gate; a patrol is about {pluralize(patrolMinutes(game), 'minute')} out (a guess, not a measured figure). It answers only while the banks and the law hold: after a permanent collapse nobody comes. The road watch is the neighbors: a chat group, radios, a sign. It costs a little and gives warning, goodwill and men within earshot, and it keeps working when the firm is gone. Armed-response signs deter opportunists, never an organized crew.</>}>Buy minutes: a patrol while the law holds, neighbors when it does not.</Hint>
    <Row label="Armed response" value={!sub ? 'none' : sub.ended !== null ? 'ended' : active ? `answering, about ${patrolMinutes(game)} min` : 'not answering'} tone={active ? 'good' : sub && sub.ended === null ? 'warn' : undefined} />
    {active
      ? <button style={btn(false)} onClick={() => { const w = useGameStore.getState().cancelArmedResponse(); if (w) alert(w); }}>Cancel the subscription</button>
      : <button style={{ ...btn(), opacity: why ? 0.55 : 1 }} disabled={!!why} title={why ?? `${usd(RESPONSE.SETUP_USD)} now, ${usd(RESPONSE.MONTHLY_USD)} a month while the banks work`} onClick={() => { const w = useGameStore.getState().subscribeArmedResponse(); if (w) alert(w); }}>Subscribe · {usd(RESPONSE.SETUP_USD)}{why ? ` · ${why}` : ''}</button>}
    {sub && sub.ended !== null && <Note tone="warn">The firm is gone: the minutes have to be bought by the family, the guards and the neighbors.</Note>}
    <Row label="Road watch" value={watch ? `${watch.members.length} households${cp.detection ? `, +${cp.detection} warning` : ''}` : 'none'} tone={watch ? 'good' : undefined} />
    {watch
      ? <button style={btn(false)} title="Leaving costs a little goodwill" onClick={() => { const w = useGameStore.getState().leaveRoadWatch(); if (w) alert(w); }}>Leave the watch</button>
      : <button style={{ ...btn(), opacity: wwhy ? 0.55 : 1 }} disabled={!!wwhy} title={wwhy ?? `${usd(WATCH.SETUP_USD)} for radios, batteries and the sign, then ${usd(WATCH.MONTHLY_USD)} a month while the banks work`} onClick={() => { const w = useGameStore.getState().foundRoadWatch(); if (w) alert(w); }}>Start a road watch · {usd(WATCH.SETUP_USD)}{wwhy ? ` · ${wwhy}` : ''}</button>}
    <div style={{ fontSize: 11, color: DIM }}>A private patrol and a fortress look can cool a neighborhood; the watch is the other way to buy minutes.</div>
  </Group>;
}
