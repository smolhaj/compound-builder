import { describe, expect, it } from 'vitest';
import { overlayPlan, type OverlayInputs } from './overlayQueue';

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
});
