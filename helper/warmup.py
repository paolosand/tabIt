"""Loads the chord model the pipeline needs, triggering its one-time weight
download, and runs one tiny inference so the first analyzed song pays no hidden
cost (no network wait, no first-call library init). Raises on failure -- the
installer needs a nonzero exit; api.main wraps this non-fatally."""
import os
import tempfile
from typing import Callable

WARM_CLIP_SEC = 2.0
WARM_SR = 22050


def _write_warm_clip(path: str) -> None:
    """A short A-minor triad: enough signal to exercise the whole BTC path."""
    import numpy as np
    import soundfile as sf

    t = np.arange(int(WARM_CLIP_SEC * WARM_SR)) / WARM_SR
    y = sum(np.sin(2 * np.pi * f * t) for f in (220.0, 261.63, 329.63)) / 3
    sf.write(path, (0.5 * y).astype("float32"), WARM_SR)


def warm_all(progress: Callable[[str], object] = print,
             get_chord_model: Callable[[], object] | None = None) -> None:
    if get_chord_model is None:
        from engine.chord_backend import select_chord_model
        get_chord_model = select_chord_model
    progress("loading chord model (downloads the BTC weights on first run)…")
    model = get_chord_model()
    model.load()

    progress("running a test inference…")
    fd, clip = tempfile.mkstemp(suffix=".wav", prefix="tabit_warm_")
    os.close(fd)
    try:
        _write_warm_clip(clip)
        model.predict(clip)
    finally:
        os.remove(clip)

    progress("all models ready")
