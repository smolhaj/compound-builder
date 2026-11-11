/**
 * A dead person does not speak (user: "Wren says 'They shot Elena' at 3:37 and Elena keeps talking to the end"). The planners schedule lines ahead of the
 * fight; the sim's deaths (and the wake's) are fixed in the same battle, so this runs last over a prepared battle: a line whose speaker has already died (or
 * been taken away) is handed to a living person on the same side who is not speaking at that moment, or dropped when there is no one. Last words are the one
 * exception (`ctx: 'last_words'`, within three seconds of the speaker's own death). Pure.
 */
import type { Battle, BattleEvent } from './battleTypes';

const LAST_WORDS = 3;

export function deadSilent(b: Battle): Battle {
  const gone = new Map<string, number>();
  for (const e of b.events) if ((e.kind === 'death' || e.kind === 'taken') && !gone.has(e.unit)) gone.set(e.unit, e.t);
  if (!gone.size) return b;
  const alive = (id: string, t: number) => { const d = gone.get(id); return d === undefined || t < d - 1e-6; };
  const side = new Map(b.units.map(u => [u.id, u.side]));
  const voices = b.units.filter(u => !u.machine && !u.bystander);
  let changed = false;
  const spoke: Array<{ t: number; who: string }> = [];
  const out: BattleEvent[] = [];
  for (const e of [...b.events].sort((p, q) => p.t - q.t)) {
    if (e.kind !== 'say' || !e.who || alive(e.who, e.t)) { if (e.kind === 'say' && e.who) spoke.push({ t: e.t, who: e.who }); out.push(e); continue; }
    if (e.ctx === 'last_words' && e.t <= (gone.get(e.who) ?? 0) + LAST_WORDS) { out.push(e); spoke.push({ t: e.t, who: e.who }); continue; }
    changed = true;
    const s = side.get(e.who);
    const busy = (id: string) => spoke.some(q => q.who === id && Math.abs(q.t - e.t) < 2.2);
    const living = voices.filter(u => u.side === s && u.id !== e.who && alive(u.id, e.t));
    // (a grown-up first, one not speaking just now; failing that anyone alive on the side: a line said is better than a silence)
    const tiers = [living.filter(u => !busy(u.id) && !(s === 'home' && u.civilian)), living.filter(u => !busy(u.id)), living.filter(u => !(s === 'home' && u.civilian)), living];
    const pool = tiers.find(x => x.length) ?? [];
    const pick = pool.length ? pool[Math.floor(e.t * 7) % pool.length] : null;
    if (!pick) continue;
    out.push({ ...e, who: pick.id });
    spoke.push({ t: e.t, who: pick.id });
  }
  return changed ? { ...b, events: out.sort((p, q) => p.t - q.t) } : b;
}

/** Every line spoken by someone already dead (for tests and audits). */
export function deadSpeakers(b: Battle): Array<{ t: number; who: string; text: string; diedAt: number }> {
  const gone = new Map<string, number>();
  for (const e of b.events) if ((e.kind === 'death' || e.kind === 'taken') && !gone.has(e.unit)) gone.set(e.unit, e.t);
  const bad: Array<{ t: number; who: string; text: string; diedAt: number }> = [];
  for (const e of b.events) if (e.kind === 'say' && e.who) { const d = gone.get(e.who); if (d !== undefined && e.t >= d - 1e-6 && !(e.ctx === 'last_words' && e.t <= d + LAST_WORDS)) bad.push({ t: e.t, who: e.who, text: e.text, diedAt: d }); }
  return bad;
}
