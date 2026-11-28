/**
 * Soak, part 2: every save version step. A mid-game state (a bot's family a few weeks after the collapse) is relabeled as each older version
 * v = 1 ... SAVE_VERSION - 1, pushed through the migration table (`migrate`), and checked: it must arrive at the current version, hold every
 * invariant of src/sim/soak/invariants.ts, and then play ten more days with the invariants checked every day and a save round trip at the end.
 * (A relabeled current save is not a true old save: steps that only back-fill with `??` keep what is there, steps that reset a field
 * (e.g. 8 -> 9 the collapse clock, 11 -> 12 neighbors and gate) replace it with a fresh one; both must leave a state that runs.)
 *   MIGRATE_DAYS=30 npx vitest run scripts/soakMigrate.test.ts
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { play, siteFor } from './playtest.test';
import { migrate, exportJson, importJson } from '../src/sim/save/migrations';
import { step } from '../src/sim/engine';
import { SAVE_VERSION, type GameState } from '../src/sim/state';
import { checkState, firstDifference, type Violation } from '../src/sim/soak/invariants';

const DAYS = Number(process.env.MIGRATE_DAYS ?? 10);
/** Top-level keys a step makes when they are absent (`key: (s.key as T | undefined) ?? fresh()`): by step number, read off the migration source. */
function madeIfAbsent(): Map<number, string[]> {
  const out = new Map<number, string[]>(), src = readFileSync(new URL('../src/sim/save/migrations.ts', import.meta.url), 'utf8');
  for (const m of src.matchAll(/^ {2}(\d+): s => (?:\{[^]*?return |\()?\{? ?\.\.\.s, version: \d+,([^\n]*)/gm)) {
    const keys = [...m[2].matchAll(/\b(\w+): \(?s\.(\w+)\b[^,;]*?\?\?/g)].filter(k => k[1] === k[2]).map(k => k[1]);
    if (keys.length) out.set(Number(m[1]), keys);
  }
  return out;
}
const codes = (v: Violation[]) => [...new Set(v.map(x => x.code))].sort().join(',');

describe('save migrations: every version step, invariants after', () => {
  process.env.DIFF = 'standard'; process.env.LIFESTYLE = 'fulltime';
  const base: GameState = play('homestead', 'grid_down', 4242, 'short', siteFor(4242), 0, 25).s;
  const baseline = codes(checkState(base));
  it('the base state itself is clean', () => { expect(baseline).toBe(''); });
  const made = madeIfAbsent();
  it('reads some made-if-absent steps off the source (the stripped runs below mean something)', () => { expect(made.size).toBeGreaterThan(4); });
  for (let v = 1; v < SAVE_VERSION; v++) {
    const strip = [...made].filter(([n]) => n >= v).flatMap(([, k]) => k);
    it(`v${v} -> v${SAVE_VERSION} with ${strip.length} later-added fields absent: migrates and runs`, () => {
      const raw = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
      for (const k of strip) delete raw[k];
      raw.version = v;
      let s = migrate(raw);
      for (let d = 0; d < DAYS; d++) {
        s = step(s, 1);
        const bad = checkState(s);
        expect(bad, `day ${d + 1}: ${JSON.stringify(bad).slice(0, 400)}`).toEqual([]);
      }
    }, 60_000);
  }
  for (let v = 1; v < SAVE_VERSION; v++) {
    it(`v${v} -> v${SAVE_VERSION}: migrates, holds every invariant, runs ${DAYS} days`, () => {
      const raw = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;
      raw.version = v;
      let s = migrate(raw);
      expect(s.version).toBe(SAVE_VERSION);
      expect(codes(checkState(s))).toBe(baseline);
      for (let d = 0; d < DAYS; d++) {
        s = step(s, 1);
        const bad = checkState(s);
        expect(bad, `day ${d + 1}: ${JSON.stringify(bad).slice(0, 400)}`).toEqual([]);
      }
      const diff = firstDifference(s, importJson(exportJson(s)));
      expect(diff).toBeNull();
    }, 60_000);
  }
});
