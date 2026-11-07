import { describe, expect, it } from 'vitest';
import { newGame, type GameState } from './state';
import { triggerDisaster, tracksAt, DISASTERS, type DisasterKind } from './disaster';
import { blackoutOf, collapseLook, darkness, envelope, NO_LOOK, skylineAz, townFade, withWeather } from './collapseLook';
import { dayCard } from './dayCard';
import { collapseChip } from './collapseChip';

function at(kind: DisasterKind, days: number, variant?: string): GameState {
  const g = newGame(7);
  triggerDisaster(g.disaster, 100, kind, 7, 14, variant);
  g.disaster.phase = days < 0 ? 'warning' : 'impact';
  g.clock.t = g.disaster.hitAt + days;
  g.disaster.tracks = tracksAt(g.disaster, g.clock.t);
  return g;
}

describe('collapse look', () => {
  it('is nothing before the warning and in peace', () => {
    const g = newGame(7);
    expect(collapseLook(g)).toBe(NO_LOOK);
    const w = at('ash_winter', -20);
    expect(collapseLook(w).stage).toBe('none');
  });
  it('a hint grows through the warning and the full look arrives at impact', () => {
    const early = collapseLook(at('ash_winter', -12)), late = collapseLook(at('ash_winter', -1)), hit = collapseLook(at('ash_winter', 5));
    expect(early.stage).toBe('warning');
    expect(late.skyAmt).toBeGreaterThan(early.skyAmt);
    expect(late.skyAmt).toBeLessThan(hit.skyAmt * 0.5);
    expect(hit.stage).toBe('survival');
    expect(hit.dim).toBeLessThan(0.6);
    expect(hit.ash).toBeGreaterThan(0.3);
  });
  it('eases on the disaster\'s own timeline: a fire clears in weeks, an ash winter lasts over a year', () => {
    expect(collapseLook(at('wildfire', 60)).k).toBeLessThan(0.05);
    expect(collapseLook(at('wildfire', 2)).k).toBeGreaterThan(0.9);
    expect(collapseLook(at('ash_winter', 300)).k).toBeGreaterThan(0.9);
    expect(collapseLook(at('ash_winter', 1500)).k).toBeLessThan(0.2);
  });
  it('each kind looks different', () => {
    const kinds: DisasterKind[] = ['ash_winter', 'wildfire', 'drought', 'pandemic', 'cyberattack', 'financial'];
    const sig = kinds.map(k => { const l = collapseLook(at(k, 4)); return [l.skyTint.map(x => x.toFixed(2)).join(), l.cast.map(x => x.toFixed(2)).join(), l.dim.toFixed(2)].join('|'); });
    expect(new Set(sig).size).toBe(kinds.length);
    expect(collapseLook(at('wildfire', 2)).skyTint[0]).toBeGreaterThan(collapseLook(at('wildfire', 2)).skyTint[2]);
  });
  it('the lights go out with the grid and come back with it', () => {
    expect(collapseLook(at('grid_down', -5, 'substation')).blackout).toBe(0);
    expect(collapseLook(at('grid_down', 1, 'substation')).blackout).toBeGreaterThan(0.95);
    expect(collapseLook(at('cyberattack', 400)).blackout).toBe(0);
    expect(blackoutOf(1)).toBe(0);
    expect(blackoutOf(0)).toBe(1);
  });
  it('is deterministic and the envelope never leaves 0-1', () => {
    expect(collapseLook(at('ash_winter', 9))).toEqual(collapseLook(at('ash_winter', 9)));
    for (const d of [-30, -1, 0, 1, 5, 100, 500, 2000]) { const k = envelope({ warn: 0.3, rise: 3, hold: 100, fade: 100, floor: 0.1 }, d, 0.7); expect(k).toBeGreaterThanOrEqual(0); expect(k).toBeLessThanOrEqual(1); }
  });
  it('nuclear keeps its flash and haze', () => {
    expect(collapseLook(at('nuclear', 0.001, 'distant')).flash).toBeGreaterThan(0);
  });
});

describe('the day-it-happened card and the chip', () => {
  it('has a headline and what falls in three days', () => {
    const c = dayCard(at('ash_winter', 0))!;
    expect(c.headline).toMatch(/Yellowstone/);
    expect(c.lines.join(' ')).toMatch(/gone or going/);
    expect(c.look).toMatch(/ash/i);
    expect(dayCard(newGame(7))).toBeNull();
  });
  it('counts down through the warning and counts days after', () => {
    expect(collapseChip(newGame(7))).toBeNull();
    const w = collapseChip(at('grid_down', -10))!;
    expect(w.chip).toBe('Impact in 10 days');
    expect(collapseChip(at('grid_down', -2))!.tone).toBe('bad');
    expect(collapseChip(at('grid_down', 12))!.chip).toBe('Day 13');
  });

  it('the pandemic look is there at impact, not creeping in over days (QA run 6)', () => {
    const day0 = collapseLook(at('pandemic', 0.5)), day1 = collapseLook(at('pandemic', 1)), day14 = collapseLook(at('pandemic', 14));
    expect(day0.k).toBeGreaterThan(0.95);
    expect(day0.sat).toBeLessThan(0.55);
    expect(Math.abs(day1.k - day14.k)).toBeLessThan(0.02);
    // the warning days keep the old, slow hint
    expect(collapseLook(at('pandemic', -10)).k).toBeLessThan(0.3);
  });
  it('pandemic, lawless and cyberattack each have a presence of their own beyond a red ticker', () => {
    const pan = collapseLook(at('pandemic', 20)), law = collapseLook(at('lawless', 20)), cyb = collapseLook(at('cyberattack', 6));
    // a pandemic: cold and drained, fewer town lights, a hazy still air
    expect(pan.sat).toBeLessThan(0.75);
    expect(pan.cast[2]).toBeGreaterThan(pan.cast[0]);
    expect(pan.townGlow).toBeLessThan(0.7);
    expect(pan.haze + pan.fog).toBeGreaterThan(0.3);
    expect(pan.smoke).toBe(0);
    // lawless: warm, smoky, fires on the horizon, dim lights
    expect(law.cast[0]).toBeGreaterThan(law.cast[2]);
    expect(law.fireGlow).toBeGreaterThan(0.4);
    expect(law.smoke).toBeGreaterThan(0.4);
    expect(law.townGlow).toBeLessThan(0.7);
    // a dead grid: no town glow, cold muted day, a lifted dark so the night stays readable
    expect(cyb.townGlow).toBeLessThan(0.3);
    expect(cyb.flicker).toBeGreaterThan(0.5);   // (a rolling attack: the grid is a third of itself, so the lights stutter rather than die)
    expect(cyb.sat).toBeLessThan(0.9);
    expect(cyb.cast[2]).toBeGreaterThan(cyb.cast[0]);
    expect(cyb.nightLift).toBeGreaterThan(0.3);
    expect(cyb.nightLift).toBeLessThanOrEqual(0.5);
  });
  it('the town glow flickers while the grid fails and is steady before and after', () => {
    expect(darkness(0)).toEqual({ townGlow: 1, flicker: 0, nightLift: 0 });
    expect(darkness(1).flicker).toBe(0);
    expect(darkness(1).townGlow).toBe(0);
    expect(darkness(0.5).flicker).toBeCloseTo(1, 5);
  });
  it('eases in on the disaster timeline: nothing at the start of the warning, the full look after the hit', () => {
    expect(collapseLook(at('lawless', -12)).smoke).toBeLessThan(collapseLook(at('lawless', 20)).smoke * 0.35);
    expect(collapseLook(at('lawless', 2000)).smoke).toBeLessThan(0.2);
    expect(collapseLook(at('grid_down', -5, 'substation')).townGlow).toBe(1);
  });
});

const ALL_KINDS = Object.keys(DISASTERS) as DisasterKind[];

describe('every disaster has a look of its own', () => {
  it('covers every disaster in the engine, and each shows something at impact', () => {
    expect(ALL_KINDS.length).toBe(16);
    for (const k of ALL_KINDS) {
      const l = collapseLook(at(k, k === 'nuclear' ? 0.001 : 4, k === 'nuclear' ? 'distant' : undefined));
      expect(l.stage, k).not.toBe('none');
      const marks = l.skyAmt + l.haze + l.fog + l.cloud + l.ash + l.flash + (1 - l.sat) + Math.abs(l.contrast) + l.smoke + l.fireGlow + l.blackout + l.aurora;
      expect(marks, k).toBeGreaterThan(0.1);
    }
  });
  it('no two kinds share the same day signature (tint, cast, saturation, dim) a few days in', () => {
    const sig = ALL_KINDS.map(k => {
      const l = collapseLook(at(k, 4, k === 'nuclear' ? 'distant' : undefined));
      return [l.skyTint.map(x => x.toFixed(2)).join(), l.cast.map(x => x.toFixed(2)).join(), l.sat.toFixed(2), l.dim.toFixed(2), l.haze.toFixed(2)].join('|');
    });
    expect(new Set(sig).size).toBe(ALL_KINDS.length);
  });
  it('the dead-grid kinds are told apart by their night: no town lights, a lifted dark', () => {
    for (const k of ['grid_down', 'solar_flare', 'cyberattack'] as DisasterKind[]) {
      const l = collapseLook(at(k, k === 'cyberattack' ? 20 : 6, k === 'grid_down' ? 'substation' : undefined));
      expect(l.townGlow, k).toBeLessThan(0.5);
      expect(l.nightLift, k).toBeGreaterThan(0.1);
    }
  });
  it('wildfire: an orange sky, ash and fires on the skyline that burn out in weeks', () => {
    const w = collapseLook(at('wildfire', 2)), later = collapseLook(at('wildfire', 60));
    expect(w.skyTint[0]).toBeGreaterThan(w.skyTint[2] * 3);
    expect(w.ash).toBeGreaterThan(0.2);
    expect(w.fireGlow).toBeGreaterThan(0.6);
    expect(w.smoke).toBeGreaterThan(0.6);
    expect(later.fireGlow).toBeLessThan(0.05);
  });
  it('civil war and invasion have gunfire and convoys; peaceful kinds do not', () => {
    for (const k of ['civil_war', 'invasion'] as DisasterKind[]) {
      const l = collapseLook(at(k, 10));
      expect(l.flashes, k).toBeGreaterThan(0.2);
      expect(l.convoy, k).toBeGreaterThan(0.1);
    }
    for (const k of ['pandemic', 'financial', 'drought', 'grid_down'] as DisasterKind[]) {
      const l = collapseLook(at(k, 10));
      expect(l.flashes, k).toBe(0);
      expect(l.convoy, k).toBe(0);
    }
  });
  it('nuclear: grey-yellow fallout light, a flash on day one, fires on the skyline, a dead grid', () => {
    const l = collapseLook(at('nuclear', 0.001, 'distant')), week = collapseLook(at('nuclear', 6, 'distant'));
    expect(l.flash).toBeGreaterThan(0.3);
    expect(week.skyTint[1]).toBeGreaterThan(week.skyTint[2]);
    expect(week.cast[2]).toBeLessThan(week.cast[0]);
    expect(week.fireGlow).toBeGreaterThan(0.3);
    expect(week.townGlow).toBeLessThan(0.4);
  });
  it('solar storm: an aurora in the warning and the first nights; asteroid: a comet only before the hit', () => {
    expect(collapseLook(at('solar_flare', -1)).aurora).toBeGreaterThan(0.1);
    expect(collapseLook(at('solar_flare', 1)).aurora).toBeGreaterThan(0.8);
    expect(collapseLook(at('solar_flare', 60)).aurora).toBeLessThan(0.1);
    expect(collapseLook(at('asteroid', -3)).comet).toBeGreaterThan(0.3);
    expect(collapseLook(at('asteroid', 3)).comet).toBe(0);
    expect(collapseLook(at('wildfire', 3)).aurora).toBe(0);
  });
});

describe('what the night horizon glows with', () => {
  it('a sick green for the bioweapon, a cold blue for a pandemic, nothing for the dead-grid kinds', () => {
    const bio = collapseLook(at('bioweapon', 6)).nightGlow, pan = collapseLook(at('pandemic', 6)).nightGlow;
    expect(bio[1]).toBeGreaterThan(bio[0] * 1.5);
    expect(pan[2]).toBeGreaterThan(pan[0]);
    for (const k of ['grid_down', 'cyberattack', 'solar_flare'] as DisasterKind[]) expect(collapseLook(at(k, 6)).nightGlow, k).toEqual([0, 0, 0]);
  });
});

describe('the fading town and the emptying road', () => {
  it('the skyline bearings are fixed by the seed', () => {
    expect(skylineAz(7)).toEqual(skylineAz(7));
    expect(skylineAz(7).town).not.toBe(skylineAz(8).town);
  });
  it('the far town shows on the skyline once the warning starts, and its lights go out over weeks', () => {
    expect(collapseLook(at('lawless', -25)).townLights).toBe(0);            // peace (before the warning): nothing is drawn
    expect(collapseLook(at('lawless', -2)).townLights).toBeGreaterThan(0.7);
    const day0 = collapseLook(at('lawless', 0.5)).townLights, wk = collapseLook(at('lawless', 14)).townLights, mo = collapseLook(at('lawless', 90)).townLights;
    expect(day0).toBeGreaterThan(wk);
    expect(wk).toBeGreaterThan(mo);
    expect(mo).toBeLessThan(0.45);
  });
  it('the lights go out with the grid at once, then stay out until it is back', () => {
    expect(collapseLook(at('grid_down', 1, 'substation')).townLights).toBeLessThan(0.05);
    expect(collapseLook(at('grid_down', 20, 'substation')).townLights).toBeLessThan(0.05);
    expect(townFade({ town: 0.3, townDays: 20, rise: 5, hold: 100, fade: 100, floor: 0.1 }, 0, 0.5)).toBeCloseTo(1, 5);
    expect(townFade({ town: 0.3, townDays: 20, rise: 5, hold: 100, fade: 100, floor: 0.1 }, 40, 1)).toBeCloseTo(0.3, 5);
    // and it comes back as the look eases
    expect(townFade({ town: 0.3, townDays: 20, rise: 5, hold: 100, fade: 100, floor: 0.1 }, 400, 0.1)).toBeGreaterThan(0.85);
  });
  it('the road is busier while people leave, then empties as fuel and deliveries fail', () => {
    const peace = collapseLook(at('wildfire', -5)).traffic, hit = collapseLook(at('wildfire', 2)).traffic;
    expect(peace).toBeGreaterThan(0.5);
    expect(hit).toBeLessThan(peace);
    const early = collapseLook(at('civil_war', 2)).traffic, late = collapseLook(at('civil_war', 40)).traffic;
    expect(late).toBeLessThan(early);
    expect(collapseLook(at('unknown', 5)).traffic).toBe(0);
  });
  it('every kind is deterministic and in range, day by day through a year', () => {
    for (const k of ALL_KINDS) for (const d of [-20, -3, 0.2, 2, 9, 40, 200, 700]) {
      const l = collapseLook(at(k, d, k === 'nuclear' ? 'distant' : undefined));
      for (const v of [l.k, l.townLights, l.traffic, l.convoy, l.flashes, l.aurora, l.comet, l.fireGlow, l.smoke, l.townGlow, l.blackout, l.nightLift]) {
        expect(v, `${k} ${d}`).toBeGreaterThanOrEqual(0);
        expect(v, `${k} ${d}`).toBeLessThanOrEqual(1.0001);
      }
    }
  });
});

describe('weather and seasons act on the look', () => {
  const ash = () => collapseLook(at('wildfire', 2));
  it('rain washes ash from the air and the ground and dampens the fires', () => {
    const dry = ash(), wet = withWeather(dry, { rain: 1, snow: 0, season: 'summer' });
    expect(wet.ash).toBeLessThan(dry.ash * 0.4);
    expect(wet.ashCover).toBeLessThan(dry.ashCover * 0.6);
    expect(wet.fireGlow).toBeLessThan(dry.fireGlow);
    expect(wet.smoke).toBeLessThan(dry.smoke);
  });
  it('snow buries the ash that lay and thins the road', () => {
    const dry = collapseLook(at('ash_winter', 20)), snowy = withWeather(dry, { rain: 0, snow: 1, season: 'winter' });
    expect(snowy.ashCover).toBeLessThan(dry.ashCover * 0.4);
    expect(snowy.traffic).toBeLessThanOrEqual(dry.traffic);
  });
  it('winter cools the cast and summer warms it, by as much as the look is on', () => {
    const l = ash(), w = withWeather(l, { rain: 0, snow: 0, season: 'winter' }), s = withWeather(l, { rain: 0, snow: 0, season: 'summer' });
    expect(w.cast[2] - w.cast[0]).toBeGreaterThan(s.cast[2] - s.cast[0]);
    expect(withWeather(NO_LOOK, { rain: 1, snow: 1, season: 'winter' })).toBe(NO_LOOK);
    // spring with a dry sky changes nothing
    expect(withWeather(l, { rain: 0, snow: 0, season: 'spring' })).toBe(l);
  });
});
