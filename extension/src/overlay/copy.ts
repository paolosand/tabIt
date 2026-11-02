/** Every user-facing string for the first-run, update, unsupported and offline bars.
 *  Kept apart from the components so the visual redesign can reword them. */

export const SETUP_TITLE_INSTALL = 'Set up tabIt on this Mac';
export const SETUP_TITLE_UPDATE = 'tabIt needs a quick update';

export const SETUP_STEPS = [
  'Open Terminal (press Cmd+Space, type Terminal, press Return)',
  'Paste the command, press Return',
  'Come back here. This page finds tabIt on its own',
] as const;

export const COPY_BUTTON = 'Copy command';
export const COPIED_LABEL = 'Copied';
export const COPY_FALLBACK = 'Select the command, then press Cmd+C';

export const UNSUPPORTED_MESSAGE = 'tabIt needs a Mac for now';

export const CONNECTED_NOTE = 'Helper connected';

export const OFFLINE_MESSAGE = "tabIt isn't running. Open Terminal and paste:";
export const RESTART_COMMAND = '~/.local/bin/tabit restart';
export const RETRY_LABEL = 'Retry';

export const REPORT_BUTTON = 'Report bad transcription';
export const REPORT_SENDING = 'Sending…';
export const REPORT_FAILED = 'Couldn’t send — try again';
export const REPORT_FOLLOWUP_TITLE = 'Thanks — what was off?';
export const REPORT_REASON_LABELS = {
  chords: 'Chords',
  key: 'Key',
  tempo: 'Tempo',
  other: 'Other',
} as const;
export const REPORT_NOTE_LABEL = 'Add a note (optional)';
export const REPORT_SEND = 'Send';
export const REPORT_DETAILS_DONE = 'Sent — thank you';
export const SHARING_LABEL = 'Help improve tabIt';
export const SHARING_NOTE =
  'Shares which songs you analyze and the charts tabIt makes for them, including songs that fail. No account or name.';
