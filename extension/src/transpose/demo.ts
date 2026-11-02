// Spike demo: wires a generated chord (or a picked file) through the transposer.
import { getTransposer } from './transposer';

function chordWavUrl(): string {
  const sr = 44100, secs = 8, n = sr * secs;
  const freqs = [261.63, 329.63, 392.0]; // C major
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const env = 0.6 + 0.4 * Math.sin((2 * Math.PI * i) / (sr * 2));
    let s = 0;
    for (const f of freqs) s += Math.sin((2 * Math.PI * f * i) / sr);
    pcm[i] = Math.round((s / 3) * env * 0.8 * 32767);
  }
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const str = (o: number, t: string) => [...t].forEach((c, k) => v.setUint8(o + k, c.charCodeAt(0)));
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  new Int16Array(buf, 44).set(pcm);
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

const media = document.querySelector<HTMLVideoElement>('#media')!;
const label = document.querySelector<HTMLElement>('#label')!;
const status = document.querySelector<HTMLElement>('#status')!;
media.src = chordWavUrl();
media.loop = true;

document.querySelector<HTMLInputElement>('#file')!.addEventListener('change', (e) => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) media.src = URL.createObjectURL(f);
});

async function shiftBy(delta: number | 'reset') {
  try {
    const t = await getTransposer(media, 'worklet.js');
    t.setSemitones(delta === 'reset' ? 0 : t.semitones + delta);
    label.textContent = (t.semitones > 0 ? '+' : '') + t.semitones;
    status.textContent = 'shifting live ✓';
  } catch (err) {
    status.textContent = 'failed: ' + (err as Error).message;
  }
}
document.querySelector('#up')!.addEventListener('click', () => shiftBy(1));
document.querySelector('#down')!.addEventListener('click', () => shiftBy(-1));
document.querySelector('#reset')!.addEventListener('click', () => shiftBy('reset'));
