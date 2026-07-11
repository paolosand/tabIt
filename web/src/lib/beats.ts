/** Beat-grid math over Chart.beats (sorted beat timestamps in seconds). */

export function beatIndexAt(beats: number[], t: number): number {
  let lo = 0, hi = beats.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid] <= t) { ans = mid; lo = mid + 1; } else { hi = mid - 1; }
  }
  return ans;
}

export function chordBeatSpan(
  beats: number[], chord: { start: number; end: number },
): { firstBeat: number; beatCount: number } {
  // first beat with beats[b] >= chord.start
  const before = beatIndexAt(beats, chord.start);
  let first = before >= 0 && beats[before] === chord.start ? before : before + 1;
  if (first >= beats.length || beats[first] >= chord.end) return { firstBeat: -1, beatCount: 0 };
  const last = beatIndexAt(beats, chord.end - 1e-9);
  return { firstBeat: first, beatCount: last - first + 1 };
}

export function beatWithinChord(
  beats: number[], chord: { start: number; end: number }, t: number,
): number {
  const { firstBeat, beatCount } = chordBeatSpan(beats, chord);
  if (beatCount === 0) return 0;
  const cur = beatIndexAt(beats, t);
  if (cur < firstBeat) return 0;
  return Math.min(cur - firstBeat + 1, beatCount);
}

export function beatsUntil(beats: number[], t: number, target: number): number {
  return beatIndexAt(beats, target) - beatIndexAt(beats, t);
}
