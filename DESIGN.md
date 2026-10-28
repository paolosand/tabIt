# tabIt — Design System

The look: a warm music notebook. Light, paper, ink, a highlighter for the moment that matters.

## Theme

**Light.** Physical scene: a guitarist in a warm-lit room, instrument in hand, laptop on the desk, glancing at the chord sheet the way they'd glance at a songbook on a music stand. Warm daylight, relaxed. That scene forces light + warm paper, never dark.

## Color (OKLCH, Restrained)

Never `#000`/`#fff`; every neutral tinted warm.

| Role | OKLCH | Use |
|---|---|---|
| Paper (bg) | `oklch(0.972 0.008 85)` | main surface, warm cream |
| Paper raised | `oklch(0.988 0.006 85)` | the "sheet" card, slightly lighter |
| Ink | `oklch(0.28 0.02 70)` | primary text, warm sepia-black |
| Ink muted | `oklch(0.52 0.02 70)` | secondary text, metadata |
| Rule line | `oklch(0.88 0.015 250)` | faint notebook feint-blue horizontal rules |
| Margin line | `oklch(0.70 0.10 25)` | notebook red margin — web app / landing pages only, never in the extension's in-player component |
| Highlighter | `oklch(0.90 0.12 92)` | warm amber marker behind the CURRENT chord |
| Amber (progress) | `oklch(0.88 0.14 90)` | the in-player component's progress state only: done/current pipeline steps, current beat cell. Never decorative, never a hover or background fill |
| Amber dot | `oklch(0.55 0.13 70)` | active beat-dot inside the amber current-beat cell |
| Graphite | `oklch(0.55 0.02 70)` | pencil underline / "next" chord marker |

**Confidence encoding:** high-confidence chords in full Ink; confidence lowers → ink lightens toward Ink-muted and a faint dotted underline appears. Never hide a low-confidence chord; soften it.

**Brand rule (in-player component):** amber means progress — it's the only color used for the done/current pipeline steps and the current-beat cell. Margin red belongs to the notebook-margin motif on app/landing pages; it never appears in the extension's in-player strip (see `docs/design/TabIt Brand Handoff.dc.html`).

## Typography

Serif for content (songbook feel), clean sans for controls (product legibility).

- **Display / song title / chord labels:** an old-style serif with warmth and character. Target for the real app: **Fraunces** (variable, soft old-style). Mockup/system fallback: `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`.
- **UI / controls / metadata:** system humanist sans: `-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`. Small caps + letterspacing for labels (key/BPM tags).
- Chord labels are the largest, boldest type on the page — they are the data.
- Fixed rem scale, ratio ~1.25. Cap prose at 65ch.

## Mark and wordmark

The mark is a Fraunces bold-italic "t" over an amber swipe rotated −6°, on a paper tile; the wordmark is the same swipe sitting behind "It" in every state. Both are outlined vector assets (`docs/design/assets/icon.svg`, `wordmark.svg`), not live text — recreate the swipe only where no asset exists. Only the swipe slants; everything else (grid cells, icon borders) stays flat and square. Source assets and Chrome Web Store sizes live in `docs/design/assets/`; built-extension copies in `extension/icons/`; store-submission-only sizes in `packaging/store/`.

## Layout

- **Chord sheet is the hero**, laid out as bars on ruled-paper lines like a real chart. The video is a small, quiet companion (compact player, not dominant).
- Generous margins, notebook rhythm. Vary spacing; no uniform padding.
- No card grids. The sheet is one warm paper surface, not a grid of tiles.
- Responsive: on narrow screens the player collapses to a slim sticky bar; the sheet reflows to fewer bars per line.

## Motion (state only, 150–250ms)

- The **current-chord highlighter** and the **playhead** move smoothly as playback advances — this motion IS the karaoke-follow state, so it earns its place.
- Control transitions (hover/focus/press) 150–200ms, ease-out. No bounce, no page-load choreography.

## Signature moments

- The amber **highlighter sweep** landing on the current chord as the song plays.
- **Ruled paper** with a red margin line — instantly reads "notebook," not "app."
- A dimmed, dotted-underline chord that quietly admits "I'm not sure about this one."
