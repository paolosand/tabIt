import { findInsertionSlot } from './page';
import { watchNavigation } from './navigation';
import { mountOverlay } from './mount';
import { renderOverlay } from '../overlay/App'; // Task 4 provides; stub until then

let current: { unmount: () => void } | null = null;
// Cancels an in-flight slot-retry (MutationObserver + timeout) that hasn't found
// a slot yet, so a stale navigation can't mount onto the wrong videoId later.
let cancelPending: (() => void) | null = null;

function teardown() {
  cancelPending?.();
  cancelPending = null;
  current?.unmount();
  current = null;
}

function mountFor(videoId: string) {
  const tryMount = (slot: Element) => {
    const { shadowRoot, unmount } = mountOverlay(slot);
    const stopApp = renderOverlay(shadowRoot, videoId);
    current = {
      unmount: () => {
        stopApp();
        unmount();
      },
    };
  };

  const slot = findInsertionSlot(document);
  if (slot) return tryMount(slot);

  // Slot not in the DOM yet (fresh navigation): observe until it appears (max 10s).
  const obs = new MutationObserver(() => {
    const found = findInsertionSlot(document);
    if (found) {
      obs.disconnect();
      clearTimeout(timer);
      cancelPending = null;
      tryMount(found);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
  const timer = setTimeout(() => {
    obs.disconnect();
    cancelPending = null;
  }, 10_000);
  cancelPending = () => {
    obs.disconnect();
    clearTimeout(timer);
  };
}

/** Bootstraps the content script: wires SPA navigation to overlay mount/teardown.
 *  Exported (rather than only run at module top-level) so it can be invoked under
 *  test without relying on import-time side effects, and so the auto-run guard
 *  below can be bypassed explicitly if ever needed. */
export function main() {
  console.log('[tabit] content alive');
  return watchNavigation((videoId) => {
    teardown();
    if (videoId) mountFor(videoId);
  });
}

// Auto-run only in a real extension context. Under vitest, test-setup.ts stubs a
// minimal `chrome` global (for background/handler tests) that has no `runtime.id`,
// so this guard keeps import-time side effects (MutationObserver, setInterval,
// document listeners) from firing during test collection of this or other files.
if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
  main();
}
