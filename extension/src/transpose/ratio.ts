export const MAX_SEMITONES = 12;

export function semitonesToRatio(semitones: number): number {
  return 2 ** (semitones / 12);
}

export function clampSemitones(semitones: number): number {
  if (Number.isNaN(semitones)) return 0;
  const whole = Math.round(semitones);
  return Math.max(-MAX_SEMITONES, Math.min(MAX_SEMITONES, whole));
}
