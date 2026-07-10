import { OVERLAY_CSS } from '../overlay/styles';

/** Prepends a `<div id="tabit-root">` shadow host into `slot` and injects the overlay
 *  stylesheet into an open shadow root. `unmount` removes the host node entirely. */
export function mountOverlay(slot: Element): { shadowRoot: ShadowRoot; unmount: () => void } {
  const host = document.createElement('div');
  host.id = 'tabit-root';
  slot.prepend(host);
  const shadowRoot = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = OVERLAY_CSS;
  shadowRoot.appendChild(style);
  return { shadowRoot, unmount: () => host.remove() };
}
