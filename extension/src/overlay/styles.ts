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

/* Panel (Task 5) - ported from web/src/screens/Sheet.tsx. Values match 1:1; only the
 * font stack differs ('Fraunces' -> --tabit-serif system stack, same substitution the
 * rest of this file already makes - no custom webfont inside a content script). */
.tabit-panel {
  flex: 1;
  padding: 28px 5vw 48px;
  animation: tabit-fade-in 0.4s ease-out;
  font-family: var(--tabit-sans);
  color: var(--tabit-ink);
}

.tabit-panel-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 22px;
}

.tabit-panel-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tabit-panel-wordmark {
  font-family: var(--tabit-serif);
  font-style: italic;
  font-weight: 600;
  font-size: 26px;
  color: var(--tabit-ink);
}

.tabit-ad-tag {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--tabit-muted);
  background: oklch(0.94 0.01 85);
  padding: 4px 8px;
  border-radius: 2px;
  white-space: nowrap;
}

.tabit-chips-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 30px;
}

.tabit-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.tabit-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 14px;
  background: var(--tabit-paper);
  border-radius: 2px;
}

.tabit-chip-scales {
  flex: 1;
  min-width: 200px;
}

.tabit-chip-label {
  font-size: 9.5px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--tabit-muted);
}

.tabit-chip-value {
  font-family: var(--tabit-serif);
  font-weight: 600;
  font-size: 17px;
}

.tabit-chip-scales-value {
  font-size: 13.5px;
  line-height: 1.4;
}

.tabit-transpose-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tabit-round-btn {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 1.5px solid oklch(0.52 0.02 70 / 0.4);
  background: var(--tabit-paper);
  color: var(--tabit-ink);
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  font-family: var(--tabit-sans);
}
.tabit-round-btn:hover { background: oklch(0.94 0.01 85); }

.tabit-transpose-label {
  font-family: var(--tabit-serif);
  font-weight: 600;
  font-size: 15px;
  min-width: 56px;
  text-align: center;
}

.tabit-sheet {
  background: var(--tabit-paper);
  border-radius: 4px;
  box-shadow: 0 1px 2px oklch(0.28 0.02 70 / 0.05), 0 10px 30px oklch(0.28 0.02 70 / 0.06);
  position: relative;
  overflow: hidden;
  transition: opacity 200ms ease-out;
}
.tabit-sheet-dim { opacity: 0.5; }

.tabit-sheet-margin {
  position: absolute;
  left: 52px;
  top: 0;
  bottom: 0;
  width: 1.5px;
  background: oklch(0.70 0.10 25 / 0.5);
  z-index: 1;
}

.tabit-sheet-scroll {
  max-height: 420px;
  overflow-y: auto;
  padding: 26px 30px 26px 76px;
  scroll-behavior: smooth;
}

.tabit-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(90px, 1fr));
  column-gap: 22px;
  padding: 14px 0;
  border-bottom: 1px solid var(--tabit-border);
}

.tabit-chord-cell {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 10px 4px;
}

.tabit-chord-marker {
  position: absolute;
  left: 6%;
  right: 6%;
  top: 14%;
  bottom: 18%;
  background: oklch(0.90 0.12 92);
  border-radius: 3px 8px 5px 9px;
  transform: rotate(-0.6deg);
  z-index: 0;
  transition: opacity 200ms ease-out;
}

.tabit-chord-label {
  position: relative;
  z-index: 1;
  font-family: var(--tabit-serif);
  font-weight: 600;
  color: var(--tabit-ink);
  border-bottom: 1.5px solid transparent;
  padding-bottom: 3px;
  transition: color 200ms ease-out;
}
.tabit-chord-label-n { color: var(--tabit-muted); }
.tabit-chord-label-current { font-size: 30px; }
.tabit-chord-label-normal { font-size: 26px; }
.tabit-chord-underline-dim {
  border-bottom: 1.5px dotted var(--tabit-muted);
  color: var(--tabit-muted);
}
.tabit-chord-underline-next { border-bottom: 2px solid var(--tabit-dot); }

.tabit-footer {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-top: 16px;
  font-size: 13.5px;
  color: var(--tabit-muted);
}
.tabit-footer-strong { color: var(--tabit-ink); font-family: var(--tabit-serif); }
.tabit-footer-next-strong { color: var(--tabit-dot); font-family: var(--tabit-serif); }
.tabit-footer-dot { color: var(--tabit-border); }
`;
