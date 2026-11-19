/**
 * The placing card for a bunker piece inside a dome's skirt ring: "protected by the skirt", the skirt's depth against the bunker floor, and the offer to build it
 * with the dome while the crater is open (sim/dome/bunkerLive.ts `bunkerSite`; every number is PROPOSED in docs/DECISIONS.md). Layout A and classic both mount it.
 */
import { useGameStore } from '../../store/gameStore';
import { useWorldStore } from '../../store/worldStore';
import { BUNKER_DOME } from '../../sim/dome/bunker';
import { T, tv } from './tokens';

export function BunkerDomeCard() {
  const tool = useGameStore(g => g.tool), site = useGameStore(g => g.bunkerSite), on = useGameStore(g => g.bunkerWithDome), set = useGameStore(g => g.setBunkerWithDome);
  const scale = useWorldStore(w => w.uiScale), hidden = useWorldStore(w => w.hudHidden);
  if (!tool || !site || hidden || !tool.startsWith('bunker_')) return null;
  const withIt = site.canWith && on, covered = site.cover.state !== 'refused';
  return <div data-testid="bunker-dome-card" role="group" aria-label="Bunker under a dome" style={{ position: 'fixed', left: 12, bottom: 78 * scale, transform: `scale(${scale})`, transformOrigin: 'bottom left', zIndex: 17, width: 380,
    boxSizing: 'border-box', padding: T.space[3], background: 'rgba(20,22,18,0.95)', color: tv.color('text'), border: `1px solid ${covered ? T.color.lineStrong : tv.color('warn')}`, borderRadius: tv.radius('panel'), boxShadow: tv.shadow(2),
    fontFamily: tv.font('family'), fontSize: tv.font('sm'), lineHeight: T.lineHeight.body, display: 'flex', flexDirection: 'column', gap: T.space[2] }}>
    <div style={{ fontSize: tv.font('title'), fontWeight: T.weight.semi }}>Under the {site.domeName.toLowerCase()}</div>
    <div data-testid="bunker-skirt-line">{site.line}</div>
    <div style={{ display: 'flex', justifyContent: 'space-between', fontVariantNumeric: 'tabular-nums' }}>
      <span style={{ color: tv.color('dim') }}>Skirt depth / bunker floor</span><span data-testid="bunker-depths">{site.cover.have} ft / {Math.round(site.floorFt)} ft</span>
    </div>
    {site.craterOpen
      ? <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', cursor: site.canWith ? 'pointer' : 'default', opacity: site.canWith ? 1 : 0.6 }}>
        <input data-testid="bunker-with-dome" type="checkbox" checked={withIt} disabled={!site.canWith} onChange={e => set(e.target.checked)} />
        <span>Build the bunker with the dome. It goes into the same crater and takes about {Math.round(BUNKER_DOME.WITH_HOURS * 100)} percent of the usual hours ({site.withHours.toLocaleString('en-US')} h), but the dome waits to backfill until its walls and roof stand.
          {site.canWith ? ` Crew room left in this crater: ${site.room.toLocaleString('en-US')} h.` : ` The crew has only ${site.room.toLocaleString('en-US')} h of room left in this crater, so this piece waits and is dug under the floor instead.`}</span>
      </label>
      : <div style={{ color: tv.color('dim') }}>The crater is closed, so this is dug under the dome's floor with shoring: about {Math.round((BUNKER_DOME.AFTER_HOURS - 1) * 100)} percent more hours and extra lumber.</div>}
    <div style={{ color: tv.color('dim'), fontSize: tv.font('fine') }}>{site.craterOpen && !withIt ? 'Shored dig under the floor.' : ''} Its stair or hatch stands inside the dome, a cell clear of the ring and of the airlocks. Click places it, R turns it, Esc cancels.</div>
  </div>;
}
