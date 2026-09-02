# Sprint 0 findings — chord-accuracy diagnosis

Sprint 0 deliverable (`docs/BETA_ROADMAP.md`): turn "misses chord changes
every now and then" into a concrete, prioritized bug list before fixing
anything in Sprint 1. Two inputs feed the bucketed list below — the
Billboard multi-genre benchmark, and real misses noticed during normal use.

## Anecdotal miss log

Log a row here whenever normal use turns up a wrong chord — this catches
things the benchmark's 20-song sample won't (rare edge cases, songs outside
any labeled dataset, misses on your own recordings).

| Date | YouTube URL | Timestamp | What's wrong | Notes |
|------|-------------|-----------|---------------|-------|
| _(none logged yet — add a row here as you hit misses in normal use)_ | | | | |

## Failure categories

Bucketed by root cause, most-actionable-for-Sprint-1 first. "Evidence"
cites what's already confirmed vs. still a hypothesis to validate.

| Category | Status | Evidence | Root cause | Sprint 1 candidate? |
|----------|--------|----------|------------|----------------------|
| Funk/syncopated chord-*quality* confusion (root is fine, maj/min is not) | **Confirmed, sharp signal** | Billboard syncopated bucket, majmin far below root on every song: Jungle Boogie root=0.98 vs majmin=0.08(!), Cold Sweat root=0.83 vs majmin=0.28, Super Freak root=0.54 vs majmin=0.49. Bucket average majmin ≈0.28 vs. 0.75 Beatles baseline | Not yet isolated — hypothesis: sparse/muted funk guitar comping ("chicka" hits, one-chord vamps with dominant/altered color tones) gives the chord-quality classifier too little clean harmonic content per segment, while the bass line (driving `root`) stays clean and confident | **Yes — top Sprint 1 candidate.** Nearly-perfect root with near-zero majmin on Jungle Boogie is about as clean a repro as a bug report gets |
| `merge_short` over-collapsing | Hypothesis, not yet confirmed | Named in BETA_ROADMAP.md as a likely candidate for "misses genuinely short chord changes"; no specific song/timestamp logged yet. Worth checking against the funk bucket too — muted comping could plausibly produce short, real chord segments `merge_short` swallows, on top of (not instead of) the quality-confusion finding above | Sub-2-beat chord segments get merged into a neighbor (shipped 2026-07-11 to suppress noisy flicker) — plausible this also swallows real fast changes | Yes, once a concrete example lands in the anecdotal log above |
| `BASS_CONF_MIN` slash-chord edge cases | Confirmed, tuned once | On record since before the accuracy benchmark: "slash-chord bass detection tuned but still occasionally noisy on real audio" (`BASS_CONF_MIN=0.5` is the conservatism knob) | CREPE median-confidence gate over chord-tone bass frames; edge cases likely near the threshold | Maybe — needs specific failing examples to know if it's a threshold tweak or a real detection gap |
| Modern-pop-proxy bucket, moderate accuracy | Confirmed | Billboard modern-pop-proxy bucket: Hold On 0.61, Motownphilly 0.61, The Power 0.95 majmin — bucket average ≈0.72, close to but slightly below the 0.75 Beatles baseline. Root accuracy is oddly *lower* than majmin on 2/3 songs (e.g. Hold On root=0.52 < majmin=0.61) — not yet understood, may be a `mir_eval` comparator-semantics artifact rather than an engine bug | Unconfirmed | Maybe — needs the root<majmin anomaly explained first before treating it as an engine issue |
| Tempo doubling, slow/drum-less tracks | Confirmed, partially fixed | Reggae (Three Little Birds, 74→148 BPM) still doubles after the 2026-07-11 full-mix beat-tracking fix; 3/4 of the tempo test set now correct | `librosa.beat_track`'s `start_bpm=120` prior favors double-time on slow songs; tried tempo-sweep, chord-duration-in-beats, onset autocorrelation, drums-stem tempo — none separates reggae from genuinely fast songs without a trained perceptual-tempo model | No — explicit beta non-goal. Sprint 1 surfaces low tempo/beat-grid confidence in the UI instead of solving it algorithmically |
| Acoustic/singer-songwriter bucket, no new issue found | Confirmed (negative result) | Billboard acoustic bucket scored *above* the Beatles baseline: Country Road 0.82, Sounds of Silence 0.87, Bread If 0.75 majmin — bucket average ≈0.81 | N/A | No — this genre isn't where the accuracy problem lives |
| Genuinely ambiguous chords | Confirmed, not a bug | A Hard Day's Night (Beatles pilot): engine says Dm7, Isophonics annotates G:sus4(b7) — the famously disputed opening chord, timing matches so it's a real content disagreement, not a timing/pipeline error | N/A — this is inherent musical ambiguity | No — not fixable, and not worth chasing |

## Sources

- `benchmarks/results/latest.md` — 11-song Beatles pilot (0.75 majmin / 0.65 sevenths)
- `benchmarks/billboard/results/latest.md` — 9-song multi-genre pilot (0.62 majmin / 0.58 sevenths / 0.71 root, duration-weighted; see the per-song and per-bucket breakdown above — the blended number hides the real story)
- Anecdotal log above
