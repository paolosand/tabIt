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

/* Degraded fallback (spec §4): applied to the host when no insertion slot was
 * found within the 10s observer window, so the overlay still reaches the user
 * pinned to the bottom of the viewport instead of never appearing. */
:host(.tabit-fallback) {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 9999;
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
  padding: 10px 5vw 12px; /* compact: header/footer/toggle carry their own spacing */
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
  margin-left: auto;
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

.tabit-panel-header-compact { display: flex; align-items: center; justify-content: flex-start; gap: 14px; padding: 8px 14px; }
.tabit-inline-chip { font-size: 12px; color: oklch(0.4 0.02 60); white-space: nowrap; }
.tabit-inline-chip b { color: oklch(0.25 0.02 60); font-weight: 600; }
.tabit-inline-chip-scales { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

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
  max-height: min(420px, 38vh);
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
.tabit-chord-text-muted { color: var(--tabit-muted); }
.tabit-chord-underline-dim { border-bottom: 1.5px dotted var(--tabit-muted); }
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
.tabit-footer-beatcount { margin-left: auto; font-variant-numeric: tabular-nums; letter-spacing: 1px; }

.tabit-view-toggle {
  display: block;
  width: 100%;
  padding: 2px 0 8px;
  border: none;
  background: none;
  font: inherit;
  font-size: 11px;
  color: oklch(0.5 0.02 60);
  cursor: pointer;
  text-align: center;
}
.tabit-view-toggle:hover { color: oklch(0.3 0.02 60); }

/* --- beat ribbon --- */
.tabit-ribbon { position: relative; overflow: hidden; height: 86px; padding-top: 12px; }
.tabit-ribbon-track {
  position: relative; height: 64px;
  transition: transform 200ms linear;
}
@media (prefers-reduced-motion: reduce) { .tabit-ribbon-track { transition: none; } }
.tabit-beat {
  position: absolute; top: 0; width: 44px; height: 64px;
  border-left: 1px solid oklch(0.93 0.008 90);
}
.tabit-beat-bar { border-left: 2px solid oklch(0.82 0.012 90); }
.tabit-beat-done { background: oklch(0.965 0.012 90); }
.tabit-beat-now { background: oklch(0.87 0.14 85); border-radius: 4px; }
.tabit-beat-chord {
  position: absolute; left: 6px; top: 10px; z-index: 2;
  font-size: 21px; color: oklch(0.25 0.02 60); white-space: nowrap;
}
.tabit-beat-chord-muted { color: oklch(0.62 0.015 60); }
.tabit-beat-pips { position: absolute; bottom: 6px; left: 8px; display: flex; gap: 5px; z-index: 2; }
.tabit-beat-pip { width: 5px; height: 5px; border-radius: 50%; background: oklch(0.85 0.02 85); }
.tabit-beat-pip-hit { background: oklch(0.55 0.12 70); }
.tabit-ribbon-fade {
  position: absolute; right: 0; top: 0; bottom: 0; width: 70px; pointer-events: none;
  background: linear-gradient(to right, transparent, oklch(0.985 0.008 90));
}
`;
