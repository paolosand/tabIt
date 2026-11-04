export type ErrorCategory = 'download_failed' | 'video_unavailable' | 'engine_error' | 'timeout';

const MAX_LENGTH = 300;

const RULES: Array<[ErrorCategory, RegExp]> = [
  ['video_unavailable', /unavailable|private|removed|\bage\b|sign in/i],
  ['timeout', /timed out|timeout/i],
  ['download_failed', /download|yt-dlp|http error|403|network/i],
];

/** Ordered keyword match; anything unrecognised is an engine error. */
export function classifyError(message: string): ErrorCategory {
  for (const [category, pattern] of RULES) {
    if (pattern.test(message)) return category;
  }
  return 'engine_error';
}

/** Strip home-directory user names, keep only the first line, cap at 300 chars. */
export function scrubMessage(message: string): string {
  const redacted = message.replace(/\/(Users|home)\/[^/\s]+/g, '/$1/<user>');
  return redacted.split('\n')[0].slice(0, MAX_LENGTH);
}
