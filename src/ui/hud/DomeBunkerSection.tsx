/** The bunker under a dome, on the Dome page: each piece and how far it has got, whether the skirt covers it, and the refuge it makes in a breach (sim/dome/bunker.ts). */
import { useGameStore } from '../../store/gameStore';
import { Note, Row, Section } from './common';
import { TIER } from '../../sim/dome/tiers';
import { bunkerRows, domeRefuge, ringPoured, skirtDepthFt, under } from '../../sim/dome/bunkerLive';
import { coverOf, floorFt } from '../../sim/dome/bunker';
import { pluralize } from '../../sim/words';
import type { DomeView } from '../../sim/dome/live';

const MODE = { with: 'built with the dome', after: 'dug under the floor', before: 'there first' } as const;

export function DomeBunkerSection({ v }: { v: DomeView }) {
  const game = useGameStore(s => s.game), id = v.ref.st.id, dome = v.ref.st;
  const rows = bunkerRows(game, id);
  if (!rows.length) return null;
  const depth = skirtDepthFt(game, dome), base = TIER[v.ref.tier].skirtFt, fl = floorFt(1, 1 - 0.8), cover = coverOf(v.ref.tier, fl, depth - base);
  const poured = ringPoured(dome), fin = under(game, dome).filter(p => p.finishedAt !== null);
  const r = domeRefuge(game, id, 'breach', v.people, v.st.powered);
  return <Section title="The bunker under it">
    <div data-testid="dome-bunker-rows" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {rows.map(x => <Row key={x.id} label={`${x.name[0].toUpperCase()}${x.name.slice(1)} (${MODE[x.mode]})`} value={x.state === 'finished' ? 'finished' : `${x.state === 'staked' ? 'staked' : 'building'}, ${x.pct} percent`} tone={x.state === 'finished' ? 'good' : undefined} />)}
    </div>
    <Row label="Protected by the skirt" value={poured ? `${depth} ft ring, floor about ${Math.round(fl)} ft down` : 'not until the ring is poured'} tone={poured ? (cover.state === 'covered' ? 'good' : 'warn') : 'warn'} title={`The skirt must reach the bunker floor plus a 3 ft margin (${cover.need} ft). Tunnelers cannot reach a room inside the ring from outside by digging; the only ways across are the airlock sleeves.`} />
    {depth > base && <Note>The skirt was taken {depth - base} ft deeper (a deep footing) to cover the bunker.</Note>}
    {fin.length > 0 && <>
      <Row label="Refuge in a breach, fire, fallout or siege" value={r.open ? `${pluralize(r.places, 'place')}, ${r.sheltered} of ${v.people} under the shell fit` : 'no finished way down'} tone={r.open && r.left === 0 ? 'good' : 'warn'} title="People under the shell can drop into the bunker. The dome plant's power feeds it while its substation is up; the bunker's own plant room and stores still apply." />
      <Row label="Power and air down there" value={`${r.power === 'dome' ? 'from the dome plant' : r.power === 'own' ? 'the bunker\'s own plant room' : 'none'}; ${r.air === 'filtered' ? 'filtered' : 'stale air only'}`} />
    </>}
  </Section>;
}
