import type { ChordSegment } from './types';

export const NOTE_ORDER = ['A','A#','B','C','C#','D','D#','E','F','F#','G','G#'];

// Mirrors engine/schema.py QUALITY_SUFFIX exactly.
export const QUALITY_SUFFIX: Record<string, string> = {
  maj: '', min: 'm', dom7: '7', maj7: 'maj7', min7: 'm7',
  dim: 'dim', aug: 'aug', sus2: 'sus2', sus4: 'sus4', '6': '6',
  min6: 'm6', hdim7: 'm7b5', dim7: 'dim7', minmaj7: 'mMaj7',
  '9': '9', maj9: 'maj9', min9: 'm9',
};

export function transposeRoot(root: string, semi: number): string {
  const idx = NOTE_ORDER.indexOf(root);
  if (idx < 0) return root; // includes 'N'
  return NOTE_ORDER[(idx + semi + 1200) % 12];
}

export function formatLabel(root: string, quality: string, bass: string, semi: number): string {
  if (quality === 'N' || root === 'N') return '—';
  const r = transposeRoot(root, semi);
  const suffix = QUALITY_SUFFIX[quality] ?? quality;
  const b = bass ? transposeRoot(bass, semi) : null;
  return b && b !== r ? `${r}${suffix}/${b}` : `${r}${suffix}`;
}

/** Transposes the leading tonic note of an engine scale name (e.g. "A minor pentatonic"). */
export function transposeScaleName(name: string, semi: number): string {
  const m = name.match(/^([A-G]#?)\s(.+)$/);
  if (!m) return name;
  return `${transposeRoot(m[1], semi)} ${m[2]}`;
}

/** Last segment whose start <= t (clamped to [0, length-1]). Gaps stay on the previous segment. */
export function findCurrentIndex(chords: ChordSegment[], t: number): number {
  if (!chords.length) return 0;
  let lo = 0, hi = chords.length - 1, ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chords[mid].start <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans;
}
