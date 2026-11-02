import { useEffect, useId, useState } from 'react';
import type { GetSharingRequest, SetSharingRequest } from '../messages';
import { SHARING_LABEL, SHARING_NOTE } from './copy';

/** Only a strict boolean `true` counts as "on"; anything else (undefined, errors) is off. */
async function send(message: GetSharingRequest | SetSharingRequest): Promise<boolean> {
  try {
    const res = (await chrome.runtime.sendMessage(message)) as { shareUsage?: unknown } | undefined;
    return res?.shareUsage === true;
  } catch {
    return false;
  }
}

/** Opt-in "Help improve tabIt" usage sharing, off until the background says otherwise. */
export default function SharingToggle() {
  const [on, setOn] = useState(false);
  const id = useId();

  useEffect(() => {
    let alive = true;
    void send({ type: 'GET_SHARING' }).then((v) => {
      if (alive) setOn(v);
    });
    return () => {
      alive = false;
    };
  }, []);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    setOn(await send({ type: 'SET_SHARING', shareUsage: e.target.checked }));
  }

  return (
    <div className="tabit-sharing">
      <label className="tabit-sharing-label" htmlFor={id}>
        <input id={id} type="checkbox" checked={on} onChange={(e) => void onChange(e)} aria-describedby={`${id}-note`} />
        {SHARING_LABEL}
      </label>
      <p className="tabit-sharing-note" id={`${id}-note`}>{SHARING_NOTE}</p>
    </div>
  );
}
