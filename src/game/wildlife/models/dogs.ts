/**
 * The family dogs, one model per breed on the digitigrade canid builder (predators.ts): a lab (broad skull, drop ears, otter tail), a shepherd
 * (sloped back, pricked ears, sabre tail, saddle and mask), a hound (deep chest, long drop ears, plume tail with a white tip), a collie (lean,
 * long muzzle, tipped ears, ruff, white collar and blaze), a terrier (small, folded ears, upright tail) and a mutt (medium, folded ears,
 * ring tail). Three coats each (the game's `COATS`: the dog's `tone` picks one). Real sizes: a lab 0.57 m at the shoulder, a shepherd 0.62,
 * a hound 0.6, a collie 0.55, a terrier 0.4, a mutt 0.5; the instance scale is 1/6 (SCALE v2), so a lab is 0.095 and a person 0.28.
 */
import type { Breed } from '../../livestock/animalMaterial';
import { quadModel } from '../../livestock/animalQuad';
import type { AnimalModel } from '../../livestock/animalParts';
import { canid, hexLin, type Canid } from './predators';
import { COATS, type Breed as DogBreed } from '../../../sim/pets';
import type { V3 } from '../../livestock/animalKit';

const WHITE: V3 = [0.9, 0.88, 0.84], BLACK: V3 = [0.035, 0.032, 0.032];
const lin = hexLin;
const mixc = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const dc = (name: string, o: Partial<Breed> & { base: V3 }): Breed => ({ name, style: 0, fur: 0.55, furFreq: 60, nose: [0.04, 0.035, 0.035], acc1Mix: 0.9, acc2Mix: 0, acc3Mix: 0, belly: o.base, bellyMix: 0, bellyY: 0.45, ...o });

/** The three coats of each breed, painted from the game's coat table (sim/pets COATS). */
function coats(b: DogBreed): Breed[] {
  const C = COATS[b], body = (i: number) => lin(C[i].body), trim = (i: number) => lin(C[i].trim);
  switch (b) {
    case 'lab': return [0, 1, 2].map(i => dc(C[i].name, { base: body(i), belly: mixc(body(i), WHITE, 0.15), bellyMix: 0.5, acc1: mixc(body(i), WHITE, 0.18), acc1Mix: 0.6, face: mixc(body(i), BLACK, 0.1), faceMix: 0.3, fur: 0.45, furFreq: 80 }));
    case 'shepherd': return [
      dc(C[0].name, { base: body(0), style: 7, dorsal: 0.34, patch: trim(0), cover: 0.9, belt: [-0.02, 0.2], face: trim(0), faceMix: 0.8, leg: body(0), legMix: 0.2, belly: body(0), acc1: trim(0), acc1Mix: 0.85, acc3: trim(0), acc3Mix: 0.9, fur: 0.4, furFreq: 55 }),
      dc(C[1].name, { base: body(1), leg: trim(1), legMix: 0.9, face: body(1), faceMix: 0.5, belly: trim(1), bellyMix: 0.8, acc1: trim(1), acc1Mix: 0.9, acc3: body(1), acc3Mix: 0.8, fur: 0.4, furFreq: 55 }),
      dc(C[2].name, { base: body(2), style: 7, dorsal: 0.34, patch: trim(2), cover: 0.7, belt: [-0.02, 0.22], face: mixc(body(2), trim(2), 0.6), faceMix: 0.7, belly: mixc(body(2), WHITE, 0.2), bellyMix: 0.5, acc1: trim(2), acc1Mix: 0.6, acc3: trim(2), acc3Mix: 0.8, fur: 0.4, furFreq: 55 }),
    ];
    case 'hound': return [
      dc(C[0].name, { base: body(0), leg: trim(0), legMix: 0.85, belly: trim(0), bellyMix: 0.9, acc1: trim(0), acc1Mix: 0.95, acc2: trim(0), acc2Mix: 0.95, acc3: trim(0), acc3Mix: 0.95, fur: 0.4, furFreq: 80 }),
      dc(C[1].name, { base: body(1), leg: trim(1), legMix: 0.7, belly: trim(1), bellyMix: 0.8, acc1: trim(1), acc1Mix: 0.9, acc2: trim(1), acc2Mix: 0.95, acc3: trim(1), acc3Mix: 0.95, fur: 0.4, furFreq: 80 }),
      dc(C[2].name, { base: body(2), style: 7, dorsal: 0.38, patch: [0.03, 0.028, 0.028], cover: 0.8, belt: [-0.02, 0.2], leg: trim(2), legMix: 0.85, belly: trim(2), bellyMix: 0.9, acc1: trim(2), acc1Mix: 0.95, acc2: trim(2), acc2Mix: 0.95, acc3: trim(2), acc3Mix: 0.95, fur: 0.4, furFreq: 80 }),
    ];
    case 'collie': return [
      dc(C[0].name, { base: body(0), leg: trim(0), legMix: 0.9, belly: trim(0), bellyMix: 0.95, acc1: trim(0), acc1Mix: 0.97, acc2: trim(0), acc2Mix: 0.97, acc3: trim(0), acc3Mix: 0.97, fur: 0.55, furFreq: 42 }),
      dc(C[1].name, { base: body(1), leg: trim(1), legMix: 0.9, belly: trim(1), bellyMix: 0.95, acc1: trim(1), acc1Mix: 0.97, acc2: trim(1), acc2Mix: 0.97, acc3: trim(1), acc3Mix: 0.97, fur: 0.55, furFreq: 42 }),
      dc(C[2].name, { base: mixc(body(2), WHITE, 0.15), style: 1, patch: [0.04, 0.04, 0.05], cover: 0.4, scale: 7, leg: trim(2), legMix: 0.9, belly: trim(2), bellyMix: 0.95, acc1: trim(2), acc1Mix: 0.97, acc2: trim(2), acc2Mix: 0.97, acc3: trim(2), acc3Mix: 0.97, fur: 0.55, furFreq: 42 }),
    ];
    case 'terrier': return [
      dc(C[0].name, { base: body(0), face: mixc(body(0), WHITE, 0.3), faceMix: 0.4, belly: trim(0), bellyMix: 0.5, acc1: mixc(body(0), WHITE, 0.3), acc1Mix: 0.6, fur: 0.6, furFreq: 50 }),
      dc(C[1].name, { base: body(1), leg: trim(1), legMix: 0.85, face: trim(1), faceMix: 0.7, belly: trim(1), bellyMix: 0.7, acc1: trim(1), acc1Mix: 0.9, fur: 0.6, furFreq: 50 }),
      dc(C[2].name, { base: body(2), style: 1, patch: trim(2), cover: 0.3, scale: 5, face: trim(2), faceMix: 0.6, acc1: body(2), acc1Mix: 0.9, fur: 0.6, furFreq: 50 }),
    ];
    case 'mutt': return [
      dc(C[0].name, { base: body(0), style: 2, patch: trim(0), cover: 0.55, scale: 38, belly: mixc(body(0), WHITE, 0.4), bellyMix: 0.5, acc1: trim(0), acc1Mix: 0.5, fur: 0.4, furFreq: 55 }),
      dc(C[1].name, { base: body(1), belly: trim(1), bellyMix: 0.6, acc1: trim(1), acc1Mix: 0.6, fur: 0.4, furFreq: 55 }),
      dc(C[2].name, { base: body(2), style: 1, patch: trim(2), cover: 0.4, scale: 6, face: body(2), faceMix: 0.5, acc1: trim(2), acc1Mix: 0.8, fur: 0.4, furFreq: 55 }),
    ];
  }
}

const COMMON = { pets: true } as const;
const SPEC: Record<DogBreed, Canid> = {
  lab: { id: 'dog_lab', k: 0.73, chest: 1.08, width: 1.18, legK: 0.8, muzzle: 0.7, skullW: 1.25, head: 1.0, neckK: 1.15, ear: { kind: 'drop', len: 0.13, wd: 0.065 }, tail: { kind: 'otter', len: 0.42, thick: 1.5 }, paws: 1.0, withers: 0.58, length: 0.95, stride: 0.9, breeds: coats('lab'), ...COMMON },
  shepherd: { id: 'dog_shepherd', k: 0.8, chest: 1.0, slope: 0.05, width: 1.0, legK: 0.9, muzzle: 1.1, skullW: 1.0, head: 1.0, ruff: 0.6, ear: { kind: 'prick', len: 0.15, wd: 0.058 }, tail: { kind: 'sabre', len: 0.46, thick: 1.2 }, paws: 1.0, withers: 0.62, length: 1.0, stride: 1.0, breeds: coats('shepherd'), ...COMMON },
  hound: { id: 'dog_hound', k: 0.77, chest: 1.12, width: 0.92, legK: 0.85, muzzle: 1.12, skullW: 0.95, head: 1.0, ear: { kind: 'drop', len: 0.22, wd: 0.075 }, tail: { kind: 'plume', len: 0.45, thick: 1.1 }, tipAcc: true, blaze: true, paws: 1.0, withers: 0.6, length: 1.0, stride: 0.95, breeds: coats('hound'), ...COMMON },
  collie: { id: 'dog_collie', k: 0.72, chest: 0.95, width: 0.88, legK: 0.88, muzzle: 1.28, skullW: 0.9, head: 0.96, ruff: 1.35, collar: true, ear: { kind: 'semi', len: 0.13, wd: 0.05 }, tail: { kind: 'plume', len: 0.5, thick: 1.5 }, tipAcc: true, blaze: true, paws: 0.95, withers: 0.55, length: 0.95, stride: 0.9, breeds: coats('collie'), ...COMMON },
  terrier: { id: 'dog_terrier', k: 0.52, chest: 1.0, width: 0.95, legK: 0.7, muzzle: 0.85, skullW: 1.0, head: 1.1, ear: { kind: 'fold', len: 0.1, wd: 0.055 }, tail: { kind: 'curl', len: 0.35, thick: 1.3 }, paws: 0.9, withers: 0.4, length: 0.62, stride: 0.6, breeds: coats('terrier'), ...COMMON },
  mutt: { id: 'dog_mutt', k: 0.66, chest: 1.0, width: 1.0, legK: 0.8, muzzle: 0.95, skullW: 1.05, head: 1.02, ear: { kind: 'fold', len: 0.13, wd: 0.06 }, tail: { kind: 'ring', len: 0.4, thick: 1.2 }, paws: 1.0, withers: 0.5, length: 0.8, stride: 0.8, breeds: coats('mutt'), ...COMMON },
};
export const DOG_BREEDS = Object.keys(SPEC) as DogBreed[];
export const dogModelId = (b: DogBreed): string => `dog_${b}`;
export const DOG_MODEL = (b: DogBreed): AnimalModel => quadModel(canid(SPEC[b]));
