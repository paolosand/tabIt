/** Shadow-DOM stylesheet for the overlay. Injected once by mount.ts into the shadow
 *  root's own <style> element (shadow DOM never inherits the host page's CSS, so
 *  everything the overlay needs — including a reset — has to live here).
 *
 *  Paper tokens and keyframes are ported 1:1 from web/src/index.css so the extension
 *  overlay and the standalone web app read as the same product. System-serif stack
 *  only (no Fraunces webfont inside a content script). */
export const OVERLAY_CSS = `
:host {
  all: initial;
  display: block;
  --tabit-bg: oklch(0.972 0.008 85);
  --tabit-paper: oklch(0.988 0.006 85);
  --tabit-ink: oklch(0.28 0.02 70);
  --tabit-muted: oklch(0.52 0.02 70);
  --tabit-dot: oklch(0.55 0.02 70);
  --tabit-border: oklch(0.88 0.015 250);
  --tabit-accent: oklch(0.70 0.10 25);
  --tabit-error: oklch(0.55 0.12 25);
  --tabit-sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --tabit-serif: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif;
}

* { box-sizing: border-box; }

@keyframes tabit-pulse {
  0%, 100% { opacity: 0.25; transform: translateY(0); }
  50% { opacity: 1; transform: translateY(-2px); }
}
@keyframes tabit-fade-in {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes tabit-sweep {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; }
}

.tabit-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  width: fit-content;
  max-width: 100%;
  padding: 10px 16px;
  margin: 8px 0;
  background: var(--tabit-paper);
  border-radius: 3px;
  box-shadow: 0 1px 2px oklch(0.28 0.02 70 / 0.06), 0 8px 24px oklch(0.28 0.02 70 / 0.06);
  font-family: var(--tabit-sans);
  color: var(--tabit-ink);
  animation: tabit-fade-in 0.3s ease-out;
}

.tabit-wordmark {
  font-family: var(--tabit-serif);
  font-style: italic;
  font-weight: 600;
  font-size: 16px;
  color: var(--tabit-ink);
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.tabit-btn {
  font-family: var(--tabit-sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  border: none;
  border-radius: 2px;
  padding: 8px 16px;
  cursor: pointer;
  white-space: nowrap;
  transition: background 180ms ease-out, transform 180ms ease-out;
}
.tabit-btn:active { transform: translateY(0); }

.tabit-btn-primary {
  color: var(--tabit-paper);
  background: var(--tabit-ink);
}
.tabit-btn-primary:hover { background: oklch(0.36 0.03 70); transform: translateY(-1px); }

.tabit-btn-secondary {
  color: var(--tabit-ink);
  background: transparent;
  border: 1.5px solid var(--tabit-border);
}
.tabit-btn-secondary:hover { background: oklch(0.94 0.01 85); }

.tabit-loading-body {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tabit-sweep-track {
  position: relative;
  overflow: hidden;
  width: 120px;
  height: 1.5px;
  border-radius: 2px;
  background: var(--tabit-border);
}
.tabit-sweep-fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 40%;
  background: oklch(0.70 0.10 25 / 0.7);
  animation: tabit-sweep 1.4s ease-in-out infinite;
}

.tabit-hint {
  font-size: 12px;
  color: var(--tabit-muted);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.tabit-bar-error .tabit-error-message {
  font-size: 13px;
  color: var(--tabit-error);
  line-height: 1.4;
}

.tabit-sheet-placeholder {
  padding: 16px;
  margin: 8px 0;
  background: var(--tabit-paper);
  border-radius: 3px;
  box-shadow: 0 1px 2px oklch(0.28 0.02 70 / 0.06), 0 8px 24px oklch(0.28 0.02 70 / 0.06);
  font-family: var(--tabit-sans);
  color: var(--tabit-ink);
  animation: tabit-fade-in 0.3s ease-out;
}
`;
