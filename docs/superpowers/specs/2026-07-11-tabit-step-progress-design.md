# tabIt step-based loading progress — design

**Date:** 2026-07-11
**Status:** approved
**Scope:** extension overlay only (web app untouched; it inherits the API field for later use)

## Problem

While a song is analyzed (~36–45s after the ingestion-perf work, longer on first
model load), the extension bar shows an indeterminate sweep line and the hint
"first listen takes a minute or two". The user has no idea what is happening,
what comes next, or how close they are. We want the wait to read as a pipeline
making visible progress.

## Decision

Replace the sweep line in the `loading` variant of the extension bar with a
**horizontal step checklist** driven by real, server-reported step transitions
(brainstormed as option B1 in live browser mockups):

```
tabIt   ✓ Fetch audio   ◌ Separate instruments   ○ Find chords   ○ Build chart
```

- **Pending** step: dim outline circle, muted 12px label.
- **Active** step: accent spinner ring (the intra-step motion), dark bold label.
- **Done** step: accent-filled circle with a paper-colored check, slightly
  darkened label.
- The "first listen takes a minute or two" hint text is removed; the checklist
  replaces it.
- On job completion the overlay transitions straight to the chart panel as it
  does today — no "done" flash state.

Alternatives considered and rejected: a weighted segmented progress bar with a
step label (strong "how close" signal, weaker "what's next" storytelling), a
minimal "step n of 4" counter next to the existing sweep (cheapest, least
payoff), and checklist + progress hairline (B2 — rejected in favor of the
cleaner plain checklist).

## Steps

Four user-facing steps, reported by the engine with stable string ids and
labeled by the client:

| id (server)  | label (client)         | covers                                          |
|--------------|------------------------|-------------------------------------------------|
| `ingest`     | Fetch audio            | download / decode via `engine.ingest`            |
| `separate`   | Separate instruments   | Demucs separation + harmonic mix (~60% of wait)  |
| `chords`     | Find chords            | chord model + concurrent key/bass/beats block    |
| `finalize`   | Build chart            | postprocess, meter detection, chart assembly     |

The engine runs key/bass/beats concurrently with the chord model; the UI tells
a linear story on purpose — `chords` names the whole concurrent block.

## Plumbing (one new field, end to end)

1. **Engine** — `engine.pipeline.analyze()` gains an optional
   `on_step: Callable[[str], None] | None = None` keyword. It is invoked at
   stage entry with `"ingest"`, `"separate"`, `"chords"`, `"finalize"` in that
   order. No callback → behavior identical to today. Callback exceptions must
   not break analysis (call sites are trusted internal code, but a `try` around
   the invocation is cheap insurance).
2. **JobStore** (`api/jobs.py`) — pending jobs may carry a step:
   `{"status": "pending", "step": "separate"}`. New method
   `set_step(job_id, step)` (no-op if the job is no longer pending).
   `submit(fn)` changes to call `fn(job_id)` — the work fn receives the job id
   as its argument, so `api/main.py`'s `work(job_id)` closures can wire
   `on_step=lambda s: jobs.set_step(job_id, s)` with no race (the id exists
   before the executor ever runs the fn, unlike binding it after `submit()`
   returns). Both call sites (URL and upload) update to the new signature.
3. **API** — `GET /analyze/{job_id}` already returns the raw job dict, so the
   `step` field is exposed with no route changes.
4. **Extension background** (`api.ts`, `handler.ts`) — `pollJobOnce` returns
   the pending state including the optional `step`; `GetChartResponse`'s
   pending variant becomes `{ status: 'pending'; step?: string }`;
   `handleGetChart` passes it through (including on the freshly-submitted
   path, where no step exists yet).
5. **Overlay** (`App.tsx`, `Bar.tsx`) — the `loading` state carries
   `step?: string`; `Bar`'s loading variant renders the checklist, deriving
   done/active/pending from the step id's position in the fixed order.

## Edge cases

- **Missing/unknown step id** (job just submitted, older API, or a future
  renamed step): treat as step 1 active. The UI never breaks on the field
  being absent.
- **Cached chart** (server cache or session cache): first poll returns `done`;
  the checklist appears for at most one poll cycle or not at all. Acceptable.
- **Error mid-run**: existing error variant unchanged; step info discarded.
- **Poll lag**: step transitions surface up to 3s late (poll interval). With
  four coarse steps this is imperceptible.
- **`prefers-reduced-motion`**: overlay CSS already freezes animations; the
  active step remains distinguishable by its bold, dark label.

## Testing

- **Engine** (`tests/`): `analyze(..., on_step=recorder)` fires the four ids
  in order (stages monkeypatched per existing pipeline-test style).
- **API**: a pending job whose work fn reports a step exposes `step` on
  `GET /analyze/{job_id}`; a done job carries no stale pending fields.
- **Extension**: `handler.test.ts` — pending responses pass `step` through;
  `Bar.test.tsx` — for a given step, earlier items render done, the item
  itself active, later items pending; missing step renders step 1 active.

## Implementation notes

- Work happens in a git worktree branched off `main` (post
  `8873548` ingestion-perf merge).
- No web-app changes; `web/src/screens/Analyzing.tsx` can adopt the same field
  later.
