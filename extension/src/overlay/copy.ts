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
