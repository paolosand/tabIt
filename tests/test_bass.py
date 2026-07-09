import pytest
from engine.bass import _hz_to_pitch_class
from engine.notes import NOTES


def test_hz_to_pitch_class_a440():
    assert _hz_to_pitch_class(440.0) == "A"
    assert _hz_to_pitch_class(261.63) == "C"      # middle C
    assert _hz_to_pitch_class(82.41) == "E"       # low E string
    assert _hz_to_pitch_class(0.0) is None        # unvoiced


@pytest.mark.integration
def test_detect_bass_notes_length_matches_segments(tone_440_wav):
    from engine.bass import detect_bass_notes
    from engine.schema import ChordSegment
    segs = [ChordSegment(start=0.0, end=1.0, label="A", root="A",
                         quality="maj", bass="A", confidence=0.9)]
    out = detect_bass_notes(tone_440_wav, segs)
    assert len(out) == 1
    assert out[0] in NOTES
