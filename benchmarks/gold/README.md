# tabIt gold set — songs labeled by ear

Ground truth for the songs tabIt is actually used on (modern guitar music the public
Beatles/Billboard sets don't cover). Made with the dev-only annotator in `web/`.
Only chord labels and timing are stored here — **no audio**.

## Label a song

```bash
cd web && source ~/.nvm/nvm.sh && nvm use 20 && npm run dev
# the tabIt helper must be running (it is a login agent: `tabit status`)
```

Open <http://localhost:5173/#annotate>, paste a YouTube URL, **set the key first**, then confirm or
correct the engine's ghost chips. Keys: `1`–`7` place a degree · `b` then `1`–`7` flat · `m` minor ·
`d` ♭7 · `j` maj7 · `n` no chord · `x` unsure · `Enter` confirm · `Backspace` clear · arrows move ·
`Space` play/pause · `⌘Z` undo. Clicking a beat also seeks the video there.

## Files (per song, `annotations/<videoId>.*`)

| File | What |
|------|------|
| `.json` | source of truth: key, grid, engine snapshot, your spans (absolute chords + sure/guess/skip + provenance) |
| `.lab` | sure + guess spans, Harte format; unreviewed regions and skips are `X` (ignored by the scorer) |
| `.sure.lab` | sure spans only |

`X` regions are ignored by `engine.eval.score_chart` on every metric, so partially labeled songs are fine.

## Not built yet

Manifest generation, boundary metric and per-stage scoring (separate spec); Slice 2 editor features
(`R` repeat, ½×/2× grid, click track, blind mode). See `docs/superpowers/specs/2026-09-24-tabit-gold-annotator-design.md`.
