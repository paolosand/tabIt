import { describe, expect, it } from 'vitest';
import { classifyError, scrubMessage } from './errors';

describe('scrubMessage', () => {
  it('redacts the macOS user segment', () => {
    expect(scrubMessage('failed at /Users/paolosandejas/Library/Application Support/tabIt/x'))
      .toBe('failed at /Users/<user>/Library/Application Support/tabIt/x');
  });
  it('redacts the linux user segment', () => {
    expect(scrubMessage('/home/bob/x')).toBe('/home/<user>/x');
  });
  it('keeps only the first line of a traceback', () => {
    expect(scrubMessage('Error: bad\n  at foo (a.js:1)\n  at bar (b.js:2)')).toBe('Error: bad');
  });
  it('truncates to 300 characters', () => {
    expect(scrubMessage('x'.repeat(500))).toHaveLength(300);
  });
});

describe('classifyError', () => {
  it.each(['Video unavailable', 'Private video', 'Sign in to confirm your age'])(
    '%s -> video_unavailable', (m) => expect(classifyError(m)).toBe('video_unavailable'));
  it.each(['HTTP Error 403: Forbidden', 'yt-dlp download failed'])(
    '%s -> download_failed', (m) => expect(classifyError(m)).toBe('download_failed'));
  it('timed out -> timeout', () => expect(classifyError('timed out')).toBe('timeout'));
  it('defaults to engine_error', () => expect(classifyError('ValueError: bad shape')).toBe('engine_error'));
});
