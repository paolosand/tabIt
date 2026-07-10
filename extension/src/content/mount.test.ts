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
