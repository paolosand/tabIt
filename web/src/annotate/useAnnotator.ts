import { useEffect, useReducer, useState } from 'react';
import type { GoldFile } from '../lib/gold/types.ts';
import { initState, reduce } from './annotatorReducer.ts';
import { saveGold, writeDraft } from './goldApi.ts';

export const SAVE_DEBOUNCE_MS = 500;
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Reducer + debounced autosave. An untouched file is never written unless it needs a re-save (newer draft).
 * Every real edit is also drafted to localStorage synchronously (not only on a failed save), so navigating
 * away or reloading inside the debounce window never loses it -- loadGold picks up the newer draft next time. */
export function useAnnotator(initial: GoldFile, needsSave: boolean) {
  const [state, dispatch] = useReducer(reduce, initial, initState);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    if (state.file === initial && !needsSave) return;
    writeDraft(state.file);
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      saveGold(state.file).then(
        () => setSaveStatus('saved'),
        () => setSaveStatus('error'),
      );
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [state.file, initial, needsSave]);

  return { state, dispatch, saveStatus };
}
