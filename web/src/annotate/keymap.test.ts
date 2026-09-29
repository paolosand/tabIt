import { expect, test } from 'vitest';
import { isTypingTarget, keyToAction, type KeyLike } from './keymap.ts';

const k = (key: string, extra: Partial<KeyLike> = {}): KeyLike =>
  ({ key, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, repeat: false, ...extra });

test('digits, flat prefix, quality toggles, marks', () => {
  expect(keyToAction(k('6'))).toEqual({ type: 'digit', digit: 6 });
  expect(keyToAction(k('8'))).toBeNull();
  expect(keyToAction(k('0'))).toBeNull();
  expect(keyToAction(k('b'))).toEqual({ type: 'flatPrefix' });
  expect(keyToAction(k('m'))).toEqual({ type: 'toggle', which: 'm' });
  expect(keyToAction(k('d'))).toEqual({ type: 'toggle', which: 'd' });
  expect(keyToAction(k('j'))).toEqual({ type: 'toggle', which: 'j' });
  expect(keyToAction(k('n'))).toEqual({ type: 'mark', kind: 'N' });
  expect(keyToAction(k('x'))).toEqual({ type: 'mark', kind: 'X' });
});

test('confirm, clear, movement, play/pause', () => {
  expect(keyToAction(k('Enter'))).toEqual({ type: 'confirm' });
  expect(keyToAction(k('Backspace'))).toEqual({ type: 'clear' });
  expect(keyToAction(k('ArrowLeft'))).toEqual({ type: 'moveCursor', delta: -1 });
  expect(keyToAction(k('ArrowRight'))).toEqual({ type: 'moveCursor', delta: 1 });
  expect(keyToAction(k('ArrowUp'))).toEqual({ type: 'moveRow', dir: -1 });
  expect(keyToAction(k('ArrowDown'))).toEqual({ type: 'moveRow', dir: 1 });
  expect(keyToAction(k(' '))).toEqual({ type: 'playPause' });
});

test('undo/redo via ⌘/Ctrl+Z; other modified keys are ignored', () => {
  expect(keyToAction(k('z', { metaKey: true }))).toEqual({ type: 'undo' });
  expect(keyToAction(k('z', { ctrlKey: true }))).toEqual({ type: 'undo' });
  expect(keyToAction(k('z', { metaKey: true, shiftKey: true }))).toEqual({ type: 'redo' });
  expect(keyToAction(k('6', { metaKey: true }))).toBeNull(); // ⌘6 is a browser shortcut
  expect(keyToAction(k('6', { altKey: true }))).toBeNull();
});

test('auto-repeat never re-fires chord entry, but arrows may repeat (Review Focus 4)', () => {
  expect(keyToAction(k('6', { repeat: true }))).toBeNull();
  expect(keyToAction(k('Enter', { repeat: true }))).toBeNull();
  expect(keyToAction(k('m', { repeat: true }))).toBeNull();
  expect(keyToAction(k('ArrowRight', { repeat: true }))).toEqual({ type: 'moveCursor', delta: 1 });
});

test('isTypingTarget: inputs, selects and textareas swallow keys; body and buttons do not (Review Focus 4)', () => {
  const el = (tag: string) => document.createElement(tag);
  expect(isTypingTarget(el('input'))).toBe(true);
  expect(isTypingTarget(el('select'))).toBe(true);
  expect(isTypingTarget(el('textarea'))).toBe(true);
  expect(isTypingTarget(el('button'))).toBe(false);
  expect(isTypingTarget(document.body)).toBe(false);
  expect(isTypingTarget(null)).toBe(false);
});
