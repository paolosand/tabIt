"""Chord model construction: BTC is the only backend."""
from engine.chords_btc import BtcChordModel, WEIGHTS_SHA256, ensure_weights


def select_chord_model() -> BtcChordModel:
    """Build the BTC chord model, downloading its weights on first use.

    Raises BtcWeightsUnavailable (with the cache dir, source URL and how to
    retry) when the weights are neither cached nor downloadable; there is no
    fallback to another backend.
    """
    return BtcChordModel(ensure_weights(), sha256=WEIGHTS_SHA256)
