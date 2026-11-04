import { useEffect, useRef, useState } from 'react';
import type { GetSharingRequest, SetSharingRequest } from '../messages';

/**
 * Resolves the value the background reports: true/false only for a strict boolean, and
 * null when the answer is unknown (rejected message, undefined, `{ error: 'unavailable' }`,
 * anything else), so callers keep what they were already showing rather than guess.
 */
async function send(message: GetSharingRequest | SetSharingRequest): Promise<boolean | null> {
  try {
    const res = (await chrome.runtime.sendMessage(message)) as { shareUsage?: unknown } | undefined;
    if (res?.shareUsage === true) return true;
    if (res?.shareUsage === false) return false;
    return null;
  } catch {
    return null;
  }
}

/** Opt-in "Help improve tabIt" usage sharing, off until the background says otherwise.
 *  The initial GET_SHARING happens once, on mount (not when the menu opens). */
export function useSharing(): { on: boolean; failed: boolean; change: (checked: boolean) => Promise<void> } {
  const [on, setOn] = useState(false);
  const [failed, setFailed] = useState(false);
  // Bumped by every user choice; a reply only applies if no newer choice was made since it was sent.
  const choice = useRef(0);

  useEffect(() => {
    let alive = true;
    const startedAt = choice.current;
    void send({ type: 'GET_SHARING' }).then((v) => {
      if (alive && v !== null && choice.current === startedAt) setOn(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function change(checked: boolean) {
    const mine = ++choice.current;
    const v = await send({ type: 'SET_SHARING', shareUsage: checked });
    if (mine !== choice.current) return;
    if (v === null) {
      setFailed(true);
    } else {
      setFailed(false);
      setOn(v);
    }
  }

  return { on, failed, change };
}
