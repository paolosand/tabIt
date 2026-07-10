import { OVERLAY_CSS } from '../overlay/styles';

/** Prepends a `<div id="tabit-root">` shadow host into `slot` and injects the overlay
 *  stylesheet into an open shadow root. `unmount` removes the host node entirely.
 *  Pass `{ fallback: true }` when no real insertion slot was found (spec §4): this
 *  toggles a class that pins the host to the bottom of the viewport via CSS. */
export function mountOverlay(
  slot: Element,
  options?: { fallback?: boolean },
): { shadowRoot: ShadowRoot; unmount: () => void } {
  const host = document.createElement('div');
  host.id = 'tabit-root';
  if (options?.fallback) host.classList.add('tabit-fallback');
  slot.prepend(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;
  shadowRoot.appendChild(style);
  return { shadowRoot, unmount: () => host.remove() };
}
