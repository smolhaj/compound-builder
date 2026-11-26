import { describe, expect, it } from 'vitest';
import { campClashesDome } from './campInDome';

const dome = { x: 0, z: 0, r: 9, airlocks: [{ angle: 0 }] };
describe('camp inside a dome', () => {
  it('a camp in the middle of a big dome is fine', () => { expect(campClashesDome({ x: 0, z: -3 }, dome)).toBe(false); });
  it('a camp well outside the dome is not its business', () => { expect(campClashesDome({ x: 30, z: 0 }, dome)).toBe(false); });
  it('a camp touching the shell clashes', () => { expect(campClashesDome({ x: 7.9, z: 0 }, dome)).toBe(true); });
  it('a camp across an airlock lane clashes, one beside it does not', () => {
    expect(campClashesDome({ x: 0.3, z: 4 }, dome)).toBe(true);
    expect(campClashesDome({ x: 3.2, z: 4 }, dome)).toBe(false);
  });
  it('a small dome with the camp in it clashes', () => { expect(campClashesDome({ x: 0.5, z: 0.5 }, { x: 0, z: 0, r: 1.8, airlocks: [{ angle: 3 }] })).toBe(true); });
});
