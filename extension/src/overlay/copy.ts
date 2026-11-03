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

export const FEEDBACK_BUTTON = 'Feedback';
export const FEEDBACK_TITLE = 'Feedback';
export const FEEDBACK_WRONG_CHORDS = 'Wrong chords?';
export const REPORT_BUTTON = 'Report bad transcription';
export const REPORT_SENDING = 'Sending…';
export const REPORT_FAILED = "Couldn't send, try again";
export const REPORT_ALREADY = 'Reported for this song';
export const REPORT_SENT = 'Report sent';
export const REPORTED = 'Reported';
export const REPORT_POPUP_LABEL = 'Report bad transcription';
export const REPORT_QUESTION = 'What was off?';
export const REPORT_REASON_LABELS = {
  chords: 'Chords',
  key: 'Key',
  tempo: 'Tempo',
  other: 'Other',
} as const;
export const REPORT_NOTE_LABEL = 'Optional note';
export const REPORT_NOTE_PLACEHOLDER = 'Add a note (optional)';
export const REPORT_SKIP = 'Skip';
export const REPORT_SEND = 'Send';
export const REPORT_THANKS = 'Thanks, noted.';
export const SHARING_LABEL = 'Help improve tabIt';
export const SHARING_ERROR = "Couldn't change this, try again";
export const SHARING_LIST = [
  'Songs you analyze (video ID and title)',
  'The chart tabIt makes for each song',
  'Songs that fail, with a short error',
] as const;
export const SHARING_NEVER = 'Never your audio, account or browsing history. No name attached.';
export const PRIVACY_LABEL = 'Read the privacy policy';
export const PRIVACY_URL = 'https://github.com/paolosand/tabIt/blob/main/PRIVACY.md';
