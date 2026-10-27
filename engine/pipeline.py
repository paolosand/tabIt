import shutil
import tempfile
from concurrent.futures import ThreadPoolExecutor

from engine import engine_version
from engine.ingest import ingest
from engine.beats import track_beats
from engine.key import detect_key
from engine.chord_backend import select_chord_model
from engine.chords import raw_to_segments
from engine.scales import suggest_scales
from engine.postprocess import (
    snap_to_beats, merge_adjacent, apply_key_prior, simplify_quality,
)
from engine.meter import detect_meter
from engine.schema import Analysis, Chart, Tempo


def _report(on_step, step):
    """Invoke the progress callback defensively: a bug in the listener must
    never break an analysis run."""
    if on_step is None:
        return
    try:
        on_step(step)
    except Exception:
        pass


def analyze(src, *, created_at, workdir=None, chord_model=None, keep_audio=False,
            on_step=None) -> Chart:
    # Resolved first: missing BTC weights raise here, before a workdir exists to leak.
    chord_model = chord_model or select_chord_model()
    own_workdir = workdir is None
    workdir = workdir or tempfile.mkdtemp(prefix="tabit_")
    try:
        _report(on_step, "ingest")
        ingested = ingest(src, workdir)
        # Key and beat tracking need only the original wav, so they overlap the
        # chord model (which stays on this thread). torch and numpy release the
        # GIL during inference.
        with ThreadPoolExecutor(max_workers=2) as pool:
            key_fut = pool.submit(detect_key, ingested.wav_path)
            beats_fut = pool.submit(track_beats, ingested.wav_path)
            # BTC reads the original mix and has no slash chords, so every
            # segment's bass is its root.
            _report(on_step, "chords")
            raws = chord_model.predict(ingested.wav_path)

            bpm, beats = beats_fut.result()
            key = key_fut.result()

        segs = raw_to_segments(raws)
        segs = snap_to_beats(segs, beats)
        # Snapping can collapse a short segment onto a single beat.
        segs = [x for x in segs if x.end > x.start]
        segs = merge_adjacent(segs)

        _report(on_step, "finalize")
        segs = apply_key_prior(segs, key)
        # Runs after apply_key_prior on purpose -- the x0.7 out-of-key dock widens
        # simplification for out-of-key exotics, and the threshold reads the same
        # confidence the UI dims on.
        segs = simplify_quality(segs)
        segs = merge_adjacent(segs)

        change_times = [s.start for s in segs[1:]]
        meter, downbeats = detect_meter(beats, change_times)

        return Chart(
            source=ingested.source,
            analysis=Analysis(engineVersion=engine_version(), createdAt=created_at),
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
