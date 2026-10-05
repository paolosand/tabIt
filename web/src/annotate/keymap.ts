import type { QualityToggle } from '../lib/gold/degrees.ts';
import type { Action } from './annotatorReducer.ts';

export type UiAction = Action | { type: 'playPause' };

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

/** Map a key event to an action. Held keys never re-fire chord entry; arrows may repeat. */
export function keyToAction(e: KeyLike): UiAction | null {
  if (e.altKey) return null;
  if (e.metaKey || e.ctrlKey) {
    if (e.key.toLowerCase() === 'z') return e.shiftKey ? { type: 'redo' } : { type: 'undo' };
    return null;
  }
  switch (e.key) {
    case 'ArrowLeft': return { type: 'moveCursor', delta: -1 };
    case 'ArrowRight': return { type: 'moveCursor', delta: 1 };
    case 'ArrowUp': return { type: 'moveRow', dir: -1 };
    case 'ArrowDown': return { type: 'moveRow', dir: 1 };
    default: break;
  }
  if (e.repeat) return null;
  if (/^[1-7]$/.test(e.key)) return { type: 'digit', digit: Number(e.key) };
  switch (e.key) {
    case 'b': return { type: 'flatPrefix' };
    case 'm':
    case 'd':
    case 'j': return { type: 'toggle', which: e.key as QualityToggle };
    case 'n': return { type: 'mark', kind: 'N' };
    case 'x': return { type: 'mark', kind: 'X' };
    case 'Enter': return { type: 'confirm' };
    case 'Backspace': return { type: 'clear' };
    case ' ': return { type: 'playPause' };
    default: return null;
  }
}

/** Keys typed into a form control must not enter chords. */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable === true;
}
