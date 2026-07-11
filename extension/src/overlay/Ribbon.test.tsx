import { render } from '@testing-library/react';
import { expect, test } from 'vitest';
import Ribbon, { clampTx } from './Ribbon';

// 16 beats at 1s intervals starting t=0; four 4-beat chords.
const beats = Array.from({ length: 16 }, (_, i) => i);
const chords = [
  { start: 0, end: 4, label: 'Am', quality: 'min', low: false },
  { start: 4, end: 8, label: 'F', quality: 'maj', low: true },
  { start: 8, end: 12, label: 'N', quality: 'N', low: false },
  { start: 12, end: 16, label: 'G', quality: 'maj', low: false },
];

function rib(currentBeat: number, currentChordIndex: number) {
  return render(
    <Ribbon beats={beats} chords={chords} currentBeat={currentBeat} currentChordIndex={currentChordIndex} />,
  ).container;
}

test('labels sit on each chord first beat only; N gets no label', () => {
  const c = rib(0, 0);
  const cells = c.querySelectorAll('.tabit-beat');
  expect(cells.length).toBeGreaterThanOrEqual(16);
  expect(c.querySelectorAll('.tabit-beat-chord').length).toBe(3); // Am, F, G — no N label
  expect(cells[0].querySelector('.tabit-beat-chord')?.textContent).toBe('Am');
  expect(cells[4].querySelector('.tabit-beat-chord')?.textContent).toBe('F');
  expect(cells[1].querySelector('.tabit-beat-chord')).toBeNull();
});

test('current beat is amber, passed beats of current chord are washed', () => {
  const c = rib(6, 1); // chord F (beats 4-7), on beat 6
  const cells = c.querySelectorAll('.tabit-beat');
  expect(cells[6].className).toContain('tabit-beat-now');
  expect(cells[4].className).toContain('tabit-beat-done');
  expect(cells[5].className).toContain('tabit-beat-done');
  expect(cells[7].className).not.toContain('tabit-beat-done');
});

test('pips on the current chord count consumed beats', () => {
  const c = rib(6, 1); // beat 3 of 4 within F
  const pips = c.querySelectorAll('.tabit-beat-pip');
  expect(pips.length).toBe(4);
  expect(c.querySelectorAll('.tabit-beat-pip-hit').length).toBe(3);
});

test('low-confidence label is muted; bar line every 4th beat', () => {
  const c = rib(0, 0);
  const f = c.querySelectorAll('.tabit-beat')[4].querySelector('.tabit-beat-chord');
  expect(f?.className).toContain('tabit-beat-chord-muted');
  expect(c.querySelectorAll('.tabit-beat')[4].className).toContain('tabit-beat-bar');
  expect(c.querySelectorAll('.tabit-beat')[5].className).not.toContain('tabit-beat-bar');
});

test('track slides to keep the current beat in view; pre-intro parks at start', () => {
  expect(rib(12, 3).querySelector('.tabit-ribbon-track')?.getAttribute('style')).toContain('translateX(-');
  expect(rib(-1, 0).querySelector('.tabit-ribbon-track')?.getAttribute('style')).toContain('translateX(0');
});

test('windows the render: far-away beats get no cell', () => {
  const many = Array.from({ length: 400 }, (_, i) => i);
  const c = render(
    <Ribbon beats={many} chords={[{ start: 0, end: 400, label: 'A', quality: 'maj', low: false }]} currentBeat={200} currentChordIndex={0} />,
  ).container;
  expect(c.querySelectorAll('.tabit-beat').length).toBeLessThan(100);
});

test('clampTx passes mid-song offsets through unchanged', () => {
  expect(clampTx(1000, 4400, 800)).toBe(1000);
});

test('clampTx clamps at song end so the track never slides past the last cell', () => {
  expect(clampTx(10000, 4400, 800)).toBe(3600); // trackWidth - viewWidth
});

test('clampTx degrades to trackWidth bound when viewWidth is 0 (unmeasured)', () => {
  expect(clampTx(10000, 4400, 0)).toBe(4400);
  expect(clampTx(1000, 4400, 0)).toBe(1000);
});

test('clampTx floors negative offsets at 0', () => {
  expect(clampTx(-500, 4400, 800)).toBe(0);
});
