import { useEffect, useReducer, useState } from 'react';
import type { GoldFile } from '../lib/gold/types.ts';
import { initState, reduce } from './annotatorReducer.ts';
import { saveGold } from './goldApi.ts';

export const SAVE_DEBOUNCE_MS = 500;
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** Reducer + debounced autosave. An untouched file is never written unless it needs a re-save (newer draft). */
export function useAnnotator(initial: GoldFile, needsSave: boolean) {
  const [state, dispatch] = useReducer(reduce, initial, initState);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');

  useEffect(() => {
    if (state.file === initial && !needsSave) return;
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
