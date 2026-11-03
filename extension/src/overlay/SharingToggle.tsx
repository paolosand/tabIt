import { useEffect, useId, useRef, useState } from 'react';
import type { GetSharingRequest, SetSharingRequest } from '../messages';
import { SHARING_LABEL, SHARING_NOTE } from './copy';

/**
 * Resolves the value the background reports: true/false only for a strict boolean, and
 * null when the answer is unknown (rejected message, undefined, error shape, anything else),
 * so callers keep what they were already showing rather than guess.
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

/** Opt-in "Help improve tabIt" usage sharing, off until the background says otherwise. */
export default function SharingToggle() {
  const [on, setOn] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = useId();
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

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const mine = ++choice.current;
    const v = await send({ type: 'SET_SHARING', shareUsage: e.target.checked });
    if (mine !== choice.current) return;
    if (v === null) {
      setFailed(true);
    } else {
      setFailed(false);
      setOn(v);
    }
  }

  return (
    <div className="tabit-sharing">
      <label className="tabit-sharing-label" htmlFor={id}>
        <input id={id} type="checkbox" checked={on} onChange={(e) => void onChange(e)} aria-describedby={`${id}-note`} />
        {SHARING_LABEL}
      </label>
      <p className="tabit-sharing-note" id={`${id}-note`}>{SHARING_NOTE}</p>
      {failed && <p className="tabit-sharing-error" role="status">Couldn{'’'}t change this {'—'} try again</p>}
    </div>
  );
}
