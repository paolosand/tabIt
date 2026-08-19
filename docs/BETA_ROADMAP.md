# tabIt — Beta Roadmap

**register: planning** · living document, revisit as sprints complete or priorities shift.

## Where we are (2026-08-18)

Engine, web app, and Chrome extension are all feature-complete (v1). Packaging Phase 1
shipped (v0.3.1): local helper installs via `curl | sh`, extension ships as a downloadable
zip (Chrome dev-mode load required — not yet on the Web Store). CI is live. A real-song
accuracy benchmark just landed: **0.75 majmin / 0.65 sevenths across 11 Isophonics-labeled
Beatles songs** — a single-genre/era pilot, not a broad accuracy claim. In normal use, chords
are generally right but miss some changes "every now and then."

Known engine gaps on record: tempo doubling on slow/drum-less tracks (reggae specifically —
no cheap fix found, would need a trained perceptual-tempo model), slash-chord bass detection
tuned but still occasionally noisy, `allin1` section labels deferred (Python/NATTEN install
pain), accuracy only validated on one genre/era so far.

## What "beta" means here

- **Audience:** public soft launch — anyone can find and install it (Chrome Web Store
  listing / public zip), not just hand-picked testers. No fixed launch date; sprints are
  sized by effort and dependency order, not a calendar.
- **Top priority:** chord accuracy. Everything else is sequenced around protecting effort
  for this.

## The sequencing tension

tabIt's target user (PRODUCT.md) is a hobbyist guitarist, not an engineer — "anything that
reads as a developer tool" is an explicit anti-reference. But today, installing tabIt means
opening Terminal and piping a shell script into bash, then enabling Chrome dev mode to load
an unpacked extension. That's a real mismatch with "public soft launch."

**Resolution:** don't reorder priority — accuracy stays the main engineering effort — but
kick off the Chrome Web Store submission *in parallel*, starting now, since store review has
a multi-day queue that costs nothing to have running in the background. "Make install
non-scary" becomes a small, separate gate sprint that finishes before launch, not a
competitor for early effort. Full Phase 2 packaging (signed menubar `.app` + onboarding
wizard) is explicitly deferred past beta.

---

## Sprint 0 — Diagnose (days, not weeks)

Turn "misses chord changes every now and then" into a concrete, prioritized bug list before
fixing anything.

- Expand the accuracy benchmark past the 11-Beatles pilot with a small multi-genre sample
  (a few songs each: acoustic/singer-songwriter, modern pop, something syncopated/non-4-on-
  the-floor). Failure modes outside 60s British rock are unknown territory right now.
- Log specific YouTube URLs where misses were noticed during normal use — real anecdotal
  failures the benchmark won't catch.
- Bucket failures into categories. Likely candidates already on record: `merge_short`
  collapsing genuinely short chord changes, tempo-doubling on slow/drum-less tracks,
  `BASS_CONF_MIN` edge cases.
- *In parallel, no engineering time*: register a Chrome Web Store developer account and open
  a draft listing so the review clock can start later without blocking on this.

## Sprint 1 — Accuracy (the priority)

- Fix the top 1–2 failure categories Sprint 0 surfaces. Re-run the expanded benchmark;
  confirm no regression on the Beatles baseline.
- For the known hard ML problem (reggae/slow-song tempo doubling) — don't chase a
  perceptual-tempo model for beta. Lean on PRODUCT.md's own "honest confidence" principle
  instead: detect when tempo/beat-grid confidence is low and surface it visually. Today's
  confidence dimming is per-chord-label and doesn't catch a systematically wrong beat grid;
  telling the user "sync may drift on this one" is cheaper than solving tempo detection and
  more honest than silently being wrong.

## Sprint 2 — Onboarding gate (started in parallel, finishes before launch)

- Submit the extension to the Chrome Web Store using the zip CI already builds (#7) —
  removes the "enable dev mode, load unpacked" friction, which matters far more for a public
  non-technical audience than it does for us.
- Give the `curl | sh` helper installer a trust/clarity pass (clearer progress output,
  possibly a signed `.pkg` wrapper if cheap). Not the full menubar app + wizard — just enough
  that a stranger doesn't bail at "paste this into Terminal."
- **Opt-in correction pipeline.** Extend the existing "Fix this chord" popover — today a
  correction only updates `localStorage`. Add a one-time, persistent "help improve tabIt"
  opt-in (not a per-correction prompt). Once on, every correction a user makes for
  themselves also POSTs to a new ingest endpoint, tagged with videoId, timestamp, original
  engine output, corrected label, and engine version. This is genuinely tabIt's first
  centralized backend (everything else is local-first by design) — it gets its own short
  design pass when this sprint starts: hosting choice, minimal schema, basic
  abuse/rate-limiting on a public endpoint. It maps to what was already anticipated as
  "Phase 4 telemetry," pulled forward because it directly serves the accuracy priority — a
  live feedback loop across real genres beats an 11-song benchmark.
- Privacy policy line (needed for Web Store submission regardless): honest, on-brand
  disclosure — what's collected (song ID, timestamps, chord labels, engine version — never
  audio, never account/personal info, since there are no accounts), why (model improvement),
  opt-in and revocable.

Explicitly **not** in scope for beta: signed menubar `.app`, full onboarding wizard —
real Phase 2 work, deferred past beta.

## Sprint 3 — Polish & reliability

Burn down what's already logged as deferred nits rather than opening new scope:

- Transparent checkmark glyph on the step checklist; near-instant "finalize" step
- Stale `Gmaj7/D#` chord label in the README hero screenshot (pre-dates the 0.2.0 engine)
- A pass on edge cases beta testers will actually hit: live streams, very long videos,
  malformed URLs, non-English titles

## Launch checklist

- Chrome Web Store listing approved and live (Sprint 2)
- Opt-in correction pipeline live, privacy policy published (Sprint 2)
- Refresh demo video/README screenshot before announcing — there's an untracked
  `tabIt - demo video - just a song - NO LOADER STEP.mp4` at repo root; decide if that's the
  one to use or scratch

## Explicit non-goals for beta

- Full Phase 2 packaging (signed menubar `.app`, onboarding wizard)
- Solving reggae/slow-song tempo-doubling algorithmically (honest-confidence UI instead)
- `allin1` section labels
- Broad cross-genre accuracy *claim* (Sprint 0/1 improves coverage but this beta is not
  positioned as "works equally well on every genre")

## Next step

Sprint 0 is the natural starting point — it's cheap, diagnostic, and everything else depends
on its output. When ready to start it, that gets its own short brainstorm/plan (each sprint
here is sized to get one as work begins, per the usual spec → plan → implementation flow) —
this document is the sequencing map, not an implementation plan for any one sprint.
