"""Chord-backend selection: TABIT_CHORD_BACKEND = btc (default) | crema."""
import logging
import os

from engine.chords import CremaChordModel
from engine.chords_btc import BtcChordModel, BtcWeightsUnavailable, WEIGHTS_SHA256, ensure_weights

logger = logging.getLogger(__name__)

ENV_VAR = "TABIT_CHORD_BACKEND"
BACKENDS = ("btc", "crema")
DEFAULT_BACKEND = "btc"


def requested_backend() -> tuple[str, bool]:
    """(backend, explicit): explicit is True only when the user set the env var."""
    raw = os.environ.get(ENV_VAR, "").strip().lower()
    if not raw:
        return DEFAULT_BACKEND, False
    if raw not in BACKENDS:
        raise ValueError(f"{ENV_VAR} must be one of {', '.join(BACKENDS)} (got {raw!r})")
    return raw, True


def backend_of(chord_model) -> str:
    """Models without a `backend` attribute (test doubles, older callers) are crema."""
    return getattr(chord_model, "backend", "crema")


def select_chord_model():
    """Build the chord model for the configured backend.

    The default (btc) quietly degrades to crema if its weights can't be fetched;
    an explicit TABIT_CHORD_BACKEND=btc is a request, so it raises instead.
    """
    backend, explicit = requested_backend()
    if backend == "crema":
        return CremaChordModel()
    try:
        return BtcChordModel(ensure_weights(), sha256=WEIGHTS_SHA256)
    except BtcWeightsUnavailable as exc:
        if explicit:
            raise
        logger.warning("BTC chord backend unavailable, falling back to crema: %s", exc)
        return CremaChordModel()
