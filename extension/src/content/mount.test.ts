import { mountOverlay } from './mount';

test('mounts a shadow host into the slot and unmounts cleanly', () => {
  document.body.innerHTML = '<div id="below"></div>';
  const slot = document.getElementById('below')!;
  const { shadowRoot, unmount } = mountOverlay(slot);
  expect(document.getElementById('tabit-root')).not.toBeNull();
  expect(shadowRoot.querySelector('style')).not.toBeNull();
  unmount();
  expect(document.getElementById('tabit-root')).toBeNull();
});

test('does not add the fallback class by default', () => {
  document.body.innerHTML = '<div id="below"></div>';
  const slot = document.getElementById('below')!;
  const { unmount } = mountOverlay(slot);
  expect(document.getElementById('tabit-root')!.classList.contains('tabit-fallback')).toBe(false);
  unmount();
});

test('adds the fallback class when fallback is requested', () => {
  document.body.innerHTML = '<div id="below"></div>';
  const slot = document.getElementById('below')!;
  const { unmount } = mountOverlay(slot, { fallback: true });
  expect(document.getElementById('tabit-root')!.classList.contains('tabit-fallback')).toBe(true);
  unmount();
});
