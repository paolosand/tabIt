import { clampSemitones, semitonesToRatio, MAX_SEMITONES } from './ratio';

describe('semitonesToRatio', () => {
  it('is 1 at zero semitones', () => {
    expect(semitonesToRatio(0)).toBe(1);
  });
  it('doubles frequency at +12 and halves at -12', () => {
    expect(semitonesToRatio(12)).toBeCloseTo(2, 10);
    expect(semitonesToRatio(-12)).toBeCloseTo(0.5, 10);
  });
  it('uses equal temperament for +1', () => {
    expect(semitonesToRatio(1)).toBeCloseTo(1.059463, 5);
  });
});

describe('clampSemitones', () => {
  it('limits to ±MAX_SEMITONES and rounds to whole semitones', () => {
    expect(clampSemitones(99)).toBe(MAX_SEMITONES);
    expect(clampSemitones(-99)).toBe(-MAX_SEMITONES);
    expect(clampSemitones(2.4)).toBe(2);
  });
  it('treats NaN as 0', () => {
    expect(clampSemitones(Number.NaN)).toBe(0);
  });
});
