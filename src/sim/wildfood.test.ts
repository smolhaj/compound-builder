import { describe, expect, it } from 'vitest';
import { newGame } from './state';
import { buyLicense, hasLicense, inSeason, wildDay } from './wildfood';
import { CLASSIC } from './site';

const hunters = (doy: number, kind?: 'nuclear' | 'ash_winter' | 'drought') => {
  const g = newGame(4, doy, 2027, kind ? { mode: 'scenario', peace: 'short', kind } : {});
  g.money = 20_000;
  g.people[0].skills.hunter = 8;
  g.armory.guns.push({ id: 'g', model: 'rem_700', condition: 1, fired: 0, where: 'safe', carrier: null });
  g.armory.ammo['308'] = 200;
  return g;
};
const season = (g: ReturnType<typeof newGame>, days: number, freezer = true) => { let m = 0; const t0 = g.clock.t; for (let d = 0; d < days; d++) { g.clock.t = t0 + d; m += wildDay(g, freezer); } return m; };

describe('wild food', () => {
  it('peacetime: deer only in season and with a tag (or poach and risk the warden)', () => {
    const g = hunters(285);
    expect(inSeason(g, 'deer')).toBe(true);
    expect(season(g, 40)).toBe(0);                     // no tag
    const h = hunters(285);
    expect(buyLicense(h, 'deer')).toBeNull();
    expect(hasLicense(h, 'deer')).toBe(true);
    expect(season(h, 45)).toBeGreaterThan(0);
    expect(h.stock.frozen).toBeGreaterThan(0);
    const summer = hunters(180);
    buyLicense(summer, 'deer');
    expect(season(summer, 40)).toBe(0);                 // out of season
  });

  it('after it hits there are no seasons, but the game thins out', () => {
    const g = hunters(285, 'drought');
    g.clock.t = g.disaster.hitAt + 1; g.disaster.tracks.stores = 0;
    const m = season(g, 300);
    expect(m).toBeGreaterThan(0);
    expect(g.wild.abundance.big).toBeLessThan(0.7);
    expect(g.wild.abundance.fish).toBeLessThan(0.3);    // the drought killed the fish
  });

  it('fishing needs gear (and a license in peacetime); a creek on the place fishes better', () => {
    const g = hunters(200);
    g.site = { ...CLASSIC, creek: true };
    buyLicense(g, 'fishing');
    expect(season(g, 60)).toBe(0);
    g.stock.fishing_gear = 1;
    expect(season(g, 60)).toBeGreaterThan(0);
  });

  it('fallout makes the meat hot; no freezer and a smoker turns it into jerky', () => {
    const g = hunters(285, 'nuclear');
    g.clock.t = g.disaster.hitAt + 20; g.disaster.tracks.stores = 0;
    g.stock.smoker = 1;
    const st0 = g.stock.staples;
    season(g, 120, false);
    expect(g.stock.staples).toBeGreaterThan(st0);
    expect(g.personState[0].needs.dose).toBeGreaterThan(0);
  });
});
