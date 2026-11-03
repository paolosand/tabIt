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
  --tabit-amber: oklch(0.88 0.14 90);
  --tabit-amber-dot: oklch(0.55 0.13 70);
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
@keyframes tabit-fade-out {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-4px); }
}
@keyframes tabit-spin {
  to { transform: rotate(360deg); }
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
  height: 16px;
  width: auto;
  display: block;
  flex: none;
}

/* A brief, self-dismissing confirmation after the chart-polling path recovers from
 * offline (see App.tsx's justReconnected) - plain ink, not amber: amber is reserved
 * for pipeline/beat progress, and this is a connectivity confirmation, not progress. */
.tabit-reconnect-toast {
  display: flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  padding: 8px 14px;
  margin: 0 0 8px;
  background: var(--tabit-paper);
  border-radius: 3px;
  box-shadow: 0 1px 2px oklch(0.28 0.02 70 / 0.06), 0 8px 24px oklch(0.28 0.02 70 / 0.06);
  font-family: var(--tabit-sans);
  font-size: 12px;
  font-weight: 600;
  color: var(--tabit-ink);
  animation: tabit-fade-in 0.25s ease-out, tabit-fade-out 0.3s ease-in 2.7s forwards;
}

.tabit-reconnect-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--tabit-ink);
  color: var(--tabit-paper);
  font-size: 9px;
  flex: none;
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

.tabit-checklist {
  display: flex;
  align-items: center;
  gap: 16px;
}
.tabit-check-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--tabit-muted);
  white-space: nowrap;
  transition: color 0.3s;
}
.tabit-check-done { color: oklch(0.45 0.02 70); }
.tabit-check-active { color: var(--tabit-ink); font-weight: 600; }
.tabit-check-icon {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  flex: none;
  border: 1.5px solid oklch(0.85 0.015 85);
  color: transparent;
  transition: border-color 0.3s, background 0.3s, color 0.3s;
}
.tabit-check-done .tabit-check-icon {
  background: var(--tabit-amber);
  border-color: var(--tabit-amber);
  color: var(--tabit-ink);
}
.tabit-check-active .tabit-check-icon {
  border-color: var(--tabit-amber);
  border-top-color: transparent;
  animation: tabit-spin 0.9s linear infinite;
}

.tabit-bar-error .tabit-error-message {
  min-width: 0;
  overflow-wrap: anywhere; /* long server errors (paths, URLs) wrap instead of overflowing */
  font-size: 13px;
  color: var(--tabit-error);
  line-height: 1.4;
}

.tabit-bar-offline .tabit-offline-message {
  font: 13px/1.4 var(--tabit-sans);
  color: var(--tabit-muted);
}
.tabit-bar-offline .tabit-offline-message code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--tabit-ink);
}

.tabit-bar-setup { align-items: flex-start; }
.tabit-bar-setup p {
  margin: 0 0 6px;
  font-weight: 600;
  font-size: 13px;
}
.tabit-bar-setup ol {
  margin: 0 0 8px;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--tabit-muted);
}
.tabit-bar-setup code {
  display: block;
  margin-bottom: 8px;
  padding: 6px 8px;
  border: 1.5px solid var(--tabit-border);
  border-radius: 2px;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 12px;
  color: var(--tabit-ink);
  overflow-wrap: anywhere;
  user-select: all;
}
.tabit-bar-unsupported span {
  font: 13px/1.4 var(--tabit-sans);
  color: var(--tabit-muted);
}
.tabit-copy-row {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.tabit-copy-row span {
  font: 12px/1.4 var(--tabit-sans);
  color: var(--tabit-muted);
}

/* Panel (Task 5) - ported from web/src/screens/Sheet.tsx. Values match 1:1; only the
 * font stack differs ('Fraunces' -> --tabit-serif system stack, same substitution the
 * rest of this file already makes - no custom webfont inside a content script). */
.tabit-panel {
  flex: 1;
  padding: 8px 0 8px; /* desk margin around the panel card; the card carries the paper */
  animation: tabit-fade-in 0.4s ease-out;
  font-family: var(--tabit-sans);
  color: var(--tabit-ink);
}

/* One paper card around the WHOLE panel (header + ribbon/sheet + footer + toggle), per
 * the approved mockup, so header chips, footer and toggle never render ink-on-dark on
 * dark-theme host pages. Same paper/radius/shadow tokens the ribbon card carried; the
 * sheet view keeps its own .tabit-sheet card inside this one (card-in-card reads as the
 * web app's page-on-desk aesthetic — same radius, so flush corners coincide). */
.tabit-panel-card {
  background: var(--tabit-paper);
  border-radius: 4px;
  box-shadow: 0 1px 2px oklch(0.28 0.02 70 / 0.05), 0 10px 30px oklch(0.28 0.02 70 / 0.06);
  padding-bottom: 4px; /* bottom inset when the toggle is absent (no-beats charts) */
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
  height: 26px;
  width: auto;
  display: block;
  flex: none;
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

.tabit-panel-header-compact { display: flex; align-items: center; justify-content: flex-start; flex-wrap: nowrap; gap: 14px; padding: 6px 14px; margin-bottom: 4px; /* overrides .tabit-panel-header's 22px (web-port leftover) */ }
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
  margin-top: 6px;
  padding: 0 14px; /* inset inside the panel card (was previously the panel's 5vw) */
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
  padding: 2px 0 4px;
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
/* Layout + ad-dim wrapper for the ribbon area. The paper background/radius/shadow
 * moved up to .tabit-panel-card (the whole panel is one card per the mockup); this
 * keeps the ribbon's horizontal inset (mirrors .tabit-sheet-scroll's right padding so
 * the two views align) and the 200ms opacity transition so .tabit-sheet-dim fades the
 * ribbon area only — header/footer stay full-opacity during ads, same as sheet view. */
.tabit-ribbon-card {
  padding: 0 30px;
  transition: opacity 200ms ease-out;
}
.tabit-ribbon { position: relative; overflow: hidden; height: 56px; padding-top: 8px; /* border-box: 48px track + 8px padding */ }
.tabit-ribbon-track {
  position: relative; height: 48px;
  transition: transform 200ms linear;
}
@media (prefers-reduced-motion: reduce) { .tabit-ribbon-track { transition: none; } }
.tabit-beat {
  position: absolute; top: 0; width: 44px; height: 48px;
  border-left: 1px solid oklch(0.93 0.008 90);
}
.tabit-beat-bar { border-left: 2px solid oklch(0.82 0.012 90); }
.tabit-beat-done { background: oklch(0.965 0.012 90); }
.tabit-beat-now { background: var(--tabit-amber); border-radius: 4px; }
.tabit-beat-chord {
  position: absolute; left: 6px; top: 6px; z-index: 2;
  font-family: var(--tabit-serif); font-weight: 600;
  font-size: 19px; color: oklch(0.25 0.02 60); white-space: nowrap;
}
.tabit-beat-chord-muted { color: oklch(0.62 0.015 60); }
.tabit-beat-pips { position: absolute; bottom: 4px; left: 8px; display: flex; gap: 5px; z-index: 2; }
.tabit-beat-pip { width: 5px; height: 5px; border-radius: 50%; background: oklch(0.85 0.02 85); }
.tabit-beat-pip-hit { background: var(--tabit-amber-dot); }
.tabit-ribbon-fade {
  position: absolute; right: 0; top: 0; bottom: 0; width: 70px; pointer-events: none;
  background: linear-gradient(to right, transparent, oklch(0.985 0.008 90));
}

/* --- feedback row: view toggle left, "Feedback" menu right (layout C) --- */
/* One slim row. position: relative anchors the pop-ups, which float above it (absolute)
 * and so never change the panel's height. */
.tabit-feedback-row {
  position: relative;
  display: flex; align-items: center; gap: 4px 16px;
  padding: 0 30px 6px;
  font: 11px/1.4 var(--tabit-sans);
  color: var(--tabit-muted);
}
.tabit-feedback-row .tabit-view-toggle { width: auto; padding: 3px 0; text-align: left; }
.tabit-fb { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.tabit-fb-status { color: var(--tabit-muted); font-size: 11px; }
.tabit-sr-only {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
}
.tabit-text-btn {
  padding: 3px 0; border: none; background: none; font: inherit; font-size: 11px;
  letter-spacing: 0.02em; color: var(--tabit-muted); cursor: pointer;
  text-decoration: underline; text-underline-offset: 2px;
  text-decoration-color: oklch(0.52 0.02 70 / 0.5);
  transition: color 180ms ease-out;
}
.tabit-text-btn:hover:not(:disabled) { color: var(--tabit-ink); }
.tabit-text-btn:disabled { cursor: default; opacity: 0.6; text-decoration: none; }
.tabit-text-btn:focus-visible, .tabit-pop-chip:focus-visible, .tabit-pop-send:focus-visible,
.tabit-pop-link:focus-visible, .tabit-view-toggle:focus-visible {
  outline: 2px solid var(--tabit-ink); outline-offset: 2px;
}

/* Pop-ups: float over the song, Popover shadow, fade in once when they first appear. They are
 * keyed per kind in React, so chips and typing never remount them (no replayed fade). */
@keyframes tabit-pop-in { from { opacity: 0; } to { opacity: 1; } }
.tabit-pop-fade { animation: tabit-pop-in 180ms ease-out; }
.tabit-pop {
  position: absolute; bottom: calc(100% - 4px); right: 30px; z-index: 5;
  width: 290px; padding: 12px 14px;
  background: var(--tabit-paper); color: var(--tabit-ink);
  border-radius: 4px; box-shadow: 0 4px 14px oklch(0.28 0.02 70 / 0.22);
  font: 12px/1.45 var(--tabit-sans);
}
.tabit-pop:focus { outline: none; }
.tabit-pop-report { width: 340px; }
.tabit-pop-title {
  margin: 0 0 6px; font: 600 9.5px/1 var(--tabit-sans);
  letter-spacing: 0.1em; text-transform: uppercase; color: var(--tabit-muted);
}
.tabit-pop-row {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 6px 0; border-top: 1.5px solid var(--tabit-border);
}
.tabit-pop-title + .tabit-pop-row { border-top: 0; }
.tabit-pop-error { margin: 2px 0 4px; color: var(--tabit-error); font-size: 11px; }
.tabit-pop-list { margin: 6px 0 4px; padding-left: 16px; color: var(--tabit-muted); }
.tabit-pop-list li { margin: 2px 0; }
.tabit-pop-never { margin: 0 0 8px; color: var(--tabit-muted); }
.tabit-pop-link {
  color: oklch(0.42 0.09 250); text-decoration: underline;
  text-decoration-color: oklch(0.75 0.06 250); text-underline-offset: 2px;
}
.tabit-pop-link:hover { color: oklch(0.32 0.11 250); }

/* "Help improve tabIt" checkbox: native input kept (hidden) for semantics and keyboard. */
.tabit-switch { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; position: relative; }
.tabit-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.tabit-switch-box {
  width: 14px; height: 14px; display: grid; place-items: center;
  border: 1.5px solid var(--tabit-muted); border-radius: 2px; background: var(--tabit-paper);
  transition: background 180ms ease-out;
}
.tabit-switch input:checked + .tabit-switch-box { background: var(--tabit-ink); border-color: var(--tabit-ink); }
.tabit-switch input:checked + .tabit-switch-box::after {
  content: ""; width: 6px; height: 3px;
  border-left: 1.5px solid var(--tabit-paper); border-bottom: 1.5px solid var(--tabit-paper);
  transform: rotate(-45deg) translate(1px, -1px);
}
.tabit-switch input:focus-visible + .tabit-switch-box { outline: 2px solid var(--tabit-ink); outline-offset: 2px; }

/* Report form */
.tabit-tick {
  display: inline-grid; place-items: center; width: 14px; height: 14px; margin-right: 6px;
  border: 1.5px solid var(--tabit-ink); border-radius: 50%; vertical-align: -3px;
}
.tabit-tick::after {
  content: ""; width: 5px; height: 2.5px;
  border-left: 1.5px solid var(--tabit-ink); border-bottom: 1.5px solid var(--tabit-ink);
  transform: rotate(-45deg) translate(0.5px, -0.5px);
}
.tabit-pop-question { margin: 0 0 8px; font-size: 13px; color: var(--tabit-ink); }
.tabit-pop-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.tabit-pop-chip {
  padding: 4px 10px; border-radius: 2px; font: inherit; cursor: pointer;
  border: 1.5px solid var(--tabit-border); background: transparent; color: var(--tabit-ink);
  transition: background 180ms ease-out;
}
.tabit-pop-chip:hover { background: oklch(0.94 0.01 85); }
.tabit-pop-chip[aria-pressed="true"] { background: var(--tabit-ink); border-color: var(--tabit-ink); color: var(--tabit-paper); }
.tabit-pop-note {
  display: block; width: 100%; padding: 4px 2px; resize: none; line-height: 1.4;
  border: none; border-bottom: 1.5px solid var(--tabit-border); border-radius: 0;
  background: transparent; color: var(--tabit-ink); font: inherit; outline: none;
}
.tabit-pop-note:focus { border-bottom-color: var(--tabit-ink); }
.tabit-pop-note::placeholder { color: var(--tabit-muted); }
.tabit-pop-actions { display: flex; align-items: center; justify-content: flex-end; gap: 14px; margin-top: 10px; }
.tabit-pop-send {
  padding: 6px 14px; border: none; border-radius: 2px; cursor: pointer;
  background: var(--tabit-ink); color: var(--tabit-paper);
  font: 600 11px var(--tabit-sans); letter-spacing: 0.06em; text-transform: uppercase;
  transition: background 180ms ease-out, transform 180ms ease-out;
}
.tabit-pop-send:hover:not(:disabled) { background: oklch(0.36 0.03 70); transform: translateY(-1px); }
.tabit-pop-send:disabled { background: oklch(0.85 0.015 85); color: var(--tabit-muted); cursor: default; }
.tabit-pop-thanks { color: var(--tabit-ink); font-size: 12px; }
`;
