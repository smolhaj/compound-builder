import { describe, expect, it } from 'vitest';
import { onJustPlaced } from './justPlaced';

describe('onJustPlaced', () => {
  const just = { x: 12, z: 8.5, rot: 1 };
  it('is quiet while the cursor stays on the spot just staked', () => expect(onJustPlaced(just, 12, 8.5, 1)).toBe(true));
  it('checks again at another cell or after a turn', () => {
    expect(onJustPlaced(just, 12.5, 8.5, 1)).toBe(false);
    expect(onJustPlaced(just, 12, 8.5, 2)).toBe(false);
  });
  it('is off with nothing placed yet', () => expect(onJustPlaced(null, 0, 0, 0)).toBe(false));
});
