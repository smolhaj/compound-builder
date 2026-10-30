/** The plow blade's difference, in numbers (sim/slope.ts `plowReport`): days a winter the way in is shut with and without it, and how long help takes while it is. */
import type { GameState } from '../../sim/state';
import { plowReport } from '../../sim/slope';
import { Note } from './common';

export function PlowNote({ game }: { game: GameState }) {
  const r = plowReport(game);
  if (!r || (r.without === 0 && r.withBlade === 0)) return null;
  const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;
  return (
    <Note tone={r.haveBlade ? undefined : 'warn'}>
      {r.haveBlade
        ? `The plow blade is on the truck: the road is shut about ${days(r.withBlade)} a winter instead of ${r.without}, and while it is shut help takes ${r.responseShut[1]} times as long (${r.responseShut[0]} without the blade). The truck goes up the drive after each heavy snow.`
        : `Without a plow blade the road is shut about ${days(r.without)} a winter (${r.heavy} heavy snows, ${r.eachWithout} day${r.eachWithout === 1 ? '' : 's'} each) and help takes ${r.responseShut[0]} times as long while it is; with one, about ${days(r.withBlade)} and ${r.responseShut[1]} times.`}
    </Note>
  );
}
