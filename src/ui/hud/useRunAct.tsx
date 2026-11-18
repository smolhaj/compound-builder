/**
 * A suggestion's one-click action (a Next-steps button, a goal's primary button, a What-to-do-now row): one place, so the Build tab and the
 * layout A card do exactly the same thing. `showProjects` is how a "select" jump brings the Projects panel up.
 */
import { useState, type ReactNode } from 'react';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { orderCost, prices } from '../../sim/economy';
import { crewQuote } from '../../sim/crews';
import { useSpendGuard } from './useSpendGuard';
import { driveQuote, powerQuote } from '../../sim/improvements';
import { hireCaretaker, openMoveIn, setBelt } from '../../sim/weekender';
import { takeRestDay } from '../../sim/mind';
import { enroll, setDrills } from '../../sim/courses';
import { setQuarantine } from '../../sim/medical';
import { callGathering } from '../../sim/gatherings';
import { pluralize } from '../../sim/words';
import { useDrawerStore } from '../../store/drawerStore';
import { fxChoose } from '../../sim/disasterFx';
import type { SuggestionAct } from '../../sim/guidance';

export function useRunAct(showProjects: () => void): { run: (a: SuggestionAct) => void; arm: (tool: string) => void; note: string | null; setNote: (n: string | null) => void; guardNode: ReactNode } {
  const g = useGameStore();
  const markTrees = useWorldStore(w => w.markNearestTrees);
  const [note, setNote] = useState<string | null>(null);
  const { guard, node: guardNode } = useSpendGuard();
  const game = g.game;
  const arm = (tool: string) => g.setTool(g.tool === tool ? null : tool);
  const run = (a: SuggestionAct) => {
    setNote(null);
    if (a.type === 'stake') arm(a.kind);
    else if (a.type === 'tool') g.setTool(a.tool);
    else if (a.type === 'order') { const lines = a.lines; guard(orderCost(lines, prices(game)), () => { if (!g.order(lines)) setNote('Could not place that order.'); }); }
    else if (a.type === 'markTrees') { const n = markTrees?.(a.n, a.logs) ?? 0; setNote(n ? `Marked ${pluralize(n, 'tree')}: the family fells ${n === 1 ? 'it' : 'them'} in work hours.` : a.logs ? 'There are no more pines or aspens to mark on your land. Logs are not for sale: buy a different kind of house instead.' : 'No more trees to mark near the yard.'); }
    else if (a.type === 'caretaker') { const why = g.money(d => hireCaretaker(d, a.kind)); if (why) setNote(`Could not arrange that: ${why}.`); }
    else if (a.type === 'fire') g.fireAllHands(a.on);
    else if (a.type === 'belt') { const why = g.daily(d => setBelt(d, a.on)); if (why) setNote(why[0].toUpperCase() + why.slice(1) + '.'); }
    else if (a.type === 'crew') { const id = a.id, st = game.structures.find(x => x.id === id) ?? game.perimeter.find(x => x.id === id); const lines = a.lines, count = a.count ?? 1; guard((st ? crewQuote(st).usd : 0) + (lines ? orderCost(lines, prices(game)) : 0), () => { if (lines && !g.order(lines)) { setNote('Could not place that order.'); return; } const why = g.hire(id, count); if (why) setNote(`Could not hire them: ${why}.`); }); }
    else if (a.type === 'focus') { const why = g.setFocus(a.id); setNote(why ? `Could not do that: ${why}.` : 'The wall comes first now. Clear it in the Projects tab.'); }
    else if (a.type === 'hookup') { const q = a.what === 'drive' ? driveQuote(game.site.improvements, game.site, game.seed).usd : powerQuote(game.site.improvements, game.site).usd; guard(q, () => { const why = g.hookup(a.what); if (why) setNote(`Could not arrange that: ${why}.`); }); }
    else if (a.type === 'shop') g.openShop(true, a.tab);
    else if (a.type === 'open') { if (a.right === 'utilities' && game.dome?.lockdown && game.dome.alarm !== 'ok') useDrawerStore.getState().setPage('utilities', 'dome'); g.focusHud({ right: a.right, ...(a.supplies ? { supplies: a.supplies } : {}) }); }
    else if (a.type === 'restDay') { const why = g.daily(d => takeRestDay(d)); if (why) setNote(why); }
    else if (a.type === 'quarantine') { const why = g.daily(d => setQuarantine(d, a.on)); if (why) setNote(why); }
    else if (a.type === 'fx') { const why = g.daily(d => fxChoose(d, a.choice)); if (why) setNote(why); }
    else if (a.type === 'rx') g.stockUpRx();
    else if (a.type === 'terrain') useWorldStore.getState().setTerrainMode(a.mode);
    else if (a.type === 'enroll') { const why = g.money(d => enroll(d, a.course, a.pid, a.mode, a.teacher)); if (why) setNote(`Could not sign up: ${why}.`); }
    else if (a.type === 'drills') g.daily(d => { setDrills(d, a.perWeek); return null; });
    else if (a.type === 'terraces') { const why = g.stakeTerraces(a.tiers); setNote(why ? `Cannot stake the terraces: ${why}.` : `Staked ${a.tiers.length} terraced garden beds down the slope: each is cut into the hill on its own flat pad and walled in dry-stack stone as its foundation goes in (Projects).`); }
    else if (a.type === 'drain') { const why = g.planSpan('drain_channel', a.a, a.b); setNote(why ? `Cannot lay it there: ${why}.` : 'Planned the drainage channel above the building: the family digs it as the materials come in (Projects).'); }
    else if (a.type === 'span') { const k = a.kind ?? 'tunnel_bridge', why = g.planSpan(k, a.a, a.b); setNote(why ? `Cannot lay it there: ${why}.` : k === 'rock_tunnel' ? 'Planned the rock tunnel: the family drives it as the materials and the excavator come in (Projects).' : 'Planned the tunnel-bridge across the gorge: the family builds it as the materials come in (Projects).'); }
    else if (a.type === 'gather') { const why = g.daily(d => callGathering(d, a.kind)); if (why) setNote(why); }
    else if (a.type === 'moveIn') { const why = g.money(d => openMoveIn(d)); if (why) setNote(why[0].toUpperCase() + why.slice(1) + '.'); }
    else { g.select(a.id); showProjects(); const st = game.structures.find(x => x.id === a.id); if (st && !st.unplaced) useWorldStore.getState().frameCamera([st]); }
  };
  return { run, arm, note, setNote, guardNode };
}
