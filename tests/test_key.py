import pytest
from engine.key import detect_key
from engine.notes import NOTES


@pytest.mark.integration
def test_detect_key_returns_valid_key(tone_440_wav):
    key = detect_key(tone_440_wav)
    assert key.tonic in NOTES
    assert key.mode in ("major", "minor")
    assert 0.0 <= key.confidence <= 1.0
