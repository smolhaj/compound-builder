import { describe, expect, it } from 'vitest';
import { overlayPlan, topTier, type OverlayInputs } from './overlayQueue';

const none: OverlayInputs = { title: false, setup: false, ending: false, cutscene: 'none', decision: false, dayCard: false, recap: false, milestones: 0 };
const up = (p: ReturnType<typeof overlayPlan>) => Object.entries(p).filter(([k, v]) => k !== 'decisionWaiting' && v).map(([k]) => k);

describe('overlay queue', () => {
  it('shows nothing when nothing is waiting', () => expect(up(overlayPlan(none))).toEqual([]));
  it('a decision outranks a milestone, the recap and the day card', () => {
    expect(up(overlayPlan({ ...none, decision: true, milestones: 2, recap: true, dayCard: true }))).toEqual(['gate']);
  });
  it('the recap does not cover a pending event: the event first, then the recap, then milestones one at a time', () => {
    const a = { ...none, decision: true, recap: true, milestones: 1 };
    expect(up(overlayPlan(a))).toEqual(['gate']);
    expect(up(overlayPlan({ ...a, decision: false }))).toEqual(['recap']);
    expect(up(overlayPlan({ ...a, decision: false, recap: false }))).toEqual(['milestone']);
  });
  it('the title screen owns the screen: no card behind or over it', () => {
    const p = overlayPlan({ ...none, title: true, decision: true, recap: true, milestones: 3 });
    expect(up(p)).toEqual([]);
    expect(p.decisionWaiting).toBe(true);
  });
  it('after Continue the pending decision is shown alone', () => {
    expect(up(overlayPlan({ ...none, title: false, decision: true, recap: true }))).toEqual(['gate']);
  });
  it('the day card waits for a decision and outranks the recap', () => {
    expect(up(overlayPlan({ ...none, dayCard: true, recap: true }))).toEqual(['dayCard']);
  });
  it('the ending report outranks everything but the title', () => {
    expect(up(overlayPlan({ ...none, ending: true, decision: true, recap: true, milestones: 1 }))).toEqual(['ending']);
  });
  it('a cutscene keeps milestones and the recap off the screen', () => {
    expect(up(overlayPlan({ ...none, cutscene: 'playing', recap: true, milestones: 1 }))).toEqual(['gate']);
  });
  it('no recap or milestone over the new-game screen', () => {
    expect(up(overlayPlan({ ...none, setup: true, recap: true, milestones: 1 }))).toEqual([]);
  });
  it('a goal or milestone card waits while a tool or the starter proposal is open, then comes up', () => {
    expect(up(overlayPlan({ ...none, milestones: 2, planning: true }))).toEqual([]);
    expect(up(overlayPlan({ ...none, milestones: 2, planning: false }))).toEqual(['milestone']);
  });
  it('felt layer: gate > hit moment > day card > felt card > recap > milestone, and nothing is lost', () => {
    const all = { ...none, hitMoment: true, dayCard: true, feltCard: true, recap: true, milestones: 1 };
    expect(up(overlayPlan({ ...all, decision: true }))).toEqual(['gate']);
    expect(up(overlayPlan(all))).toEqual(['hitMoment']);
    expect(up(overlayPlan({ ...all, hitMoment: false }))).toEqual(['dayCard']);
    expect(up(overlayPlan({ ...all, hitMoment: false, dayCard: false }))).toEqual(['feltCard']);
    expect(up(overlayPlan({ ...all, hitMoment: false, dayCard: false, feltCard: false }))).toEqual(['recap']);
    expect(up(overlayPlan({ ...all, hitMoment: false, dayCard: false, feltCard: false, recap: false }))).toEqual(['milestone']);
  });
  it('felt layer: a felt card waits for the new-game screen and a placing tool; the title and a cutscene hide the new slots', () => {
    expect(up(overlayPlan({ ...none, feltCard: true, setup: true }))).toEqual([]);
    expect(up(overlayPlan({ ...none, feltCard: true, planning: true }))).toEqual([]);
    expect(up(overlayPlan({ ...none, feltCard: true, planning: false }))).toEqual(['feltCard']);
    expect(up(overlayPlan({ ...none, title: true, hitMoment: true, feltCard: true }))).toEqual([]);
    expect(up(overlayPlan({ ...none, cutscene: 'playing', hitMoment: true, feltCard: true }))).toEqual(['gate']);
  });
  it('a milestone card waits while the Board is open', () => {
    expect(overlayPlan({ ...none, milestones: 1, board: true }).milestone).toBe(false);
    expect(overlayPlan({ ...none, milestones: 1 }).milestone).toBe(true);
  });
  it('layout A: the welcome card is a queue entry that waits for every decision, the recap and the new-game screen', () => {
    expect(overlayPlan({ ...none, welcome: true }).welcome).toBe(true);
    expect(overlayPlan({ ...none }).welcome).toBe(false);   // Classic never sets it
    for (const over of [{ decision: true }, { hitMoment: true }, { dayCard: true }, { feltCard: true }, { recap: true }, { setup: true }, { planning: true }]) expect(overlayPlan({ ...none, welcome: true, ...over }).welcome).toBe(false);
  });
  it('tiers: decisions block, cards wait under them, a clear map has no tier', () => {
    expect(topTier(overlayPlan({ ...none, feltCard: true }))).toBe('blocking');
    expect(topTier(overlayPlan({ ...none, welcome: true }))).toBe('card');
    expect(topTier(overlayPlan({ ...none }))).toBeNull();
  });
});
