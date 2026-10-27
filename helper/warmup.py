"""Loads every model the pipeline needs, triggering their one-time weight
downloads, so the first analyzed song pays no hidden cost. Raises on failure —
the installer needs a nonzero exit; api.main wraps this non-fatally."""
from typing import Callable


def warm_all(progress: Callable[[str], object] = print,
             get_chord_model: Callable[[], object] | None = None) -> None:
    if get_chord_model is None:
        from engine.chord_backend import select_chord_model
        get_chord_model = select_chord_model
    progress("loading chord model…")
    model = get_chord_model()
    if getattr(model, "backend", "crema") == "btc":
        # BTC runs on the original mix: no crema, Demucs or CREPE to preload.
        model.load()
        progress("all models ready")
        return
    progress("loading chord model (crema)…")
    import crema.analyze  # noqa: F401  (keras model builds at import)

    progress("loading source separator (Demucs htdemucs)…")
    from engine.separate import _get_separator, _pick_device
    _get_separator("htdemucs", _pick_device())

    progress("loading bass tracker (CREPE small)…")
    from crepe.core import build_and_load_model
    build_and_load_model("small")

    progress("all models ready")
