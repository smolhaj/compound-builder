/** The Defense tab: score, the property line (with "Wall my property"), upgrades, lights, towers, readiness checks. */
import { terrainDefense } from '../../sim/terrainFx';
import { spotsText } from '../../sim/format';
import { LightDiscipline } from '../LightDiscipline';
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { defenseReport, type Check } from '../../sim/defenseReport';
import { setGuard } from '../../sim/pets';
import { MATERIALS, type MaterialId } from '../../sim/materials';
import { orderCost } from '../../sim/economy';
import { PERIMETER, RAZOR, SALVAGE, UPGRADE_NEXT, runBill, runFinished, runHours, upgradeProblem, wallLength } from '../../sim/perimeter';
import { STRUCTURE_SALVAGE, isFinished as structFinished } from '../../sim/construction';
import { AI_MODULE, ARMORY_LIGHTS, LIGHT_MODES, LIGHT_MODE_NAME, aiModulesUsed, hasAiSensor, lightList, lightMode, lightsOf } from '../../sim/lights';
import { floodTowerIds, TOWERS, TOWER_NEXT, highBonus, highShare, isTower, towerBill, towerUpgradeProblem } from '../../sim/towers';
import { ungatedCrossings } from '../../sim/roadGate';
import { razorBill, razorHours, razorProblem } from '../../sim/razor';
import { canHostWalkway, walkOn, walkwayBill, walkwayProblem } from '../../sim/walkway';
import { adaptLevel, firstWinter, sinceHit } from '../../sim/adaptive';
import { adaptOf } from '../../sim/encounters';
import { dayIndex } from '../../sim/state';
import { Note, Row, Section } from './common';
import { readiness } from '../../sim/courses';

const DRILL_NAME = ['', 'weekly drills', 'drills twice a week', 'drills three times a week'] as const;
import { TONE, DIM, btn, usd } from './style';
import { WallProperty } from './WallProperty';
import { FortifyRing } from './FortifyRing';

/** One checklist line: a tick or a cross, what it is, and why. */
function CheckRow({ c }: { c: Check }) {
  const money = useGameStore(s => s.money);
  const dog = c.id.startsWith('dog:') ? c.id.slice(4) : null;
  return <div title={c.detail} style={{ display: 'flex', gap: 6, padding: '2px 0', alignItems: 'baseline' }}>
    <span style={{ color: TONE[c.tone], width: 14, textAlign: 'center' }}>{c.ok ? '✓' : '✕'}</span>
    <span style={{ flex: 1 }}>{c.label}</span>
    <span style={{ color: DIM, fontSize: 11.5, textAlign: 'right', maxWidth: '55%' }}>{c.detail}</span>
    {dog && <button style={{ ...btn(), padding: '1px 6px', fontSize: 11 }} title="Put this dog on a post at the line, or keep it inside with the family" onClick={() => money(g => { const d = g.dogs.find(x => x.id === dog); return d ? setGuard(g, dog, !d.guard) : null; })}>{c.detail.startsWith('on the post') ? 'bring in' : 'post'}</button>}
  </div>;
}

/** Hardcore only: why the crews are getting bigger and what the first winter will take (sim/adaptive.ts), so it reads as a world that learns. */
function HardcoreNotes() {
  const game = useGameStore(s => s.game);
  const a = adaptOf(game), since = sinceHit(game), w = firstWinter(game);
  const winterOver = !w || dayIndex(game.clock.t) > w.thaw;
  return <>
    {!!game.disaster.kind && <Row label="What the crews have learned" value={a <= 0 ? 'nothing yet' : `${Math.round(a * 100)}%`} tone={a >= 0.67 ? 'bad' : a > 0 ? 'warn' : 'good'} title="Hardcore: after the first year, the better a place is defended, the more the crews that come for it have prepared" />}
    <Note>{since <= 365 || a <= 0
      ? 'Hardcore: the world learns. From the second year on, the crews that come for a well-defended place come bigger, better armed and oftener, and may test the wire with a pair of men first. A weak place draws no such attention.'
      : 'Word has gone round that this place holds. The crews that still come have learned from the ones who failed: more of them, better armed, oftener. Walls and rifles buy time, not immunity: keep adding to them.'}</Note>
    {!winterOver && <Note tone="warn">Hardcore: the first winter after the hit brings a deep freeze that burns the woodpile and the fuel, then a thaw that spoils fresh and frozen food. Put wood and fuel by, and eat the fresh food first.</Note>}
  </>;
}

/** Defense and preparedness: a score, whether the place is walled in, what's built, and how ready it is for other trouble. */
export function DefenseTab() {
  const game = useGameStore(s => s.game);
  const w = useWorldStore();
  const d = defenseReport(game, w.siteGeo?.drive);
  const missingGate = ungatedCrossings(game, w.siteGeo?.drive).length;
  const exposed = d.homes.filter(h => !h.covered);
  const hardcore = adaptLevel(game) > 0;
  const terrain = terrainDefense(game);
  return <>
    <Section title="Defense">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ fontSize: 30, fontWeight: 700, color: TONE[d.tone] }}>{d.score}</span>
        <span style={{ fontSize: 15, color: TONE[d.tone] }}>{d.label}</span>
        <span style={{ color: DIM, fontSize: 11.5 }}>of 100</span>
      </div>
      <Row label="Line holds people out" value={`${Math.round(d.barrier)}%`} tone={d.barrier >= 65 ? 'good' : d.barrier >= 35 ? 'warn' : 'bad'} title="How hard the walls, gates and bars stop a crew, as the gate card and the battle read it" />
      <Row label="Seen coming" value={`${Math.round(d.detection)}%`} tone={d.detection >= 60 ? 'good' : d.detection >= 35 ? 'warn' : 'bad'} />
      {game.armory.guns.length > 0 && <Row label="Drilled for the alarm" value={`${Math.round(100 * readiness(game))}%${game.courses?.drills.perWeek ? ` · ${DRILL_NAME[game.courses.drills.perWeek]}` : ' · no drills'}`} tone={readiness(game) >= 0.5 ? 'good' : readiness(game) >= 0.2 ? 'warn' : undefined} title="How practiced the household is at the alarm: fewer seconds frozen when it sounds. Set the drill schedule on the Family tab (Classes and drills)." />}
      <button style={{ ...btn(w.showBoundary), marginTop: 4 }} onClick={() => w.setShowBoundary(!w.showBoundary)} title="Draw the property line on the ground">{w.showBoundary ? 'Hide' : 'Show'} property line</button>
      {hardcore && <HardcoreNotes />}
    </Section>
    <Section title="The property line">
      {d.walls.map(c => <CheckRow key={c.id} c={c} />)}
      {missingGate > 0 && <div style={{ border: '1px solid #c9a24a', borderRadius: 6, padding: 6, margin: '4px 0' }}>
        <Note tone="warn">The road comes through here: {missingGate} wall{missingGate > 1 ? 's' : ''} cross{missingGate > 1 ? '' : 'es'} the driveway with no gate, so the trucks and the family's vehicles cannot get in.</Note>
        <button style={{ ...btn(true), width: '100%' }} title="Opens a vehicle gate in each wall where the driveway crosses it" onClick={() => useGameStore.getState().cutRoadGates(w.siteGeo?.drive)}>Add a gate where the road comes in</button>
      </div>}
      <WallProperty />
      <FortifyRing />
      {d.gaps.length > 0 && <Note tone="warn">Open ground on the line, e.g. on the {spotsText(d.gaps, game.site.home)}. Turn on the property line to see it.</Note>}
    </Section>
    <Section title="Upgrade the walls">
      {game.perimeter.filter(r => runFinished(r) && UPGRADE_NEXT[r.kind]).length === 0 && <Note>Nothing to upgrade. A finished fence or wall can be upgraded in place to the next tier: the old one stands until the new one is up, and half its materials come back.</Note>}
      {game.perimeter.filter(r => runFinished(r) && UPGRADE_NEXT[r.kind]).slice(0, 8).map(r => {
        const next = UPGRADE_NEXT[r.kind]!, len = wallLength(r);
        const price = (k: typeof next, f: number) => orderCost(Object.entries(runBill(k, len)).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: Math.ceil((qty as number) * f) })));
        const net = Math.max(0, price(next, 1) - price(r.kind, SALVAGE));
        const why = upgradeProblem(game, r);
        return <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>
          <span style={{ flex: 1 }}>{PERIMETER[r.kind].name} <span style={{ color: DIM }}>({Math.round(len * 6)} m)</span> <span style={{ color: DIM }}>→</span> {PERIMETER[next].name}</span>
          <button style={btn(false)} disabled={!!why} title={why ?? `${Math.round(runHours(next, len))} h of work; about ${usd(net)} after the salvage of the old one (${Math.round(SALVAGE * 100)}% of its materials back)`} onClick={() => { const w = useGameStore.getState().upgradeRun(r.id); if (w) alert(w); }}>{why ? 'Under way' : `Upgrade ~${usd(net)}`}</button>
        </div>;
      })}
    </Section>
    <Section title="The ground and the tunnels">
      {terrain.lines.length > 0 ? terrain.lines.map(l => <Note key={l}>{l}</Note>) : <Note>The ground here gives a crew no particular way in (Terrain overlay: Lanes).</Note>}
      <Row label="The ground's share of the defense" value={`${Math.round(terrain.score * 100)}%`} tone={terrain.score >= 0.5 ? 'good' : terrain.score >= 0.25 ? 'warn' : undefined} title="Hard lanes, a held choke and towers on real high ground: one input to how hard a crew finds the place (never a second scaling)" />
      {game.perimeter.filter(r => PERIMETER[r.kind].vehicleWay).map(r => <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>
        <span style={{ flex: 1 }}>{PERIMETER[r.kind].name} <span style={{ color: DIM }}>({Math.round(wallLength(r) * 6)} m, {runFinished(r) ? 'standing' : r.dropped ? 'dropped: rebuild it from Projects' : 'being built'})</span></span>
        {runFinished(r) && <button style={btn(false)} title="Bring it down on purpose: nothing crosses there until it is rebuilt, and a crew has to ford and climb the gorge. Half the steel comes back." onClick={() => { if (window.confirm('Drop this tunnel? It has to be rebuilt to use it again.')) { const w = useGameStore.getState().dropBridge(r.id); if (w) alert(w); } }}>Drop it</button>}
      </div>)}
    </Section>
    <Section title="Wall-top walkway">
      <Note>A steel patrol deck along the top of a container, steel or concrete wall (1.2 m wide, a handrail, stairs at the gates and about every 80 m). Guards on watch walk it and see farther; a post on it fights from above and fewer crews get over. It stays on through a wall upgrade.</Note>
      {game.perimeter.filter(r => canHostWalkway(r.kind) && !r.replaces).length === 0 && <Note>No wall that can take one yet: container, steel or concrete.</Note>}
      {game.perimeter.filter(r => canHostWalkway(r.kind) && !r.replaces).slice(0, 8).map(r => {
        const len = wallLength(r), deck = walkOn(game, r.id), why = walkwayProblem(game, r.id);
        const price = orderCost(Object.entries(walkwayBill(len)).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })));
        return <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>
          <span style={{ flex: 1 }}>{PERIMETER[r.kind].name} <span style={{ color: DIM }}>({Math.round(len * 6)} m)</span></span>
          <button style={btn(!!deck && runFinished(deck))} disabled={!!why} title={why ?? `${Math.round(runHours('wall_walk', len))} h of work; about ${usd(price)} of materials (rebar, roofing sheet, hardware: Shop, Fencing)`} onClick={() => { const w = useGameStore.getState().addWalkway(r.id); if (w) alert(w); }}>{deck ? (runFinished(deck) ? 'Walkway built' : 'Walkway under way') : why ? 'Not yet' : `Add walkway ~${usd(price)}`}</button>
        </div>;
      })}
    </Section>
    <Section title="Razor wire">
      <Note>Concertina coils along the top of a finished wall or fence: a crew going over it leaves skin and time (+{Math.round(RAZOR.PEOPLE * 100)} points of what the run stops). The family hangs it from the stockpile (wire and hardware: Shop, Fencing); it is lost when the wall is upgraded. Steel and electrified walls carry their own.</Note>
      {game.perimeter.filter(r => RAZOR.HOSTS.includes(r.kind) && runFinished(r) && !r.replaces).length === 0 && <Note>No finished wall or fence that can take it yet.</Note>}
      {game.perimeter.filter(r => RAZOR.HOSTS.includes(r.kind) && runFinished(r) && !r.replaces).slice(0, 8).map(r => {
        const len = wallLength(r), why = razorProblem(game, r);
        const price = orderCost(Object.entries(razorBill(len)).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: qty as number })));
        return <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>
          <span style={{ flex: 1 }}>{PERIMETER[r.kind].name} <span style={{ color: DIM }}>({Math.round(len * 6)} m)</span></span>
          <button style={btn(!!r.razor)} disabled={!!why} title={why ?? `${Math.round(razorHours(len))} h of work; about ${usd(price)} of wire and hardware`} onClick={() => { const w = useGameStore.getState().addRazor(r.id); if (w) alert(w); }}>{r.razor ? 'Wired' : 'Hang razor wire'}</button>
        </div>;
      })}
    </Section>
    <LightDiscipline />
    <Section title="Floodlights">
      <Note>Part of the night-time suite: lights that stay on draw the road's eyes to the camp. Always on costs power and is seen from the road; a motion sensor lights up when a threat is detected near and for a little after; off keeps the place dark. Light discipline (above) can turn every light off.</Note>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0' }}>
        <span style={{ flex: 1 }}>Default for all</span>
        {LIGHT_MODES.map(m => <button key={m} style={btn(lightsOf(game).mode === m)} onClick={() => useGameStore.getState().setLightDefault(m)}>{LIGHT_MODE_NAME[m]}</button>)}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0' }}>
        <span style={{ flex: 1, color: DIM }}>Set all lights (clears overrides)</span>
        {LIGHT_MODES.map(m => <button key={m} style={btn(false)} onClick={() => useGameStore.getState().setAllLights(m)}>{LIGHT_MODE_NAME[m]}</button>)}
      </div>
      <Note>A basic motion sensor trips on anything that moves at night: deer, coyotes, a bear. That burns power and the glow is seen from the road. An AI sensor module ({game.stock[AI_MODULE]} owned, {aiModulesUsed(game)} fitted; Shop, Defense) tells people from animals: the light comes on for people only.</Note>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0' }}>
        <span style={{ flex: 1, color: DIM }}>AI sensor, all lights</span>
        <button style={btn(false)} onClick={() => { const n = useGameStore.getState().setAllLightsAi(lightList(game, floodTowerIds(game)).map(l => l.id), true); if (!n) alert(game.stock[AI_MODULE] - aiModulesUsed(game) < 1 ? 'No spare AI sensor module: buy one in the Shop (Defense).' : 'Nothing to fit (the lights need power).'); }}>Fit all</button>
        <button style={btn(false)} onClick={() => useGameStore.getState().setAllLightsAi(lightList(game, floodTowerIds(game)).map(l => l.id), false)}>Strip all</button>
      </div>
      {lightList(game, floodTowerIds(game)).length === 0 && <Note>No floodlights yet: buy a set (Shop, Defense) or build a tower with a light mast.</Note>}
      {lightList(game, floodTowerIds(game)).map(l => <div key={l.id} style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', padding: '3px 0' }}>
        <span style={{ flex: 1 }}>{l.name}{l.id !== ARMORY_LIGHTS ? '' : ''}</span>
        {LIGHT_MODES.map(m => <button key={m} style={btn(lightMode(game, l.id) === m)} onClick={() => useGameStore.getState().setLightMode(l.id, lightsOf(game).per[l.id] === m ? null : m)}>{LIGHT_MODE_NAME[m]}</button>)}
        <button style={btn(hasAiSensor(game, l.id))} title="AI sensor module: this light ignores animals and comes on for people only (needs a spare module and power)" onClick={() => { const why = useGameStore.getState().setLightAi(l.id, !hasAiSensor(game, l.id)); if (why) alert(why); }}>AI {hasAiSensor(game, l.id) ? 'on' : 'off'}</button>
      </div>)}
    </Section>
    <Section title="Upgrade the towers">
      <Note>A watch tower goes: rise &amp; lookout, wooden tower, concrete &amp; steel, floodlights, a manned mounted gun, an automated turret. The next tier rises beside the old one, which keeps watch until it is up.</Note>
      {game.structures.every(st => !isTower(st.kind)) && <Note>No tower yet. Build a rise &amp; lookout from the Build menu (Watch towers).</Note>}
      {game.structures.filter(st => isTower(st.kind) && structFinished(st)).map(st => {
        const def = TOWERS[st.kind as keyof typeof TOWERS], nk = TOWER_NEXT[st.kind];
        const hb = highBonus(st, st.kind as keyof typeof TOWERS);
        const hg = highShare(st) > 0.05 ? <span style={{ color: TONE.good }} title="The ground under it stands above the land round it: the watch sees farther and earlier (capped)."> · high ground +{Math.round((st.high ?? 0) * 6)} m: sees {Math.round(hb.viewR * 6)} m farther, +{Math.round(hb.view)} warning</span> : null;
        if (!nk) return <div key={st.id} style={{ padding: '3px 0' }}>{def.name} <span style={{ color: DIM }}>(tier {def.tier} of 6, the last)</span>{hg}</div>;
        const price = (bill: ReturnType<typeof towerBill>, f: number) => orderCost(Object.entries(bill).filter(([m]) => MATERIALS[m as MaterialId].price !== null).map(([material, qty]) => ({ material: material as MaterialId, qty: Math.ceil((qty as number) * f) })));
        const net = Math.max(0, price(towerBill(nk), 1) - price(towerBill(st.kind as keyof typeof TOWERS), STRUCTURE_SALVAGE));
        const why = towerUpgradeProblem(game, st);
        return <div key={st.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>
          <span style={{ flex: 1 }}>{def.name} <span style={{ color: DIM }}>(tier {def.tier})</span>{hg} <span style={{ color: DIM }}>→</span> {TOWERS[nk].name}</span>
          <button style={btn(false)} disabled={!!why} title={why ?? `${TOWERS[nk].blurb} About ${usd(net)} after the salvage of the old one (${Math.round(STRUCTURE_SALVAGE * 100)}% of its materials back).`} onClick={() => { const w = useGameStore.getState().upgradeTower(st.id); if (w) alert(w); }}>{why ? 'Under way' : `Upgrade ~${usd(net)}`}</button>
        </div>;
      })}
    </Section>
    <Section title="The houses">
      {d.homes.length === 0 && <Note>No house finished yet.</Note>}
      {d.homes.map(h => <CheckRow key={h.id} c={{ id: h.id, label: h.name, ok: h.covered, tone: h.covered ? 'good' : 'bad', detail: h.how }} />)}
      {exposed.length > 0 && <Note tone="bad">{exposed.length} home{exposed.length > 1 ? 's are' : ' is'} exposed: close the property line (and bar the creek) or wall a ring round {exposed.length > 1 ? 'them' : 'it'}.</Note>}
    </Section>
    {d.linked.length > 0 && <Section title="Linked yards">
      {d.linked.map(c => <CheckRow key={c.id} c={c} />)}
      {d.linkList.filter(l => l.kind === 'passage').map(l => {
        const run = game.perimeter.find(r => r.id === l.runId);
        const exposed = d.hatches.some(h => h.runId === l.runId && h.exposed);
        return <div key={l.runId} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>
          <span style={{ flex: 1 }}>Passage blast doors <span style={{ color: DIM }}>{exposed ? '(one end comes up outside a wall)' : '(both ends inside walls)'}</span></span>
          <button style={btn(!run?.unlocked)} onClick={() => useGameStore.getState().lockPassage(l.runId, !!run?.unlocked)}>{run?.unlocked ? 'Unbolted: bolt them' : 'Bolted: unbolt'}</button>
        </div>;
      })}
      <Note>A covered walkway is steel and glass above ground, lit if there is power, with a doorway cut in each yard wall. A passage is hidden below it; only a hatch outside every wall could ever be found. The doors bolt themselves when a raid starts.</Note>
    </Section>}
    {d.digging.length > 0 && <Section title="Digging">
      {d.digging.map(c => <CheckRow key={c.id} c={c} />)}
      {d.skirtable.map(r => <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>
        <span style={{ flex: 1 }}>{r.label}</span>
        <button style={btn(false)} disabled={!!r.problem} title={r.problem ?? 'Sink a steel-and-concrete skirt 4 m down under the wall; the crew has it in the ground in a few days'} onClick={() => { const w = useGameStore.getState().addSkirt(r.id); if (w) alert(w); }}>{r.has ? 'Skirt buried' : r.problem && !/Waiting/.test(r.problem) ? r.problem : 'Add a buried skirt'}</button>
      </div>)}
      <Note>Organized crews dig under walls over a week or more, late in the collapse. A skirt stops them; a ditch floods the tunnel; sensors, dogs and a watch give you days of warning. Then you can wait for them at the breakout with the party.</Note>
    </Section>}
    <Section title="Watching">{d.watch.map(c => <CheckRow key={c.id} c={c} />)}</Section>
    <Section title="Fighting">{d.fight.map(c => <CheckRow key={c.id} c={c} />)}</Section>
    <Section title="Shelter">{d.shelter.map(c => <CheckRow key={c.id} c={c} />)}</Section>
    <Section title="Other catastrophes">{d.catastrophes.map(c => <CheckRow key={c.id} c={c} />)}</Section>
    <Section title="Built for defense">
      {d.improvements.length ? <div style={{ color: DIM, lineHeight: 1.5 }}>{d.improvements.join(' · ')}</div> : <Note>Nothing yet. Fences, walls, a tower, a dog and cameras all count.</Note>}
    </Section>
  </>;
}

