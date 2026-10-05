import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, test } from 'vitest';
import { sampleGold } from '../lib/gold/sample.ts';
import { readDraft } from './goldApi.ts';
import { useAnnotator } from './useAnnotator.ts';

beforeEach(() => localStorage.clear());

test('an edit is drafted to localStorage immediately, so unmounting inside the debounce window does not lose it', () => {
  const file = sampleGold();
  const { result, unmount } = renderHook(() => useAnnotator(file, false));
  act(() => {
    result.current.dispatch({ type: 'digit', digit: 6 });
  });
  unmount(); // well inside the 500 ms debounce; the scheduled network save never fires
  const draft = readDraft(file.videoId);
  expect(draft).not.toBeNull();
  expect(draft?.spans).toHaveLength(1);
});

test('an untouched file writes no draft', () => {
  const file = sampleGold();
  const { unmount } = renderHook(() => useAnnotator(file, false));
  unmount();
  expect(readDraft(file.videoId)).toBeNull();
});
