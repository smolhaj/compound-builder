/**
 * Family → House rules (sim/rules.ts): from the hamlet stage the grown residents
 * vote on a few standing rules. A small card: the stage and play style, the rule
 * in force on each, and a button per other choice that puts it to a vote.
 */
import { useState } from 'react';
import { useGameStore } from '../store/gameStore';
import { stageNow, styleNow, STAGE_NAME, STYLE_NAME } from '../sim/settlement';
import { atVoteStage, RULE_IDS, RULES, rulesOf, tally, voteProblem, voters } from '../sim/rules';
import { Hint, Note, Row, Section } from './hud/common';
import { DIM } from './hud/style';

const btn = (primary = false) => ({ padding: '2px 7px', borderRadius: 6, border: 0, cursor: 'pointer', background: primary ? '#d8c9a0' : '#3a3d34', color: primary ? '#1c1d18' : '#eee', fontSize: 11.5 } as const);

export function HouseRulesPanel() {
  const g = useGameStore();
  const game = g.game;
  const [said, setSaid] = useState<string | null>(null);
  const stage = stageNow(game);
  if (!atVoteStage(stage)) return null;
  const R = rulesOf(game), style = styleNow(game);
  return (
    <Section title="House rules">
      <div data-testid="house-rules">
        <Row label="The place" value={`${STAGE_NAME[stage]}${style ? `, run as a ${STYLE_NAME[style]}` : ''}`} />
        <Row label="Who votes" value={`${voters(game).length} grown residents`} title="Everyone grown who lives here, newcomers included. A majority carries it." />
        {RULE_IDS.map(id => {
          const def = RULES[id], cur = def.options.find(o => o.id === R.adopted[id])!;
          return <div key={id} style={{ margin: '5px 0' }}>
            <Row label={def.name} value={cur.name} title={cur.blurb} />
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {def.options.filter(o => o.id !== cur.id).map(o => {
                const why = voteProblem(game, id, o.id), t = !why ? tally(game, id, o.id) : null;
                return <button key={o.id} style={{ ...btn(), opacity: why ? 0.5 : 1 }} disabled={!!why} title={why ?? `${o.blurb} Likely: ${t!.yes} for, ${t!.no} against.`} onClick={() => setSaid(g.callRuleVote(id, o.id))}>Vote: {o.name}</button>;
              })}
            </div>
          </div>;
        })}
        {said && <Note>{said}</Note>}
        {R.history.length > 0 && <Hint more={R.history.slice().reverse().map((h, i) => <div key={i} style={{ color: DIM }}>{RULES[h.rule].name}: {h.yes} to {h.no}, {h.passed ? 'carried' : 'lost'}</div>)}>Last vote: {RULES[R.history.at(-1)!.rule].name}, {R.history.at(-1)!.passed ? 'carried' : 'lost'}.</Hint>}
      </div>
    </Section>
  );
}
