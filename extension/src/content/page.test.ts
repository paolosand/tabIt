import { watchVideoId, isAdShowing, findInsertionSlot, INSERTION_SELECTORS } from './page';

describe('watchVideoId', () => {
  test('watch page with v param', () => {
    expect(watchVideoId({ pathname: '/watch', search: '?v=dQw4w9WgXcQ' })).toBe('dQw4w9WgXcQ');
  });
  test('extra params', () => {
    expect(watchVideoId({ pathname: '/watch', search: '?v=dQw4w9WgXcQ&t=42s' })).toBe('dQw4w9WgXcQ');
  });
  test('non-watch pages -> null', () => {
    expect(watchVideoId({ pathname: '/', search: '' })).toBeNull();
    expect(watchVideoId({ pathname: '/feed/subscriptions', search: '' })).toBeNull();
  });
  test('malformed id -> null', () => {
    expect(watchVideoId({ pathname: '/watch', search: '?v=short' })).toBeNull();
  });
});

describe('isAdShowing', () => {
  test('detects ad-showing class', () => {
    document.body.innerHTML = '<div class="html5-video-player ad-showing"></div>';
    expect(isAdShowing(document)).toBe(true);
    document.body.innerHTML = '<div class="html5-video-player"></div>';
    expect(isAdShowing(document)).toBe(false);
  });
});

describe('findInsertionSlot', () => {
  test('prefers earlier selectors', () => {
    document.body.innerHTML = '<div id="primary-inner"><div id="below"></div></div>';
    expect(findInsertionSlot(document)?.id).toBe('below');
  });
  test('falls back down the list', () => {
    document.body.innerHTML = '<div id="primary-inner"></div>';
    expect(findInsertionSlot(document)?.id).toBe('primary-inner');
  });
  test('null when nothing matches', () => {
    document.body.innerHTML = '<main></main>';
    expect(findInsertionSlot(document)).toBeNull();
  });
  test('selector list is the documented constant', () => {
    expect(INSERTION_SELECTORS[0]).toBe('#below');
  });
});
