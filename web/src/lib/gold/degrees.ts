import type { ChordChoice, GoldKey, GoldQuality, Mode } from './types.ts';

export const PITCH_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const FLAT_TO_SHARP: Record<string, string> = {
  Cb: 'B', Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#',
};

export function pcOf(name: string): number {
  const n = FLAT_TO_SHARP[name] ?? name;
  const i = (PITCH_NAMES as readonly string[]).indexOf(n);
  if (i < 0) throw new Error(`Unknown note name: ${name}`);
  return i;
}

export function nameOf(pc: number): string {
  return PITCH_NAMES[((pc % 12) + 12) % 12];
}

const INTERVALS: Record<Mode, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
};

// Default quality per digit. The two diminished degrees (vii° in major, ii° in
// minor) fall back to the minor triad because dim is outside the v1 vocabulary.
const TRIADS: Record<Mode, GoldQuality[]> = {
  major: ['maj', 'min', 'min', 'maj', 'maj', 'min', 'min'],
  minor: ['min', 'min', 'maj', 'min', 'min', 'maj', 'maj'],
};

export function chordForDigit(key: GoldKey, digit: number, flat: boolean): ChordChoice {
  if (!Number.isInteger(digit) || digit < 1 || digit > 7) {
    throw new Error(`Degree out of range: ${digit}`);
  }
  const interval = INTERVALS[key.mode][digit - 1] - (flat ? 1 : 0);
  return {
    root: nameOf(pcOf(key.tonic) + interval),
    // flatted degrees (bVII, bVI, bIII) are almost always major in pop
    quality: flat ? 'maj' : TRIADS[key.mode][digit - 1],
  };
}

const HARTE: Record<GoldQuality, string> = { maj: 'maj', min: 'min', dom7: '7', min7: 'min7', maj7: 'maj7' };
const SUFFIX: Record<GoldQuality, string> = { maj: '', min: 'm', dom7: '7', min7: 'm7', maj7: 'maj7' };

export function harteLabel(c: ChordChoice): string {
  if (c.quality === 'X') return 'X';
  if (c.quality === 'N') return 'N';
  return `${c.root}:${HARTE[c.quality]}`;
}

export function chordName(c: ChordChoice): string {
  if (c.quality === 'X') return '?';
  if (c.quality === 'N') return '—';
  return `${c.root}${SUFFIX[c.quality]}`;
}

const NUMERALS = ['I', 'bII', 'II', 'bIII', 'III', 'IV', 'bV', 'V', 'bVI', 'VI', 'bVII', 'VII'];

export function numeralFor(key: GoldKey, c: ChordChoice): string {
  if (c.quality === 'X') return '?';
  if (c.quality === 'N' || c.root === null) return '—';
  const base = NUMERALS[(pcOf(c.root) - pcOf(key.tonic) + 12) % 12];
  const minor = c.quality === 'min' || c.quality === 'min7';
  const cased = minor ? base.replace(/[IV]+$/, (m) => m.toLowerCase()) : base;
  const suffix = c.quality === 'dom7' || c.quality === 'min7' ? '7' : c.quality === 'maj7' ? 'maj7' : '';
  return cased + suffix;
}

export interface PaletteEntry {
  digit: number;
  chord: ChordChoice;
  numeral: string;
  name: string;
}

export function paletteFor(key: GoldKey): PaletteEntry[] {
  return [1, 2, 3, 4, 5, 6, 7].map((digit) => {
    const chord = chordForDigit(key, digit, false);
    return { digit, chord, numeral: numeralFor(key, chord), name: chordName(chord) };
  });
}

export type QualityToggle = 'm' | 'd' | 'j';

const TOGGLES: Record<QualityToggle, Partial<Record<GoldQuality, GoldQuality>>> = {
  m: { maj: 'min', min: 'maj', dom7: 'min7', min7: 'dom7', maj7: 'min7' },
  d: { maj: 'dom7', min: 'min7', dom7: 'maj', min7: 'min', maj7: 'dom7' },
  j: { maj: 'maj7', maj7: 'maj', dom7: 'maj7' },
};

export function toggleQuality(c: ChordChoice, which: QualityToggle): ChordChoice {
  if (c.quality === 'N' || c.quality === 'X') return c;
  const next = TOGGLES[which][c.quality];
  return next ? { root: c.root, quality: next } : c;
}

// Mirrors engine/postprocess.py SIMPLIFY_MAP; anything unknown becomes a major triad.
const REDUCE: Record<string, GoldQuality> = {
  dim: 'min', dim7: 'min', hdim7: 'min', min6: 'min', min9: 'min', minmaj7: 'min',
  aug: 'maj', sus2: 'maj', sus4: 'maj', '6': 'maj', '9': 'maj', maj9: 'maj',
};
const VOCAB = new Set<string>(['maj', 'min', 'dom7', 'min7', 'maj7']);

/** Engine chord → the v1 vocabulary. Bass (inversions) is dropped: every metric ignores it. */
export function reduceEngineChord(root: string, quality: string): ChordChoice {
  if (root === 'N' || quality === 'N') return { root: 'N', quality: 'N' };
  const q = VOCAB.has(quality) ? (quality as GoldQuality) : (REDUCE[quality] ?? 'maj');
  return { root: nameOf(pcOf(root)), quality: q };
}
