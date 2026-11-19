import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DigLine } from './ProjectsTab';
import { BLUEPRINTS } from '../../sim/blueprints';
import { blueprintOf } from '../../sim/construction';
import type { Structure } from '../../sim/state';

const mk = (stage: number, f: number): Structure => {
  const st = { id: 'd', kind: 'dome_arcology', x: 0, z: 0, rot: 0, stage, done: 0, supplied: true } as Structure;
  st.done = f * blueprintOf(st).stages[stage].hours;
  return st;
};

describe('Projects panel: a dome under construction names its stage and what the crew is doing', () => {
  it('stage names and the dig line for each phase', () => {
    const names = BLUEPRINTS.dome_arcology.stages.map(s => s.name);
    expect(names[0]).toMatch(/crater/); expect(names[1]).toMatch(/utilities/); expect(names[1]).toMatch(/skirt/); expect(names[2]).toMatch(/Backfill/);
    const line = (s: number, f: number) => renderToStaticMarkup(<DigLine st={mk(s, f)} />);
    expect(line(0, 0.05)).toMatch(/Staking/);
    expect(line(0, 0.5)).toMatch(/Excavating the crater: \d+ of 60 ft down \(.* cu yd\)/);
    expect(line(1, 0.2)).toMatch(/utilities and airlock sleeves/);
    expect(line(1, 0.8)).toMatch(/Pouring the buried skirt: \d+% round the ring/);
    expect(line(2, 0.3)).toMatch(/Backfilling round the skirt/);
    expect(line(3, 0.2)).toMatch(/Raising the shell/);
    expect(line(4, 0.8)).toMatch(/commissioning/);
  });
});
