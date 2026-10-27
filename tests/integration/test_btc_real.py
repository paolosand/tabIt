import pytest

from engine.chords_btc import BtcChordModel, MIN_SEGMENT_SEC


@pytest.mark.integration
def test_real_btc_weights_on_synthetic_clip(ref_clip):
    """Downloads/uses the real pinned weights (network on first run)."""
    raws = BtcChordModel().predict(ref_clip["wav"])
    assert raws and raws[0].start == 0.0
    assert all(b.start == a.end for a, b in zip(raws, raws[1:]))
    assert all(r.end - r.start >= MIN_SEGMENT_SEC for r in raws[:-1] or raws)
