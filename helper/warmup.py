"""Loads every model the pipeline needs, triggering their one-time weight
downloads, so the first analyzed song pays no hidden cost. Raises on failure —
the installer needs a nonzero exit; api.main wraps this non-fatally."""
from typing import Callable


def warm_all(progress: Callable[[str], object] = print,
             get_chord_model: Callable[[], object] | None = None) -> None:
    progress("loading chord model (crema)…")
    if get_chord_model is None:
        from engine.chords import CremaChordModel
        get_chord_model = CremaChordModel
    get_chord_model()
    import crema.analyze  # noqa: F401  (keras model builds at import)

    progress("loading source separator (Demucs htdemucs)…")
    from engine.separate import _get_separator, _pick_device
    _get_separator("htdemucs", _pick_device())

    progress("loading bass tracker (CREPE small)…")
    from crepe.core import build_and_load_model
    build_and_load_model("small")

    progress("all models ready")
