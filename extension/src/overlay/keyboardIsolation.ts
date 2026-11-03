/** Attribute that marks the feedback UI (the Panel's bottom row, and FeedbackMenu itself). */
export const FEEDBACK_ROOT_ATTR = 'data-tabit-feedback';

const KEY_EVENTS = ['keydown', 'keyup', 'keypress'] as const;

/**
 * Keeps keyboard events that originate inside the feedback UI from leaving the shadow DOM.
 *
 * Root cause: the overlay lives in a shadow root. When a key is pressed in our textarea,
 * the event is retargeted at the page level to the shadow HOST (a plain <div>), so
 * YouTube's document-level shortcut handler sees a non-editable target and acts on Space,
 * k, f, m, j, l, arrows, digits, and so on, instead of letting the user type.
 *
 * Ordering: React 19 delegates events at its root container, which is a CHILD of the shadow
 * root. These listeners sit on the shadow root (above that container), so by the time they
 * run React's own onKeyDown handlers (Enter to send, Esc to close) have already run. We
 * never preventDefault, so typing, Tab and checkbox/button activation behave normally.
 *
 * Caveat: if the page registers capture-phase key handlers on window/document, those run
 * before any listener inside the shadow tree and cannot be stopped from here. That must be
 * verified in real Chrome on YouTube.
 *
 * Returns a cleanup function.
 */
export function isolateFeedbackKeys(root: ShadowRoot | Element): () => void {
  const stop = (e: Event) => {
    if (e.composedPath().some((n) => n instanceof Element && n.hasAttribute(FEEDBACK_ROOT_ATTR))) {
      e.stopPropagation();
    }
  };
  for (const t of KEY_EVENTS) root.addEventListener(t, stop);
  return () => {
    for (const t of KEY_EVENTS) root.removeEventListener(t, stop);
  };
}
