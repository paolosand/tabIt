import shutil
import tempfile

from engine import __version__
from engine.ingest import ingest
from engine.separate import separate, harmonic_mix
from engine.beats import track_beats
from engine.key import detect_key
from engine.bass import detect_bass_notes
from engine.chords import CremaChordModel, raw_to_segments
from engine.scales import suggest_scales
from engine.postprocess import (
    snap_to_beats, merge_adjacent, reconcile_bass, apply_key_prior,
    simplify_quality, merge_short,
)
from engine.meter import detect_meter
from engine.schema import Analysis, Chart, Tempo


def analyze(src, *, created_at, workdir=None, chord_model=None, keep_audio=False) -> Chart:
    own_workdir = workdir is None
    workdir = workdir or tempfile.mkdtemp(prefix="tabit_")
    chord_model = chord_model or CremaChordModel()
    try:
        ingested = ingest(src, workdir)
        stems = separate(ingested.wav_path, workdir)
        harm = harmonic_mix(stems, workdir)

        bpm, beats = track_beats(harm)
        key = detect_key(ingested.wav_path)
        raws = chord_model.predict(harm)

        segs = raw_to_segments(raws)
        segs = snap_to_beats(segs, beats)
        segs = merge_adjacent(segs)

        bass_src = stems.get("bass", ingested.wav_path)
        segs = reconcile_bass(segs, detect_bass_notes(bass_src, segs))
        segs = apply_key_prior(segs, key)
        # Runs after apply_key_prior on purpose -- the x0.7 out-of-key dock widens
        # simplification for out-of-key exotics, and the threshold reads the same
        # confidence the UI dims on.
        segs = simplify_quality(segs)
        segs = merge_short(segs, beats)
        segs = merge_adjacent(segs)

        change_times = [s.start for s in segs[1:]]
        meter, downbeats = detect_meter(beats, change_times)

        return Chart(
            source=ingested.source,
            analysis=Analysis(engineVersion=__version__, createdAt=created_at),
            key=key,
            scales=suggest_scales(key.tonic, key.mode),
            tempo=Tempo(bpm=bpm),
            beats=beats,
            chords=segs,
            meter=meter,
            downbeats=downbeats,
        )
    finally:
        if not keep_audio and own_workdir:
            shutil.rmtree(workdir, ignore_errors=True)
