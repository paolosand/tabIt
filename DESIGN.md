---
name: tabIt
description: A paper chord sheet that follows the song. Clean, warm, quietly notebook.
colors:
  ink: "oklch(0.28 0.02 70)"
  ink-pressed: "oklch(0.36 0.03 70)"
  ink-soft: "oklch(0.45 0.02 70)"
  muted: "oklch(0.52 0.02 70)"
  graphite: "oklch(0.55 0.02 70)"
  paper: "oklch(0.988 0.006 85)"
  desk: "oklch(0.972 0.008 85)"
  wash: "oklch(0.94 0.01 85)"
  hairline: "oklch(0.85 0.015 85)"
  rule-blue: "oklch(0.88 0.015 250)"
  beat-tick: "oklch(0.93 0.008 90)"
  bar-line: "oklch(0.82 0.012 90)"
  beat-done: "oklch(0.965 0.012 90)"
  amber: "oklch(0.88 0.14 90)"
  amber-dot: "oklch(0.55 0.13 70)"
  highlighter: "oklch(0.90 0.12 92)"
  margin-red: "oklch(0.70 0.10 25)"
  error: "oklch(0.55 0.12 25)"
  link: "oklch(0.42 0.09 250)"
  link-hover: "oklch(0.32 0.11 250)"
typography:
  chord-current:
    fontFamily: "Fraunces, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: 1
  chord:
    fontFamily: "Fraunces, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1
  chord-compact:
    fontFamily: "Fraunces, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
    fontSize: "19px"
    fontWeight: 600
  serif-input:
    fontFamily: "Fraunces, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
    fontSize: "20px"
    fontWeight: 400
  value:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  body-small:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    letterSpacing: "0.02em"
  button:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.08em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.08em"
  label-micro:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif"
    fontSize: "9.5px"
    fontWeight: 600
    letterSpacing: "0.1em"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
rounded:
  tag: "2px"
  surface: "3px"
  card: "4px"
  round: "50%"
spacing:
  "2xs": "4px"
  xs: "6px"
  sm: "8px"
  md: "14px"
  lg: "22px"
  xl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    typography: "{typography.button}"
    rounded: "{rounded.tag}"
    padding: "12px 22px"
  button-primary-hover:
    backgroundColor: "{colors.ink-pressed}"
  button-primary-compact:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.tag}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.tag}"
    padding: "8px 16px"
  button-secondary-hover:
    backgroundColor: "{colors.wash}"
  button-round:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.round}"
    size: "26px"
  button-round-hover:
    backgroundColor: "{colors.wash}"
  data-chip:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.value}"
    rounded: "{rounded.tag}"
    padding: "8px 14px"
  tag:
    backgroundColor: "{colors.wash}"
    textColor: "{colors.muted}"
    rounded: "{rounded.tag}"
    padding: "4px 8px"
  input-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.serif-input}"
    padding: "6px 2px 12px"
  sheet-card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "26px 30px 26px 76px"
  status-bar:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "10px 16px"
  popover:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.card}"
    padding: "12px 14px"
    width: "220px"
  beat-cell:
    backgroundColor: "transparent"
    padding: "8px"
  beat-cell-done:
    backgroundColor: "{colors.beat-done}"
  beat-cell-now:
    backgroundColor: "{colors.amber}"
    rounded: "{rounded.card}"
---

# Design System: tabIt

## Overview

**Creative North Star: "The Brand Handoff, v1": a paper card that follows the song.**

tabIt is a warm paper card with ink on it and one amber mark that shows where you are in the song. It has a few notebook touches: ruled lines, a red margin on the web app, a pencil underline. They add character. The base is still clean and calm, and should never look like a SaaS dashboard or "music tech". The north star is `docs/design/TabIt Brand Handoff.dc.html` (Handoff v1, Oct 2026), and its three rules hold everywhere: **amber means progress**, **serif for headers and chords**, **paper on dark**.

The scene is a guitarist in a warm-lit room with the instrument in hand, glancing at the screen the way they would glance at a songbook on a music stand. That's why the theme is always light and the paper is always warm. On YouTube's dark UI the paper card stays light. It never becomes dark-on-dark. Density is low: the chord sheet is the hero, and everything else (video, metadata, controls) is a quiet companion.

Character comes from a few precise details rather than decoration. The mark's amber swipe is the one slanted element. A low-confidence chord is visibly softer, which admits uncertainty instead of hiding it. The amber cell moves through the beat grid in step with the music.

**Key Characteristics:**
- Light only: warm cream desk, lighter paper card, sepia-black ink. Never `#000` or `#fff`; every neutral is warm.
- One accent, used with purpose: amber means progress and nothing else.
- Serif (Fraunces) for headers and chord names; system sans for everything else.
- Square, flat geometry with 2–4px radii. Only the logo swipe slants.
- State-only motion, 150–250ms, ease-out, with reduced motion respected.

## Colors

A restrained warm-neutral palette (hue 70–90) with one accent (amber), plus a cool notebook rule line and a red margin used only on the web app. **OKLCH is canonical.** Hex values in the brand handoff are sRGB renderings of the same tokens (ink `#2F271E`, paper `#FDFBF7`, amber `#FBD35F`, muted `#71675D`).

### Primary
- **Progress Amber** (`amber`): the current beat cell, completed pipeline steps (done-check fill, current-step spinner ring), and the "It" swipe in the wordmark. Nothing else.
- **Beat-dot Amber** (`amber-dot`): the "hit" beat pip inside the current amber cell. Darker so it shows on amber.

### Neutral
- **Sepia Ink** (`ink`): primary text, chord labels, primary-button fill, the "now" chord in the footer.
- **Pressed Ink** (`ink-pressed`): hover state of ink-filled buttons.
- **Soft Ink** (`ink-soft`): completed step labels in the processing checklist.
- **Muted Brown** (`muted`): metadata, labels, low-confidence chords, secondary copy. The most-used text color after ink.
- **Graphite** (`graphite`): pencil marks: the "next chord" underline, the next-chord name in the footer, loading dots.
- **Paper** (`paper`): every card or sheet surface: the sheet, popover, status bar, data chips.
- **Desk** (`desk`): the page background the paper sits on (web `body`, extension `--tabit-bg`).
- **Wash** (`wash`): hover fill for secondary and round buttons, and the background of quiet tags such as the ad tag.
- **Warm Hairline** (`hairline`): pending-step rings and the warm "Line" from the handoff (`#DCD7CD`).
- **Beat grid neutrals** (`beat-tick`, `bar-line`, `beat-done`): a 1px beat divider, a 2px bar-start divider, and the fill for beats already played.

### Notebook accents (web app only)
- **Notebook Rule Blue** (`rule-blue`): feint-blue ruled lines: input underlines, row dividers, secondary-button and code-box borders, the "or" divider.
- **Margin Red** (`margin-red`): the vertical notebook margin on the landing card and the web sheet (at 50–70% alpha), and the 5px "edited" dot on a corrected chord.

### Functional
- **Error** (`error`): error message text only.
- **Link Ink-Blue** (`link`, `link-hover`): inline text links in the web app. Underline at `oklch(0.75 0.06 250)`, offset 2px.
- **Highlighter** (`highlighter`): `::selection` in the web app only.

### Named Rules
**The Amber-Means-Progress Rule.** Amber marks where you are in the song or the pipeline. Never use it for decoration, hover, focus, backgrounds, or emphasis. A connectivity confirmation such as "Helper connected" is ink, not amber.

**The Red-Belongs-To-YouTube Rule.** The in-player extension component uses no red for UI (spinners, accents, borders). The red margin line is a web-app notebook motif.

**The Soften-Don't-Hide Rule.** Lower confidence moves a chord from `ink` to `muted` and adds a 1.5px dotted `muted` underline. A low-confidence chord is never removed or replaced by a placeholder. No-chord (`N`) cells render in `muted`.

## Typography

**Display / Chord Font:** Fraunces (variable, weights 400–600, roman + italic), loaded from Google Fonts in `web/index.html`. Fallback: `'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif`.
**UI Font:** system sans (`-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif`).
**Mono:** `ui-monospace, SFMono-Regular, Menlo, monospace`, only for terminal commands in setup and offline states.

**Character:** a warm, slightly bookish serif for what you play, and a plain native sans for everything you read about it. The extension cannot load webfonts in a content script, so it uses the system serif stack (`--tabit-serif`), and its wordmark is outlined Fraunces vector paths rather than live text.

### Hierarchy
- **Chord, current** (Fraunces 600, 30px, line-height 1): the chord under the playhead in the web beat grid. Chords are the largest type on the page because they are the data.
- **Chord** (Fraunces 600, 26px): every other chord in the beat grid and sheet.
- **Chord, compact** (serif 600, 19px): the extension's beat ribbon. The edit popover uses 20px.
- **Serif input** (Fraunces 400, 20px): the YouTube-link field on the landing card. The user types a song, so it reads like writing on the page.
- **Value** (sans 600, 17px): the data values in the Key and Tempo chips. Use 15px for the transpose readout and 13.5px for the scales line.
- **Body** (sans 400, 13px, line-height 1.4): messages, setup steps, the drop zone. The footer uses 13.5px.
- **Body small** (sans 400, 12px, 0.02em): status lines and helper notes.
- **Button** (sans 600, 12px, 0.08em, uppercase): primary actions. Compact buttons in the extension use 11px with 0.06em.
- **Label** (sans 600, 11px, 0.08em, uppercase): field labels ("YouTube link"), the "‹ new song" back link (11.5px, 0.06em).
- **Label micro** (sans 600, 9.5px, 0.1em, uppercase, `muted`): chip captions ("Key", "Tempo", "Fix this chord").

### Named Rules
**The Serif-Is-For-Chords Rule.** Serif is only for the wordmark, titles and headers, and chord names (grid, ribbon, footer Now/Next, edit popover). Key, tempo, scale, transpose, counters, labels, steps and buttons are always sans. Values are bold sans and labels are regular or micro-caps sans.

**The Fixed-Pixel Rule.** The type scale is a fixed set of pixel sizes, not fluid `clamp()`. The extension sits inside YouTube's layout and the web sheet needs stable cell widths. Use the sizes above; don't add new ones in between.

## Layout

- **The chord sheet is the hero.** The video is a compact companion (not the main element). On the web the sheet is one paper card on the desk, inset `28px 5vw 48px`.
- **Beat grid:** one cell per beat, wrapped into rows of `beatsPerBar × barsPerRow` beats. The grid measures its own rendered width and drops from 4 bars per row to 2 below ~900px so chord labels stay readable instead of truncating. Rows auto-scroll only when the current row changes, and they pause after a manual scroll.
- **Notebook margin:** the web sheet's scroll area is padded `26px 30px 26px 76px`, with the red margin line at `left: 52px`. The landing card's margin sits at 28px left padding.
- **Landing:** one centered column, max width 560px, paper card padded `36px 32px 28px`.
- **Extension:** content-sized (`fit-content`) bars and one panel card that fits YouTube's width. The sheet scroll is capped at `min(420px, 38vh)`. If no insertion slot is found, the host pins to the bottom of the viewport.
- **Spacing rhythm:** the spacing tokens (4 / 6 / 8 / 14 / 22 / 28px) cover most gaps. 10px and 16px are common in-between values for gaps. Vary spacing to group related items; don't pad everything the same.
- **No card grids.** Group content as one sheet, a row of chips, or a single bar, never a grid of tiles.

## Elevation & Depth

Depth is paper resting on a desk: a near-invisible contact shadow plus a long, very soft ambient shadow, always tinted with ink (never black). Surfaces don't lift on hover. The only movement is a 1px rise on primary buttons.

### Shadow Vocabulary
- **Sheet** (`box-shadow: 0 1px 2px oklch(0.28 0.02 70 / 0.05), 0 10px 30px oklch(0.28 0.02 70 / 0.06)`): the chord sheet (web and extension sheet view) and the extension panel card.
- **Bar** (`box-shadow: 0 1px 2px oklch(0.28 0.02 70 / 0.06), 0 8px 24px oklch(0.28 0.02 70 / 0.06)`): the landing card, the extension's status bar and toast.
- **Popover** (`box-shadow: 0 4px 14px oklch(0.28 0.02 70 / 0.22)`): the chord edit popover, the only surface that floats over content.
- **Player** (`box-shadow: 0 6px 18px oklch(0.28 0.02 70 / 0.18)`): the compact YouTube / audio player companion.

### Named Rules
**The Paper-On-Desk Rule.** A surface either sits on the desk (Sheet or Bar shadow) or floats over content (Popover shadow). The media player is the one exception (Player shadow). Don't stack shadows or add colored glows.

## Shapes

Flat and nearly square. Radii are small and only three sizes are used. The single slanted form is the logo's amber swipe (−6°). Grid cells, icon borders, chips and cards stay level.

- **Tag** (2px): buttons, data chips, tags, code boxes, quality options, the progress track.
- **Surface** (3px): the landing card, drop zone, extension status bar and toast.
- **Card** (4px): the sheet and panel cards, the popover, the current-beat amber cell.
- **Round** (50%): transpose and root stepper buttons (26px), check icons (14px), beat pips and edited dots (5px), loading dots.
- **Borders** are 1.5px solid (rule-blue, or muted at 40% alpha for round buttons). Dashed borders are for drop targets and the back link. Dotted borders are only for low-confidence chords.

## Components

Every component is paper and ink with sans controls and the fixed pixel type scale. Tokens are written as literal OKLCH values in each surface (inline styles in `web/src/screens/*`, CSS variables in `extension/src/overlay/styles.ts`), so a new component copies values from this file rather than inventing new ones.

### Buttons
- **Primary:** ink fill, paper text, uppercase tracked sans (12px / 0.08em), 2px radius, `12px 22px` padding. In the extension: 11px / 0.06em, `8px 16px`.
- **Hover / Active:** fill moves to `ink-pressed` and the button rises 1px (`translateY(-1px)`), 180ms ease-out. It settles back on press.
- **Secondary:** transparent with a 1.5px `rule-blue` border and ink text. Hover fills with `wash`.
- **Round stepper:** 26px circle, 1.5px border in `muted` at 40% alpha, paper fill, a "–" or "+" glyph at 14–15px. Hover fills with `wash`.
- **Text button:** muted, 11px, underlined (for example "reset to detected") or dashed-underlined uppercase (for example "‹ new song").

### Chips
- **Data chip:** paper fill, 2px radius, `8px 14px`, a micro-caps `muted` caption above a bold sans value (Key, Tempo, Scales). No border.
- **Inline chip (extension compact header):** 12px sans, label in `oklch(0.4 0.02 60)` and bold value in `oklch(0.25 0.02 60)`. Scales truncate with an ellipsis.
- **Tag:** `wash` fill, `muted` 11px / 600 text, `4px 8px`. Used for quiet status such as the ad indicator.
- **Quality option (popover):** 11px, `5px 8px`, 2px radius, 1px border in `muted` at 35% alpha.

### Cards / Containers
- **Sheet card:** paper, 4px radius, Sheet shadow, overflow hidden. On the web it carries the red margin line. Dims to 50% opacity during ads (200ms).
- **Status bar (extension):** paper, 3px radius, Bar shadow, `10px 16px`, 14px gap, wordmark first. Fades in over 0.3s.
- **Popover:** paper, 4px radius, Popover shadow, 220px wide, `12px 14px`. It is anchored under its chord, centered, with a micro-caps title and a × close button.

### Inputs / Fields
- **Link input:** no box. A transparent field on the paper with a 1.5px `rule-blue` underline, Fraunces 20px, `6px 2px 12px`, like writing on a ruled line. A micro-caps label sits above it.
- **Drop zone:** 1.5px dashed `graphite` at 45% alpha, 3px radius, 14px padding, 13px muted text. Hover darkens the border to 80% alpha and adds a faint `wash` fill (180ms).
- **Code box (setup):** 1.5px `rule-blue` border, 2px radius, mono 12px, `user-select: all`.

### Beat grid (signature)
The heart of the product: one cell per beat, with the current beat shown as a flat amber cell.
- **Cell:** transparent with 8px padding. 1px `beat-tick` left and bottom borders, or a 2px `bar-line` left border on a bar's first beat.
- **Done:** `beat-done` fill. **Now:** `amber` fill, 4px radius, beat pips with the hit pip in `amber-dot`. In the ribbon the track slides with a 200ms linear transform.
- **Chord label:** serif 600. Current is 30px, others 26px. The next chord gets a 2px `graphite` underline, low confidence gets a 1.5px dotted `muted` underline, and an edited chord gets a 5px `margin-red` dot top-right. Clicking a label opens the edit popover.
- **Degraded mode:** with no beat grid, the same component renders one cell per chord with no sweep.

### Pipeline checklist (extension, processing)
Each step has a 14px round icon plus a 12px sans label. **Pending:** 1.5px `hairline` ring with a muted label. **Current:** an amber ring with a transparent top that spins (0.9s linear) and an ink label at 600. **Done:** amber fill, ink ✓, `ink-soft` label.

### Footer readout
13.5px muted sans: "Now: **G#** · Next: **C#** in 3 beats". Now is serif ink, Next is serif graphite, the separator dot is `rule-blue`, and the beat count is tabular-nums, pushed right.

### Building a new component
1. Start from paper on desk. Choose the Sheet or Bar shadow, or Popover only if it floats. Use a 2, 3 or 4px radius.
2. Use only the color tokens above. If you need a new neutral, you probably want `muted`, `wash` or `hairline`.
3. Use sans for UI, serif only for chord names and headers, and sizes from the hierarchy.
4. Amber only if the element shows progress or position in the song.
5. Hover/focus/press: 150–200ms ease-out, fill moves to `wash` (light controls) or `ink-pressed` (ink controls). Use no hover color besides those.
6. Animation must respect `prefers-reduced-motion` (both surfaces already zero out animation durations globally).
7. When building for the extension, add the class to `OVERLAY_CSS` with the `tabit-` prefix and use the `--tabit-*` variables. On the web, use inline styles with the same literal values. Global hover rules go in `web/src/index.css`.

## Do's and Don'ts

### Do:
- **Do** keep amber for progress only: the current beat, completed and current pipeline steps, and the wordmark's "It".
- **Do** set chord names in serif 600 and key, tempo, scale, transpose and counters in bold sans.
- **Do** keep grid cells, cards and icon borders flat and square. Slant only the logo swipe (−6°).
- **Do** show a low-confidence chord in `muted` with a dotted underline. Never hide it.
- **Do** keep the extension as a paper card on YouTube's dark UI.
- **Do** use the outlined `wordmark.svg` / `icon.svg` assets rather than recreating the mark in live text. Use the mark alone at 32px and below, and never use the stacked lockup below 64px.
- **Do** tint every shadow with ink (`oklch(0.28 0.02 70 / α)`).

### Don't:
- **Don't** use amber for decoration, hover, focus, or backgrounds.
- **Don't** set key, tempo, or scale in serif.
- **Don't** use red in the in-player extension component (spinners, borders, accents). Red belongs to YouTube.
- **Don't** use `#000`, `#fff`, or cool grays. Every neutral is warm.
- **Don't** build card grids, gradient hero metrics, neon accents, waveform decoration, or dark themes.
- **Don't** add page-load choreography or bouncy easing. Motion only shows state.
- **Don't** add new font sizes, radii, or shadows when an existing token fits.

### Known drift (code vs. handoff, not yet reconciled)
- The extension's full-sheet view (`Panel.tsx`) still marks the current chord with the retired **highlighter** swipe (`.tabit-chord-marker`) and draws the red margin line (`.tabit-sheet-margin`). The ribbon and the web grid use the amber cell.
- The handoff specifies Fraunces **700** for grid chords, **0.1em** button tracking and an **r3** current-beat cell. The code ships 600, 0.06–0.08em and 4px. The tokens above record the code.
- The extension sets the transpose readout in serif (`.tabit-transpose-label`). The web app and the handoff set it in sans.
- The extension's compact chip and ribbon text use hue 60 (`oklch(0.25/0.4 0.02 60)`) instead of ink's hue 70.
